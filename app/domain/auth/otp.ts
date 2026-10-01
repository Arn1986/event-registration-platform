export const OTP_TTL_MINUTES = 10;
export const OTP_MAX_ATTEMPTS = 5;
export const OTP_REQUEST_LIMIT = 3;
export const OTP_IP_REQUEST_LIMIT = 10;

export function normalizeEmail(value: string) {
  return value.trim().toLowerCase();
}

export function generateOtp(randomValues = crypto.getRandomValues(new Uint32Array(1))) {
  return String(randomValues[0] % 1_000_000).padStart(6, "0");
}

export function isValidOtpFormat(value: string) {
  return /^\d{6}$/.test(value);
}
