import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import type { RowDataPacket } from "mysql2/promise";
import { getDbPool } from "@/lib/db/client";
import { recordRunnerHeartbeat } from "@/lib/db/repositories/jobs.repository";
import { connectionByUser, listConflicts, updateConnection } from "@/lib/db/repositories/gcal.repository";
import { createModuleType, publishTypeDraft, saveTypeDraft } from "@/server/modules/config";
import { DEFAULT_INFO_SETTINGS, DEFAULT_TASK_SETTINGS } from "@/server/modules/settings";
import { createTask } from "@/server/modules/tasks";
import { saveInformation } from "@/server/modules/information";
import { DEFAULT_CONFIG } from "@/server/calendar/config";
import {
  availability,
  createPersonalItem,
  disconnect,
  editPersonalItem,
  finishConnect,
  handleNotification,
  myCalendars,
  resolveConflict,
  saveConfiguration,
  setIntegrationEnabled,
  startConnect,
  testConfiguration,
} from "@/server/calendar/service";
import { hashChannelToken, syncConnection, SyncStop } from "@/server/calendar/sync";
import { processDueJobs } from "@/server/calendar/jobs";
import { FAKE_CLIENT_ID, FAKE_CLIENT_SECRET, FAKE_REFRESH, FakeGoogle } from "../helpers/fake-google";
import { createDepartment, createUser, setDepartment } from "./helpers";

// v1.11.0 Google Calendar two-way sync on real MySQL, with Google mocked
// (tests/helpers/fake-google.ts): configuration, OAuth, both directions,
// idempotency, loops, deletions, conflicts, retries, revocation, isolation.
process.env.APP_BASE_URL = "https://approval.example.test";
const google = new FakeGoogle();
const sql = async (text: string, params: unknown[] = []) => (await getDbPool().query<RowDataPacket[]>(text, params))[0];
const CAL = "primary";

let superAdmin: { id: number; roles: string[] };
let person: number;
let other: number;
let creator: number;
let connectionId: number;
let taskTypeId: number;
let taskId: number;

const writes = () => google.calls.filter((call) => call.method !== "GET" && call.path.includes("/events")).length;
const sync = async () => syncConnection(connectionId);

async function connect(userId: number, email: string) {
  const started = await startConnect({ id: userId, email });
  if (!started.ok) throw new Error(started.message);
  const state = new URL(started.value.url).searchParams.get("state");
  return finishConnect({ id: userId }, { code: "good-code", state, error: null }, started.value.nonce);
}

beforeAll(async () => {
  vi.stubGlobal("fetch", google.fetch);
  const sa = await createUser({ name: "V111 Super", roles: ["USER", "SUPER_ADMIN"] });
  superAdmin = { id: sa, roles: ["USER", "SUPER_ADMIN"] };
  person = await createUser({ name: "V111 Person" });
  other = await createUser({ name: "V111 Other" });
  creator = await createUser({ name: "V111 Creator" });
  const department = await createDepartment(null);
  for (const id of [person, other, creator]) await setDepartment(id, department);
  const type = await createModuleType("TASK", { code: `V111_T${Date.now() % 100000}`, name: "V111 Task" }, superAdmin as never);
  taskTypeId = type.ok ? type.value.id : 0;
  await saveTypeDraft("TASK", taskTypeId, { name: "V111 Task", form: [], settings: { ...DEFAULT_TASK_SETTINGS, assignScope: "SAME_DEPARTMENT", completion: "NOTE" } }, superAdmin as never);
  await publishTypeDraft("TASK", taskTypeId, superAdmin as never);
  await recordRunnerHeartbeat();
});

afterAll(async () => {
  vi.unstubAllGlobals();
  await sql("UPDATE gcal_settings SET enabled = FALSE, client_id = NULL, client_secret_enc = NULL, last_test_ok = NULL, config_json = JSON_OBJECT() WHERE id = 1");
});

