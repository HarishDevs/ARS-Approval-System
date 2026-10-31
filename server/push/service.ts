import "server-only";
import webpush from "web-push";
import { getSettingValue } from "@/server/settings/values";
import { logError } from "@/lib/logging/logger";
import {
  activeDeviceIds,
  expireSubscription,
  leaseDuePushes,
  markPushFailed,
  markPushSent,
  noteSubscriptionFailure,
  queuePush,
  recordPushSkipped,
  type DuePush,
  type PushKeys,
} from "@/lib/db/repositories/push.repository";
import { buildPushPayload, pushRetryDelay, type LockScreenDetail, type PushPayload, type PushPriority } from "@/server/push/payload";

// D-252: Web Push (VAPID). The server queues one delivery per device with
// each notification and sends them in the background: right after the action
// (a drain in this process) and on every job run. Nothing waits for a push.

export interface PushConfig {
  enabled: boolean;
  publicKey: string | null;
  privateKey: string | null;
  subject: string;
  detail: LockScreenDetail;
}

let cached: { at: number; config: PushConfig } | null = null;

// Read fresh at most every 30 seconds (a change in Super Admin applies quickly).
export async function getPushConfig(fresh = false): Promise<PushConfig> {
  if (!fresh && cached && Date.now() - cached.at < 30_000) return cached.config;
  const [enabled, publicKey, privateKey, subject, detail] = await Promise.all(
    ["push.enabled", "push.vapid_public_key", "push.vapid_private_key", "push.vapid_subject", "push.lock_screen_detail"].map((key) => getSettingValue(key).catch(() => null)),
  );
  const config: PushConfig = {
    enabled: enabled !== "OFF",
    publicKey: publicKey || null,
    privateKey: privateKey || null,
    subject: subject || "mailto:itadmin@arssteels.co.in",
    detail: detail === "FULL" || detail === "GENERIC" ? detail : "TITLE",
  };
  cached = { at: Date.now(), config };
  return config;
}

export function clearPushConfigCache(): void {
  cached = null;
}

export const pushReady = (config: PushConfig) => config.enabled && Boolean(config.publicKey && config.privateKey);

// New VAPID keys (Super Admin → Settings → Phone & desktop notifications).
// Browsers registered with the old public key must register again; the app
// does that by itself on the next visit.
export function generateVapidKeys(): { publicKey: string; privateKey: string } {
  return webpush.generateVAPIDKeys();
}

// Called by notify() for each notification. Queues one delivery per active
// device; nothing is sent here.
export async function queuePushForNotification(input: {
  notificationId: number;
  userId: number;
  eventType: string;
  title: string;
  message: string;
  deepLink: string | null;
  entity?: { type: string; id: number } | null;
  priority?: PushPriority;
  skipCode: string | null; // USER_PREFERENCE / DO_NOT_DISTURB
}): Promise<{ status: "QUEUED" | "SKIPPED"; code?: string; devices: number } | null> {
  const config = await getPushConfig();
  if (!pushReady(config)) return null;
  const devices = await activeDeviceIds(input.userId);
  if (!devices.length) return null;
  if (input.skipCode) {
    await recordPushSkipped(input.notificationId, input.skipCode);
    return { status: "SKIPPED", code: input.skipCode, devices: devices.length };
  }
  const payload = buildPushPayload(input, config.detail);
  await queuePush(input.notificationId, devices, payload as unknown as Record<string, unknown>);
  schedulePushDrain();
  return { status: "QUEUED", devices: devices.length };
}

// ---- sending ----------------------------------------------------------

export type SendOutcome = { kind: "SENT" } | { kind: "GONE"; status: number } | { kind: "FAILED"; status: number | null; code: string; retryAfter: number | null };

export interface PushTransport {
  send(keys: PushKeys, payload: PushPayload, config: PushConfig): Promise<SendOutcome>;
}

