import "server-only";
import crypto from "node:crypto";
import type { RowDataPacket } from "mysql2/promise";
import { getDbPool, type Queryable } from "@/lib/db/client";
import { loadDirectorySnapshot, toDirectory, type DirectorySnapshot } from "@/lib/db/repositories/directory.repository";
import { loadFieldLookups } from "@/lib/db/repositories/lookups.repository";
import { visibleToSql } from "@/lib/db/repositories/visibility";
import { findRecentDuplicate, type WorkflowRecord, type WorkflowVersionRecord } from "@/lib/db/repositories/approvals.repository";
import { getSettingValue } from "@/server/settings/values";
import { parseFormSubmission, type FormField } from "@/server/forms/fields";
import { checkDoaAmount } from "@/server/workflows/builder";
import { simulate, validateWorkflow, type FormData as EngineFormData } from "@/server/engine";
import { budgetPosition, financialYear, fyLabel, parseTypeSettings, type BudgetState } from "@/server/workflows/type-settings";
import { formatPaise } from "@/server/forms/dynamic";

// Submission readiness (unified prompt FN1). One service for the "Check
// before submitting" button and for the submit itself, where it runs inside
// the submit transaction (with locks) and is the only authority. It never
// changes approval state. Severity: BLOCKING stops the submit; WARNING needs
// the person to confirm (and, for possible duplicates, say why); INFO is a
// suggestion.
export type Severity = "BLOCKING" | "WARNING" | "INFO";
export interface DuplicateCandidate {
  id: number | null; // null: the person can't open it (shown without details)
  requestNo: string | null;
  status: string | null;
  reason: string;
}
export interface ReadinessItem {
  code: "FIELD" | "TITLE" | "DOCUMENTS" | "CONFIG" | "ROUTING" | "DUPLICATE" | "RECENT_DUPLICATE" | "BUDGET" | "DEPARTMENT" | "UNIQUE";
  severity: Severity;
  message: string;
  field?: string; // form field key, "title" or "attachments"
  candidates?: DuplicateCandidate[];
}
export interface BudgetCheck {
  state: BudgetState | "NOT_CHECKED";
  departmentId: number | null;
  fy: number | null;
  budgetPaise: number | null;
  committedPaise: number | null;
  requestPaise: number | null;
}
export interface Readiness {
  status: "READY" | "WARNINGS" | "BLOCKED";
  items: ReadinessItem[];
  needsConfirmation: boolean; // warnings the person must confirm
  needsReason: boolean; // a possible duplicate: say why it isn't one
  fingerprint: string; // what was checked; a change makes the result stale
  budget: BudgetCheck;
}

export interface ReadinessInput {
  workflow: WorkflowRecord;
  version: WorkflowVersionRecord;
  title: string;
  fields: Record<string, string | undefined>;
  attachmentCount: number;
  requester: { id: number; roles: readonly string[] };
  isCustom?: boolean;
  // FN5: an amendment of an approved request. The original (and its other
  // amendments) aren't duplicates of it, and only the change in amount
  // counts against the budget.
  amendment?: { originalId: number; basePaise: number | null };
  // D-248 (V181-A1, AUD-11): a resubmit is checked like a submit, leaving the
  // request itself out of the duplicate, unique and budget checks.
  excludeRequestId?: number;
}

const isAdmin = (roles: readonly string[]) => roles.includes("IT_ADMIN") || roles.includes("SUPER_ADMIN");
const OPEN_OR_APPROVED = ["IN_PROGRESS", "ON_HOLD", "CHANGES_REQUIRED", "APPROVED"];

export function fingerprintOf(input: { title: string; fields: Record<string, string | undefined>; attachmentCount: number }): string {
  const fields = Object.fromEntries(Object.entries(input.fields).filter(([, value]) => value !== undefined && value !== "").sort(([a], [b]) => a.localeCompare(b)));
  return crypto.createHash("sha256").update(JSON.stringify({ t: input.title.trim(), f: fields, a: input.attachmentCount })).digest("hex").slice(0, 24);
}

// Approver fields must name people who may approve (the same rule as submit).
type ApproverFieldCheck = (definition: WorkflowVersionRecord["definition"], data: EngineFormData, snapshot: DirectorySnapshot) => Record<string, string>;

// Routing and missing-department warnings are notes only (IT sorts them
// out); duplicates and budget warnings must be confirmed.
const CONFIRM_CODES = new Set<ReadinessItem["code"]>(["DUPLICATE", "RECENT_DUPLICATE", "BUDGET"]);