describe("Super Admin configuration", () => {
  it("only the Super Admin changes it; bad values are refused; the secret is stored encrypted and never audited", async () => {
    const input = { clientId: FAKE_CLIENT_ID, clientSecret: FAKE_CLIENT_SECRET, config: DEFAULT_CONFIG };
    expect(await saveConfiguration({ id: person, roles: ["USER", "IT_ADMIN"] }, input)).toMatchObject({ ok: false });
    expect(await saveConfiguration(superAdmin, { ...input, clientId: "not-a-client" })).toMatchObject({ ok: false, message: expect.stringMatching(/client ID/) });
    expect(await saveConfiguration(superAdmin, { ...input, config: { ...DEFAULT_CONFIG, titleTemplate: "{amount} due" } })).toMatchObject({ ok: false });
    expect(await saveConfiguration(superAdmin, input)).toEqual({ ok: true, value: { secretChanged: true } });
    const [row] = await sql("SELECT client_secret_enc FROM gcal_settings WHERE id = 1");
    expect(String(row!.client_secret_enc)).not.toContain(FAKE_CLIENT_SECRET);
    const audit = await sql("SELECT metadata_json FROM audit_logs WHERE action = 'GCAL_CREDENTIALS_ROTATED' ORDER BY id DESC LIMIT 1");
    expect(JSON.stringify(audit[0]!.metadata_json)).not.toContain(FAKE_CLIENT_SECRET);
  });

  it("can't be enabled until the checks pass; Test configuration asks Google about the client", async () => {
    google.failNext((_method, path) => path === "/token", 401, "invalid_client");
    const refused = await setIntegrationEnabled(superAdmin, true);
    expect(refused).toMatchObject({ ok: false, message: expect.stringMatching(/rejected the client/) });
    expect((await availability()).active).toBe(false);
    const test = await testConfiguration(superAdmin);
    expect(test.ok && test.value.checks.find((check) => check.key === "google")?.ok).toBe(true);
    expect(test.ok && test.value.ok).toBe(true);
    expect(await setIntegrationEnabled(superAdmin, true)).toMatchObject({ ok: true });
    expect((await availability()).active).toBe(true);
  });

  it("disabled: nobody can start a connection (takes effect at once, no restart)", async () => {
    await setIntegrationEnabled(superAdmin, false);
    expect(await startConnect({ id: person, email: "p@example.com" })).toMatchObject({ ok: false });
    await setIntegrationEnabled(superAdmin, true);
    expect((await startConnect({ id: person, email: "p@example.com" })).ok).toBe(true);
  });
});

describe("OAuth connection", () => {
  it("refuses a wrong nonce, another person's state, a reused state, and a denial", async () => {
    const started = await startConnect({ id: person, email: "p@example.com" });
    const state = started.ok ? new URL(started.value.url).searchParams.get("state") : null;
    expect(started.ok && new URL(started.value.url).searchParams.get("scope")).toContain("calendar.events.owned");
    expect(await finishConnect({ id: other }, { code: "good-code", state, error: null }, started.ok ? started.value.nonce : null)).toEqual({ ok: false, error: "STATE" });
    expect(await finishConnect({ id: person }, { code: "good-code", state, error: null }, "forged-nonce")).toEqual({ ok: false, error: "STATE" });
    const again = await startConnect({ id: person, email: "p@example.com" });
    const againState = again.ok ? new URL(again.value.url).searchParams.get("state") : null;
    expect(await finishConnect({ id: person }, { code: null, state: againState, error: "access_denied" }, again.ok ? again.value.nonce : null)).toEqual({ ok: false, error: "DENIED" });
    expect(await finishConnect({ id: person }, { code: "good-code", state: againState, error: null }, again.ok ? again.value.nonce : null)).toEqual({ ok: false, error: "STATE" });
    const failures = await sql("SELECT COUNT(*) AS n FROM audit_logs WHERE action = 'GCAL_CONNECT_FAILED' AND actor_user_id IN (?, ?)", [person, other]);
    expect(Number(failures[0]!.n)).toBeGreaterThanOrEqual(4);
  });

  it("connects: tokens stored encrypted, primary calendar, first sync and channel queued", async () => {
    expect(await connect(person, "p@example.com")).toEqual({ ok: true });
    const connection = (await connectionByUser(person))!;
    connectionId = connection.id;
    expect(connection).toMatchObject({ status: "ACTIVE", googleEmail: "person@example.com", calendarId: "primary" });
    expect(connection.refreshTokenEnc).not.toContain(FAKE_REFRESH);
    const jobs = await sql("SELECT kind FROM gcal_jobs WHERE connection_id = ? AND status = 'PENDING' ORDER BY kind", [connectionId]);
    expect(jobs.map((job) => job.kind)).toEqual(["FULL_RESYNC", "RENEW_CHANNEL"]);
    const processed = await processDueJobs({ budgetMs: 20_000, maxJobs: 10, connectionId });
    expect(processed.done).toBe(2);
    expect((await connectionByUser(person))!.channelId).toBeTruthy();
    // v1.12.2 (D-162): only calendars the person owns are offered (the scope covers no others).
    const calendars = await myCalendars(person);
    expect(calendars.ok && calendars.value.map((calendar) => calendar.id)).toEqual(["person@example.com"]);
  });
});

