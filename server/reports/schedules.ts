import "server-only";
import type { ResultSetHeader, RowDataPacket } from "mysql2/promise";
import { getDbPool } from "@/lib/db/client";
import { runReport, cleanQuery } from "@/server/reports/run";
import { exportReport, fileName, type ExportFormat } from "@/server/reports/export";
import { nextRunAt, describeSchedule, alertDecision, inQuietHours, type Frequency } from "@/server/reports/schedule-time";
import { resolveScope, taskScopeSql, type ScopeKind } from "@/server/analytics/scope";
import { loadNow, type AnalyticsFilter } from "@/lib/db/repositories/analytics.repository";
import { indiaToday, resolvePeriod } from "@/server/analytics/periods";
import { findStuckRequests } from "@/server/ops/stuck";
import { listBudgets } from "@/lib/db/repositories/budgets.repository";
import { financialYear } from "@/server/workflows/type-settings";
import { sendEmail } from "@/server/integrations/resend/client";
import { getEmailConfig } from "@/server/settings/values";
import { notify } from "@/server/notifications/notify";
import { getEnv } from "@/config/environment";
import { logError } from "@/lib/logging/logger";
import { canExport, featureMode } from "@/server/settings/features";

// D-124: OFF stops both jobs; IT_ONLY runs only for IT team owners.
async function allowedFor(person: Owner): Promise<boolean> {
  const mode = await featureMode("scheduled_reports");
  return mode === "ON" || (mode === "IT_ONLY" && (person.roles.includes("IT_ADMIN") || person.roles.includes("SUPER_ADMIN")));
}

// Scheduled reports and alert rules (Addendum A §10.5, §15, D-123). Both
// run inside the job runner and always use the owner's permissions at the
// time they run; an inactive owner's schedules and alerts are paused.
export const MAX_ATTACHMENT_BYTES = 5 * 1024 * 1024;
const base = () => getEnv().APP_BASE_URL ?? "https://approval.arssteels.net";

interface Owner {
  id: number;
  name: string;
  email: string;
  active: boolean;
  roles: string[];
}

async function owner(userId: number): Promise<Owner | null> {
  const db = getDbPool();
  const [users] = await db.query<(RowDataPacket & { id: number; name: string; email: string; active: number })[]>("SELECT id, name, email, active FROM users WHERE id = ?", [userId]);
  if (!users[0]) return null;
  const [roles] = await db.query<(RowDataPacket & { code: string })[]>("SELECT r.code FROM user_roles ur JOIN roles r ON r.id = ur.role_id WHERE ur.user_id = ? AND r.active = TRUE", [userId]);
  return { id: users[0].id, name: users[0].name, email: users[0].email, active: Boolean(users[0].active), roles: roles.map((row) => row.code) };
}

export interface ScheduleRow {
  id: number;
  userId: number;
  reportKey: string;
  query: Record<string, string>;
  format: ExportFormat;
  frequency: Frequency;
  weekday: number | null;
  monthDay: number | null;
  hourIst: number;
  active: boolean;
  nextRunAt: Date;
  lastRunAt: Date | null;
  lastStatus: string | null;
  failures: number;
  recipients: number[]; // B06: extra recipients (user ids)
}

type Row = RowDataPacket & { id: number; user_id: number; report_key: string; query_json: unknown; format: ExportFormat; frequency: Frequency; weekday: number | null; month_day: number | null; hour_ist: number; active: number; next_run_at: Date; last_run_at: Date | null; last_status: string | null; failures: number; recipients_json: unknown };
const recipientsOf = (value: unknown): number[] => {
  const parsed = typeof value === "string" ? (JSON.parse(value) as unknown) : value;
  return Array.isArray(parsed) ? parsed.filter((item): item is number => Number.isInteger(item) && item > 0).slice(0, 10) : [];
};
const toSchedule = (row: Row): ScheduleRow => ({
  id: row.id,
  userId: row.user_id,
  reportKey: row.report_key,
  query: (typeof row.query_json === "string" ? JSON.parse(row.query_json) : row.query_json) as Record<string, string>,
  format: row.format,
  frequency: row.frequency,
  weekday: row.weekday,
  monthDay: row.month_day,
  hourIst: row.hour_ist,
  active: Boolean(row.active),
  nextRunAt: row.next_run_at,
  lastRunAt: row.last_run_at,
  lastStatus: row.last_status,
  failures: row.failures,
  recipients: recipientsOf(row.recipients_json),
});

