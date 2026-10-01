import { env } from "cloudflare:workers";
import { buildWalletPassSpec, type WalletPassRegistration } from "../../domain/wallet/pass-spec";
import { hmacSha256 } from "../security/crypto.server";
import { createProviderPass, decodeApplePass, revokeProviderPass, updateProviderPass } from "./walletwallet-provider.server";

type WalletEnvironment = Env & {
  PASSES?: R2Bucket;
  WALLETWALLET_API_KEY?: string;
  WALLET_DOWNLOAD_SECRET?: string;
};
const config = () => env as WalletEnvironment;
const database = () => env.DB;
const now = () => new Date().toISOString();
const id = (prefix: string) => `${prefix}_${crypto.randomUUID()}`;

type WalletRegistration = WalletPassRegistration & { id: string; status: string };
type WalletRecord = {
  id: string; registrationId: string; externalSerial: string; status: "active" | "revoked" | "failed";
  appleObjectKey: string | null; googleSaveUrl: string | null; passSpecJson: string; lastError: string | null;
};

export function walletDeliveryConfigured() {
  const value = config();
  return Boolean(value.WALLETWALLET_API_KEY && value.WALLET_DOWNLOAD_SECRET && value.PASSES);
}

async function loadRegistration(registrationId: string) {
  return database().prepare(`SELECT r.id, r.status, r.registration_reference AS registrationReference, r.bib_number AS bibNumber,
    p.first_name AS firstName, p.last_name AS lastName, e.name AS eventName, e.starts_at AS eventStartsAt,
    e.venue_name AS venueName, race.name AS raceName, c.name AS categoryName, w.name AS waveName, t.name AS teamName
    FROM registrations r
    JOIN athlete_profiles p ON p.id = r.athlete_profile_id
    JOIN events e ON e.id = r.event_id
    JOIN races race ON race.id = r.race_id
    LEFT JOIN categories c ON c.id = r.category_id
    LEFT JOIN waves w ON w.id = r.wave_id
    LEFT JOIN teams t ON t.id = r.team_id
    WHERE r.id = ?`).bind(registrationId).first<WalletRegistration>();
}

async function loadWallet(registrationId: string) {
  return database().prepare(`SELECT id, registration_id AS registrationId, external_serial AS externalSerial, status,
    apple_object_key AS appleObjectKey, google_save_url AS googleSaveUrl, pass_spec_json AS passSpecJson, last_error AS lastError
    FROM wallet_passes WHERE registration_id = ?`).bind(registrationId).first<WalletRecord>();
}

function requireConfiguration() {
  const value = config();
  if (!value.WALLETWALLET_API_KEY) throw new Error("WALLETWALLET_API_KEY is not configured");
  if (!value.WALLET_DOWNLOAD_SECRET) throw new Error("WALLET_DOWNLOAD_SECRET is not configured");
  if (!value.PASSES) throw new Error("The PASSES R2 binding is not configured");
  return value as WalletEnvironment & { PASSES: R2Bucket; WALLET_DOWNLOAD_SECRET: string };
}

