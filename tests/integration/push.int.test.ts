import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { RowDataPacket } from "mysql2/promise";
import webpush from "web-push";
import { getDbPool } from "@/lib/db/client";
import { encryptSecret } from "@/lib/security/encryption";
import { clearSetting, upsertSetting } from "@/lib/db/repositories/settings.repository";
import { listDevicesForUser, removeDevice, replaceSubscription, upsertSubscription } from "@/lib/db/repositories/push.repository";
import { clearPushConfigCache, drainPushQueue, setPushAutoDrain, type PushTransport, type SendOutcome } from "@/server/push/service";
import { notify } from "@/server/notifications/notify";
import { resolveAudience } from "@/server/notifications/broadcast";
import { createSession, sessionLive } from "@/lib/db/repositories/sessions.repository";
import { createDepartment, createUser, setDepartment } from "./helpers";

// D-252: devices, the push queue and IT's audiences against the database;
// D-250: the daily session row. The push service is a stand-in (no network).
const keysOf = (n: number) => ({ endpoint: `https://fcm.googleapis.com/fcm/send/int-${Date.now().toString(36)}-${n}`, p256dh: "B".repeat(87), auth: "a".repeat(22) });
let alice: number;
let bob: number;
let gone: number;
let adminId: number;

const setSetting = async (key: string, value: string, encrypted = false) =>
  upsertSetting({ key, group: "PUSH", valueType: "STRING", encrypted, storedValue: encrypted ? encryptSecret(value) : value, updatedBy: adminId });

beforeAll(async () => {
  setPushAutoDrain(false);
  adminId = await createUser({ name: "Push admin", roles: ["IT_ADMIN"] });
  alice = await createUser({ name: "Push Alice" });
  bob = await createUser({ name: "Push Bob" });
  gone = await createUser({ name: "Push Gone", active: false });
  const keys = webpush.generateVAPIDKeys();
  await setSetting("push.enabled", "ON");
  await setSetting("push.vapid_public_key", keys.publicKey);
  await setSetting("push.vapid_private_key", keys.privateKey, true);
  clearPushConfigCache();
});

afterAll(async () => {
  for (const key of ["push.vapid_public_key", "push.vapid_private_key"]) await clearSetting(key, adminId).catch(() => undefined);
  clearPushConfigCache();
  setPushAutoDrain(true);
});

// The stand-in push service: answers per endpoint as told, and records what it got.
function fakeService(answers: Record<string, SendOutcome>): PushTransport & { sent: { endpoint: string; title: string; body: string }[] } {
  const sent: { endpoint: string; title: string; body: string }[] = [];
  return {
    sent,
    async send(keys, payload) {
      sent.push({ endpoint: keys.endpoint, title: payload.title, body: payload.body });
      return answers[keys.endpoint] ?? { kind: "SENT" };
    },
  };
}

