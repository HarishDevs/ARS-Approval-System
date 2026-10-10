"use server";

import { revalidatePath } from "next/cache";
import { requireApiArea } from "@/server/authorization/guards";
import { deleteView, saveView } from "@/lib/db/repositories/analytics-views.repository";
import { cleanQuery, prepareReport } from "@/server/reports/run";
import { ALERT_METRICS, alertValue, createAlertRule, createSchedule, setAlertActive, setScheduleActive } from "@/server/reports/schedules";
import { availableScopes, type ScopeKind } from "@/server/analytics/scope";
import { recordAudit } from "@/lib/db/repositories/audit.repository";
import { logError } from "@/lib/logging/logger";
import type { ActionResult } from "@/lib/http/action-result";
import { featureOn } from "@/server/settings/features";

const OFF: ActionResult = { ok: false, message: "Scheduled reports and alerts are switched off at the moment." };

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
const queryFrom = (formData: FormData) => cleanQuery(Object.fromEntries([...formData.entries()].filter(([key]) => key.startsWith("q_")).map(([key, value]) => [key.slice(2), value])));

export async function saveViewAction(_previous: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const user = await me();
  if (!user) return { ok: false, message: "Not found." };
  const target = text(formData.get("target"), 60);
  const name = text(formData.get("viewName"), 80);
  if (!/^(DASHBOARD|[a-z_]{3,60})$/.test(target)) return { ok: false, message: "Not found." };
  if (name.length < 2) return { ok: false, message: "Give the view a name.", fieldErrors: { viewName: "Use 2 to 80 characters." } };
  if ((await saveView({ userId: user.id, target, name, query: queryFrom(formData) as Record<string, string> })) === "TOO_MANY") return { ok: false, message: "You have 100 saved views. Delete one first." };
  revalidatePath(target === "DASHBOARD" ? "/users/analytics" : `/users/reports/${target}`);
  return { ok: true, message: `Saved "${name}".` };
}

export async function deleteViewAction(_previous: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const user = await me();
  const viewId = id(formData.get("viewId"));
  if (!user || viewId === null || !(await deleteView(user.id, viewId))) return { ok: false, message: "Not found." };
  revalidatePath("/users/analytics");
  revalidatePath("/users/reports", "layout");
  return { ok: true, message: "View deleted." };
}

export async function createScheduleAction(_previous: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const user = await me();
  const reportKey = text(formData.get("reportKey"), 60);
  if (!user) return { ok: false, message: "Not found." };
  if (!(await featureOn("scheduled_reports", user))) return OFF;
  const query = queryFrom(formData);
  // Only a report the person can run now can be scheduled.
  if (!(await prepareReport(reportKey, query, user))) return { ok: false, message: "Not found." };
  const frequency = String(formData.get("frequency"));
  const format = String(formData.get("format"));
  const hour = Number(formData.get("hour"));
  const weekday = Number(formData.get("weekday"));
  const monthDay = Number(formData.get("monthDay"));
  if (!["DAILY", "WEEKLY", "MONTHLY"].includes(frequency) || !["csv", "xlsx", "pdf"].includes(format) || !Number.isInteger(hour) || hour < 0 || hour > 23) return { ok: false, message: "Choose when and in what format." };
  if (frequency === "WEEKLY" && !(weekday >= 1 && weekday <= 7)) return { ok: false, message: "Choose a day of the week." };
  if (frequency === "MONTHLY" && !(monthDay >= 1 && monthDay <= 28)) return { ok: false, message: "Choose a day from 1 to 28." };
  try {
    const scheduleId = await createSchedule({ userId: user.id, reportKey, query: query as Record<string, string>, format: format as "csv", frequency: frequency as "DAILY", weekday: frequency === "WEEKLY" ? weekday : null, monthDay: frequency === "MONTHLY" ? monthDay : null, hourIst: hour });
    await recordAudit({ actorUserId: user.id, action: "REPORT_SCHEDULED", entityType: "REPORT", entityId: reportKey, sessionId: user.sessionId, metadata: { scheduleId, frequency, format, hour } });
  } catch (error) {
    if ((error as Error).message === "TOO_MANY") return { ok: false, message: "You have 20 active schedules. Switch one off first." };
    logError("createScheduleAction failed", error);
    return { ok: false, message: "Couldn't save. Please try again." };
  }
  revalidatePath("/users/reports", "layout");
  return { ok: true, message: "Scheduled. It is emailed to you with your permissions at the time it runs." };
}

export async function toggleScheduleAction(_previous: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const user = await me();
  const scheduleId = id(formData.get("scheduleId"));
  const active = formData.get("active") === "on";
  if (!user || scheduleId === null || !(await setScheduleActive(user.id, scheduleId, active))) return { ok: false, message: "Not found." };
  revalidatePath("/users/reports", "layout");
  return { ok: true, message: active ? "Switched on." : "Switched off." };
}

export async function createAlertAction(_previous: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const user = await me();
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
  try {
    const ruleId = await createAlertRule({ userId: user.id, metric, scopeKind, threshold, param: definition.needsDays ? days : null, cooldownHours: 24 });
    const now = await alertValue({ metric, scopeKind, param: definition.needsDays ? days : null }, user);
    await recordAudit({ actorUserId: user.id, action: "ALERT_RULE_CREATED", entityType: "ALERT", entityId: ruleId, sessionId: user.sessionId, metadata: { metric, scopeKind, threshold } });
    revalidatePath("/users/reports", "layout");
    return { ok: true, message: `Alert saved. Right now the value is ${now ?? "unknown"}; it is checked every few minutes.` };
  } catch (error) {
    if ((error as Error).message === "TOO_MANY") return { ok: false, message: "You have 20 active alerts. Switch one off first." };
    logError("createAlertAction failed", error);
    return { ok: false, message: "Couldn't save. Please try again." };
  }
}

export async function toggleAlertAction(_previous: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const user = await me();
  const ruleId = id(formData.get("ruleId"));
  const active = formData.get("active") === "on";
  if (!user || ruleId === null || !(await setAlertActive(user.id, ruleId, active))) return { ok: false, message: "Not found." };
  revalidatePath("/users/reports", "layout");
  return { ok: true, message: active ? "Switched on." : "Switched off." };
}