describe("ARS → Google", () => {
  it("a task due date becomes a private event with the reference only; the task is untouched; a second run writes nothing", async () => {
    const due = new Date(Date.now() + 3 * 86_400_000 + 330 * 60_000).toISOString().slice(0, 16);
    const created = await createTask(
      { typeId: taskTypeId, title: "Confidential pump repair", description: "Secret", priority: "NORMAL", assigneeId: person, due, startsOn: "", related: "", fields: {}, submissionKey: crypto.randomUUID(), files: [] },
      { id: creator, name: "V111 Creator", roles: ["USER"] } as never,
    );
    if (!created.ok) throw new Error(created.message);
    taskId = created.value.id;
    const [task] = await sql("SELECT task_no, status FROM tasks WHERE id = ?", [taskId]);
    const result = await sync();
    expect(result.created).toBeGreaterThanOrEqual(1);
    const event = google.live(CAL).find((item) => item.extendedProperties?.private?.arsType === "TASK" && item.extendedProperties.private.arsId === String(taskId))!;
    expect(event.summary).toBe(`Task due: ${task!.task_no}`);
    expect(event.description).toContain(`https://approval.example.test/users/tasks/${taskId}`);
    expect(JSON.stringify(event)).not.toContain("Confidential");
    expect(event.visibility).toBe("private");
    expect((await sql("SELECT status FROM tasks WHERE id = ?", [taskId]))[0]!.status).toBe(task!.status);
    const before = writes();
    await sync();
    expect(writes()).toBe(before); // idempotent: nothing new to write
  });

  it("a changed due date updates the same event; completing the task removes it (policy) without completing anything else", async () => {
    await sql("UPDATE tasks SET due_at = DATE_ADD(due_at, INTERVAL 1 DAY) WHERE id = ?", [taskId]);
    const result = await sync();
    expect(result.updated).toBe(1);
    expect(google.live(CAL).filter((item) => item.extendedProperties?.private?.arsId === String(taskId))).toHaveLength(1);
    await sql("UPDATE tasks SET status = 'COMPLETED' WHERE id = ?", [taskId]);
    expect((await sync()).removed).toBe(1);
    expect(google.live(CAL).some((item) => item.extendedProperties?.private?.arsId === String(taskId))).toBe(false);
    const [link] = await sql("SELECT state FROM gcal_links WHERE connection_id = ? AND entity_type = 'TASK' AND entity_id = ?", [connectionId, taskId]);
    expect(link!.state).toBe("CANCELLED");
  });

  it("other people's work never reaches this calendar (isolation)", async () => {
    const due = new Date(Date.now() + 2 * 86_400_000).toISOString().slice(0, 16);
    await createTask({ typeId: taskTypeId, title: "Other's task", description: "", priority: "NORMAL", assigneeId: other, due, startsOn: "", related: "", fields: {}, submissionKey: crypto.randomUUID(), files: [] }, { id: creator, name: "V111 Creator", roles: ["USER"] } as never);
    await sync();
    expect(JSON.stringify(google.live(CAL))).not.toContain("Other's task");
    const links = await sql("SELECT COUNT(*) AS n FROM gcal_links l JOIN tasks t ON t.id = l.entity_id AND l.entity_type = 'TASK' WHERE l.connection_id = ? AND t.assignee_id = ?", [connectionId, other]);
    expect(Number(links[0]!.n)).toBe(0);
  });

  it("information goes on the calendar only when its type is marked for calendars", async () => {
    const effective = new Date(Date.now() + 5 * 86_400_000 + 330 * 60_000).toISOString().slice(0, 10);
    const ids: Record<string, number> = {};
    for (const calendar of [true, false]) {
      const type = await createModuleType("INFO", { code: `V111_I${calendar ? 1 : 0}${Date.now() % 10000}`, name: `V111 Info ${calendar}` }, superAdmin as never);
      const typeId = type.ok ? type.value.id : 0;
      await saveTypeDraft("INFO", typeId, { name: `V111 Info ${calendar}`, form: [], settings: { ...DEFAULT_INFO_SETTINGS, calendar } }, superAdmin as never);
      await publishTypeDraft("INFO", typeId, superAdmin as never);
      const saved = await saveInformation(
        { infoId: null, typeId, rowVersion: null, title: `Training ${calendar}`, body: "Body", priority: "NORMAL", askAck: false, effectiveOn: effective, expiresOn: "", targets: { people: [person], departments: [], groups: [], everyone: false }, fields: {}, files: [], publish: true },
        { id: creator, name: "V111 Creator", roles: ["USER"] } as never,
      );
      if (!saved.ok) throw new Error(saved.message);
      ids[String(calendar)] = saved.value.id;
    }
    await sync();
    const infoEvents = google.live(CAL).filter((item) => item.extendedProperties?.private?.arsType === "INFO");
    expect(infoEvents.map((item) => item.extendedProperties!.private!.arsId)).toEqual([String(ids.true)]);
    expect(infoEvents[0]!.start).toEqual({ date: effective });
    // A calendar event is never an acknowledgement.
    const [recipient] = await sql("SELECT acknowledged_at FROM info_recipients WHERE info_id = ? AND user_id = ?", [ids.true, person]);
    expect(recipient!.acknowledged_at).toBeNull();
  });
});

