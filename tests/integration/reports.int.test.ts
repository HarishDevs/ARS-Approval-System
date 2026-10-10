import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { RowDataPacket } from "mysql2/promise";
import { getDbPool } from "@/lib/db/client";
import { createWorkflow, publishVersion, submitRequest, type Actor } from "@/server/approvals/service";
import { runReport, prepareReport } from "@/server/reports/run";
import { createAlertRule, createSchedule, evaluateAlerts, runDueSchedules } from "@/server/reports/schedules";
import { reportXlsx } from "@/server/reports/export";
import { createUser } from "./helpers";

// Addendum A §10/§15 on real MySQL: report scoping, one delivery per slot,
// alerts that fire once per crossing.
let approver: number;
let requester: number;
let other: number;
let admin: Actor;
let workflowId: number;
const person = (id: number): Actor => ({ id, roles: ["USER"] });

beforeAll(async () => {
  approver = await createUser({ name: "Rep Approver" });
  requester = await createUser({ name: "Rep Requester" });
  other = await createUser({ name: "Rep Other" });
  const adminId = await createUser({ roles: ["USER", "IT_ADMIN"] });
  admin = { id: adminId, roles: ["USER", "IT_ADMIN"] };
  const created = await createWorkflow(
    {
      code: `REP_${Date.now()}`,
      name: "Report type",
      kind: "PREDEFINED",
      requestPrefix: "RP",
      form: [{ key: "amount", label: "Amount", type: "NUMBER", required: true }],
      definition: {
        nodes: [
          { id: "start", kind: "START", label: "Start" },
          { id: "a", kind: "APPROVAL", label: "Check", approvers: [{ type: "USER", userId: approver }], completion: { type: "ALL" }, slaHours: 4 },
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
  for (const [actor, title] of [[requester, "Rep mine one"], [requester, "Rep mine two"], [other, "Rep theirs"]] as const) {
    const result = await submitRequest({ workflowId, title, fields: { amount: "10" } }, person(actor));
    if (!result.ok) throw new Error(result.message);
  }
});

afterAll(async () => {
  await getDbPool().end();
});

describe("reports", () => {
  it("are scoped to the person; organisation-only reports are refused to requesters", async () => {
    const mine = await runReport("request_register", { type: String(workflowId), period: "7d" }, person(requester));
    expect(mine?.scope.kind).toBe("MINE");
    expect(mine?.result.rows.map((row) => row[1])).toEqual(expect.arrayContaining(["Rep mine one", "Rep mine two"]));
    expect(mine?.result.rows.some((row) => row[1] === "Rep theirs")).toBe(false);
    // Asking for the organisation scope doesn't widen it.
    expect((await runReport("request_register", { scope: "ORGANISATION", type: String(workflowId) }, person(requester)))?.scope.kind).toBe("MINE");
    expect(await prepareReport("department_summary", {}, person(requester))).toBeNull();
    const org = await runReport("request_register", { type: String(workflowId), period: "7d" }, admin);
    expect(org?.result.rows).toHaveLength(3);
    const pending = await runReport("pending_approvals", { type: String(workflowId) }, person(approver));
    expect(pending?.scope.kind).toBe("APPROVALS");
    expect(pending?.result.rows).toHaveLength(3);
    expect(pending?.result.rows[0]![8]).toMatch(/Within response time|Approaching/);
    const scorecard = await runReport("department_scorecard", { type: String(workflowId), period: "7d" }, admin);
    expect(scorecard?.result.rows[0]![0]).toBe("Whole organisation");
    expect(scorecard?.result.rows[0]![1]).toBe(3);
    expect(await prepareReport("department_scorecard", {}, person(requester))).toBeNull();
    expect(reportXlsx(org!.result, { title: "t", scopeLabel: "s", periodLabel: null, generatedAt: new Date(), generatedBy: "x" }).byteLength).toBeGreaterThan(500);
  });
});

describe("scheduled reports", () => {
  it("a due slot is claimed once even when two runs overlap; the next slot moves on", async () => {
    const id = await createSchedule({ userId: admin.id, reportKey: "request_register", query: { type: String(workflowId) }, format: "csv", frequency: "DAILY", weekday: null, monthDay: null, hourIst: 8 });
    await getDbPool().query("UPDATE report_schedules SET next_run_at = DATE_SUB(CURRENT_TIMESTAMP, INTERVAL 1 MINUTE) WHERE id = ?", [id]);
    await Promise.all([runDueSchedules(), runDueSchedules()]);
    const [runs] = await getDbPool().query<RowDataPacket[]>("SELECT status, message FROM report_runs WHERE schedule_id = ?", [id]);
    expect(runs).toHaveLength(1);
    // No email provider in tests: the run fails cleanly and is recorded.
    expect(runs[0]).toMatchObject({ status: "FAILED" });
    const [[schedule]] = await getDbPool().query<RowDataPacket[]>("SELECT next_run_at > CURRENT_TIMESTAMP AS moved_on, failures FROM report_schedules WHERE id = ?", [id]);
    expect(Number(schedule!.moved_on)).toBe(1);
    expect(Number(schedule!.failures)).toBe(1);
  });

  it("v1.7.1: reports are for IT only; a requester's schedule is skipped, never sent", async () => {
    const id = await createSchedule({ userId: requester, reportKey: "request_register", query: {}, format: "csv", frequency: "DAILY", weekday: null, monthDay: null, hourIst: 8 });
    await getDbPool().query("UPDATE report_schedules SET next_run_at = DATE_SUB(CURRENT_TIMESTAMP, INTERVAL 1 MINUTE) WHERE id = ?", [id]);
    await runDueSchedules();
    const [[run]] = await getDbPool().query<RowDataPacket[]>("SELECT status, message FROM report_runs WHERE schedule_id = ?", [id]);
    expect(run).toMatchObject({ status: "SKIPPED", message: expect.stringMatching(/IT team only/) });
    await getDbPool().query("UPDATE report_schedules SET active = FALSE WHERE id = ?", [id]);
  });

  it("an inactive owner's schedule is paused, not run", async () => {
    const leaver = await createUser({ name: "Rep Leaver" });
    const id = await createSchedule({ userId: leaver, reportKey: "request_register", query: {}, format: "csv", frequency: "DAILY", weekday: null, monthDay: null, hourIst: 8 });
    await getDbPool().query("UPDATE users SET active = FALSE WHERE id = ?", [leaver]);
    await getDbPool().query("UPDATE report_schedules SET next_run_at = DATE_SUB(CURRENT_TIMESTAMP, INTERVAL 1 MINUTE) WHERE id = ?", [id]);
    await runDueSchedules();
    const [[row]] = await getDbPool().query<RowDataPacket[]>("SELECT s.active, r.status FROM report_schedules s JOIN report_runs r ON r.schedule_id = s.id WHERE s.id = ?", [id]);
    expect(row).toMatchObject({ active: 0, status: "SKIPPED" });
  });
});

describe("feature switches (D-124)", () => {
  it("OFF stops scheduled reports; IT_ONLY keeps them for the IT team; ON is the default", async () => {
    const { featureOn } = await import("@/server/settings/features");
    expect(await featureOn("reports", person(requester))).toBe(true);
    await getDbPool().query("INSERT INTO system_settings (setting_key, setting_group, value) VALUES ('features.scheduled_reports', 'FEATURES', 'IT_ONLY') ON DUPLICATE KEY UPDATE value = 'IT_ONLY'");
    try {
      expect(await featureOn("scheduled_reports", person(requester))).toBe(false);
      expect(await featureOn("scheduled_reports", admin)).toBe(true);
      await getDbPool().query("UPDATE system_settings SET value = 'OFF' WHERE setting_key = 'features.scheduled_reports'");
      expect(await featureOn("scheduled_reports", admin)).toBe(false);
      const id = await createSchedule({ userId: requester, reportKey: "request_register", query: {}, format: "csv", frequency: "DAILY", weekday: null, monthDay: null, hourIst: 8 });
      await getDbPool().query("UPDATE report_schedules SET next_run_at = DATE_SUB(CURRENT_TIMESTAMP, INTERVAL 1 MINUTE) WHERE id = ?", [id]);
      expect(await runDueSchedules()).toEqual({ reportsSent: 0, reportsFailed: 0, reportsSkipped: 0 });
      const [runs] = await getDbPool().query<RowDataPacket[]>("SELECT id FROM report_runs WHERE schedule_id = ?", [id]);
      expect(runs).toHaveLength(0);
      await getDbPool().query("UPDATE report_schedules SET active = FALSE WHERE id = ?", [id]);
    } finally {
      await getDbPool().query("DELETE FROM system_settings WHERE setting_key = 'features.scheduled_reports'");
    }
  });
});

describe("alert rules", () => {
  it("fire once on crossing, not again while over the line, and again after dropping back", async () => {
    // v1.7.1: alerts are part of Reports, for the IT team only.
    await getDbPool().query("INSERT IGNORE INTO user_roles (user_id, role_id) SELECT ?, id FROM roles WHERE code = 'IT_ADMIN'", [approver]);
    const id = await createAlertRule({ userId: approver, metric: "PENDING_OLDER", scopeKind: "APPROVALS", threshold: 2, param: 1, cooldownHours: 24 });
    const events = async () => {
      const [[row]] = await getDbPool().query<RowDataPacket[]>("SELECT COUNT(*) AS n FROM alert_events WHERE rule_id = ?", [id]);
      return Number(row!.n);
    };
    await evaluateAlerts();
    expect(await events()).toBe(0); // nothing older than a day yet
    await getDbPool().query("UPDATE approval_tasks t JOIN approval_requests r ON r.id = t.request_id SET t.created_at = DATE_SUB(t.created_at, INTERVAL 3 DAY) WHERE r.title LIKE 'Rep %'");
    await evaluateAlerts();
    expect(await events()).toBe(1);
    await evaluateAlerts();
    expect(await events()).toBe(1); // still over the line: no repeat within the cool-down
    await getDbPool().query("UPDATE approval_tasks t JOIN approval_requests r ON r.id = t.request_id SET t.created_at = CURRENT_TIMESTAMP WHERE r.title LIKE 'Rep %'");
    await evaluateAlerts();
    const [[rule]] = await getDbPool().query<RowDataPacket[]>("SELECT firing, latest_value FROM alert_rules WHERE id = ?", [id]);
    expect(rule).toMatchObject({ firing: 0, latest_value: 0 });
    // A requester can't hold an alert at all (reports are IT only): it is switched off.
    const bad = await createAlertRule({ userId: requester, metric: "STUCK", scopeKind: "ORGANISATION", threshold: 1, param: null, cooldownHours: 24 });
    await evaluateAlerts();
    const [[disabled]] = await getDbPool().query<RowDataPacket[]>("SELECT active FROM alert_rules WHERE id = ?", [bad]);
    expect(Number(disabled!.active)).toBe(0);
  });
});
