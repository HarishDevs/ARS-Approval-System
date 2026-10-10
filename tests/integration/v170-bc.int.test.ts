import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import mysql from "mysql2/promise";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { RowDataPacket } from "mysql2/promise";
import { getDbPool } from "@/lib/db/client";
import { createWorkflow, decideTask, publishVersion, resubmitRequest, submitRequest, withdrawRequest, type Actor } from "@/server/approvals/service";
import { loadKpis, loadNow, type AnalyticsFilter } from "@/lib/db/repositories/analytics.repository";
import { loadDrill, loadDueSoon, loadHeatmap, loadHistory, loadQuality, loadStatusMix } from "@/lib/db/repositories/analytics-more.repository";
import { indiaToday, resolvePeriod } from "@/server/analytics/periods";
import type { Scope } from "@/server/analytics/scope";
import { listViews, saveView, setDefaultView, setViewShared } from "@/lib/db/repositories/analytics-views.repository";
import { createAlertRule, createSchedule, evaluateAlerts, listSchedules, ownerOf, scheduleAudience, updateSchedule } from "@/server/reports/schedules";
import { runReport } from "@/server/reports/run";
import { listExports, openExport, pruneExports, requestExport, runExportJob } from "@/server/reports/background";
import { createBackup } from "@/server/ops/backup";
import { guardAnalyticsRate, ANALYTICS_PER_MINUTE } from "@/server/analytics/rate";
import { createDepartment, createUser, pendingTaskKey } from "./helpers";

// v1.7.0 lists B and C on real MySQL: drill-down lists agree with the
// numbers, the new filters and KPIs, history, heatmap, shared and default
// views, schedule recipients, alert severity and quiet hours, background
// exports, the backup check script and the analytics rate limit.
let approver: number;
let requester: number;
let other: number;
let admin: Actor;
let workflowId: number;
let department: number;
const person = (id: number): Actor => ({ id, roles: ["USER"] });
const ORG: Scope = { kind: "ORGANISATION", label: "Whole organisation" };
const ids: Record<string, number> = {};

const filter = (extra: Partial<AnalyticsFilter> = {}): AnalyticsFilter => ({ period: resolvePeriod({ key: "7d" }, indiaToday(new Date())), workflowId, departmentId: null, ...extra });

async function raise(title: string) {
  const result = await submitRequest({ workflowId, title, fields: { amount: "10" } }, person(requester));
  if (!result.ok) throw new Error(result.message);
  return result.value.requestId;
}

beforeAll(async () => {
  approver = await createUser({ name: "BC Approver" });
  department = await createDepartment(null);
  requester = await createUser({ name: "BC Requester", departmentId: department });
  other = await createUser({ name: "BC Other" });
  const adminId = await createUser({ roles: ["USER", "IT_ADMIN"] });
  admin = { id: adminId, roles: ["USER", "IT_ADMIN"] };
  const created = await createWorkflow(
    {
      code: `BC_${Date.now()}`,
      name: "BC type",
      kind: "PREDEFINED",
      requestPrefix: "BC",
      form: [{ key: "amount", label: "Amount", type: "NUMBER", required: true }],
      definition: {
        nodes: [
          { id: "start", kind: "START", label: "Start" },
          { id: "a", kind: "APPROVAL", label: "BC Check", approvers: [{ type: "USER", userId: approver }], completion: { type: "ALL" }, slaHours: 4 },
          { id: "end", kind: "END", label: "End" },
        ],
        edges: [
          { id: "e1", from: "start", to: "a" },
          { id: "e2", from: "a", to: "end" },
        ],
      },
    },
    admin,
  );
  if (!created.ok) throw new Error(created.message);
  await publishVersion(created.value.versionId, admin);
  workflowId = created.value.workflowId;
  const decide = async (id: number, decision: "APPROVE" | "REQUEST_CHANGES") => {
    const result = await decideTask({ requestId: id, taskKey: await pendingTaskKey(id, approver), decision, comment: decision === "APPROVE" ? undefined : "Fix the amount" }, person(approver));
    if (!result.ok) throw new Error(result.message);
  };
  ids.firstPass = await raise("BC first pass");
  await decide(ids.firstPass, "APPROVE");
  ids.rework = await raise("BC rework");
  await decide(ids.rework, "REQUEST_CHANGES");
  const again = await resubmitRequest({ requestId: ids.rework }, person(requester));
  if (!again.ok) throw new Error(again.message);
  await decide(ids.rework, "APPROVE");
  ids.withdrawn = await raise("BC withdrawn");
  await withdrawRequest({ requestId: ids.withdrawn }, person(requester));
  ids.pending = await raise("BC pending");
  ids.overdue = await raise("BC overdue");
  ids.dueToday = await raise("BC due today");
  await getDbPool().query("UPDATE approval_tasks SET due_at = DATE_SUB(CURRENT_TIMESTAMP, INTERVAL 2 HOUR), created_at = DATE_SUB(CURRENT_TIMESTAMP, INTERVAL 5 HOUR) WHERE request_id = ? AND status = 'PENDING'", [ids.overdue]);
  await getDbPool().query("UPDATE approval_tasks SET due_at = DATE_ADD(CURRENT_TIMESTAMP, INTERVAL 1 MINUTE) WHERE request_id = ? AND status = 'PENDING'", [ids.dueToday]);
  await getDbPool().query("UPDATE approval_tasks SET due_at = DATE_ADD(CURRENT_TIMESTAMP, INTERVAL 3 DAY) WHERE request_id = ? AND status = 'PENDING'", [ids.pending]);
});