describe("Google → ARS", () => {
  it("imports new events once (all-day and timed, across pages), updates and deletes them", async () => {
    const start = new Date(Date.now() + 86_400_000);
    google.userCreates(CAL, { summary: "Dentist", start: { dateTime: start.toISOString() }, end: { dateTime: new Date(start.getTime() + 3_600_000).toISOString() } });
    const holiday = google.userCreates(CAL, { summary: "Holiday", start: { date: "2026-12-25" }, end: { date: "2026-12-27" } });
    for (let index = 0; index < 4; index += 1) google.userCreates(CAL, { summary: `Batch ${index}`, start: { date: "2026-12-01" }, end: { date: "2026-12-02" } });
    const first = await sync();
    expect(first.imported).toBe(6);
    expect((await sync()).imported).toBe(0); // duplicates never
    const items = await sql("SELECT title, all_day, start_date, end_date, origin FROM calendar_items WHERE user_id = ? AND deleted_at IS NULL ORDER BY id", [person]);
    expect(items.map((item) => item.title)).toEqual(expect.arrayContaining(["Dentist", "Holiday", "Batch 0", "Batch 3"]));
    const holidayRow = items.find((item) => item.title === "Holiday")!;
    expect([holidayRow.all_day, new Date(holidayRow.start_date).toISOString().slice(0, 10), new Date(holidayRow.end_date).toISOString().slice(0, 10), holidayRow.origin]).toEqual([1, "2026-12-25", "2026-12-26", "GOOGLE"]);
    google.userEdits(CAL, holiday.id, { summary: "Holiday (family)" });
    expect((await sync()).updatedFromGoogle).toBe(1);
    google.userDeletes(CAL, holiday.id);
    expect((await sync()).deletedFromGoogle).toBe(1);
    expect((await sql("SELECT deleted_at FROM calendar_items WHERE user_id = ? AND title = 'Holiday (family)'", [person]))[0]!.deleted_at).not.toBeNull();
  });

  it("an ARS entry goes to Google once and its echo doesn't loop back", async () => {
    const created = await createPersonalItem({ id: person, roles: ["USER"] }, { title: "Plant visit", notes: "", allDay: true, date: "2026-12-10", endDate: "", start: "", end: "" });
    const itemId = created.ok ? created.value.id : 0;
    expect((await sync()).created).toBe(1);
    const [before] = await sql("SELECT version FROM calendar_items WHERE id = ?", [itemId]);
    const result = await sync();
    expect(result.updatedFromGoogle + result.created + result.updated).toBe(0);
    expect((await sql("SELECT version FROM calendar_items WHERE id = ?", [itemId]))[0]!.version).toBe(before!.version);
  });

  it("a Google edit to an ARS-managed event is put back (ARS is the source for business dates)", async () => {
    const due = new Date(Date.now() + 4 * 86_400_000).toISOString().slice(0, 16);
    const created = await createTask({ typeId: taskTypeId, title: "Second", description: "", priority: "NORMAL", assigneeId: person, due, startsOn: "", related: "", fields: {}, submissionKey: crypto.randomUUID(), files: [] }, { id: creator, name: "V111 Creator", roles: ["USER"] } as never);
    const id = created.ok ? created.value.id : 0;
    await sync();
    const event = google.live(CAL).find((item) => item.extendedProperties?.private?.arsId === String(id) && item.extendedProperties.private.arsType === "TASK")!;
    google.userEdits(CAL, event.id, { summary: "Moved by hand" });
    await sync();
    expect(google.live(CAL).find((item) => item.id === event.id)!.summary).toMatch(/^Task due: /);
  });

  it("a change in both places makes a conflict (manual policy); keeping the ARS version writes it to Google", async () => {
    const created = await createPersonalItem({ id: person, roles: ["USER"] }, { title: "Review", notes: "", allDay: true, date: "2026-12-12", endDate: "", start: "", end: "" });
    const itemId = created.ok ? created.value.id : 0;
    await sync();
    const [link] = await sql("SELECT google_event_id FROM gcal_links WHERE entity_type = 'ITEM' AND entity_id = ?", [itemId]);
    await editPersonalItem({ id: person, roles: ["USER"] }, itemId, { title: "Review (ARS)", notes: "", allDay: true, date: "2026-12-12", endDate: "", start: "", end: "" });
    google.userEdits(CAL, link!.google_event_id, { summary: "Review (Google)" });
    expect((await sync()).conflicts).toBe(1);
    const [conflict] = await listConflicts({ userId: person, status: "OPEN", limit: 5 });
    expect(conflict!.ars.title).toBe("Review (ARS)");
    expect(await resolveConflict({ id: other, roles: ["USER"] }, conflict!.id, "KEEP_ARS")).toMatchObject({ ok: false }); // not theirs
    expect(await resolveConflict({ id: person, roles: ["USER"] }, conflict!.id, "KEEP_ARS")).toEqual({ ok: true, value: undefined });
    await sync();
    expect(google.live(CAL).find((item) => item.id === link!.google_event_id)!.summary).toBe("Review (ARS)");
  });

  it("an expired sync token (410) does a controlled full resync without duplicates", async () => {
    const connection = (await connectionByUser(person))!;
    google.expiredSyncTokens.add(connection.syncToken!);
    const count = async () => Number((await sql("SELECT COUNT(*) AS n FROM calendar_items WHERE user_id = ? AND deleted_at IS NULL", [person]))[0]!.n);
    const before = await count();
    const result = await sync();
    expect(result.fullResync).toBe(1);
    expect(await count()).toBe(before);
  });
});

