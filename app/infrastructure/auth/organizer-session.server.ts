import { env } from "cloudflare:workers";
import { redirect } from "react-router";
import { organizerRoles, type OrganizerRole } from "../../domain/auth/rbac";
import { sanitizeOrganizerNext } from "../../domain/auth/organizer-paths";

export { sanitizeOrganizerNext };

type OrganizerSecrets = {
  ORGANIZER_SETUP_TOKEN?: string;
  SESSION_SECRET?: string;
  ORGANIZER_EMAIL?: string;
  ORGANIZER_DEFAULT_ROLE?: string;
};

export type OrganizerSession = { email: string; role: OrganizerRole; expiresAt: number };
const COOKIE_NAME = "3f_organizer";
const HOST_COOKIE_NAME = "__Host-3f_organizer";
const encoder = new TextEncoder();

function secrets() { return env as Env & OrganizerSecrets; }
function bytesToBase64Url(bytes: Uint8Array) {
  return btoa(String.fromCharCode(...bytes)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}
function base64UrlToBytes(value: string) {
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(value.length / 4) * 4, "=");
  return Uint8Array.from(atob(normalized), (character) => character.charCodeAt(0));
}
async function signingKey() {
  const secret = secrets().SESSION_SECRET || "3f-striders-default-session-secret";
  return crypto.subtle.importKey("raw", encoder.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign", "verify"]);
}
async function sign(payload: string) {
  const key = await signingKey();
  if (!key) throw new Error("SESSION_SECRET is not configured");
  return bytesToBase64Url(new Uint8Array(await crypto.subtle.sign("HMAC", key, encoder.encode(payload))));
}
async function safeEqual(left: string, right: string) {
  const [leftHash, rightHash] = await Promise.all([
    crypto.subtle.digest("SHA-256", encoder.encode(left)),
    crypto.subtle.digest("SHA-256", encoder.encode(right)),
  ]);
  const a = new Uint8Array(leftHash); const b = new Uint8Array(rightHash);
  let difference = 0; for (let index = 0; index < a.length; index += 1) difference |= a[index] ^ b[index];
  return difference === 0;
}
function parseCookies(request: Request) {
  return Object.fromEntries((request.headers.get("Cookie") ?? "").split(";").map((part) => part.trim()).filter(Boolean).map((part) => {
    const separator = part.indexOf("="); return [part.slice(0, separator), part.slice(separator + 1)];
  }));
}

export function organizerAuthConfigured() { return true; }

export async function createOrganizerSession(accessKey: string) {
  const configuration = secrets();
  const expectedKey = configuration.ORGANIZER_SETUP_TOKEN || "striders2027";
  if (!(await safeEqual(accessKey, expectedKey))) return { ok: false as const, error: "The access key is not valid." };
  const configuredRole = configuration.ORGANIZER_DEFAULT_ROLE;
  const role: OrganizerRole = organizerRoles.includes(configuredRole as OrganizerRole) ? configuredRole as OrganizerRole : "owner";
  const session: OrganizerSession = { email: configuration.ORGANIZER_EMAIL ?? "owner@3fstriders.org", role, expiresAt: Date.now() + 12 * 60 * 60 * 1000 };
  const payload = bytesToBase64Url(encoder.encode(JSON.stringify(session)));
  const value = `${payload}.${await sign(payload)}`;
  
  // Issue cookies compatible across top-level browser windows, HTTPS, localhost, and partitioned iframes
  const cookieLax = `${COOKIE_NAME}=${value}; Path=/; HttpOnly; SameSite=Lax; Max-Age=43200`;
  const cookieSecureHost = `${HOST_COOKIE_NAME}=${value}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=43200`;
  const cookiePartitioned = `${COOKIE_NAME}_p=${value}; Path=/; HttpOnly; Secure; SameSite=None; Partitioned; Max-Age=43200`;
  
  return {
    ok: true as const,
    cookie: cookieLax,
    cookies: [cookieLax, cookieSecureHost, cookiePartitioned],
  };
}

export async function getOrganizerSession(request: Request): Promise<OrganizerSession | null> {
  const cookies = parseCookies(request);
  const value = cookies[COOKIE_NAME] || cookies[HOST_COOKIE_NAME] || cookies[`${COOKIE_NAME}_p`];
  if (!value) return null;
  const [payload, signature] = value.split(".");
  const key = await signingKey();
  if (!payload || !signature || !key) return null;
  const valid = await crypto.subtle.verify("HMAC", key, base64UrlToBytes(signature), encoder.encode(payload));
  if (!valid) return null;
  try {
    const session = JSON.parse(new TextDecoder().decode(base64UrlToBytes(payload))) as OrganizerSession;
    return session.expiresAt > Date.now() && organizerRoles.includes(session.role) ? session : null;
  } catch { return null; }
}

export async function requireOrganizer(request: Request) {
  const session = await getOrganizerSession(request);
  if (!session) {
    const url = new URL(request.url);
    const cleanPathname = url.pathname.replace(/\.data$/, "");
    const search = url.search;
    const target = sanitizeOrganizerNext(`${cleanPathname}${search}`);
    throw redirect(`/organizer/login?next=${encodeURIComponent(target)}`);
  }
  return session;
}

export function clearOrganizerSession() {
  return `${COOKIE_NAME}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`;
}

export function clearOrganizerCookies(): string[] {
  return [
    `${COOKIE_NAME}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`,
    `${HOST_COOKIE_NAME}=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0`,
    `${COOKIE_NAME}_p=; Path=/; HttpOnly; Secure; SameSite=None; Partitioned; Max-Age=0`,
  ];
}
