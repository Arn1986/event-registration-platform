import { env } from "cloudflare:workers";
import { redirect } from "react-router";

import { generateOtp, isValidOtpFormat, normalizeEmail, OTP_IP_REQUEST_LIMIT, OTP_MAX_ATTEMPTS, OTP_REQUEST_LIMIT, OTP_TTL_MINUTES } from "../../domain/auth/otp";
import { sendOtpEmail } from "../email/email-provider.server";
import { hmacSha256, randomToken, sha256 } from "../security/crypto.server";

type AthleteSecrets = { OTP_HASH_SECRET?: string };
export type OtpPurpose = "register" | "sign_in" | "guardian_consent";
export type AthleteIdentity = { userId: string; email: string; profileId: string | null };

const COOKIE_NAME = "__Host-3f_athlete";
const SESSION_TTL_SECONDS = 60 * 60 * 24 * 30;
const database = () => env.DB;
const now = () => new Date().toISOString();
const id = (prefix: string) => `${prefix}_${crypto.randomUUID()}`;

function config() { return env as Env & AthleteSecrets; }
function parseCookies(request: Request) {
  return Object.fromEntries((request.headers.get("Cookie") ?? "").split(";").map((part) => part.trim()).filter(Boolean).map((part) => {
    const separator = part.indexOf("="); return [part.slice(0, separator), part.slice(separator + 1)];
  }));
}

async function otpHash(email: string, purpose: OtpPurpose, code: string) {
  const secret = config().OTP_HASH_SECRET;
  if (!secret) throw new Error("OTP_HASH_SECRET is not configured");
  return hmacSha256(`${purpose}:${email}:${code}`, secret);
}

export async function requestOtp(emailInput: string, purpose: OtpPurpose, request: Request) {
  const email = normalizeEmail(emailInput);
  const secret = config().OTP_HASH_SECRET;
  if (!secret) throw new Error("OTP verification is not configured");
  const tenMinutesAgo = new Date(Date.now() - OTP_TTL_MINUTES * 60_000).toISOString();
  const ip = request.headers.get("CF-Connecting-IP") ?? "unknown";
  const ipHash = await hmacSha256(ip, secret);
  const [recentEmail, recentIp] = await Promise.all([
    database().prepare("SELECT COUNT(*) AS count FROM auth_challenges WHERE normalized_email = ? AND purpose = ? AND created_at >= ?").bind(email, purpose, tenMinutesAgo).first<{ count: number }>(),
    database().prepare("SELECT COUNT(*) AS count FROM auth_challenges WHERE request_ip_hash = ? AND created_at >= ?").bind(ipHash, tenMinutesAgo).first<{ count: number }>(),
  ]);
  if ((recentEmail?.count ?? 0) >= OTP_REQUEST_LIMIT || (recentIp?.count ?? 0) >= OTP_IP_REQUEST_LIMIT) return { accepted: true as const, rateLimited: true as const, challengeId: null };

  const code = generateOtp();
  const challengeId = id("challenge");
  const createdAt = now();
  const expiresAt = new Date(Date.now() + OTP_TTL_MINUTES * 60_000).toISOString();
  await database().prepare("INSERT INTO auth_challenges (id, normalized_email, code_hash, purpose, expires_at, consumed_at, attempt_count, request_ip_hash, created_at) VALUES (?, ?, ?, ?, ?, NULL, 0, ?, ?)")
    .bind(challengeId, email, await otpHash(email, purpose, code), purpose, expiresAt, ipHash, createdAt).run();
  try {
    await sendOtpEmail(email, code, `otp/${challengeId}`);
  } catch (error) {
    await database().prepare("DELETE FROM auth_challenges WHERE id = ?").bind(challengeId).run();
    throw error;
  }
  return { accepted: true as const, rateLimited: false as const, challengeId };
}

