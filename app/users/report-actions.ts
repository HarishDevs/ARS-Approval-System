"use server";

import { revalidatePath } from "next/cache";
import { requireApiArea } from "@/server/authorization/guards";
import { deleteView, saveView, setDefaultView, setViewShared } from "@/lib/db/repositories/analytics-views.repository";
import { cleanQuery, prepareReport } from "@/server/reports/run";
import { ALERT_METRICS, alertValue, createAlertRule, createSchedule, setAlertActive, setScheduleActive, updateSchedule } from "@/server/reports/schedules";
import { availableScopes, type ScopeKind } from "@/server/analytics/scope";
import { recordAudit } from "@/lib/db/repositories/audit.repository";
import { logError } from "@/lib/logging/logger";
import type { ActionResult } from "@/lib/http/action-result";
import { canUseReports, featureOn } from "@/server/settings/features";
import { after } from "next/server";
import { requestExport, runExportJob } from "@/server/reports/background";

const OFF: ActionResult = { ok: false, message: "Scheduled reports and alerts are switched off at the moment." };
const NOT_FOUND: ActionResult = { ok: false, message: "Not found." };
const LIST_TARGETS = ["my_requests", "collaborating", "queue"];

// v1.7.1: reports, schedules, alerts and exports are for IT and the Super
// Admin only; Analytics saved views (target DASHBOARD) stay open to all.
async function reportUser() {
  const user = await me();
  return user && (await canUseReports(user)) ? user : null;
}

// Saved views, scheduled reports and alert rules (Addendum A §10.5, §11,
// §15, D-123). Everything is the signed-in person's own; scope is checked
// on the server when saving and again whenever it runs.
async function me() {
  try {
    const session = await requireApiArea("users");
    return { id: session.user.id, roles: session.user.roles, sessionId: session.sessionId };
  } catch {
    return null;
  }
}
const id = (value: FormDataEntryValue | null) => (typeof value === "string" && /^\d{1,10}$/.test(value) ? Number(value) : null);
const text = (value: FormDataEntryValue | null, max: number) => String(value ?? "").replace(/\s+/g, " ").trim().slice(0, max);
// B06: extra recipients, by user id (at most 10, never the owner).
const recipientsFrom = (formData: FormData, ownerId: number) =>
  [...new Set(formData.getAll("recipient").map((value) => (typeof value === "string" && /^\d{1,10}$/.test(value) ? Number(value) : 0)))].filter((value) => value > 0 && value !== ownerId).slice(0, 10);

// When and how, shared by create and edit.
function timing(formData: FormData): { ok: true; value: { frequency: "DAILY" | "WEEKLY" | "MONTHLY"; format: "csv" | "xlsx" | "pdf"; hourIst: number; weekday: number | null; monthDay: number | null } } | { ok: false; message: string } {
  const frequency = String(formData.get("frequency"));
  const format = String(formData.get("format"));
  const hour = Number(formData.get("hour"));
  const weekday = Number(formData.get("weekday"));
  const monthDay = Number(formData.get("monthDay"));
  if (!["DAILY", "WEEKLY", "MONTHLY"].includes(frequency) || !["csv", "xlsx", "pdf"].includes(format) || !Number.isInteger(hour) || hour < 0 || hour > 23) return { ok: false, message: "Choose when and in what format." };
  if (frequency === "WEEKLY" && !(weekday >= 1 && weekday <= 7)) return { ok: false, message: "Choose a day of the week." };
  if (frequency === "MONTHLY" && !(monthDay >= 1 && monthDay <= 28)) return { ok: false, message: "Choose a day from 1 to 28." };
  return { ok: true, value: { frequency: frequency as "DAILY", format: format as "csv", hourIst: hour, weekday: frequency === "WEEKLY" ? weekday : null, monthDay: frequency === "MONTHLY" ? monthDay : null } };
}

const queryFrom = (formData: FormData) => cleanQuery(Object.fromEntries([...formData.entries()].filter(([key]) => key.startsWith("q_")).map(([key, value]) => [key.slice(2), value])));

export async function saveViewAction(_previous: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const user = await me();
  if (!user) return { ok: false, message: "Not found." };
  const target = text(formData.get("target"), 60);
  const name = text(formData.get("viewName"), 80);
  if (!/^(DASHBOARD|[a-z_]{3,60})$/.test(target)) return { ok: false, message: "Not found." };
  // v1.7.2: personal list pages keep their own views; anything else is a report (IT only).
  if (!LIST_TARGETS.includes(target) && target !== "DASHBOARD" && !(await canUseReports(user))) return NOT_FOUND;
  if (name.length < 2) return { ok: false, message: "Give the view a name.", fieldErrors: { viewName: "Use 2 to 80 characters." } };
  if ((await saveView({ userId: user.id, target, name, query: queryFrom(formData) as Record<string, string>, shared: formData.get("shared") === "on" })) === "TOO_MANY") return { ok: false, message: "You have 100 saved views. Delete one first." };
  revalidatePath(target === "DASHBOARD" ? "/users/analytics" : target === "my_requests" ? "/users/requests" : target === "collaborating" ? "/users/collaborating" : `/admin/reports/${target}`);
  return { ok: true, message: `Saved "${name}".` };
}

