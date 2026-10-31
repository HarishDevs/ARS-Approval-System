import { beforeEach, describe, expect, it, vi } from "vitest";

// D-243 (audit DB-012): only a definitive refusal of the token refresh needs
// a manual reconnect; an outage keeps the connection.
const repo = vi.hoisted(() => ({
  getConnection: vi.fn(),
  markNeedsReauth: vi.fn(async () => undefined),
  saveAccessToken: vi.fn(async () => undefined),
}));

vi.mock("@/lib/db/repositories/salesforce.repository", () => ({
  ...repo,
  clearConnection: vi.fn(),
  clearPending: vi.fn(),
  savePending: vi.fn(),
  saveConnected: vi.fn(),
  saveTest: vi.fn(),
}));
vi.mock("@/server/settings/values", () => ({
  getSettingValue: vi.fn(async (key: string) => ({ "ai.salesforce.client_id": "cid", "ai.salesforce.client_secret": "secret", "ai.salesforce.environment": "SANDBOX" })[key] ?? null),
}));
vi.mock("@/config/environment", () => ({ getEnv: () => ({ APP_BASE_URL: "https://approval.example.test" }) }));

import { encryptSecret } from "@/lib/security/encryption";
import { refreshNeedsReauth, salesforceGet, SalesforceUnavailable } from "@/server/ai/connectors/salesforce-auth";

function tokenEndpoint(status: number, body: unknown) {
  return vi.fn(async () => new Response(JSON.stringify(body), { status }));
}

describe("Salesforce token refresh", () => {
  beforeEach(() => {
    repo.markNeedsReauth.mockClear();
    // Connected, but the access token has to be refreshed first.
    repo.getConnection.mockResolvedValue({ status: "CONNECTED", instanceUrl: "https://ars.my.salesforce.com", accessTokenEnc: null, refreshTokenEnc: encryptSecret("refresh-token") });
  });

  it.each([
    [503, {}],
    [500, { error: "server_error" }],
    [429, { error: "rate_limited" }],
  ])("an HTTP %i keeps the connection (tried again later)", async (status, body) => {
    const error = await salesforceGet("/services/data/v61.0/limits", tokenEndpoint(status, body)).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(SalesforceUnavailable);
    expect((error as Error).message).toMatch(/tried again/);
    expect(repo.markNeedsReauth).not.toHaveBeenCalled();
  });

  it("a network error keeps the connection", async () => {
    const down = vi.fn(async () => {
      throw new TypeError("fetch failed");
    });
    await expect(salesforceGet("/services/data/v61.0/limits", down)).rejects.toBeInstanceOf(SalesforceUnavailable);
    expect(repo.markNeedsReauth).not.toHaveBeenCalled();
  });

  it("invalid_grant needs a reconnect", async () => {
    await expect(salesforceGet("/services/data/v61.0/limits", tokenEndpoint(400, { error: "invalid_grant", error_description: "expired access/refresh token" }))).rejects.toThrow("Salesforce needs reconnecting.");
    expect(repo.markNeedsReauth).toHaveBeenCalledOnce();
  });

  it("classifies the answers", () => {
    expect(refreshNeedsReauth(400, "invalid_grant")).toBe(true);
    expect(refreshNeedsReauth(401, "invalid_client")).toBe(true);
    expect(refreshNeedsReauth(400, undefined)).toBe(false);
    expect(refreshNeedsReauth(503, "invalid_grant")).toBe(true);
    expect(refreshNeedsReauth(503, "server_error")).toBe(false);
    expect(refreshNeedsReauth(429, undefined)).toBe(false);
  });
});
