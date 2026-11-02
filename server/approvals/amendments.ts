import "server-only";
import type { RowDataPacket } from "mysql2/promise";
import { getDbPool, type Queryable } from "@/lib/db/client";
import { findPublishedVersion, findRequest, findValidity, findWorkflow, findWorkflowVersion, type RequestRecord, type WorkflowRecord, type WorkflowVersionRecord } from "@/lib/db/repositories/approvals.repository";
import { cleanExpiredReason, expiredReasonError, isExpiredApproval } from "@/server/approvals/expiry-rules";
import { submitRequest, type Actor, type AmendmentChange, type Result } from "@/server/approvals/service";
import type { FormField } from "@/server/forms/fields";
import { featureOn } from "@/server/settings/features";
import type { FormData as EngineFormData } from "@/server/engine";

// FN5 amendments after approval (D-120). An amendment is a new request of
// the same approval type, raised by the original requester, that changes
// only the fields the type allows and goes through the type's current
// workflow again (DoA re-evaluated on the new values). The original request
// and its decisions never change; its effective values are those of the
// latest APPROVED amendment, so a rejected or withdrawn amendment changes
// nothing.
const OPEN = new Set(["IN_PROGRESS", "ON_HOLD", "CHANGES_REQUIRED"]);

export interface AmendmentRecord {
  originalId: number;
  amendmentId: number;
  requestNo: string;
  status: string;
  reason: string;
  changes: AmendmentChange[];
  createdAt: Date;
}

type Row = RowDataPacket & { original_id: number; amendment_id: number; request_no: string; status: string; reason: string; changes_json: unknown; created_at: Date };
const toRecord = (row: Row): AmendmentRecord => ({
  originalId: row.original_id,
  amendmentId: row.amendment_id,
  requestNo: row.request_no,
  status: row.status,
  reason: row.reason,
  changes: (typeof row.changes_json === "string" ? JSON.parse(row.changes_json) : row.changes_json) as AmendmentChange[],
  createdAt: row.created_at,
});

const SELECT = `SELECT a.original_id, a.amendment_id, r.request_no, r.status, a.reason, a.changes_json, a.created_at
  FROM request_amendments a JOIN approval_requests r ON r.id = a.amendment_id WHERE r.deleted_at IS NULL`;

export async function listAmendments(originalId: number, db: Queryable = getDbPool()): Promise<AmendmentRecord[]> {
  const [rows] = await db.query<Row[]>(`${SELECT} AND a.original_id = ? ORDER BY a.id DESC`, [originalId]);
  return rows.map(toRecord);
}

export async function findAmendment(amendmentId: number, db: Queryable = getDbPool()): Promise<(AmendmentRecord & { originalNo: string }) | null> {
  const [rows] = await db.query<(Row & { original_no: string })[]>(
    `SELECT a.original_id, a.amendment_id, r.request_no, r.status, a.reason, a.changes_json, a.created_at, o.request_no AS original_no
     FROM request_amendments a JOIN approval_requests r ON r.id = a.amendment_id JOIN approval_requests o ON o.id = a.original_id WHERE a.amendment_id = ?`,
    [amendmentId],
  );
  return rows[0] ? { ...toRecord(rows[0]), originalNo: rows[0].original_no } : null;
}

// The values in force: the latest approved amendment's, else the original's.
export async function effectiveValues(original: RequestRecord, db: Queryable = getDbPool()): Promise<{ data: EngineFormData; fromAmendment: AmendmentRecord | null }> {
  const latest = (await listAmendments(original.id, db)).find((amendment) => amendment.status === "APPROVED") ?? null;
  if (!latest) return { data: original.formData as EngineFormData, fromAmendment: null };
  const amended = await findRequest(latest.amendmentId, db);
  return { data: (amended?.formData ?? original.formData) as EngineFormData, fromAmendment: latest };
}

export const rawOf = (data: Record<string, unknown>): Record<string, string> =>
  Object.fromEntries(Object.entries(data).map(([key, value]) => [key, value === null || value === undefined ? "" : String(value)]));

export interface AmendmentPlan {
  original: RequestRecord;
  workflow: WorkflowRecord;
  version: WorkflowVersionRecord;
  amendable: FormField[];
  effective: EngineFormData;
  basePaise: number | null;
  inProgress: AmendmentRecord | null;
  // DR-05 (owner, 2 Nov 2026): amending an expired approval needs a reason.
  expired: boolean;
  validUntil: Date | null;
}