describe("devices", () => {
  it("a person can register several devices; one browser is one row; another person signing in on it takes it over", async () => {
    const phone = keysOf(1);
    const laptop = keysOf(2);
    const first = await upsertSubscription({ userId: alice, keys: phone, deviceType: "PHONE", browser: "Chrome", operatingSystem: "Android", installed: true, permission: "granted" });
    await upsertSubscription({ userId: alice, keys: laptop, deviceType: "DESKTOP", browser: "Edge", operatingSystem: "Windows", installed: false, permission: "granted" });
    const again = await upsertSubscription({ userId: alice, keys: phone, deviceType: "PHONE", browser: "Chrome", operatingSystem: "Android", installed: true, permission: "granted" });
    expect(again).toMatchObject({ id: first.id, created: false, movedFrom: null });
    expect((await listDevicesForUser(alice)).filter((device) => device.status === "ACTIVE")).toHaveLength(2);
    // The keys are stored encrypted, never as given.
    const [[row]] = await getDbPool().query<RowDataPacket[]>("SELECT p256dh_enc, auth_enc FROM push_subscriptions WHERE id = ?", [first.id]);
    expect(row!.p256dh_enc).not.toContain("BBBB");
    // Bob signs in on Alice's laptop browser: it is his now.
    const taken = await upsertSubscription({ userId: bob, keys: laptop, deviceType: "DESKTOP", browser: "Edge", operatingSystem: "Windows", installed: false, permission: "granted" });
    expect(taken.movedFrom).toBe(alice);
    expect((await listDevicesForUser(alice)).map((device) => device.browser)).toEqual(["Chrome"]);
    // Nobody removes someone else's device.
    expect(await removeDevice(alice, taken.id)).toBe(false);
  });

  it("the browser's own renewal keeps the owner and needs the old endpoint", async () => {
    const old = keysOf(3);
    await upsertSubscription({ userId: alice, keys: old, deviceType: "PHONE", browser: "Chrome", operatingSystem: "Android", installed: true, permission: "granted" });
    const fresh = keysOf(4);
    expect(await replaceSubscription(old.endpoint, fresh)).toBe(alice);
    expect(await replaceSubscription("https://fcm.googleapis.com/fcm/send/unknown", keysOf(5))).toBeNull();
  });
});

describe("the push queue", () => {
  it("each notification is queued once per active device, sent in the background, and a gone device is expired", async () => {
    const carol = await createUser({ name: "Push Carol" });
    const ok = keysOf(10);
    const dead = keysOf(11);
    await upsertSubscription({ userId: carol, keys: ok, deviceType: "PHONE", browser: "Chrome", operatingSystem: "Android", installed: true, permission: "granted" });
    const deadRow = await upsertSubscription({ userId: carol, keys: dead, deviceType: "DESKTOP", browser: "Firefox", operatingSystem: "Windows", installed: false, permission: "granted" });
    const summary = await notify({ eventType: "APPROVAL_NEEDED", userId: carol, title: "Approval needed: X-1", message: "Amount ₹9,99,999", deepLink: "/users/requests/1", email: null, whatsappVariables: null });
    expect(summary.push).toMatchObject({ status: "QUEUED", devices: 2 });
    const service = fakeService({ [dead.endpoint]: { kind: "GONE", status: 410 } });
    await new Promise((resolve) => setTimeout(resolve, 50));
    const result = await drainPushQueue({ transport: service, budgetMs: 10_000 });
    expect(result.sent).toBeGreaterThanOrEqual(1);
    expect(result.expired).toBeGreaterThanOrEqual(1);
    // The lock screen never got the amount.
    expect(service.sent.every((item) => !item.body.includes("9,99,999"))).toBe(true);
    const [[status]] = await getDbPool().query<RowDataPacket[]>("SELECT status FROM push_subscriptions WHERE id = ?", [deadRow.id]);
    expect(status!.status).toBe("EXPIRED");
    // Nothing is sent twice.
    const second = fakeService({});
    await drainPushQueue({ transport: second, budgetMs: 5_000 });
    expect(second.sent.filter((item) => item.endpoint === ok.endpoint)).toHaveLength(0);
  });

  it("a busy push service is retried later, not given up", async () => {
    const dave = await createUser({ name: "Push Dave" });
    const busy = keysOf(20);
    await upsertSubscription({ userId: dave, keys: busy, deviceType: "PHONE", browser: "Chrome", operatingSystem: "Android", installed: true, permission: "granted" });
    await notify({ eventType: "WORK_TASK_ASSIGNED", userId: dave, title: "Task for you", message: "Count stock", deepLink: "/users/tasks/1", email: null, whatsappVariables: null });
    await new Promise((resolve) => setTimeout(resolve, 50));
    const result = await drainPushQueue({ transport: fakeService({ [busy.endpoint]: { kind: "FAILED", status: 503, code: "PUSH_HTTP_503", retryAfter: null } }), budgetMs: 5_000 });
    expect(result.retrying).toBeGreaterThanOrEqual(1);
    const [[row]] = await getDbPool().query<RowDataPacket[]>(
      "SELECT d.status, d.failure_code, d.next_retry_at > CURRENT_TIMESTAMP AS later FROM notification_deliveries d JOIN push_subscriptions s ON s.id = d.subscription_id WHERE s.user_id = ? ORDER BY d.id DESC LIMIT 1",
      [dave],
    );
    expect(row).toMatchObject({ status: "QUEUED", failure_code: "PUSH_HTTP_503" });
    expect(Number(row!.later)).toBe(1);
  });

  it("a person switched off for devices gets no push (kept in the Inbox); an inactive person gets nothing", async () => {
    const erin = await createUser({ name: "Push Erin" });
    await upsertSubscription({ userId: erin, keys: keysOf(30), deviceType: "PHONE", browser: "Chrome", operatingSystem: "Android", installed: true, permission: "granted" });
    await getDbPool().query("INSERT INTO notification_preferences (user_id, event_group, channel, enabled) VALUES (?, 'MY_REQUESTS', 'PUSH', FALSE)", [erin]);
    const off = await notify({ eventType: "REQUEST_APPROVED", userId: erin, title: "Approved", message: "Your request is approved", deepLink: null, email: null, whatsappVariables: null });
    expect(off).toMatchObject({ recorded: true, push: { status: "SKIPPED", code: "USER_PREFERENCE" } });
    expect(await notify({ eventType: "APPROVAL_NEEDED", userId: gone, title: "x", message: "y", deepLink: null, email: null, whatsappVariables: null })).toMatchObject({ inactive: true });
  });
});