export async function listSchedules(userId: number): Promise<ScheduleRow[]> {
  const [rows] = await getDbPool().query<Row[]>("SELECT * FROM report_schedules WHERE user_id = ? ORDER BY id DESC LIMIT 50", [userId]);
  return rows.map(toSchedule);
}

export async function createSchedule(input: { userId: number; reportKey: string; query: Record<string, string>; format: ExportFormat; frequency: Frequency; weekday: number | null; monthDay: number | null; hourIst: number; recipients?: number[] }): Promise<number> {
  const db = getDbPool();
  const [[count]] = await db.query<RowDataPacket[]>("SELECT COUNT(*) AS n FROM report_schedules WHERE user_id = ? AND active = TRUE", [input.userId]);
  if (Number(count?.n ?? 0) >= 20) throw new Error("TOO_MANY");
  const next = nextRunAt({ frequency: input.frequency, weekday: input.weekday, monthDay: input.monthDay, hourIst: input.hourIst }, new Date());
  const [result] = await db.query<ResultSetHeader>(
    "INSERT INTO report_schedules (user_id, report_key, query_json, format, frequency, weekday, month_day, hour_ist, recipients_json, next_run_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
    [input.userId, input.reportKey, JSON.stringify(input.query), input.format, input.frequency, input.weekday, input.monthDay, input.hourIst, JSON.stringify(input.recipients ?? []), next],
  );
  return result.insertId;
}

// B06: change when, how and to whom (owner only). The next run is worked
// out again from now; the run history stays.
export async function updateSchedule(userId: number, id: number, input: { format: ExportFormat; frequency: Frequency; weekday: number | null; monthDay: number | null; hourIst: number; recipients: number[] }): Promise<boolean> {
  const next = nextRunAt({ frequency: input.frequency, weekday: input.weekday, monthDay: input.monthDay, hourIst: input.hourIst }, new Date());
  const [result] = await getDbPool().query<ResultSetHeader>(
    "UPDATE report_schedules SET format = ?, frequency = ?, weekday = ?, month_day = ?, hour_ist = ?, recipients_json = ?, next_run_at = IF(active, ?, next_run_at) WHERE id = ? AND user_id = ?",
    [input.format, input.frequency, input.weekday, input.monthDay, input.hourIst, JSON.stringify(input.recipients.slice(0, 10)), next, id, userId],
  );
  return result.affectedRows === 1;
}

export async function setScheduleActive(userId: number, id: number, active: boolean): Promise<boolean> {
  const db = getDbPool();
  const [rows] = await db.query<Row[]>("SELECT * FROM report_schedules WHERE id = ? AND user_id = ?", [id, userId]);
  const row = rows[0];
  if (!row) return false;
  const next = active ? nextRunAt({ frequency: row.frequency, weekday: row.weekday, monthDay: row.month_day, hourIst: row.hour_ist }, new Date()) : row.next_run_at;
  await db.query("UPDATE report_schedules SET active = ?, failures = IF(?, 0, failures), next_run_at = ? WHERE id = ? AND user_id = ?", [active, active, next, id, userId]);
  return true;
}

export async function listRuns(userId: number, limit = 20): Promise<{ scheduleId: number; reportKey: string; dueAt: Date; status: string; rows: number | null; message: string | null }[]> {
  const [rows] = await getDbPool().query<RowDataPacket[]>(
    "SELECT r.schedule_id, s.report_key, r.due_at, r.status, r.row_count, r.message FROM report_runs r JOIN report_schedules s ON s.id = r.schedule_id WHERE s.user_id = ? ORDER BY r.id DESC LIMIT ?",
    [userId, limit],
  );
  return rows.map((row) => ({ scheduleId: row.schedule_id, reportKey: row.report_key, dueAt: row.due_at, status: row.status, rows: row.row_count === null ? null : Number(row.row_count), message: row.message }));
}