describe("notifications, retries, credentials", () => {
  it("a push notification must match channel, resource and token; duplicates make one waiting sync", async () => {
    await updateConnection(connectionId, { channelId: "chan-test", channelResourceId: "res-test", channelTokenHash: hashChannelToken("right-token") });
    await sql("DELETE FROM gcal_jobs WHERE connection_id = ? AND status = 'PENDING'", [connectionId]);
    expect(await handleNotification({ channelId: "chan-test", resourceId: "res-test", token: "wrong", state: "exists" })).toBe("UNKNOWN");
    expect(await handleNotification({ channelId: "chan-test", resourceId: "other", token: "right-token", state: "exists" })).toBe("UNKNOWN");
    expect(await handleNotification({ channelId: "chan-test", resourceId: "res-test", token: "right-token", state: "exists" })).toBe("QUEUED");
    expect(await handleNotification({ channelId: "chan-test", resourceId: "res-test", token: "right-token", state: "exists" })).toBe("QUEUED");
    const jobs = await sql("SELECT COUNT(*) AS n FROM gcal_jobs WHERE connection_id = ? AND status = 'PENDING' AND kind = 'SYNC'", [connectionId]);
    expect(Number(jobs[0]!.n)).toBe(1);
  });

  it("a temporary Google error is retried later with backoff, not lost", async () => {
    google.failNext((method, path) => method === "GET" && path.endsWith("/events"), 503, "backendError");
    await processDueJobs({ budgetMs: 20_000, maxJobs: 5, connectionId });
    const [job] = await sql("SELECT status, attempts, error_category, next_run_at > UTC_TIMESTAMP() AS later FROM gcal_jobs WHERE connection_id = ? ORDER BY id DESC LIMIT 1", [connectionId]);
    expect(job).toMatchObject({ status: "PENDING", attempts: 1, error_category: "SERVER", later: 1 });
  });

  it("an expired access token is refreshed; a withdrawn consent stops syncing with stale credentials", async () => {
    await updateConnection(connectionId, { accessExpiresAt: new Date(Date.now() - 1000) });
    const refreshes = () => google.calls.filter((call) => call.path === "/token").length;
    const before = refreshes();
    await sync();
    expect(refreshes()).toBe(before + 1);
    google.refreshValid = false;
    await updateConnection(connectionId, { accessExpiresAt: new Date(Date.now() - 1000) });
    await expect(sync()).rejects.toBeInstanceOf(SyncStop);
    expect((await connectionByUser(person))!.status).toBe("NEEDS_REAUTH");
    const calls = google.calls.length;
    expect((await sync()).skipped).toBe(1);
    expect(google.calls.length).toBe(calls);
    google.refreshValid = true;
  });

  it("reconnecting restores it; disconnecting removes ARS events if asked, revokes and forgets the tokens", async () => {
    expect(await connect(person, "p@example.com")).toEqual({ ok: true });
    await sync();
    const arsEvents = () => google.live(CAL).filter((item) => item.extendedProperties?.private?.ars === "1").length;
    expect(arsEvents()).toBeGreaterThan(0);
    expect(await disconnect({ id: other, roles: ["USER"] }, connectionId, { removeEvents: true, revokedByAdmin: false })).toMatchObject({ ok: false });
    const result = await disconnect({ id: person, roles: ["USER"] }, connectionId, { removeEvents: true, revokedByAdmin: false });
    expect(result.ok && result.value.removed).toBeGreaterThan(0);
    expect(arsEvents()).toBe(0);
    const connection = (await connectionByUser(person))!;
    expect(connection).toMatchObject({ status: "DISCONNECTED", refreshTokenEnc: null, accessTokenEnc: null });
    expect((await sync()).skipped).toBe(1);
    expect(google.calls.some((call) => call.path === "/revoke")).toBe(true);
  });
});