export async function deleteViewAction(_previous: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const user = await me();
  const viewId = id(formData.get("viewId"));
  if (!user || viewId === null || !(await deleteView(user.id, viewId))) return { ok: false, message: "Not found." };
  revalidatePath("/users/analytics");
  revalidatePath("/admin/analytics");
  revalidatePath("/users/requests");
  revalidatePath("/users/collaborating");
  revalidatePath("/users/queue");
  revalidatePath("/admin/reports", "layout");
  return { ok: true, message: "View deleted." };
}

export async function createScheduleAction(_previous: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const user = await reportUser();
  const reportKey = text(formData.get("reportKey"), 60);
  if (!user) return { ok: false, message: "Not found." };
  if (!(await featureOn("scheduled_reports", user))) return OFF;
  const query = queryFrom(formData);
  // Only a report the person can run now can be scheduled.
  if (!(await prepareReport(reportKey, query, user))) return { ok: false, message: "Not found." };
  const when = timing(formData);
  if (!when.ok) return when;
  const recipients = recipientsFrom(formData, user.id);
  try {
    const scheduleId = await createSchedule({ userId: user.id, reportKey, query: query as Record<string, string>, ...when.value, recipients });
    await recordAudit({ actorUserId: user.id, action: "REPORT_SCHEDULED", entityType: "REPORT", entityId: reportKey, sessionId: user.sessionId, metadata: { scheduleId, frequency: when.value.frequency, format: when.value.format, hour: when.value.hourIst, recipients: recipients.length } });
  } catch (error) {
    if ((error as Error).message === "TOO_MANY") return { ok: false, message: "You have 20 active schedules. Switch one off first." };
    logError("createScheduleAction failed", error);
    return { ok: false, message: "Couldn't save. Please try again." };
  }
  revalidatePath("/admin/reports", "layout");
  return { ok: true, message: "Scheduled. It is emailed to you (and anyone you added), each with their own permissions at the time it runs." };
}

// B06: change a schedule (owner only).
export async function updateScheduleAction(_previous: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const user = await reportUser();
  const scheduleId = id(formData.get("scheduleId"));
  if (!user || scheduleId === null) return { ok: false, message: "Not found." };
  if (!(await featureOn("scheduled_reports", user))) return OFF;
  const when = timing(formData);
  if (!when.ok) return when;
  const recipients = recipientsFrom(formData, user.id);
  if (!(await updateSchedule(user.id, scheduleId, { ...when.value, recipients }))) return { ok: false, message: "Not found." };
  await recordAudit({ actorUserId: user.id, action: "REPORT_SCHEDULE_CHANGED", entityType: "REPORT", entityId: scheduleId, sessionId: user.sessionId, metadata: { ...when.value, recipients: recipients.length } });
  revalidatePath("/admin/reports", "layout");
  return { ok: true, message: "Saved. The next run uses the new settings." };
}

export async function toggleScheduleAction(_previous: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const user = await reportUser();
  const scheduleId = id(formData.get("scheduleId"));
  const active = formData.get("active") === "on";
  if (!user || scheduleId === null || !(await setScheduleActive(user.id, scheduleId, active))) return { ok: false, message: "Not found." };
  revalidatePath("/admin/reports", "layout");
  return { ok: true, message: active ? "Switched on." : "Switched off." };
}

