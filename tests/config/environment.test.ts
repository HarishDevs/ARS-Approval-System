import { afterEach, describe, expect, it } from "vitest";
import { getEnv, resetEnvCacheForTests } from "@/config/environment";

describe("environment", () => {
  const saved = { ...process.env };
  afterEach(() => {
    process.env = { ...saved };
    resetEnvCacheForTests();
  });

  it("treats blank optional values as not set", () => {
    process.env.FIREBASE_CLIENT_EMAIL = "";
    process.env.FIREBASE_PRIVATE_KEY = "  ";
    process.env.JOB_RUNNER_SECRET = "";
    resetEnvCacheForTests();
    const env = getEnv();
    expect(env.FIREBASE_CLIENT_EMAIL).toBeUndefined();
    expect(env.JOB_RUNNER_SECRET).toBeUndefined();
  });

  it("fails clearly when a required value is missing", () => {
    delete process.env.SESSION_SECRET;
    resetEnvCacheForTests();
    expect(() => getEnv()).toThrow(/SESSION_SECRET/);
  });
});