describe("IT's audiences", () => {
  it("departments, heads, managers and named people, each once; never inactive people", async () => {
    const head = await createUser({ name: "Push Head" });
    const department = await createDepartment(head);
    const member = await createUser({ name: "Push Member", managerId: head });
    await setDepartment(member, department);
    const outsider = await createUser({ name: "Push Outsider" });
    const byDepartment = await resolveAudience({ everyone: false, userIds: [], departmentIds: [department], roleCodes: [], hods: false, managers: false });
    expect(byDepartment).toEqual([member]);
    const heads = await resolveAudience({ everyone: false, userIds: [outsider], departmentIds: [], roleCodes: [], hods: true, managers: true });
    expect(heads).toContain(head);
    expect(heads).toContain(outsider);
    expect(new Set(heads).size).toBe(heads.length);
    const all = await resolveAudience({ everyone: true, userIds: [], departmentIds: [], roleCodes: [], hods: false, managers: false });
    expect(all).toContain(member);
    expect(all).not.toContain(gone);
  });
});

describe("the daily session (D-250)", () => {
  it("is stored as DAILY, has no idle limit and ends at its expiry", async () => {
    const id = crypto.randomUUID();
    await createSession({ id, userId: alice, deviceId: null, authMethod: "GOOGLE", ipAddress: null, userAgent: "phone", ttlSeconds: 3600, daily: true });
    await getDbPool().query("UPDATE user_sessions SET last_seen_at = DATE_SUB(CURRENT_TIMESTAMP, INTERVAL 3 HOUR) WHERE id = ?", [id]);
    expect(await sessionLive(id, alice)).toMatchObject({ daily: true });
    await getDbPool().query("UPDATE user_sessions SET expires_at = DATE_SUB(CURRENT_TIMESTAMP, INTERVAL 1 SECOND) WHERE id = ?", [id]);
    expect(await sessionLive(id, alice)).toBeNull();
    // Signing out never touches the person's devices.
    const before = (await listDevicesForUser(alice)).length;
    await getDbPool().query("UPDATE user_sessions SET revoked_at = CURRENT_TIMESTAMP, revoke_reason = 'SIGN_OUT' WHERE user_id = ?", [alice]);
    expect((await listDevicesForUser(alice)).length).toBe(before);
  });
});