afterAll(async () => {
  await getDbPool().end();
});

const drillIds = async (kind: Parameters<typeof loadDrill>[0], extra: Partial<AnalyticsFilter> = {}, scope: Scope = ORG, viewer: Actor = admin) => (await loadDrill(kind, scope, viewer, filter(extra))).rows.map((row) => row.id).sort();

describe("B01 drill-down lists match the numbers", () => {
  it("raised, approved, withdrawn, open, pending, overdue, due soon, sent back", async () => {
    const kpis = await loadKpis(ORG, admin, filter());
    const now = await loadNow(ORG, admin, filter());
    expect(kpis.raised).toBe(6);
    expect(await drillIds("raised")).toHaveLength(kpis.raised);
    expect(await drillIds("approved")).toEqual([ids.firstPass, ids.rework].sort());
    expect(kpis.approved).toBe(2);
    expect(await drillIds("withdrawn")).toEqual([ids.withdrawn]);
    expect(await drillIds("open")).toHaveLength(now.openRequests);
    expect(await drillIds("pending")).toHaveLength(now.pendingRequests);
    expect(await drillIds("overdue")).toEqual([ids.overdue]);
    expect(now.overdueRequests).toBe(1);
    const due = await loadDueSoon(ORG, admin, filter());
    expect(await drillIds("due_today")).toContain(ids.dueToday);
    expect((await drillIds("due_week")).length).toBe(due.dueWeek);
    expect(await drillIds("sent_back")).toEqual([ids.rework]);
    // A requester's own scope never shows another person's request.
    const mine = await loadDrill("raised", { kind: "MINE", label: "Mine" }, person(other), filter());
    expect(mine.rows).toHaveLength(0);
  });
});

describe("B02 filters narrow every number", () => {
  it("status, approver, step, response time and age", async () => {
    expect((await loadKpis(ORG, admin, filter({ status: "APPROVED" }))).raised).toBe(2);
    expect((await loadKpis(ORG, admin, filter({ approverId: approver }))).raised).toBe(6);
    expect((await loadKpis(ORG, admin, filter({ approverId: other }))).raised).toBe(0);
    expect((await loadKpis(ORG, admin, filter({ step: "BC Check" }))).raised).toBe(6);
    expect((await loadKpis(ORG, admin, filter({ step: "No such step" }))).raised).toBe(0);
    expect(await drillIds("open", { sla: "BREACHED" })).toEqual([ids.overdue]);
    expect((await loadNow(ORG, admin, filter({ aging: "lt1d" }))).openRequests).toBe(3);
    expect((await loadNow(ORG, admin, filter({ aging: "gt30d" }))).openRequests).toBe(0);
  });
});

describe("B03 quality KPIs", () => {
  it("median time, first pass, rework and withdrawal rates", async () => {
    const quality = await loadQuality(ORG, admin, filter());
    expect(quality.closed).toBe(3);
    expect(quality.firstPassRate).toBe(50);
    expect(quality.reworkRate).toBe(50);
    expect(quality.withdrawalRate).toBe(33.3);
    expect(quality.medianCycleHours).not.toBeNull();
  });
});

describe("B05 charts", () => {
  it("status mix, history and the department × step heatmap", async () => {
    expect(await loadStatusMix(ORG, admin, filter())).toMatchObject({ APPROVED: 2, CANCELLED: 1, IN_PROGRESS: 3 });
    const history = await loadHistory(ORG, admin, filter());
    const last = history.points.at(-1)!;
    expect(last.backlog).toBe(3);
    expect(last.overdue).toBe(1);
    expect(history.points.reduce((sum, point) => sum + point.approved, 0)).toBe(2);
    expect(history.points.reduce((sum, point) => sum + point.sentBack, 0)).toBe(1);
    expect(history.points.reduce((sum, point) => sum + point.breaches, 0)).toBe(1);
    const heatmap = await loadHeatmap(ORG, admin, filter());
    const row = heatmap.departments.find((name) => name.startsWith("Department"));
    expect(row && heatmap.cells[row]?.["BC Check"]).toBe(3);
  });
});