export async function assessReadiness(
  input: ReadinessInput,
  options: { db?: Queryable; lock?: boolean; approverFieldErrors?: ApproverFieldCheck } = {},
): Promise<{ readiness: Readiness; data: EngineFormData }> {
  const db = options.db ?? getDbPool();
  // At submit, lock the type first, before any other read in the
  // transaction: InnoDB's snapshot starts at the first plain read, so a
  // later lock would still miss a request committed meanwhile. The checks
  // below also use locking reads (FOR SHARE) to see the latest rows.
  if (options.lock) await db.query("SELECT id FROM workflow_definitions WHERE id = ? FOR UPDATE", [input.workflow.id]);
  const latest = options.lock ? " FOR SHARE" : "";
  const settings = parseTypeSettings(input.workflow.settings ?? null);
  const items: ReadinessItem[] = [];
  const snapshot = await loadDirectorySnapshot(db);
  const active = new Set(snapshot.users.filter((user) => user.active && !user.isBreakGlass).map((user) => user.id));
  const parsed = parseFormSubmission(input.version.form, input.fields, active, await loadFieldLookups(db));
  const labelOf = (key: string) => input.version.form.find((field: FormField) => field.key === key)?.label ?? key;

  // 1. Blocking: the form itself, the title, the DoA amount, approver fields.
  const title = input.title.trim();
  if (title.length < 3 || title.length > 200) items.push({ code: "TITLE", severity: "BLOCKING", field: "title", message: "Give the request a title of 3 to 200 characters." });
  // Field messages stay as the parser wrote them (the page adds the label).
  if (!parsed.ok) for (const [field, message] of Object.entries(parsed.errors)) items.push({ code: "FIELD", severity: "BLOCKING", field, message });
  if (parsed.ok) {
    const doa = { ...checkDoaAmount(input.version.builder, parsed.data), ...(options.approverFieldErrors ? options.approverFieldErrors(input.version.definition, parsed.data, snapshot) : {}) };
    for (const [field, message] of Object.entries(doa)) items.push({ code: "FIELD", severity: "BLOCKING", field, message });
  }
  if (input.attachmentCount < settings.attachments.minimum) {
    items.push({ code: "DOCUMENTS", severity: "BLOCKING", field: "attachments", message: `Attach at least ${settings.attachments.minimum} file${settings.attachments.minimum === 1 ? "" : "s"}${settings.attachments.note ? `: ${settings.attachments.note}` : ""}.` });
  }
  const validation = validateWorkflow(input.version.definition);
  if (!validation.valid) items.push({ code: "CONFIG", severity: "BLOCKING", message: "This approval type has a set-up problem, so it can't take requests right now. Tell IT." });

  // 2. Routing: who would be asked, with these values. A step that finds
  //    nobody is a warning: the request waits there until IT assigns someone.
  if (parsed.ok && validation.valid) {
    const route = simulate(input.version.definition, { requesterId: input.requester.id, formData: parsed.data, now: new Date().toISOString() }, toDirectory(snapshot));
    const labels = new Map(input.version.definition.nodes.map((node) => [node.id, node.label]));
    for (const blocked of route.blocked) items.push({ code: "ROUTING", severity: "WARNING", message: `Nobody is set up to approve "${labels.get(blocked.nodeId) ?? blocked.nodeId}" for these details. You can still submit; IT will be asked to choose someone.` });
    // D-245 (audit DB-005): a step skipped for having nobody is said too.
    for (const skipped of route.skipped.filter((item) => item.reason === "NO_APPROVER")) {
      items.push({ code: "ROUTING", severity: "WARNING", message: `Nobody is set up to approve "${labels.get(skipped.nodeId) ?? skipped.nodeId}", so that step will be skipped.` });
    }
  }

  // 3. Possible duplicates: the type's matching fields, in its window.
  const amendmentOf = input.amendment?.originalId ?? null;
  const self = input.excludeRequestId ?? null;
  const selfSql = self ? " AND r.id <> ?" : "";
  const selfParams = self ? [self] : [];
  if (parsed.ok && !input.isCustom) {
    const keys = settings.duplicates.fields.filter((key) => input.version.form.some((field) => field.key === key));
    const values = keys.map((key) => parsed.data[key]);
    // A10: whose requests count.
    const scope = settings.duplicates.scope;
    const departmentId = snapshot.users.find((user) => user.id === input.requester.id)?.departmentId ?? null;
    const byDepartment = scope === "SAME_DEPARTMENT" && departmentId !== null;
    const scopeSql = scope === "SAME_REQUESTER" ? " AND r.requester_id = ?" : byDepartment ? " AND r.requester_id IN (SELECT id FROM users WHERE department_id = ?)" : "";
    const scopeParams = scope === "SAME_REQUESTER" ? [input.requester.id] : byDepartment ? [departmentId] : [];
    if (keys.length > 0 && values.every((value) => value !== undefined && value !== null && value !== "")) {
      const where = keys.map(() => "LOWER(JSON_UNQUOTE(JSON_EXTRACT(r.form_data_json, ?))) = LOWER(?)").join(" AND ");
      const params = keys.flatMap((key, index) => [`$.${key}`, String(values[index])]);
      const [rows] = await db.query<(RowDataPacket & { id: number; request_no: string; status: string; requester_id: number })[]>(
        `SELECT r.id, r.request_no, r.status, r.requester_id FROM approval_requests r JOIN workflow_versions v ON v.id = r.workflow_version_id
         WHERE v.workflow_id = ? AND r.deleted_at IS NULL AND r.status IN (?) AND r.submitted_at > DATE_SUB(CURRENT_TIMESTAMP, INTERVAL ? DAY) AND ${where}${scopeSql}${amendmentOf ? " AND r.id <> ? AND NOT EXISTS (SELECT 1 FROM request_amendments ra WHERE ra.amendment_id = r.id AND ra.original_id = ?)" : ""}${selfSql}
         ORDER BY r.id DESC LIMIT 5${latest}`,
        [input.workflow.id, OPEN_OR_APPROVED, settings.duplicates.windowDays, ...params, ...scopeParams, ...(amendmentOf ? [amendmentOf, amendmentOf] : []), ...selfParams],
      );
      if (rows.length > 0) {
        const visible = await visibleIds(rows.map((row) => row.id), input.requester, db);
        const reason = `the same ${keys.map(labelOf).join(" and ")}${scope === "SAME_REQUESTER" ? " (from you)" : byDepartment ? " (in your department)" : ""}`;
        const candidates: DuplicateCandidate[] = rows.map((row) => (visible.has(row.id) ? { id: row.id, requestNo: row.request_no, status: row.status, reason } : { id: null, requestNo: null, status: null, reason }));
        const blocking = settings.duplicates.policy === "BLOCK" && !isAdmin(input.requester.roles);
        items.push({
          code: "DUPLICATE",
          severity: blocking ? "BLOCKING" : "WARNING",
          message: blocking
            ? `A request with ${reason} already exists, and this type doesn't allow duplicates. Ask IT if this is a genuine repeat.`
            : `Possible duplicate: a request with ${reason} was raised in the last ${settings.duplicates.windowDays} days. If this one is separate, say why.`,
          candidates,
        });
      }
    }
  }
  // 3b. A10: must-be-unique identifiers, any date, anyone's request; always
  //     blocking. Under the type lock at submit, so two can't pass together.
  if (parsed.ok && !input.isCustom) {
    for (const key of settings.unique.fields.filter((item) => input.version.form.some((field) => field.key === item))) {
      const value = parsed.data[key];
      if (value === undefined || value === null || value === "") continue;
      const [rows] = await db.query<(RowDataPacket & { id: number; request_no: string; status: string })[]>(
        `SELECT r.id, r.request_no, r.status FROM approval_requests r JOIN workflow_versions v ON v.id = r.workflow_version_id
         WHERE v.workflow_id = ? AND r.deleted_at IS NULL AND r.status IN (?) AND LOWER(TRIM(JSON_UNQUOTE(JSON_EXTRACT(r.form_data_json, ?)))) = LOWER(TRIM(?))${amendmentOf ? " AND r.id <> ? AND NOT EXISTS (SELECT 1 FROM request_amendments ra WHERE ra.amendment_id = r.id AND ra.original_id = ?)" : ""}${selfSql}
         ORDER BY r.id DESC LIMIT 3${latest}`,
        [input.workflow.id, OPEN_OR_APPROVED, `$.${key}`, String(value), ...(amendmentOf ? [amendmentOf, amendmentOf] : []), ...selfParams],
      );
      if (!rows.length) continue;
      const visible = await visibleIds(rows.map((row) => row.id), input.requester, db);
      const reason = `the same ${labelOf(key)}`;
      items.push({
        code: "UNIQUE",
        severity: "BLOCKING",
        field: key,
        message: `${labelOf(key)} must be unique: a request with this value is already open or approved. Check the value, or ask IT.`,
        candidates: rows.map((row) => (visible.has(row.id) ? { id: row.id, requestNo: row.request_no, status: row.status, reason } : { id: null, requestNo: null, status: null, reason })),
      });
    }
  }
  // An amendment repeats the original's title on purpose.
  if (title && !input.amendment && !self) {
    const recent = await findRecentDuplicate({ requesterId: input.requester.id, title, workflowId: input.isCustom ? null : input.workflow.id }, db);
    if (recent) items.push({ code: "RECENT_DUPLICATE", severity: "WARNING", message: `You raised “${title}” as ${recent} a few minutes ago. If this is a separate request, confirm and submit again.` });
  }

  // 4. Budget (EN-09, BD-3): only for types that ask for it.
  const budget: BudgetCheck = { state: "NOT_CHECKED", departmentId: null, fy: null, budgetPaise: null, committedPaise: null, requestPaise: null };
  if (parsed.ok && settings.budget.enabled && !input.isCustom) {
    const amount = parsed.data[settings.budget.amountField];
    const departmentId = snapshot.users.find((user) => user.id === input.requester.id)?.departmentId ?? null;
    if (typeof amount !== "number") {
      // nothing to check (the amount field is optional and empty)
    } else if (departmentId === null) {
      items.push({ code: "DEPARTMENT", severity: "WARNING", message: "Your department isn't set, so this can't be checked against a budget. You can still submit; tell IT to set your department." });
    } else {
      const fy = financialYear(new Date());
      const [budgetRows] = await db.query<(RowDataPacket & { amount_paise: number; warn_percent: number })[]>(
        `SELECT amount_paise, warn_percent FROM budgets WHERE department_id = ? AND fy_start_year = ?${options.lock ? " FOR UPDATE" : ""}`,
        [departmentId, fy],
      );
      const [[committed]] = await db.query<RowDataPacket[]>(
        `SELECT COALESCE(SUM(CASE WHEN c.request_paise < 0 AND r.status <> 'APPROVED' THEN 0 ELSE c.request_paise END), 0) AS paise FROM request_submission_checks c JOIN approval_requests r ON r.id = c.request_id
         WHERE c.budget_department = ? AND c.budget_fy = ? AND r.deleted_at IS NULL AND r.status IN (?)${selfSql}${latest}`,
        [departmentId, fy, OPEN_OR_APPROVED, ...selfParams],
      );
      // An amendment counts only its change against the effective amount.
      const requestPaise = Math.round(amount * 100) - (input.amendment?.basePaise ?? 0);
      const row = budgetRows[0];
      const position = budgetPosition({ budgetPaise: row ? Number(row.amount_paise) : null, warnPercent: row ? Number(row.warn_percent) : 90, committedPaise: Number(committed?.paise ?? 0), requestPaise: Math.max(0, requestPaise) });
      Object.assign(budget, { state: position.state, departmentId, fy, budgetPaise: row ? Number(row.amount_paise) : null, committedPaise: Number(committed?.paise ?? 0), requestPaise });
      const department = (await departmentName(departmentId, db)) ?? "your department";
      if (position.state === "NO_BUDGET") {
        items.push({ code: "BUDGET", severity: "WARNING", message: `No budget is loaded for ${department} in ${fyLabel(fy)}, so this can't be checked. It doesn't mean the budget is unlimited.` });
      } else if (position.state === "OVER") {
        const block = (await getSettingValue("general.budget_policy").catch(() => null)) === "BLOCK";
        items.push({
          code: "BUDGET",
          severity: block ? "BLOCKING" : "WARNING",
          message: `Over budget: ${department}'s ${fyLabel(fy)} budget is ${formatPaise(budget.budgetPaise!)}; ${formatPaise(budget.committedPaise!)} is already committed and this adds ${formatPaise(requestPaise)}.${block ? " Over-budget requests can't be submitted; talk to IT or Finance." : ""}`,
        });
      } else if (position.state === "WARN") {
        items.push({ code: "BUDGET", severity: "INFO", message: `This brings ${department}'s ${fyLabel(fy)} budget to ${position.usedPercent}% used.` });
      }
    }
  }

  const status = items.some((item) => item.severity === "BLOCKING") ? "BLOCKED" : items.some((item) => item.severity === "WARNING") ? "WARNINGS" : "READY";
  return {
    readiness: {
      status,
      items,
      needsConfirmation: items.some((item) => item.severity === "WARNING" && CONFIRM_CODES.has(item.code)),
      needsReason: items.some((item) => item.code === "DUPLICATE" && item.severity === "WARNING"),
      fingerprint: fingerprintOf({ title: input.title, fields: input.fields, attachmentCount: input.attachmentCount }),
      budget,
    },
    data: parsed.data,
  };
}

async function visibleIds(ids: number[], viewer: { id: number; roles: readonly string[] }, db: Queryable): Promise<Set<number>> {
  if (isAdmin(viewer.roles)) return new Set(ids);
  const visible = visibleToSql("r");
  const [rows] = await db.query<(RowDataPacket & { id: number })[]>(`SELECT r.id FROM approval_requests r WHERE r.id IN (?) AND ${visible.sql}`, [ids, ...visible.params(viewer.id)]);
  return new Set(rows.map((row) => row.id));
}

async function departmentName(id: number, db: Queryable): Promise<string | null> {
  const [rows] = await db.query<(RowDataPacket & { name: string })[]>("SELECT name FROM departments WHERE id = ?", [id]);
  return rows[0]?.name ?? null;
}