export async function createAlertAction(_previous: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const user = await reportUser();
  if (!user) return { ok: false, message: "Not found." };
  if (!(await featureOn("scheduled_reports", user))) return OFF;
  const metric = String(formData.get("metric"));
  const scopeKind = String(formData.get("scope")) as ScopeKind;
  const threshold = Number(formData.get("threshold"));
  const days = Number(formData.get("days"));
  const definition = ALERT_METRICS[metric];
  const scopes = await availableScopes(user);
  if (!definition || !scopes.some((scope) => scope.kind === scopeKind) || !definition.scopes.includes(scopeKind)) return { ok: false, message: "That alert isn't available for that scope.", fieldErrors: { metric: "Choose an alert your scope supports." } };
  if (!Number.isInteger(threshold) || threshold < 1 || threshold > 100000) return { ok: false, message: "Set the line as a whole number.", fieldErrors: { threshold: "1 or more." } };
  if (definition.needsDays && !(Number.isInteger(days) && days >= 1 && days <= 90)) return { ok: false, message: "Set the number of days (1 to 90).", fieldErrors: { days: "1 to 90." } };
  // B08: severity, channels and quiet hours.
  const severity = ["INFO", "WARNING", "CRITICAL"].includes(String(formData.get("severity"))) ? (String(formData.get("severity")) as "INFO") : "WARNING";
  const channels = formData.get("channels") === "INBOX" ? "INBOX" : "INBOX_EMAIL";
  const hourOf = (value: FormDataEntryValue | null) => (typeof value === "string" && /^\d{1,2}$/.test(value) && Number(value) <= 23 ? Number(value) : null);
  const quietStart = hourOf(formData.get("quietStart"));
  const quietEnd = hourOf(formData.get("quietEnd"));
  if ((quietStart === null) !== (quietEnd === null) || (quietStart !== null && quietStart === quietEnd)) return { ok: false, message: "Choose both quiet-hour times, or neither.", fieldErrors: { quiet: "From and to must differ." } };
  try {
    const ruleId = await createAlertRule({ userId: user.id, metric, scopeKind, threshold, param: definition.needsDays ? days : null, cooldownHours: 24, severity, channels, quietStart, quietEnd });
    const now = await alertValue({ metric, scopeKind, param: definition.needsDays ? days : null }, user);
    await recordAudit({ actorUserId: user.id, action: "ALERT_RULE_CREATED", entityType: "ALERT", entityId: ruleId, sessionId: user.sessionId, metadata: { metric, scopeKind, threshold } });
    revalidatePath("/admin/reports", "layout");
    return { ok: true, message: `Alert saved. Right now the value is ${now ?? "unknown"}; it is checked every few minutes.` };
  } catch (error) {
    if ((error as Error).message === "TOO_MANY") return { ok: false, message: "You have 20 active alerts. Switch one off first." };
    logError("createAlertAction failed", error);
    return { ok: false, message: "Couldn't save. Please try again." };
  }
}

export async function toggleAlertAction(_previous: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const user = await reportUser();
  const ruleId = id(formData.get("ruleId"));
  const active = formData.get("active") === "on";
  if (!user || ruleId === null || !(await setAlertActive(user.id, ruleId, active))) return { ok: false, message: "Not found." };
  revalidatePath("/admin/reports", "layout");
  return { ok: true, message: active ? "Switched on." : "Switched off." };
}

// v1.7.0 (B07): share a view with everyone, or make it the default for its page.
export async function shareViewAction(_previous: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const user = await me();
  const viewId = id(formData.get("viewId"));
  const shared = formData.get("shared") === "on";
  if (!user || viewId === null || !(await setViewShared(user.id, viewId, shared))) return { ok: false, message: "Not found." };
  await recordAudit({ actorUserId: user.id, action: shared ? "VIEW_SHARED" : "VIEW_UNSHARED", entityType: "VIEW", entityId: viewId, sessionId: user.sessionId });
  revalidatePath("/users/analytics");
  revalidatePath("/admin/analytics");
  revalidatePath("/users/requests");
  revalidatePath("/users/collaborating");
  revalidatePath("/users/queue");
  revalidatePath("/admin/reports", "layout");
  return { ok: true, message: shared ? "Shared: everyone can open it and sees their own numbers." : "No longer shared." };
}

export async function defaultViewAction(_previous: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const user = await me();
  const viewId = id(formData.get("viewId"));
  const isDefault = formData.get("isDefault") === "on";
  if (!user || viewId === null || !(await setDefaultView(user.id, viewId, isDefault))) return { ok: false, message: "Not found." };
  revalidatePath("/users/analytics");
  revalidatePath("/admin/analytics");
  revalidatePath("/users/requests");
  revalidatePath("/users/collaborating");
  revalidatePath("/users/queue");
  revalidatePath("/admin/reports", "layout");
  return { ok: true, message: isDefault ? "Opens with this view from now on." : "Default cleared." };
}

// v1.7.0 (C02): ask for a large export, made in the background. It starts
// straight after this answer is sent; the job runner picks up anything left.
export async function requestExportAction(_previous: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const user = await reportUser();
  if (!user) return NOT_FOUND;
  const reportKey = text(formData.get("reportKey"), 60);
  const format = String(formData.get("format"));
  if (!["csv", "xlsx", "pdf"].includes(format)) return { ok: false, message: "Choose a format." };
  const result = await requestExport(user, reportKey, queryFrom(formData), format as "csv");
  if (!result.ok) return result;
  after(() => runExportJob(result.id).then(() => undefined));
  revalidatePath("/admin/reports", "layout");
  return { ok: true, message: "Being made. You'll be told in the app when it's ready; it's listed under Admin → Reports → My exports." };
}
