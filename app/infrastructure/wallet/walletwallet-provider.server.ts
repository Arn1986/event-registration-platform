import { env } from "cloudflare:workers";
import type { WalletPassSpec } from "../../domain/wallet/pass-spec";

type WalletSecrets = { WALLETWALLET_API_KEY?: string };
const API_BASE = "https://api.walletwallet.dev";

function apiKey() {
  const key = (env as Env & WalletSecrets).WALLETWALLET_API_KEY;
  if (!key) throw new Error("WALLETWALLET_API_KEY is not configured");
  return key;
}

async function providerRequest(path: string, init: RequestInit) {
  const response = await fetch(`${API_BASE}${path}`, {
    ...init,
    headers: { Authorization: `Bearer ${apiKey()}`, ...(init.headers ?? {}) },
  });
  if (!response.ok) {
    const payload: { error?: string; message?: string } = await response.json<{ error?: string; message?: string }>().catch(() => ({}));
    throw new Error(payload.message ?? payload.error ?? `Wallet provider returned ${response.status}`);
  }
  return response;
}

function validateGoogleSaveUrl(value: unknown) {
  if (typeof value !== "string") return null;
  const url = new URL(value);
  if (url.protocol !== "https:" || url.hostname !== "pay.google.com" || !url.pathname.startsWith("/gp/v/save/")) throw new Error("Wallet provider returned an invalid Google Wallet URL");
  return url.toString();
}

export async function createProviderPass(spec: WalletPassSpec) {
  const response = await providerRequest("/api/passes", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(spec),
  });
  const payload = await response.json<Record<string, unknown>>();
  if (typeof payload.serialNumber !== "string" || typeof payload.applePass !== "string") throw new Error("Wallet provider returned an incomplete pass");
  return {
    serialNumber: payload.serialNumber,
    googleSaveUrl: validateGoogleSaveUrl(payload.googleSaveUrl),
    applePass: payload.applePass,
  };
}

export async function updateProviderPass(serialNumber: string, spec: WalletPassSpec) {
  await providerRequest(`/api/passes/${encodeURIComponent(serialNumber)}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(spec),
  });
}

export async function revokeProviderPass(serialNumber: string) {
  await providerRequest(`/api/passes/${encodeURIComponent(serialNumber)}`, { method: "DELETE" });
}

export function decodeApplePass(value: string) {
  const binary = atob(value);
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}
