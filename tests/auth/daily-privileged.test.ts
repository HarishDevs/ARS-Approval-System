import { describe, expect, it, vi } from "vitest";
import { completeSignIn, type CompleteSignInDeps } from "@/server/auth/complete-sign-in";
import type { RequestContext } from "@/types/auth";
import { userRecord } from "../helpers/user-fixtures";

// QA-SEC-03 (v1.42.1): the daily (until-midnight) session depends on what the
// browser says it is, so IT, the Super Admin and break-glass never get it.
const phone: RequestContext = { ipAddress: "10.0.0.1", userAgent: "Mozilla/5.0 (Linux; Android 14) Mobile", deviceKey: null, clientKind: "app" } as RequestContext;

function deps() {
  const createSession = vi.fn(async () => undefined);
  const value: CompleteSignInDeps = {
    findDevice: vi.fn(async () => null) as unknown as CompleteSignInDeps["findDevice"],
    createDevice: vi.fn(async () => 9) as unknown as CompleteSignInDeps["createDevice"],
    touchDevice: vi.fn(async () => undefined) as unknown as CompleteSignInDeps["touchDevice"],
    createSession: createSession as unknown as CompleteSignInDeps["createSession"],
    markLoginSuccess: vi.fn(async () => undefined) as unknown as CompleteSignInDeps["markLoginSuccess"],
    recordLogin: vi.fn(async () => undefined) as unknown as CompleteSignInDeps["recordLogin"],
    recordAudit: vi.fn(async () => undefined) as unknown as CompleteSignInDeps["recordAudit"],
    listSuperAdminIds: async () => [1],
    notify: async () => undefined,
    dispatch: (work) => void work(),
    getTrustedDeviceDays: async () => 30,
    dailySessionScope: async () => "DEVICES",
    randomUUID: () => "session-uuid",
    now: () => new Date("2026-11-01T10:00:00Z"),
    appBaseUrl: () => "https://approval.arssteels.net",
  };
  return { value, createSession };
}

const daily = (call: unknown[]) => (call[0] as { daily?: boolean }).daily === true;

describe("daily session and privileged accounts", () => {
  it("a plain employee on a phone gets the daily session", async () => {
    const { value, createSession } = deps();
    await completeSignIn(userRecord({ roles: ["USER"] }), "GOOGLE", phone, value);
    expect(daily(createSession.mock.calls[0]!)).toBe(true);
  });

  it.each([
    ["IT Admin", { roles: ["USER", "IT_ADMIN"] }],
    ["Super Admin", { roles: ["USER", "IT_ADMIN", "SUPER_ADMIN"] }],
    ["break-glass", { roles: ["USER"], isBreakGlass: true }],
  ])("%s keeps the idle sign-out even when the browser claims to be the app", async (_label, overrides) => {
    const { value, createSession } = deps();
    await completeSignIn(userRecord(overrides as never), "GOOGLE", phone, value);
    expect(daily(createSession.mock.calls[0]!)).toBe(false);
  });
});
