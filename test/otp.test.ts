import { describe, expect, it } from "vitest";
import { generateOtp, isValidOtpFormat, normalizeEmail } from "../app/domain/auth/otp";

describe("OTP helpers", () => {
  it("normalizes email without changing internal characters", () => expect(normalizeEmail(" Athlete+Race@Example.COM ")).toBe("athlete+race@example.com"));
  it("always generates a padded six-digit code", () => expect(generateOtp(new Uint32Array([42]))).toBe("000042"));
  it("accepts only six digits", () => { expect(isValidOtpFormat("123456")).toBe(true); expect(isValidOtpFormat("12345a")).toBe(false); });
});

