import "server-only";
import { z } from "zod";
import { withTransaction } from "@/lib/db/transaction";
import {
  findDepartment,
  insertDepartment,
  insertDesignation,
  listDesignations,
  updateDepartment,
  updateDesignation,
} from "@/lib/db/repositories/organisation.repository";
import { recordAudit } from "@/lib/db/repositories/audit.repository";
import type { AdminActor, ServiceResult } from "@/server/admin/users";
import { checkChosenApprover } from "@/server/approvals/approver-check";

// Departments (with HOD, used by the REQUESTER_DEPARTMENT_HOD and
// DEPARTMENT_HOD approver sources) and designations (P1-01, S2-03a).
const codeSchema = z
  .string()
  .trim()
  .min(2, "Use at least 2 characters.")
  .max(50)
  .regex(/^[A-Za-z0-9_-]+$/, "Letters, numbers, dash or underscore.")
  .transform((value) => value.toUpperCase());
const nameSchema = z.string().trim().min(2, "Enter a name.").max(150);
const idSchema = z
  .string()
  .optional()
  .transform((value) => (value && /^\d+$/.test(value) ? Number(value) : null));

const departmentSchema = z.object({ code: codeSchema, name: nameSchema, hodUserId: idSchema, active: z.string().optional() });
const designationSchema = z.object({ code: codeSchema, name: nameSchema, isApprover: z.string().optional(), active: z.string().optional() });

function issues(error: z.ZodError): Record<string, string> {
  const out: Record<string, string> = {};
  for (const issue of error.issues) out[String(issue.path[0] ?? "form")] ??= issue.message;
  return out;
}

function isDuplicate(error: unknown): boolean {
  return (error as { code?: string })?.code === "ER_DUP_ENTRY";
}

export async function saveDepartment(id: number | null, fields: Record<string, string | undefined>, actor: AdminActor): Promise<ServiceResult<number>> {
  const parsed = departmentSchema.safeParse(fields);
  if (!parsed.success) return { ok: false, message: "Check the highlighted fields.", fieldErrors: issues(parsed.error) };
  const value = { code: parsed.data.code, name: parsed.data.name, hodUserId: parsed.data.hodUserId };
  // D-085: the HOD approves at the HOD level. The HOD already saved stays valid.
  const currentHod = id === null ? null : ((await findDepartment(id))?.hodUserId ?? null);
  const notApprover = await checkChosenApprover(value.hodUserId, currentHod);
  if (notApprover) return { ok: false, message: "Check the highlighted fields.", fieldErrors: { hodUserId: notApprover } };
  try {
    const savedId = await withTransaction(async (connection) => {
      if (id === null) {
        const newId = await insertDepartment(value, connection);
        await recordAudit({ actorUserId: actor.id, action: "DEPARTMENT_CREATED", entityType: "DEPARTMENT", entityId: newId, sessionId: actor.sessionId, ipAddress: actor.ipAddress, metadata: { after: value } }, connection);
        return newId;
      }
      const before = await findDepartment(id, connection);
      if (!before) throw new Error("NOT_FOUND");
      const active = parsed.data.active === "on";
      await updateDepartment(id, { ...value, active }, connection);
      await recordAudit(
        {
          actorUserId: actor.id,
          action: "DEPARTMENT_UPDATED",
          entityType: "DEPARTMENT",
          entityId: id,
          sessionId: actor.sessionId,
          ipAddress: actor.ipAddress,
          metadata: { before: { code: before.code, name: before.name, hodUserId: before.hodUserId, active: before.active }, after: { ...value, active } },
        },
        connection,
      );
      return id;
    });
    return { ok: true, value: savedId };
  } catch (error) {
    if (isDuplicate(error)) return { ok: false, message: "Check the highlighted fields.", fieldErrors: { code: "This code is already used." } };
    if ((error as Error).message === "NOT_FOUND") return { ok: false, message: "Department not found." };
    if ((error as { code?: string })?.code === "ER_NO_REFERENCED_ROW_2") return { ok: false, message: "The selected HOD no longer exists." };
    throw error;
  }
}

export async function saveDesignation(id: number | null, fields: Record<string, string | undefined>, actor: AdminActor): Promise<ServiceResult<number>> {
  const parsed = designationSchema.safeParse(fields);
  if (!parsed.success) return { ok: false, message: "Check the highlighted fields.", fieldErrors: issues(parsed.error) };
  // D-085: people with this designation can be chosen as approvers.
  const value = { code: parsed.data.code, name: parsed.data.name, isApprover: parsed.data.isApprover === "on" };
  try {
    const savedId = await withTransaction(async (connection) => {
      if (id === null) {
        const newId = await insertDesignation(value, connection);
        await recordAudit({ actorUserId: actor.id, action: "DESIGNATION_CREATED", entityType: "DESIGNATION", entityId: newId, sessionId: actor.sessionId, ipAddress: actor.ipAddress, metadata: { after: value } }, connection);
        return newId;
      }
      const before = (await listDesignations(connection)).find((item) => item.id === id);
      if (!before) throw new Error("NOT_FOUND");
      const active = parsed.data.active === "on";
      await updateDesignation(id, { ...value, active }, connection);
      await recordAudit(
        {
          actorUserId: actor.id,
          action: "DESIGNATION_UPDATED",
          entityType: "DESIGNATION",
          entityId: id,
          sessionId: actor.sessionId,
          ipAddress: actor.ipAddress,
          metadata: { before: { code: before.code, name: before.name, isApprover: before.isApprover, active: before.active }, after: { ...value, active } },
        },
        connection,
      );
      return id;
    });
    return { ok: true, value: savedId };
  } catch (error) {
    if (isDuplicate(error)) return { ok: false, message: "Check the highlighted fields.", fieldErrors: { code: "This code is already used." } };
    if ((error as Error).message === "NOT_FOUND") return { ok: false, message: "Designation not found." };
    throw error;
  }
}
