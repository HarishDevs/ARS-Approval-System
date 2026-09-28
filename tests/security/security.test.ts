import { describe, expect, it } from "vitest";
import { decryptSecret, encryptSecret } from "@/lib/security/encryption";
import { keyedHash, randomToken, safeEqualHex } from "@/lib/security/hashing";
import { generateOtpCode, hashOtpCode, verifyOtpCode } from "@/lib/security/otp";
import { checkPasswordPolicy, hashPassword, verifyPassword } from "@/lib/security/password";
import {
  createDeviceCookieValue,
  createPurposeToken,
  createSessionToken,
  readDeviceKey,
  verifyPurposeToken,
  verifySessionToken,
} from "@/lib/session/token";

describe("encryption (AES-256-GCM)", () => {
  it("round-trips and uses a fresh IV each time", () => {
    const a = encryptSecret("ceoitbox-api-key");
    const b = encryptSecret("ceoitbox-api-key");
    expect(a).not.toBe(b);
    expect(a).not.toContain("ceoitbox");
    expect(decryptSecret(a)).toBe("ceoitbox-api-key");
  });

  it("rejects tampered ciphertext", () => {
    const encoded = encryptSecret("secret");
    const tampered = encoded.slice(0, -4) + (encoded.endsWith("AAAA") ? "BBBB" : "AAAA");
    expect(() => decryptSecret(tampered)).toThrow();
  });
});

describe("hashing", () => {
  it("keyed hash is stable, compares safely, tokens are random", () => {
    expect(keyedHash("x")).toBe(keyedHash("x"));
    expect(keyedHash("x")).not.toBe(keyedHash("y"));
    expect(safeEqualHex(keyedHash("x"), keyedHash("x"))).toBe(true);
    expect(safeEqualHex(keyedHash("x"), "ab")).toBe(false);
    expect(randomToken()).not.toBe(randomToken());
  });
});

describe("OTP", () => {
  it("generates numeric codes of the requested length", () => {
    for (let i = 0; i < 50; i += 1) expect(generateOtpCode(6)).toMatch(/^\d{6}$/);
    expect(generateOtpCode(8)).toMatch(/^\d{8}$/);
  });

  it("stores only a hash and verifies it", () => {
    const hash = hashOtpCode("123456");
    expect(hash).not.toContain("123456");
    expect(verifyOtpCode("123456", hash)).toBe(true);
    expect(verifyOtpCode("654321", hash)).toBe(false);
  });
});

describe("passwords (scrypt)", () => {
  it("hashes with salt and verifies", async () => {
    const hash = await hashPassword("Steel2026pass");
    expect(hash.startsWith("scrypt$")).toBe(true);
    expect(await hashPassword("Steel2026pass")).not.toBe(hash);
    expect(await verifyPassword("Steel2026pass", hash)).toBe(true);
    expect(await verifyPassword("wrong-pass-1", hash)).toBe(false);
    expect(await verifyPassword("x", null)).toBe(false);
    expect(await verifyPassword("x", "garbage")).toBe(false);
  });

  it("enforces the policy", () => {
    expect(checkPasswordPolicy("short1").ok).toBe(false);
    expect(checkPasswordPolicy("onlyletterslong").ok).toBe(false);
    expect(checkPasswordPolicy("letters1234").ok).toBe(true);
  });
});

describe("session and purpose tokens", () => {
  const now = 1_800_000_000;

  it("verifies a valid session token and rejects tampering and expiry", () => {
    const token = createSessionToken("sid-1", 5, now);
    expect(verifySessionToken(token, now + 10)).toMatchObject({ sid: "sid-1", uid: 5 });
    const [encoded, sig] = token.split(".");
    const forged = Buffer.from(JSON.stringify({ sid: "sid-1", uid: 1, iat: now, exp: now + 999999 })).toString("base64url");
    expect(verifySessionToken(`${forged}.${sig}`, now)).toBeNull();
    expect(verifySessionToken(`${encoded}.x${sig}`, now)).toBeNull();
    expect(verifySessionToken(token, now + 60 * 60 * 24 * 365)).toBeNull();
    expect(verifySessionToken(null)).toBeNull();
  });

  it("purpose tokens can't be used for another purpose", () => {
    const token = createPurposeToken("not-me", 5, "sid-1", 600, now);
    expect(verifyPurposeToken(token, "not-me", now)).toMatchObject({ uid: 5, sid: "sid-1" });
    expect(verifyPurposeToken(token, "reset-password", now)).toBeNull();
    expect(verifyPurposeToken(token, "not-me", now + 601)).toBeNull();
  });

  it("device cookie signature is checked", () => {
    const { cookieValue, deviceKey } = createDeviceCookieValue();
    expect(readDeviceKey(cookieValue)).toBe(deviceKey);
    expect(readDeviceKey(`${deviceKey}.forged`)).toBeNull();
    expect(readDeviceKey("nodot")).toBeNull();
  });
});