describe("B07 shared and default views", () => {
  it("others see a shared view; only the owner changes it; one default per page", async () => {
    await saveView({ userId: requester, target: "DASHBOARD", name: "BC shared", query: { period: "30d" }, shared: true });
    await saveView({ userId: requester, target: "DASHBOARD", name: "BC private", query: { period: "7d" } });
    const theirs = await listViews(other, "DASHBOARD");
    const shared = theirs.find((view) => view.name === "BC shared");
    expect(shared).toMatchObject({ mine: false, ownerName: "BC Requester" });
    expect(theirs.some((view) => view.name === "BC private")).toBe(false);
    expect(await setViewShared(other, shared!.id, false)).toBe(false);
    const mine = await listViews(requester, "DASHBOARD");
    const [a, b] = [mine.find((view) => view.name === "BC shared")!, mine.find((view) => view.name === "BC private")!];
    await setDefaultView(requester, a.id, true);
    await setDefaultView(requester, b.id, true);
    const after = await listViews(requester, "DASHBOARD");
    expect(after.filter((view) => view.isDefault).map((view) => view.name)).toEqual(["BC private"]);
    // Someone else's default never shows as mine.
    expect((await listViews(other, "DASHBOARD")).some((view) => view.isDefault)).toBe(false);
  });
});

describe("B06 schedule recipients", () => {
  it("edits keep the history; each recipient gets their own scope or is skipped", async () => {
    const it2 = await createUser({ roles: ["USER", "IT_ADMIN"], name: "BC IT two" });
    const id = await createSchedule({ userId: admin.id, reportKey: "request_register", query: { scope: "ORGANISATION", type: String(workflowId) }, format: "csv", frequency: "DAILY", weekday: null, monthDay: null, hourIst: 8, recipients: [requester, it2] });
    expect(await updateSchedule(admin.id, id, { format: "xlsx", frequency: "WEEKLY", weekday: 3, monthDay: null, hourIst: 9, recipients: [requester, it2, admin.id] })).toBe(true);
    expect(await updateSchedule(other, id, { format: "csv", frequency: "DAILY", weekday: null, monthDay: null, hourIst: 8, recipients: [] })).toBe(false);
    const schedule = (await listSchedules(admin.id)).find((item) => item.id === id)!;
    expect(schedule).toMatchObject({ format: "xlsx", frequency: "WEEKLY", weekday: 3, hourIst: 9 });
    const owner = (await ownerOf(admin.id))!;
    const ran = (await runReport("request_register", { scope: "ORGANISATION", type: String(workflowId) }, admin))!;
    const { audience, skippedPeople } = await scheduleAudience(schedule, owner, ran, new Date());
    expect(audience.map((entry) => entry.person.id)).toEqual([admin.id, it2]);
    expect(skippedPeople).toBe(1); // the requester has no organisation scope
    expect(audience[1]!.ran.result.rows).toHaveLength(6);
  });
});

describe("B08 alert severity, quiet hours and channels", () => {
  it("quiet hours hold a warning; a critical alert goes at once, inbox only when chosen", async () => {
    const hour = new Date(Date.now() + 330 * 60_000).getUTCHours();
    const quiet = { quietStart: hour, quietEnd: (hour + 2) % 24 };
    const held = await createAlertRule({ userId: approver, metric: "OVERDUE_TASKS", scopeKind: "APPROVALS", threshold: 1, param: null, cooldownHours: 24, severity: "WARNING", ...quiet });
    const loud = await createAlertRule({ userId: approver, metric: "OVERDUE_TASKS", scopeKind: "APPROVALS", threshold: 1, param: null, cooldownHours: 24, severity: "CRITICAL", channels: "INBOX", ...quiet });
    const result = await evaluateAlerts();
    expect(result.alertsHeld).toBeGreaterThanOrEqual(1);
    const events = async (rule: number) => Number((await getDbPool().query<RowDataPacket[]>("SELECT COUNT(*) AS n FROM alert_events WHERE rule_id = ?", [rule]))[0][0]!.n);
    expect(await events(held)).toBe(0);
    expect(await events(loud)).toBe(1);
    const [notes] = await getDbPool().query<RowDataPacket[]>("SELECT id, title FROM notifications WHERE user_id = ? AND event_type = 'ANALYTICS_ALERT' ORDER BY id DESC LIMIT 1", [approver]);
    expect(notes[0]!.title).toMatch(/^Critical:/);
    const [emails] = await getDbPool().query<RowDataPacket[]>("SELECT COUNT(*) AS n FROM notification_deliveries WHERE notification_id = ? AND channel = 'EMAIL'", [notes[0]!.id]);
    expect(Number(emails[0]!.n)).toBe(0);
  });
});

