import "server-only";
import { createHash, randomBytes } from "node:crypto";
import { getEnv } from "@/config/environment";
import { decryptSecret, encryptSecret } from "@/lib/security/encryption";
import { clearConnection, clearPending, getConnection, markNeedsReauth, saveAccessToken, saveConnected, savePending, saveTest } from "@/lib/db/repositories/salesforce.repository";
import { getSettingValue } from "@/server/settings/values";
import { redactSecrets } from "@/server/ai/providers";

// D-172: the Salesforce connection, OAuth 2.0 web server flow with PKCE,
// authorised once by the Super Admin. Read-only use. Rules:
//   - state: 32 random bytes, kept as a SHA-256 hash, tied to the Super Admin
//     who started it, valid 10 minutes, single use;
//   - PKCE: S256 challenge; the verifier is stored encrypted until the callback;
//   - tokens: AES-256-GCM encrypted at rest, never sent to the browser or logged;
//   - an expired access token is refreshed with the refresh token; a refresh
//     Salesforce refuses for good marks the connection NEEDS_REAUTH
//     (Reconnect). D-243: an outage (5xx, 429, network) keeps the connection
//     and is tried again on the next use (refreshNeedsReauth);
//   - Disconnect revokes the refresh token at Salesforce, then deletes it here.
// Not yet tested against a real org: needs the owner's sandbox connected app.
export const CALLBACK_PATH = "/api/integrations/salesforce/callback";
export const API_VERSION = "v61.0";

const hash = (value: string) => createHash("sha256").update(value).digest("hex");
const base64url = (buffer: Buffer) => buffer.toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");

export function pkcePair(): { verifier: string; challenge: string } {
  const verifier = base64url(randomBytes(48));
  return { verifier, challenge: base64url(createHash("sha256").update(verifier).digest()) };
}

export interface SalesforceAppConfig {
  loginBase: string;
  clientId: string;
  clientSecret: string;
  scopes: string;
  redirectUri: string;
}

export function loginBaseFor(environment: string | null, myDomain: string | null): string {
  if (myDomain) return myDomain.replace(/\/$/, "");
  return environment === "PRODUCTION" ? "https://login.salesforce.com" : "https://test.salesforce.com";
}

export async function loadAppConfig(): Promise<SalesforceAppConfig | null> {
  const [environment, myDomain, clientId, clientSecret, scopes] = await Promise.all([
    getSettingValue("ai.salesforce.environment"),
    getSettingValue("ai.salesforce.my_domain"),
    getSettingValue("ai.salesforce.client_id"),
    getSettingValue("ai.salesforce.client_secret"),
    getSettingValue("ai.salesforce.scopes"),
  ]);
  const base = getEnv().APP_BASE_URL;
  if (!clientId || !clientSecret || !base) return null;
  return { loginBase: loginBaseFor(environment, myDomain), clientId, clientSecret, scopes: scopes || "api refresh_token", redirectUri: new URL(CALLBACK_PATH, base).toString() };
}

export function authorizeUrl(config: SalesforceAppConfig, state: string, challenge: string): string {
  const url = new URL(`${config.loginBase}/services/oauth2/authorize`);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("client_id", config.clientId);
  url.searchParams.set("redirect_uri", config.redirectUri);
  url.searchParams.set("scope", config.scopes);
  url.searchParams.set("state", state);
  url.searchParams.set("code_challenge", challenge);
  url.searchParams.set("code_challenge_method", "S256");
  url.searchParams.set("prompt", "login consent");
  return url.toString();
}

export async function startConnect(superAdminId: number): Promise<{ ok: true; url: string } | { ok: false; message: string }> {
  const config = await loadAppConfig();
  if (!config) return { ok: false, message: "Enter the Salesforce app's consumer key and secret first (and APP_BASE_URL must be set on the server)." };
  const state = base64url(randomBytes(32));
  const { verifier, challenge } = pkcePair();
  await savePending({ stateHash: hash(state), verifierEnc: encryptSecret(verifier), userId: superAdminId });
  return { ok: true, url: authorizeUrl(config, state, challenge) };
}