// B06: who gets a schedule's report: the owner, then each extra recipient
// with their own permissions at the time it runs. Someone who can't run the
// report for the same scope, is inactive, or may not download, is skipped
// (a schedule never widens what anyone sees).
type Ran = NonNullable<Awaited<ReturnType<typeof runReport>>>;
export async function scheduleAudience(row: Pick<ScheduleRow, "reportKey" | "query" | "recipients">, person: Owner, ran: Ran, now: Date): Promise<{ audience: { person: Owner; ran: Ran }[]; skippedPeople: number }> {
  const wantedScope = typeof row.query.scope === "string" ? row.query.scope : ran.scope.kind;
  const audience: { person: Owner; ran: Ran }[] = [{ person, ran }];
  let skippedPeople = 0;
  for (const recipientId of row.recipients.filter((item) => item !== person.id)) {
    const other = await owner(recipientId);
    if (!other?.active || !(await canExport(other))) {
      skippedPeople += 1;
      continue;
    }
    const theirs = await runReport(row.reportKey, cleanQuery({ ...row.query, scope: wantedScope }), { id: other.id, roles: other.roles }, now);
    if (!theirs || theirs.scope.kind !== wantedScope) {
      skippedPeople += 1;
      continue;
    }
    audience.push({ person: other, ran: theirs });
  }
  return { audience, skippedPeople };
}

export async function ownerOf(userId: number) {
  return owner(userId);
}

// Job runner step. Each slot is claimed by inserting its report_runs row
// (unique per schedule and due time), so a slot is delivered at most once
// even when two runs overlap or a run is retried.
export async function runDueSchedules(limit = 20): Promise<{ reportsSent: number; reportsFailed: number; reportsSkipped: number }> {
  const db = getDbPool();
  const out = { reportsSent: 0, reportsFailed: 0, reportsSkipped: 0 };
  if ((await featureMode("scheduled_reports")) === "OFF") return out;
  const [due] = await db.query<Row[]>("SELECT * FROM report_schedules WHERE active = TRUE AND next_run_at <= CURRENT_TIMESTAMP ORDER BY next_run_at LIMIT ?", [limit]);
  for (const row of due.map(toSchedule)) {
    let runId: number;
    try {
      const [claimed] = await db.query<ResultSetHeader>("INSERT INTO report_runs (schedule_id, due_at) VALUES (?, ?)", [row.id, row.nextRunAt]);
      runId = claimed.insertId;
    } catch (error) {
      if ((error as { code?: string }).code === "ER_DUP_ENTRY") continue; // another run has this slot
      throw error;
    }
    const now = new Date();
    await db.query("UPDATE report_schedules SET next_run_at = ?, last_run_at = CURRENT_TIMESTAMP WHERE id = ?", [nextRunAt(row, now), row.id]);
    const finish = async (status: "SENT" | "FAILED" | "SKIPPED", message: string, extra: { rows?: number; bytes?: number } = {}) => {
      await db.query("UPDATE report_runs SET status = ?, finished_at = CURRENT_TIMESTAMP, message = ?, row_count = ?, bytes = ? WHERE id = ?", [status, message.slice(0, 300), extra.rows ?? null, extra.bytes ?? null, runId]);
      await db.query("UPDATE report_schedules SET last_status = ?, failures = IF(? = 'FAILED', failures + 1, 0) WHERE id = ?", [status, status, row.id]);
      out[status === "SENT" ? "reportsSent" : status === "FAILED" ? "reportsFailed" : "reportsSkipped"] += 1;
    };
    try {
      const person = await owner(row.userId);
      if (!person || !person.active) {
        await db.query("UPDATE report_schedules SET active = FALSE WHERE id = ?", [row.id]);
        await finish("SKIPPED", "The owner is inactive; the schedule is paused.");
        continue;
      }
      if (!(await allowedFor(person))) {
        await finish("SKIPPED", "Scheduled reports are switched off for this person at the moment.");
        continue;
      }
      if (!(await canExport(person))) {
        await finish("SKIPPED", "Downloads are limited to the Can export permission, which the owner doesn't have.");
        continue;
      }
      const ran = await runReport(row.reportKey, cleanQuery(row.query), { id: person.id, roles: person.roles }, now);
      if (!ran) {
        await db.query("UPDATE report_schedules SET active = FALSE WHERE id = ?", [row.id]);
        await finish("SKIPPED", "The owner can no longer run this report; the schedule is paused.");
        continue;
      }
      // B06: the owner, then each extra recipient, each with their own
      // permissions at the time it runs. Someone who can't run this report
      // for the same scope, or may not download, is skipped (never widened).
      const { audience, skippedPeople } = await scheduleAudience(row, person, ran, now);
      let totalBytes = 0;
      let attachedAll = true;
      for (const entry of audience) {
        const meta = { title: entry.ran.report.name, scopeLabel: entry.ran.scope.label, periodLabel: entry.ran.report.usesPeriod ? `${entry.ran.filter.period.label} (${entry.ran.filter.period.from} to ${entry.ran.filter.period.to})` : null, generatedAt: now, generatedBy: `${person.name} (scheduled)` };
        const file = await exportReport(row.format, entry.ran.result, meta);
        const bytes = typeof file === "string" ? Buffer.byteLength(file) : file.byteLength;
        totalBytes += bytes;
        const params = new URLSearchParams(cleanQuery(row.query) as Record<string, string>).toString();
        const link = `${base()}/users/reports/${row.reportKey}${params ? `?${params}` : ""}`;
        const attach = bytes <= MAX_ATTACHMENT_BYTES;
        attachedAll &&= attach;
        const why = entry.person.id === person.id ? "You get this because you scheduled it." : `You get this because ${person.name} added you to their scheduled report. It shows what you can see.`;
        await sendEmail(
          await getEmailConfig(),
          {
            to: entry.person.email,
            subject: `ARS Approvals: ${entry.ran.report.name} (${describeSchedule(row).toLowerCase()})`,
            text: `${entry.ran.report.name}\n${meta.scopeLabel}${meta.periodLabel ? ` · ${meta.periodLabel}` : ""}\n${entry.ran.result.rows.length} row${entry.ran.result.rows.length === 1 ? "" : "s"}${entry.ran.result.truncated ? " (first rows only)" : ""}.\n\n${attach ? "The report is attached." : "The report is too large to attach."} Open it in the app:\n${link}\n\n${why} Manage schedules: ${base()}/users/reports`,
            attachments: attach ? [{ filename: fileName(row.reportKey, row.format, now), content: file }] : undefined,
          },
          { fetch },
        );
      }
      const rows = ran.result.rows.length;
      const bytes = totalBytes;
      const attach = attachedAll;
      const extra = audience.length > 1 || skippedPeople ? ` To ${audience.length} ${audience.length === 1 ? "person" : "people"}${skippedPeople ? `, ${skippedPeople} skipped (no access)` : ""}.` : "";
      await finish("SENT", `${attach ? "Sent with the file attached." : "Sent with a link (file too large to attach)."}${extra}`, { rows, bytes });
    } catch (error) {
      logError("scheduled report failed", error, { scheduleId: row.id });
      await finish("FAILED", error instanceof Error ? `${error.name}: ${error.message}` : "Failed").catch(() => undefined);
      // Three failures in a row pause the schedule; the owner sees it on Reports.
      await db.query("UPDATE report_schedules SET active = FALSE WHERE id = ? AND failures >= 3", [row.id]).catch(() => undefined);
    }
  }
  return out;
}