export async function verifyOtp(emailInput: string, purpose: OtpPurpose, code: string) {
  const email = normalizeEmail(emailInput);
  if (!isValidOtpFormat(code)) return { ok: false as const, error: "Enter the six-digit code." };
  const challenge = await database().prepare("SELECT id, code_hash AS codeHash, attempt_count AS attemptCount, expires_at AS expiresAt FROM auth_challenges WHERE normalized_email = ? AND purpose = ? AND consumed_at IS NULL ORDER BY created_at DESC LIMIT 1")
    .bind(email, purpose).first<{ id: string; codeHash: string; attemptCount: number; expiresAt: string }>();
  if (!challenge || challenge.expiresAt <= now()) return { ok: false as const, error: "That code has expired. Request a new one." };
  if (challenge.attemptCount >= OTP_MAX_ATTEMPTS) return { ok: false as const, error: "Too many attempts. Request a new code." };
  const expected = await otpHash(email, purpose, code);
  if (expected !== challenge.codeHash) {
    await database().prepare("UPDATE auth_challenges SET attempt_count = attempt_count + 1 WHERE id = ?").bind(challenge.id).run();
    return { ok: false as const, error: "That code is not correct." };
  }
  const consumed = await database().prepare("UPDATE auth_challenges SET consumed_at = ? WHERE id = ? AND consumed_at IS NULL").bind(now(), challenge.id).run();
  if (!consumed.meta.changes) return { ok: false as const, error: "That code has already been used." };
  return { ok: true as const, challengeId: challenge.id, email };
}

export async function createAthleteSession(email: string) {
  const timestamp = now();
  let user = await database().prepare("SELECT id FROM users WHERE email = ?").bind(email).first<{ id: string }>();
  if (!user) {
    user = { id: id("user") };
    await database().prepare("INSERT INTO users (id, email, email_verified_at, created_at, updated_at) VALUES (?, ?, ?, ?, ?)")
      .bind(user.id, email, timestamp, timestamp, timestamp).run();
  } else {
    await database().prepare("UPDATE users SET email_verified_at = ?, updated_at = ? WHERE id = ?").bind(timestamp, timestamp, user.id).run();
  }
  const token = randomToken();
  const expiresAt = new Date(Date.now() + SESSION_TTL_SECONDS * 1000).toISOString();
  await database().prepare("INSERT INTO sessions (id, user_id, token_hash, expires_at, created_at) VALUES (?, ?, ?, ?, ?)")
    .bind(id("session"), user.id, await sha256(token), expiresAt, timestamp).run();
  return `${COOKIE_NAME}=${token}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${SESSION_TTL_SECONDS}`;
}

export async function getAthlete(request: Request): Promise<AthleteIdentity | null> {
  const token = parseCookies(request)[COOKIE_NAME];
  if (!token) return null;
  return database().prepare(`SELECT u.id AS userId, u.email, p.id AS profileId FROM sessions s JOIN users u ON u.id = s.user_id LEFT JOIN athlete_profiles p ON p.user_id = u.id WHERE s.token_hash = ? AND s.revoked_at IS NULL AND s.expires_at > ?`)
    .bind(await sha256(token), now()).first<AthleteIdentity>();
}

export async function requireAthlete(request: Request) {
  const athlete = await getAthlete(request);
  if (!athlete) {
    const url = new URL(request.url);
    throw redirect(`/dashboard?next=${encodeURIComponent(url.pathname + url.search)}`);
  }
  return athlete;
}

export async function clearAthleteSession(request: Request) {
  const token = parseCookies(request)[COOKIE_NAME];
  if (token) await database().prepare("UPDATE sessions SET revoked_at = ? WHERE token_hash = ?").bind(now(), await sha256(token)).run();
  return `${COOKIE_NAME}=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0`;
}

export function safeNextPath(value: string | null, fallback = "/dashboard") {
  return value?.startsWith("/") && !value.startsWith("//") ? value : fallback;
}