export type CallbackError = "STATE" | "DENIED" | "TOKEN" | "CONFIG";

export async function finishConnect(superAdminId: number, input: { code: string | null; state: string | null; error: string | null }, fetchImpl: typeof fetch = fetch): Promise<{ ok: true } | { ok: false; error: CallbackError }> {
  const pending = await getConnection();
  const valid = Boolean(input.state && pending.pendingStateHash && !pending.pendingExpired && pending.pendingUserId === superAdminId && hash(input.state) === pending.pendingStateHash);
  if (!valid) return { ok: false, error: "STATE" };
  const verifierEnc = pending.pendingVerifierEnc;
  await clearPending(); // single use, whatever happens next
  if (input.error || !input.code || !verifierEnc) return { ok: false, error: "DENIED" };
  const config = await loadAppConfig();
  if (!config) return { ok: false, error: "CONFIG" };
  const response = await fetchImpl(`${config.loginBase}/services/oauth2/token`, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ grant_type: "authorization_code", code: input.code, client_id: config.clientId, client_secret: config.clientSecret, redirect_uri: config.redirectUri, code_verifier: decryptSecret(verifierEnc) }).toString(),
    signal: AbortSignal.timeout(20_000),
  }).catch(() => null);
  const body = response ? ((await response.json().catch(() => ({}))) as { access_token?: string; refresh_token?: string; instance_url?: string; id?: string; scope?: string }) : {};
  if (!response?.ok || !body.access_token || !body.instance_url || !/^https:\/\/[\w.-]+\.(salesforce|force)\.com$/.test(body.instance_url.replace(/\/$/, ""))) return { ok: false, error: "TOKEN" };
  let userName: string | null = null;
  if (body.id && /^https:\/\/[\w.-]+\.(salesforce|force)\.com\//.test(body.id)) {
    const identity = (await fetchImpl(body.id, { headers: { authorization: `Bearer ${body.access_token}` }, signal: AbortSignal.timeout(15_000) })
      .then((res) => (res.ok ? res.json() : null))
      .catch(() => null)) as { username?: string } | null;
    userName = identity?.username ?? null;
  }
  await saveConnected({ instanceUrl: body.instance_url.replace(/\/$/, ""), userName, accessTokenEnc: encryptSecret(body.access_token), refreshTokenEnc: body.refresh_token ? encryptSecret(body.refresh_token) : null, scopes: body.scope ?? config.scopes, connectedBy: superAdminId });
  return { ok: true };
}

export class SalesforceUnavailable extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SalesforceUnavailable";
  }
}

// D-243 (audit DB-012): only a definitive refusal needs a person to
// reconnect: invalid_grant (refresh token revoked or expired), or a 400/401
// carrying an OAuth error (e.g. invalid_client, inactive_user). A 5xx, a
// 429, or any other answer is temporary: the connection is kept.
export function refreshNeedsReauth(status: number, error: string | undefined): boolean {
  if (error === "invalid_grant") return true;
  return (status === 400 || status === 401) && typeof error === "string" && error.length > 0;
}

async function refreshAccessToken(fetchImpl: typeof fetch): Promise<string> {
  const [connection, config] = await Promise.all([getConnection(), loadAppConfig()]);
  if (!connection.refreshTokenEnc || !config) {
    await markNeedsReauth("No refresh token; reconnect Salesforce.");
    throw new SalesforceUnavailable("Salesforce needs reconnecting.");
  }
  const response = await fetchImpl(`${config.loginBase}/services/oauth2/token`, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ grant_type: "refresh_token", refresh_token: decryptSecret(connection.refreshTokenEnc), client_id: config.clientId, client_secret: config.clientSecret }).toString(),
    signal: AbortSignal.timeout(20_000),
  }).catch(() => null);
  const body = response ? ((await response.json().catch(() => ({}))) as { access_token?: string; error?: string; error_description?: string }) : {};
  if (!response) throw new SalesforceUnavailable("Couldn't reach Salesforce.");
  if (!response.ok || !body.access_token) {
    if (refreshNeedsReauth(response.status, body.error)) {
      // invalid_grant: the refresh token was revoked or expired; a person must reconnect.
      await markNeedsReauth(`Refresh refused (${redactSecrets(body.error ?? `HTTP ${response.status}`)}).`);
      throw new SalesforceUnavailable("Salesforce needs reconnecting.");
    }
    throw new SalesforceUnavailable(`Salesforce couldn't refresh the session just now (HTTP ${response.status}); it will be tried again.`);
  }
  await saveAccessToken(encryptSecret(body.access_token));
  return body.access_token;
}