// Whether this person may amend this request now, and with what. Returns a
// plain reason when not.
export async function amendmentPlan(requestId: number, actor: Actor): Promise<{ ok: true; plan: AmendmentPlan } | { ok: false; reason: string }> {
  const original = await findRequest(requestId);
  if (!original || original.requesterId !== actor.id) return { ok: false, reason: "Not found." };
  if (!(await featureOn("amendments", actor))) return { ok: false, reason: "Amendments are switched off at the moment." };
  if (await findAmendment(requestId)) return { ok: false, reason: "This is an amendment. Amend the original request instead." };
  if (original.status !== "APPROVED") return { ok: false, reason: "Only an approved request can be amended." };
  const originalVersion = await findWorkflowVersion(original.workflowVersionId);
  const workflow = originalVersion ? await findWorkflow(originalVersion.workflowId) : null;
  const version = workflow?.active ? await findPublishedVersion(workflow.id) : null;
  if (!workflow || !version || workflow.kind === "CUSTOM") return { ok: false, reason: "This approval type can't be amended." };
  const allowed = new Set(workflow.settings?.amendableFields ?? []);
  const amendable = version.form.filter((field) => allowed.has(field.key) && field.type !== "SECTION" && field.type !== "CALC" && field.type !== "ATTACHMENT");
  if (!amendable.length) return { ok: false, reason: "This approval type doesn't allow amendments. IT can switch them on for chosen fields." };
  const { data: effective } = await effectiveValues(original);
  const amountField = workflow.settings?.budget.enabled ? workflow.settings.budget.amountField : null;
  const amount = amountField ? effective[amountField] : undefined;
  const inProgress = (await listAmendments(original.id)).find((amendment) => OPEN.has(amendment.status)) ?? null;
  const validUntil = await findValidity(original.id);
  const expired = isExpiredApproval(original.status, validUntil);
  return { ok: true, plan: { original, workflow, version, amendable, effective, basePaise: typeof amount === "number" ? Math.round(amount * 100) : null, inProgress, expired, validUntil } };
}

// The form values for an amendment: the effective values, with only the
// amendable fields taken from what the person sent.
export function mergeAmendmentFields(plan: AmendmentPlan, fields: Record<string, string>): Record<string, string> {
  const merged: Record<string, string> = {};
  const effectiveRaw = rawOf(plan.effective);
  for (const field of plan.version.form) {
    if (field.type === "SECTION" || field.type === "CALC") continue;
    merged[field.key] = effectiveRaw[field.key] ?? "";
    // The line-items editor sends its rows; the stored total isn't enough.
    if (field.type === "LINE_ITEMS" && effectiveRaw[`${field.key}__lines`]) merged[field.key] = effectiveRaw[`${field.key}__lines`]!;
  }
  for (const field of plan.amendable) merged[field.key] = fields[field.key] ?? "";
  return merged;
}

export const amendmentTitle = (original: RequestRecord) => `Amendment: ${original.title}`.slice(0, 200);

// Submit an amendment: only the amendable fields come from the form;
// everything else is the effective value, so nothing outside the allowed
// scope can change. The service locks the original, refuses a second open
// amendment and a no-change amendment, and records the changes.
export async function submitAmendment(
  input: { originalId: number; fields: Record<string, string>; reason: string; expiredReason?: string; submissionKey?: string | null; acknowledged?: boolean; overrideReason?: string; attachmentCount?: number },
  actor: Actor,
): Promise<Result<{ requestId: number; requestNo: string; status: string; repeated?: boolean }>> {
  const planned = await amendmentPlan(input.originalId, actor);
  if (!planned.ok) return { ok: false, code: "NOT_AMENDABLE", message: planned.reason, fieldErrors: { amendment: planned.reason } };
  const reason = input.reason.replace(/\s+/g, " ").trim().slice(0, 1000);
  if (reason.length < 10) return { ok: false, code: "VALIDATION", message: "Say why it needs amending.", fieldErrors: { amendReason: "Say why it needs amending (at least 10 characters)." } };
  const { plan } = planned;
  // DR-05: not blocked, but an expired approval needs a reason, kept on its history.
  const expiredReason = plan.expired ? cleanExpiredReason(input.expiredReason) : "";
  const expiredProblem = plan.expired ? expiredReasonError(expiredReason) : null;
  if (expiredProblem) return { ok: false, code: "VALIDATION", message: expiredProblem, fieldErrors: { expiredReason: expiredProblem } };
  const merged = mergeAmendmentFields(plan, input.fields);
  return submitRequest(
    {
      workflowId: plan.workflow.id,
      title: amendmentTitle(plan.original),
      fields: merged,
      submissionKey: input.submissionKey,
      acknowledged: input.acknowledged,
      overrideReason: input.overrideReason,
      attachmentCount: input.attachmentCount,
      amendment: { originalId: plan.original.id, reason, basePaise: plan.basePaise, effective: plan.effective, ...(expiredReason ? { expiredReason } : {}) },
    },
    actor,
  );
}
