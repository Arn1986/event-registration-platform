const encoder = new TextEncoder();

export function bytesToHex(bytes: Uint8Array) {
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

export function randomToken(byteLength = 32) {
  return bytesToHex(crypto.getRandomValues(new Uint8Array(byteLength)));
}

export async function sha256(value: string) {
  return bytesToHex(new Uint8Array(await crypto.subtle.digest("SHA-256", encoder.encode(value))));
}

export async function hmacSha256(value: string, secret: string) {
  const key = await crypto.subtle.importKey("raw", encoder.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return bytesToHex(new Uint8Array(await crypto.subtle.sign("HMAC", key, encoder.encode(value))));
}

export async function encryptSensitive(value: string, secret: string) {
  const rawKey = await crypto.subtle.digest("SHA-256", encoder.encode(secret));
  const key = await crypto.subtle.importKey("raw", rawKey, "AES-GCM", false, ["encrypt"]);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encrypted = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, encoder.encode(value)));
  return `v1:${bytesToHex(iv)}:${bytesToHex(encrypted)}`;
}

export async function decryptSensitive(value: string, secret: string) {
  const [version, ivHex, encryptedHex] = value.split(":");
  if (version !== "v1" || !ivHex || !encryptedHex) throw new Error("Unsupported encrypted value");
  const rawKey = await crypto.subtle.digest("SHA-256", encoder.encode(secret));
  const key = await crypto.subtle.importKey("raw", rawKey, "AES-GCM", false, ["decrypt"]);
  const iv = Uint8Array.from(ivHex.match(/.{2}/g) ?? [], (pair) => Number.parseInt(pair, 16));
  const encrypted = Uint8Array.from(encryptedHex.match(/.{2}/g) ?? [], (pair) => Number.parseInt(pair, 16));
  return new TextDecoder().decode(await crypto.subtle.decrypt({ name: "AES-GCM", iv }, key, encrypted));
}