// A Salesforce REST GET as the connection, refreshing the access token once
// when Salesforce says the session expired. Only paths under /services/data/.
export async function salesforceGet(path: string, fetchImpl: typeof fetch = fetch, signal?: AbortSignal): Promise<unknown> {
  if (!path.startsWith("/services/data/")) throw new Error("Only Salesforce data API paths are allowed.");
  const connection = await getConnection();
  if (connection.status !== "CONNECTED" || !connection.instanceUrl) throw new SalesforceUnavailable(connection.status === "NEEDS_REAUTH" ? "Salesforce needs reconnecting." : "Salesforce isn't connected.");
  let token = connection.accessTokenEnc ? decryptSecret(connection.accessTokenEnc) : await refreshAccessToken(fetchImpl);
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const timeout = AbortSignal.timeout(30_000);
    const response = await fetchImpl(`${connection.instanceUrl}${path}`, { headers: { authorization: `Bearer ${token}`, accept: "application/json" }, signal: signal ? AbortSignal.any([timeout, signal]) : timeout }).catch((error) => {
      throw new SalesforceUnavailable(signal?.aborted ? "Stopped." : (error as Error)?.name === "TimeoutError" ? "Salesforce didn't answer in time." : "Couldn't reach Salesforce.");
    });
    if (response.status === 401 && attempt === 0) {
      token = await refreshAccessToken(fetchImpl);
      continue;
    }
    const body = (await response.json().catch(() => null)) as unknown;
    if (!response.ok) {
      const detail = Array.isArray(body) ? (body[0] as { errorCode?: string; message?: string }) : null;
      if (response.status === 403 && detail?.errorCode === "REQUEST_LIMIT_EXCEEDED") throw new SalesforceUnavailable("Salesforce's API limit for today was reached.");
      throw new SalesforceUnavailable(`Salesforce refused the request (${redactSecrets(detail?.errorCode ?? `HTTP ${response.status}`)}).`);
    }
    return body;
  }
  throw new SalesforceUnavailable("Salesforce needs reconnecting.");
}

export async function testConnection(fetchImpl: typeof fetch = fetch): Promise<{ ok: boolean; message: string }> {
  try {
    const limits = (await salesforceGet(`/services/data/${API_VERSION}/limits`, fetchImpl)) as { DailyApiRequests?: { Max?: number; Remaining?: number } };
    await saveTest(true, null);
    const api = limits.DailyApiRequests;
    return { ok: true, message: api ? `Connected. API requests left today: ${api.Remaining} of ${api.Max}.` : "Connected." };
  } catch (error) {
    const message = error instanceof SalesforceUnavailable ? error.message : "The test failed.";
    await saveTest(false, message);
    return { ok: false, message };
  }
}

export async function disconnect(fetchImpl: typeof fetch = fetch): Promise<void> {
  const [connection, config] = await Promise.all([getConnection(), loadAppConfig()]);
  const token = connection.refreshTokenEnc ? decryptSecret(connection.refreshTokenEnc) : connection.accessTokenEnc ? decryptSecret(connection.accessTokenEnc) : null;
  if (token && config) {
    await fetchImpl(`${config.loginBase}/services/oauth2/revoke`, { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ token }).toString(), signal: AbortSignal.timeout(15_000) }).catch(() => null);
  }
  await clearConnection();
}
