import crypto from "node:crypto";
import { afterAll, describe, expect, it } from "vitest";
import { getDbPool } from "@/lib/db/client";
import { createChallenge, reserveChallengeAttempt } from "@/lib/db/repositories/otp.repository";
import { createUser } from "./helpers";

afterAll(async () => {
  await getDbPool().end();
});

describe("one-time code tries (audit S-03)", () => {
  it("never allows more than max_attempts, even when guesses arrive together", async () => {
    const userId = await createUser();
    const id = await createChallenge({
      challengeTokenHash: crypto.randomBytes(32).toString("hex"),
      userId,
      purpose: "LOGIN",
      otpHash: "x",
      ttlSeconds: 300,
      maxAttempts: 5,
      ipAddress: null,
    });
    const claims = await Promise.all(Array.from({ length: 12 }, () => reserveChallengeAttempt(id)));
    expect(claims.filter(Boolean)).toHaveLength(5);
    expect(await reserveChallengeAttempt(id)).toBe(false);
  });
});