// ---- alert rules ---------------------------------------------------------------
export const ALERT_METRICS: Record<string, { label: string; unit: string; scopes: readonly ScopeKind[]; needsDays?: boolean }> = {
  OVERDUE_TASKS: { label: "Overdue approval tasks", unit: "tasks", scopes: ["APPROVALS", "TEAM", "DEPARTMENT", "ORGANISATION"] },
  PENDING_OLDER: { label: "Approval tasks waiting longer than N days", unit: "tasks", scopes: ["APPROVALS", "TEAM", "DEPARTMENT", "ORGANISATION"], needsDays: true },
  AWAITING_REQUESTER: { label: "Requests back with the requester", unit: "requests", scopes: ["MINE", "TEAM", "DEPARTMENT", "ORGANISATION"] },
  STUCK: { label: "Requests that need attention", unit: "requests", scopes: ["ORGANISATION"] },
  BUDGET_USED: { label: "Highest department budget used (%)", unit: "%", scopes: ["DEPARTMENT", "ORGANISATION"] },
};

export interface AlertRule {
  id: number;
  userId: number;
  metric: string;
  scopeKind: ScopeKind;
  threshold: number;
  param: number | null;
  cooldownHours: number;
  active: boolean;
  firing: boolean;
  lastValue: number | null;
  lastCheckedAt: Date | null;
  lastFiredAt: Date | null;
  // B08
  severity: AlertSeverity;
  quietStart: number | null;
  quietEnd: number | null;
  channels: "INBOX" | "INBOX_EMAIL";
}
export type AlertSeverity = "INFO" | "WARNING" | "CRITICAL";
export const SEVERITY_LABEL: Record<AlertSeverity, string> = { INFO: "Information", WARNING: "Warning", CRITICAL: "Critical" };