// web-push builds the encrypted request (aes128gcm, VAPID JWT); fetch sends
// it, with a time limit, so a slow push service never holds the queue.
export const webPushTransport: PushTransport = {
  async send(keys, payload, config) {
    const details = webpush.generateRequestDetails({ endpoint: keys.endpoint, keys: { p256dh: keys.p256dh, auth: keys.auth } }, JSON.stringify(payload), {
      vapidDetails: { subject: config.subject, publicKey: config.publicKey!, privateKey: config.privateKey! },
      TTL: payload.priority === "HIGH" ? 4 * 60 * 60 : 24 * 60 * 60,
      urgency: payload.priority === "HIGH" ? "high" : "normal",
      contentEncoding: "aes128gcm",
    });
    let response: Response;
    try {
      response = await fetch(details.endpoint, { method: details.method, headers: details.headers as Record<string, string>, body: details.body as BodyInit | null, signal: AbortSignal.timeout(10_000) });
    } catch (error) {
      return { kind: "FAILED", status: null, code: (error as Error)?.name === "TimeoutError" ? "PUSH_TIMEOUT" : "PUSH_NETWORK", retryAfter: null };
    }
    if (response.status === 404 || response.status === 410) return { kind: "GONE", status: response.status };
    if (response.ok) return { kind: "SENT" };
    const retryAfter = Number(response.headers.get("retry-after"));
    return { kind: "FAILED", status: response.status, code: `PUSH_HTTP_${response.status}`, retryAfter: Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter : null };
  },
};

export interface DrainResult {
  sent: number;
  failed: number;
  retrying: number;
  expired: number;
  notConfigured: number;
}

async function sendOne(item: DuePush, config: PushConfig, transport: PushTransport, result: DrainResult): Promise<void> {
  const outcome = await transport.send(item.keys, item.payload as unknown as PushPayload, config).catch(
    (error): SendOutcome => {
      logError("push send failed", error, { deliveryId: item.id });
      return { kind: "FAILED", status: null, code: "PUSH_ERROR", retryAfter: null };
    },
  );
  if (outcome.kind === "SENT") {
    await markPushSent(item.id, item.subscriptionId);
    result.sent += 1;
  } else if (outcome.kind === "GONE") {
    await markPushFailed(item.id, `PUSH_GONE_${outcome.status}`, null);
    await expireSubscription(item.subscriptionId, `HTTP_${outcome.status}`);
    result.expired += 1;
  } else {
    const delay = pushRetryDelay(outcome.status, item.attemptCount + 1, outcome.retryAfter);
    await markPushFailed(item.id, outcome.code, delay);
    await noteSubscriptionFailure(item.subscriptionId, outcome.code);
    if (delay === null) result.failed += 1;
    else result.retrying += 1;
  }
}

// Send what is due, in batches, a few at a time, within a time budget (the
// rest waits for the next drain). Returns counts for the Automation page.
export async function drainPushQueue(options: { batch?: number; concurrency?: number; budgetMs?: number; transport?: PushTransport } = {}): Promise<DrainResult> {
  const result: DrainResult = { sent: 0, failed: 0, retrying: 0, expired: 0, notConfigured: 0 };
  const config = await getPushConfig(true);
  const transport = options.transport ?? webPushTransport;
  const started = Date.now();
  const budget = options.budgetMs ?? 25_000;
  const concurrency = options.concurrency ?? 20;
  while (Date.now() - started < budget) {
    const due = await leaseDuePushes(options.batch ?? 100);
    if (!due.length) break;
    if (!pushReady(config)) {
      for (const item of due) await markPushFailed(item.id, "PUSH_NOT_CONFIGURED", null);
      result.notConfigured += due.length;
      continue;
    }
    for (let index = 0; index < due.length; index += concurrency) {
      await Promise.all(due.slice(index, index + concurrency).map((item) => sendOne(item, config, transport, result)));
    }
  }
  return result;
}

// Right after an action: drain in the background of this process (one drain
// at a time; a request made while one runs makes it go round once more).
let draining = false;
let again = false;
let autoDrain = true;
// Tests drain the queue themselves (with a stand-in push service).
export function setPushAutoDrain(enabled: boolean): void {
  autoDrain = enabled;
}
export function schedulePushDrain(): void {
  if (!autoDrain) return;
  if (draining) {
    again = true;
    return;
  }
  draining = true;
  setTimeout(() => {
    void (async () => {
      do {
        again = false;
        await drainPushQueue({ budgetMs: 20_000 }).catch((error) => logError("push drain failed", error));
      } while (again);
      draining = false;
    })();
  }, 200);
}