describe("C02 background exports", () => {
  it("made with the owner's permissions, downloadable by them only, removed after 7 days", async () => {
    const asked = await requestExport(admin, "request_register", { scope: "ORGANISATION", type: String(workflowId) }, "csv");
    if (!asked.ok) throw new Error(asked.message);
    expect(await runExportJob(asked.id)).toBe("DONE");
    expect(await runExportJob(asked.id)).toBe("SKIPPED"); // made once
    const [job] = await listExports(admin.id, 1);
    expect(job).toMatchObject({ status: "DONE", rows: 6 });
    const file = await openExport(asked.id, admin.id);
    expect(file?.body.toString("utf8")).toContain("BC first pass");
    expect(await openExport(asked.id, other)).toBeNull();
    // A requester can't export an organisation-only report.
    expect((await requestExport(person(requester), "department_summary", {}, "csv")).ok).toBe(false);
    await getDbPool().query("UPDATE export_jobs SET expires_at = DATE_SUB(CURRENT_TIMESTAMP, INTERVAL 1 MINUTE) WHERE id = ?", [asked.id]);
    expect(await pruneExports()).toBeGreaterThanOrEqual(1);
    expect(await openExport(asked.id, admin.id)).toBeNull();
    const [[row]] = await getDbPool().query<RowDataPacket[]>("SELECT status, file_name FROM export_jobs WHERE id = ?", [asked.id]);
    expect(row).toMatchObject({ status: "EXPIRED", file_name: null });
  });
});

describe("C04 analytics rate limit", () => {
  it("slows a burst down per person", async () => {
    const someone = await createUser({ name: "BC Burst" });
    for (let index = 0; index < ANALYTICS_PER_MINUTE; index += 1) expect(await guardAnalyticsRate(someone)).toBe(false);
    expect(await guardAnalyticsRate(someone)).toBe(true);
    expect(await guardAnalyticsRate(other)).toBe(false);
  });
});

describe("C03 backup check script", () => {
  const host = process.env.TEST_DB_HOST ?? "127.0.0.1";
  const port = Number(process.env.TEST_DB_PORT ?? 3307);
  const appUser = process.env.TEST_DB_USER ?? "ars_dev";
  const appPassword = process.env.TEST_DB_PASSWORD ?? "ars_dev_password";
  const rootPassword = process.env.TEST_DB_ROOT_PASSWORD ?? "ars_root_password";
  const target = "ars_verify_check_test";
  const work = fs.mkdtempSync(path.join(os.tmpdir(), "ars-verify-"));
  const script = path.resolve(__dirname, "../../scripts/database/verify-backup.js");
  const env = { ...process.env, DB_HOST: host, DB_PORT: String(port), DB_NAME: "ars_approvals_test", DB_USER: appUser, DB_PASSWORD: appPassword };

  it("restores into an empty database and proves every table and trigger; refuses the live or a used database", async () => {
    const backup = await createBackup({ dir: path.join(work, "backups"), uploadDir: path.join(work, "uploads") });
    const root = await mysql.createConnection({ host, port, user: "root", password: rootPassword });
    try {
      await root.query(`DROP DATABASE IF EXISTS \`${target}\``);
      await root.query(`CREATE DATABASE \`${target}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`);
      await root.query(`GRANT ALL PRIVILEGES ON \`${target}\`.* TO ?@'%'`, [appUser]);
      const reportFile = path.join(work, "report.json");
      const output = execFileSync(process.execPath, [script, backup.file, `--into=${target}`, `--report=${reportFile}`], { env, stdio: "pipe" }).toString();
      expect(output).toMatch(/OK: every table/);
      const report = JSON.parse(fs.readFileSync(reportFile, "utf8")) as { ok: boolean; tables: number; triggers: number; problems: string[] };
      expect(report).toMatchObject({ ok: true, problems: [] });
      expect(report.tables).toBe(backup.tables);
      expect(report.triggers).toBeGreaterThan(0);
      // The same database again: it now has tables, so the check refuses.
      expect(() => execFileSync(process.execPath, [script, backup.file, `--into=${target}`], { env, stdio: "pipe" })).toThrow();
      // Never the app's own database.
      expect(() => execFileSync(process.execPath, [script, backup.file, "--into=ars_approvals_test"], { env, stdio: "pipe" })).toThrow();
    } finally {
      await root.query(`DROP DATABASE IF EXISTS \`${target}\``);
      await root.end();
      fs.rmSync(work, { recursive: true, force: true });
    }
  });
});