export async function issueWalletPass(registrationId: string) {
  const value = requireConfiguration();
  const registration = await loadRegistration(registrationId);
  if (!registration || registration.status !== "confirmed") throw new Error("Only confirmed registrations can receive a wallet pass");
  const existing = await loadWallet(registrationId);
  if (existing?.status === "active") return existing;
  const timestamp = now();
  const spec = buildWalletPassSpec(registration);
  let attemptSerial = existing?.externalSerial ?? `pending-${registrationId}`;
  let attemptObjectKey = existing?.appleObjectKey;
  let attemptGoogleUrl = existing?.googleSaveUrl;
  try {
    let applePass: Uint8Array;
    if (existing?.status === "failed" && !existing.externalSerial.startsWith("pending-")) {
      await revokeProviderPass(existing.externalSerial);
      if (existing.appleObjectKey) await value.PASSES.delete(existing.appleObjectKey);
    }
    const created = await createProviderPass(spec);
    attemptSerial = created.serialNumber; attemptGoogleUrl = created.googleSaveUrl;
    attemptObjectKey = `wallet-passes/${registrationId}/${created.serialNumber}.pkpass`;
    applePass = decodeApplePass(created.applePass);
    await database().prepare(`INSERT INTO wallet_passes
      (id, registration_id, provider, external_serial, status, apple_object_key, google_save_url, pass_spec_json, last_error, attempt_count, last_synced_at, created_at, updated_at)
      VALUES (?, ?, 'walletwallet', ?, 'failed', ?, ?, ?, 'Apple pass storage pending', 1, ?, ?, ?)
      ON CONFLICT(registration_id) DO UPDATE SET external_serial = excluded.external_serial, status = 'failed',
      apple_object_key = excluded.apple_object_key, google_save_url = excluded.google_save_url, pass_spec_json = excluded.pass_spec_json,
      last_error = excluded.last_error, attempt_count = wallet_passes.attempt_count + 1, updated_at = excluded.updated_at`)
      .bind(existing?.id ?? id("wallet"), registrationId, attemptSerial, attemptObjectKey, attemptGoogleUrl, JSON.stringify(spec), timestamp, timestamp, timestamp).run();
    await value.PASSES.put(attemptObjectKey!, applePass, {
      httpMetadata: { contentType: "application/vnd.apple.pkpass" },
      customMetadata: { registrationId, serialNumber: attemptSerial },
    });
    await database().prepare(`INSERT INTO wallet_passes
      (id, registration_id, provider, external_serial, status, apple_object_key, google_save_url, pass_spec_json, last_error, issued_at, attempt_count, last_synced_at, created_at, updated_at)
      VALUES (?, ?, 'walletwallet', ?, 'active', ?, ?, ?, NULL, ?, 1, ?, ?, ?)
      ON CONFLICT(registration_id) DO UPDATE SET external_serial = excluded.external_serial, status = 'active',
      apple_object_key = excluded.apple_object_key, google_save_url = excluded.google_save_url, pass_spec_json = excluded.pass_spec_json,
      last_error = NULL, issued_at = excluded.issued_at, attempt_count = wallet_passes.attempt_count + 1,
      last_synced_at = excluded.last_synced_at, updated_at = excluded.updated_at`)
      .bind(existing?.id ?? id("wallet"), registrationId, attemptSerial, attemptObjectKey, attemptGoogleUrl, JSON.stringify(spec), timestamp, timestamp, timestamp, timestamp).run();
    return await loadWallet(registrationId);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Wallet pass creation failed";
    await database().prepare(`INSERT INTO wallet_passes
      (id, registration_id, provider, external_serial, status, pass_spec_json, last_error, attempt_count, last_synced_at, created_at, updated_at)
      VALUES (?, ?, 'walletwallet', ?, 'failed', ?, ?, 1, ?, ?, ?)
      ON CONFLICT(registration_id) DO UPDATE SET status = 'failed', pass_spec_json = excluded.pass_spec_json,
      last_error = excluded.last_error, attempt_count = wallet_passes.attempt_count + 1, updated_at = excluded.updated_at`)
      .bind(existing?.id ?? id("wallet"), registrationId, attemptSerial, JSON.stringify(spec), message.slice(0, 500), timestamp, timestamp, timestamp).run();
    throw error;
  }
}

export async function syncWalletPass(registrationId: string, notification = "Race information updated") {
  requireConfiguration();
  const [registration, wallet] = await Promise.all([loadRegistration(registrationId), loadWallet(registrationId)]);
  if (!registration || registration.status !== "confirmed" || !wallet || wallet.status !== "active") return false;
  const spec = buildWalletPassSpec(registration, notification);
  await updateProviderPass(wallet.externalSerial, spec);
  await database().prepare("UPDATE wallet_passes SET pass_spec_json = ?, last_error = NULL, last_synced_at = ?, updated_at = ? WHERE id = ?")
    .bind(JSON.stringify(spec), now(), now(), wallet.id).run();
  return true;
}

export async function revokeWalletPass(registrationId: string) {
  const wallet = await loadWallet(registrationId);
  if (!wallet || wallet.status === "revoked" || wallet.externalSerial.startsWith("pending-")) return false;
  const value = requireConfiguration();
  await revokeProviderPass(wallet.externalSerial);
  if (wallet.appleObjectKey) await value.PASSES.delete(wallet.appleObjectKey);
  await database().prepare("UPDATE wallet_passes SET status = 'revoked', last_error = NULL, last_synced_at = ?, updated_at = ? WHERE id = ?")
    .bind(now(), now(), wallet.id).run();
  return true;
}

export async function buildWalletDeliveryUrl(registrationId: string) {
  const value = requireConfiguration();
  const token = await hmacSha256(`wallet-download:${registrationId}`, value.WALLET_DOWNLOAD_SECRET);
  return `${value.APP_URL}/passes/${encodeURIComponent(registrationId)}/${token}`;
}

export async function getWalletDelivery(registrationId: string, token: string) {
  const value = requireConfiguration();
  const expected = await hmacSha256(`wallet-download:${registrationId}`, value.WALLET_DOWNLOAD_SECRET);
  if (!safeEqual(expected, token)) return null;
  const [registration, wallet] = await Promise.all([loadRegistration(registrationId), loadWallet(registrationId)]);
  if (!registration || !wallet || wallet.status !== "active" || !wallet.appleObjectKey) return null;
  return { registration, wallet, object: await value.PASSES.get(wallet.appleObjectKey) };
}

export async function getWalletSummary(registrationId: string) {
  const wallet = await loadWallet(registrationId);
  if (!wallet) return null;
  return { status: wallet.status, lastError: wallet.lastError, url: wallet.status === "active" && walletDeliveryConfigured() ? await buildWalletDeliveryUrl(registrationId) : null };
}

function safeEqual(left: string, right: string) {
  if (left.length !== right.length) return false;
  let difference = 0;
  for (let index = 0; index < left.length; index += 1) difference |= left.charCodeAt(index) ^ right.charCodeAt(index);
  return difference === 0;
}
