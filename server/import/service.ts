import "server-only";
import { withTransaction } from "@/lib/db/transaction";
import { loadImportSnapshot, setReportingManager, upsertHoliday } from "@/lib/db/repositories/import.repository";
import { insertUser, replaceUserRoles, updateUserRecord } from "@/lib/db/repositories/admin-users.repository";
import { insertDepartment, insertDesignation, updateDepartment, updateDesignation } from "@/lib/db/repositories/organisation.repository";
import { addGroupMember, insertGroup, removeGroupMember, updateGroup } from "@/lib/db/repositories/groups.repository";
import { revokeAllSessionsForUser } from "@/lib/db/repositories/sessions.repository";
import { recordAudit } from "@/lib/db/repositories/audit.repository";
import { notify } from "@/server/notifications/notify";
import { signInMethodChangedMessage, whatsappChangedMessage } from "@/server/notifications/security-messages";
import { planImport, type ImportOp, type ImportPlan, type Snapshot } from "@/server/import/plan";
import { IMPORT_LIMITS, IMPORT_SPECS, type ImportKind } from "@/server/import/kinds";
import { toCsv } from "@/server/import/csv";
import { logError } from "@/lib/logging/logger";
import type { AdminActor } from "@/server/admin/users";
import type { PoolConnection } from "mysql2/promise";

// Bulk import (S10-03, F-59, D-084). Check = plan only. Import = plan again
// inside one transaction and write every row, or none.
export type ImportOutcome = { ok: true; plan: ImportPlan } | { ok: false; message: string; plan?: ImportPlan };

// The uploaded file: CSV text, within the size limit.
export async function readUpload(file: FormDataEntryValue | null): Promise<{ ok: true; text: string; name: string } | { ok: false; message: string }> {
  if (!file || typeof file === "string" || file.size === 0) return { ok: false, message: "Choose a CSV file to upload." };
  if (file.size > IMPORT_LIMITS.maxBytes) return { ok: false, message: "The file is larger than 2 MB. Split it into smaller files." };
  if (!/\.csv$/i.test(file.name)) return { ok: false, message: "Upload a .csv file. In Excel: File → Save As → CSV UTF-8 (Comma delimited)." };
  const bytes = new Uint8Array(await file.arrayBuffer());
  let text: string;
  try {
    text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    // Older Excel saves "CSV (Comma delimited)" in Windows-1252.
    text = new TextDecoder("windows-1252").decode(bytes);
  }
  if (text.includes("\u0000")) return { ok: false, message: "This doesn't look like a CSV file. Save the sheet as CSV UTF-8 and try again." };
  return { ok: true, text, name: file.name.slice(0, 200) };
}

async function snapshotFor(actor: AdminActor, db?: PoolConnection): Promise<Snapshot> {
  return { actor: { id: actor.id, roles: actor.roles }, ...(await loadImportSnapshot(db)) };
}

export async function checkImport(kind: ImportKind, text: string, actor: AdminActor): Promise<ImportPlan> {
  return planImport(kind, text, await snapshotFor(actor));
}

class PlanRejected extends Error {
  constructor(readonly plan: ImportPlan) {
    super("PLAN_REJECTED");
  }
}

const audit = (actor: AdminActor, action: string, entityType: string, entityId: number | string, metadata: Record<string, unknown>, db: PoolConnection) =>
  recordAudit({ actorUserId: actor.id, action, entityType, entityId, sessionId: actor.sessionId, ipAddress: actor.ipAddress, metadata: { source: "IMPORT", ...metadata } }, db);