type AlertRow = RowDataPacket & { id: number; user_id: number; metric: string; scope_kind: ScopeKind; threshold: number; param: number | null; cooldown_hours: number; active: number; firing: number; latest_value: number | null; last_checked_at: Date | null; last_fired_at: Date | null; severity: AlertSeverity | null; quiet_start: number | null; quiet_end: number | null; channels: "INBOX" | "INBOX_EMAIL" | null };
const toRule = (row: AlertRow): AlertRule => ({
  id: row.id,
  userId: row.user_id,
  metric: row.metric,
  scopeKind: row.scope_kind,
  threshold: row.threshold,
  param: row.param,
  cooldownHours: row.cooldown_hours,
  active: Boolean(row.active),
  firing: Boolean(row.firing),
  lastValue: row.latest_value,
  lastCheckedAt: row.last_checked_at,
  lastFiredAt: row.last_fired_at,
  severity: row.severity ?? "WARNING",
  quietStart: row.quiet_start,
  quietEnd: row.quiet_end,
  channels: row.channels ?? "INBOX_EMAIL",
});

export async function listAlertRules(userId: number): Promise<AlertRule[]> {
  const [rows] = await getDbPool().query<AlertRow[]>("SELECT * FROM alert_rules WHERE user_id = ? ORDER BY id DESC LIMIT 50", [userId]);
  return rows.map(toRule);
}

export async function createAlertRule(input: { userId: number; metric: string; scopeKind: ScopeKind; threshold: number; param: number | null; cooldownHours: number; severity?: AlertSeverity; quietStart?: number | null; quietEnd?: number | null; channels?: "INBOX" | "INBOX_EMAIL" }): Promise<number> {
  const db = getDbPool();
  const [[count]] = await db.query<RowDataPacket[]>("SELECT COUNT(*) AS n FROM alert_rules WHERE user_id = ? AND active = TRUE", [input.userId]);
  if (Number(count?.n ?? 0) >= 20) throw new Error("TOO_MANY");
  const [result] = await db.query<ResultSetHeader>(
    "INSERT INTO alert_rules (user_id, metric, scope_kind, threshold, param, cooldown_hours, severity, quiet_start, quiet_end, channels) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
    [input.userId, input.metric, input.scopeKind, input.threshold, input.param, input.cooldownHours, input.severity ?? "WARNING", input.quietStart ?? null, input.quietEnd ?? null, input.channels ?? "INBOX_EMAIL"],
  );
  return result.insertId;
}

export async function setAlertActive(userId: number, id: number, active: boolean): Promise<boolean> {
  const [result] = await getDbPool().query<ResultSetHeader>("UPDATE alert_rules SET active = ?, firing = FALSE WHERE id = ? AND user_id = ?", [active, id, userId]);
  return result.affectedRows === 1;
}

export async function alertValue(rule: Pick<AlertRule, "metric" | "scopeKind" | "param">, viewer: { id: number; roles: readonly string[] }): Promise<number | null> {
  const { scopes } = await resolveScope(undefined, viewer);
  const scope = scopes.find((item) => item.kind === rule.scopeKind);
  if (!scope || !ALERT_METRICS[rule.metric]?.scopes.includes(scope.kind)) return null;
  const filter: AnalyticsFilter = { period: resolvePeriod({ key: "30d" }, indiaToday(new Date())), workflowId: null, departmentId: null };
  switch (rule.metric) {
    case "OVERDUE_TASKS":
      return (await loadNow(scope, viewer, filter)).overdueTasks;
    case "AWAITING_REQUESTER":
      return (await loadNow(scope, viewer, filter)).awaitingRequester;
    case "PENDING_OLDER": {
      const days = Math.max(1, rule.param ?? 3);
      const scoped = taskScopeSql(scope, viewer, true);
      const [[row]] = await getDbPool().query<RowDataPacket[]>(
        `SELECT COUNT(*) AS n FROM approval_tasks t JOIN approval_requests r ON r.id = t.request_id JOIN users rq ON rq.id = r.requester_id
         WHERE r.deleted_at IS NULL AND ${scoped.sql} AND t.status = 'PENDING' AND r.status = 'IN_PROGRESS' AND t.created_at < DATE_SUB(CURRENT_TIMESTAMP, INTERVAL ? DAY)`,
        [...scoped.params, days],
      );
      return Number(row?.n ?? 0);
    }
    case "STUCK":
      return (await findStuckRequests()).length;
    case "BUDGET_USED": {
      const rows = await listBudgets(financialYear(new Date()));
      const mine = scope.kind === "DEPARTMENT" ? rows.filter((row) => scope.departmentIds?.includes(row.departmentId)) : rows;
      const used = mine.filter((row) => row.budgetPaise).map((row) => Math.round((row.committedPaise / row.budgetPaise!) * 100));
      return used.length ? Math.max(...used) : 0;
    }
    default:
      return null;
  }
}