async function applyOps(ops: ImportOp[], actor: AdminActor, db: PoolConnection): Promise<void> {
  // Users: everyone first, then reporting lines that point at people
  // created by this same file.
  const idByLogin = new Map<string, number>();
  const laterManagers: { userId: number; managerLogin: string }[] = [];
  for (const op of ops) {
    if (op.kind === "user-create") {
      const managerId = op.manager && "id" in op.manager ? op.manager.id : null;
      const id = await insertUser({ ...op.value, reportingManagerId: managerId }, actor.id, db);
      await replaceUserRoles(id, op.roles, actor.id, db);
      idByLogin.set(op.value.loginId.toLowerCase(), id);
      if (op.manager && "loginId" in op.manager) laterManagers.push({ userId: id, managerLogin: op.manager.loginId });
      await audit(actor, "USER_CREATED", "USER", id, { line: op.line, after: { ...op.value, manager: op.manager, roles: op.roles } }, db);
    } else if (op.kind === "user-update") {
      const managerId = op.manager && "id" in op.manager ? op.manager.id : null;
      await updateUserRecord(op.id, { ...op.value, reportingManagerId: managerId }, op.effects, actor.id, db);
      if (op.rolesChanged) await replaceUserRoles(op.id, op.roles, actor.id, db);
      if (op.endSessions) await revokeAllSessionsForUser(op.id, "ACCOUNT_CHANGED_BY_ADMIN", db);
      if (op.manager && "loginId" in op.manager) laterManagers.push({ userId: op.id, managerLogin: op.manager.loginId });
      await audit(
        actor,
        "USER_UPDATED",
        "USER",
        op.id,
        {
          line: op.line,
          changes: op.changes,
          ...(op.rolesChanged ? { roles: op.roles } : {}),
          ...(op.effects.unlinkGoogle ? { googleUnlinked: true } : {}),
          ...(op.effects.clearPassword ? { passwordRemoved: true } : {}),
          ...(op.endSessions ? { sessionsEnded: true } : {}),
        },
        db,
      );
    } else if (op.kind === "department") {
      if (op.id === null) {
        const id = await insertDepartment(op.value, db);
        if (!op.value.active) await updateDepartment(id, op.value, db);
        await audit(actor, "DEPARTMENT_CREATED", "DEPARTMENT", id, { line: op.line, after: op.value }, db);
      } else {
        await updateDepartment(op.id, op.value, db);
        await audit(actor, "DEPARTMENT_UPDATED", "DEPARTMENT", op.id, { line: op.line, before: op.before, after: op.value }, db);
      }
    } else if (op.kind === "designation") {
      if (op.id === null) {
        const id = await insertDesignation(op.value, db);
        if (!op.value.active) await updateDesignation(id, op.value, db);
        await audit(actor, "DESIGNATION_CREATED", "DESIGNATION", id, { line: op.line, after: op.value }, db);
      } else {
        await updateDesignation(op.id, op.value, db);
        await audit(actor, "DESIGNATION_UPDATED", "DESIGNATION", op.id, { line: op.line, before: op.before, after: op.value }, db);
      }
    } else if (op.kind === "group") {
      let id = op.id;
      const before = (op.before as { members?: number[] } | null)?.members ?? [];
      if (id === null) {
        id = await insertGroup({ code: op.value.code, name: op.value.name, createdBy: actor.id }, db);
        if (!op.value.active) await updateGroup(id, op.value, db);
      } else await updateGroup(id, op.value, db);
      for (const userId of op.memberIds) if (!before.includes(userId)) await addGroupMember(id, userId, actor.id, db);
      for (const userId of before) if (!op.memberIds.includes(userId)) await removeGroupMember(id, userId, db);
      await audit(actor, op.id === null ? "GROUP_CREATED" : "GROUP_UPDATED", "GROUP", id, { line: op.line, before: op.before, after: { ...op.value, members: op.memberIds } }, db);
    } else {
      await upsertHoliday(op.value.date, op.value.name, actor.id, db);
      await audit(actor, op.exists ? "HOLIDAY_RENAMED" : "HOLIDAY_ADDED", "CALENDAR", op.value.date, { line: op.line, before: op.before, after: op.value }, db);
    }
  }
  for (const { userId, managerLogin } of laterManagers) {
    const managerId = idByLogin.get(managerLogin);
    if (managerId === undefined) throw new Error("IMPORT_MANAGER_MISSING");
    await setReportingManager(userId, managerId, actor.id, db);
  }
}

export async function runImport(kind: ImportKind, text: string, fileName: string, actor: AdminActor): Promise<ImportOutcome> {
  let plan: ImportPlan;
  try {
    plan = await withTransaction(async (db) => {
      const current = planImport(kind, text, await snapshotFor(actor, db));
      if (current.fileProblems.length || current.summary.error > 0) throw new PlanRejected(current);
      await applyOps(current.ops, actor, db);
      await recordAudit(
        {
          actorUserId: actor.id,
          action: "IMPORT_COMPLETED",
          entityType: "IMPORT",
          entityId: kind,
          sessionId: actor.sessionId,
          ipAddress: actor.ipAddress,
          metadata: { kind, fileName, ...current.summary },
        },
        db,
      );
      return current;
    });
  } catch (error) {
    if (error instanceof PlanRejected) return { ok: false, message: "Nothing was imported: some rows have problems. Fix them and check the file again.", plan: error.plan };
    if ((error as { code?: string })?.code === "ER_DUP_ENTRY") {
      return { ok: false, message: "Nothing was imported: a value became used by someone else while importing. Check the file again." };
    }
    logError("runImport failed", error, { kind });
    return { ok: false, message: "Nothing was imported because something went wrong. Please try again." };
  }

  // Security alerts after the commit (N-03), as for a change on the form.
  for (const op of plan.ops) {
    if (op.kind !== "user-update") continue;
    try {
      if (op.changes.whatsappNumber) await notify({ eventType: "WHATSAPP_CHANGED", userId: op.id, ...whatsappChangedMessage(op.value.name) });
      if (op.changes.signInMethod) await notify({ eventType: "SIGN_IN_METHOD_CHANGED", userId: op.id, ...signInMethodChangedMessage(op.value.name, op.value.signInMethod) });
    } catch (error) {
      logError("runImport: alert failed", error, { userId: op.id });
    }
  }
  return { ok: true, plan };
}

// Downloads (S10-04): the empty template, or the current data in the same
// columns so it can be edited and uploaded again.
export function templateCsv(kind: ImportKind): string {
  return toCsv(
    IMPORT_SPECS[kind].columns.map((column) => column.name),
    [],
  );
}

export async function currentDataCsv(kind: ImportKind): Promise<string> {
  const data = await loadImportSnapshot();
  const header = IMPORT_SPECS[kind].columns.map((column) => column.name);
  const yesNo = (value: boolean) => (value ? "Yes" : "No");
  const loginOf = new Map(data.users.map((user) => [user.id, user.loginId]));
  switch (kind) {
    case "users": {
      const departments = new Map(data.departments.map((item) => [item.id, item.code]));
      const designations = new Map(data.designations.map((item) => [item.id, item.code]));
      return toCsv(
        header,
        data.users
          .filter((user) => !user.isBreakGlass && !user.isDemo)
          .map((user) => [
            user.loginId,
            user.name,
            user.email,
            user.whatsappNumber,
            user.departmentId ? departments.get(user.departmentId) : "",
            user.designationId ? designations.get(user.designationId) : "",
            user.reportingManagerId ? loginOf.get(user.reportingManagerId) : "",
            user.signInMethod,
            user.roles.join(";"),
          ]),
      );
    }
    case "departments":
      return toCsv(
        header,
        data.departments.map((item) => [item.code, item.name, item.hodUserId ? loginOf.get(item.hodUserId) : "", yesNo(item.active)]),
      );
    case "designations":
      return toCsv(
        header,
        data.designations.map((item) => [item.code, item.name, yesNo(item.isApprover), yesNo(item.active)]),
      );
    case "groups":
      return toCsv(
        header,
        data.groups.map((item) => [item.code, item.name, item.memberIds.map((id) => loginOf.get(id) ?? "").filter(Boolean).join(";"), yesNo(item.active)]),
      );
    case "holidays":
      return toCsv(
        header,
        data.holidays.map((item) => [item.date, item.name]),
      );
  }
}