// Job runner step: check every active rule; tell the owner (inbox + email)
// when it crosses the line, at most once per cool-down.
export async function evaluateAlerts(limit = 200): Promise<{ alertsChecked: number; alertsFired: number; alertsHeld: number }> {
  const db = getDbPool();
  const [rows] = await db.query<AlertRow[]>("SELECT * FROM alert_rules WHERE active = TRUE ORDER BY id LIMIT ?", [limit]);
  const out = { alertsChecked: 0, alertsFired: 0, alertsHeld: 0 };
  if ((await featureMode("scheduled_reports")) === "OFF") return out;
  for (const rule of rows.map(toRule)) {
    try {
      const person = await owner(rule.userId);
      if (!person?.active) {
        await db.query("UPDATE alert_rules SET active = FALSE WHERE id = ?", [rule.id]);
        continue;
      }
      if (!(await allowedFor(person))) continue;
      const value = await alertValue(rule, { id: person.id, roles: person.roles });
      if (value === null) {
        await db.query("UPDATE alert_rules SET active = FALSE WHERE id = ?", [rule.id]); // the scope is no longer theirs
        continue;
      }
      const now = new Date();
      const decision = alertDecision(rule, value, now);
      out.alertsChecked += 1;
      // B08: quiet hours hold a firing back (CRITICAL never waits); it goes
      // out on the first check after they end, if still over the line.
      if (decision.fire && rule.severity !== "CRITICAL" && inQuietHours(rule, now)) {
        await db.query("UPDATE alert_rules SET latest_value = ?, last_checked_at = CURRENT_TIMESTAMP WHERE id = ?", [value, rule.id]);
        out.alertsHeld += 1;
        continue;
      }
      if (decision.fire) {
        // Claim the firing first, so a parallel run can't send it twice.
        const [claimed] = await db.query<ResultSetHeader>(
          "UPDATE alert_rules SET firing = TRUE, last_fired_at = CURRENT_TIMESTAMP, latest_value = ?, last_checked_at = CURRENT_TIMESTAMP WHERE id = ? AND last_fired_at <=> ?",
          [value, rule.id, rule.lastFiredAt],
        );
        if (claimed.affectedRows !== 1) continue;
        await db.query("INSERT INTO alert_events (rule_id, value) VALUES (?, ?)", [rule.id, value]);
        const metric = ALERT_METRICS[rule.metric]!;
        const label = metric.needsDays ? metric.label.replace("N", String(rule.param ?? 3)) : metric.label;
        const message = `${label}: ${value}${metric.unit === "%" ? "%" : ""} (your line is ${rule.threshold}${metric.unit === "%" ? "%" : ""}).`;
        const level = SEVERITY_LABEL[rule.severity];
        await notify({
          eventType: "ANALYTICS_ALERT",
          userId: person.id,
          title: `${level}: a number crossed your line`,
          message,
          deepLink: `${base()}/users/analytics?scope=${rule.scopeKind}`,
          email: rule.channels === "INBOX" ? null : { subject: `ARS Approvals ${level.toLowerCase()}: ${label}`, text: `${message}\n\nOpen Analytics: ${base()}/users/analytics?scope=${rule.scopeKind}\n\nYou get this at most once every ${rule.cooldownHours} hours while it stays over the line. Manage your alerts: ${base()}/users/reports#alerts` },
          whatsappVariables: null,
        }).catch((error) => logError("alert notify failed", error, { ruleId: rule.id }));
        out.alertsFired += 1;
      } else {
        await db.query("UPDATE alert_rules SET firing = ?, latest_value = ?, last_checked_at = CURRENT_TIMESTAMP WHERE id = ?", [decision.firing, value, rule.id]);
      }
    } catch (error) {
      logError("alert rule failed", error, { ruleId: rule.id });
    }
  }
  return out;
}

