import "server-only";
import { withTransaction } from "@/lib/db/transaction";
import {
  countActiveSuperAdmins,
  getManagerMap,
  getUserForAdmin,
  insertUser,
  replaceUserRoles,
  setUserModules,
  setUserChatAccess,
  setUserActive,
  unlockUser,
  updateUserRecord,
  type AdminUserDetail,
} from "@/lib/db/repositories/admin-users.repository";
import { revokeAllSessionsForUser } from "@/lib/db/repositories/sessions.repository";
import { recordAudit } from "@/lib/db/repositories/audit.repository";
import { notify } from "@/server/notifications/notify";
import { signInMethodChangedMessage, whatsappChangedMessage } from "@/server/notifications/security-messages";
import { checkCanEdit, checkContactChange, checkDeactivate, checkManager, checkModuleChange, checkRoleChange, type Actor, type TargetUser } from "@/server/admin/user-rules";
import { applyModuleChange, modulesProblem, sameModules, type ModuleChange, type ModuleCode } from "@/server/modules/modules";
import { diffFields, type ParsedUserInput } from "@/server/admin/user-input";
import { logError } from "@/lib/logging/logger";
import { countPendingTasks } from "@/server/approvals/service";
import { checkChosenApprover } from "@/server/approvals/approver-check";
import { allowsGoogle, allowsPassword } from "@/types/auth";

// User management services (F-06, D-047). Every write re-checks the rules,
// runs in one transaction with its audit entry, and sends alerts only after
// the commit.
export type ServiceResult<T = undefined> = { ok: true; value: T } | { ok: false; message: string; fieldErrors?: Record<string, string> };

export interface AdminActor extends Actor {
  sessionId: string;
  ipAddress: string | null;
}

const toTarget = (user: AdminUserDetail): TargetUser => ({ id: user.id, roles: user.roles, active: user.active, isBreakGlass: user.isBreakGlass });

function duplicateError(error: unknown): Record<string, string> | null {
  const mysqlError = error as { code?: string; message?: string };
  if (mysqlError?.code !== "ER_DUP_ENTRY") return null;
  const message = mysqlError.message ?? "";
  if (message.includes("uq_users_login_id")) return { loginId: "This User ID is already used." };
  if (message.includes("uq_users_email")) return { email: "This email is already used by another user." };
  if (message.includes("uq_users_whatsapp_number")) return { whatsappNumber: "This WhatsApp number is already used by another user." };
  return { form: "This value is already used." };
}

function foreignKeyError(error: unknown): boolean {
  return (error as { code?: string })?.code === "ER_NO_REFERENCED_ROW_2";
}

function record(input: ParsedUserInput) {
  return {
    loginId: input.loginId,
    name: input.name,
    email: input.email,
    whatsappNumber: input.whatsappNumber,
    departmentId: input.departmentId,
    designationId: input.designationId,
    reportingManagerId: input.reportingManagerId,
    signInMethod: input.signInMethod,
  };
}

export async function createUser(input: ParsedUserInput, actor: AdminActor): Promise<ServiceResult<number>> {
  const roleCheck = checkRoleChange(actor, null, input.roles, await countActiveSuperAdmins());
  if (!roleCheck.ok) return { ok: false, message: roleCheck.message, fieldErrors: { roles: roleCheck.message } };
  const managerCheck = checkManager(null, input.reportingManagerId, () => null);
  if (!managerCheck.ok) return { ok: false, message: managerCheck.message, fieldErrors: { reportingManagerId: managerCheck.message } };
  // D-085: the reporting manager approves at the manager level.
  const managerNotApprover = await checkChosenApprover(input.reportingManagerId);
  if (managerNotApprover) return { ok: false, message: managerNotApprover, fieldErrors: { reportingManagerId: managerNotApprover } };

  try {
    const id = await withTransaction(async (connection) => {
      const newId = await insertUser(record(input), actor.id, connection);
      await replaceUserRoles(newId, input.roles, actor.id, connection);
      // D-168: without a choice, the column default applies (Approval, Task, Information).
      if (input.modules) await setUserModules(newId, input.modules, actor.id, connection);
      if (input.chatAccess) await setUserChatAccess(newId, input.chatAccess, actor.id, connection);
      await recordAudit(
        {
          actorUserId: actor.id,
          action: "USER_CREATED",
          entityType: "USER",
          entityId: newId,
          sessionId: actor.sessionId,
          ipAddress: actor.ipAddress,
          metadata: { after: { ...record(input), roles: input.roles, ...(input.modules ? { modules: input.modules } : {}), ...(input.chatAccess ? { chatAccess: input.chatAccess } : {}) } },
        },
        connection,
      );
      return newId;
    });
    return { ok: true, value: id };
  } catch (error) {
    const duplicate = duplicateError(error);
    if (duplicate) return { ok: false, message: "Some values are already in use.", fieldErrors: duplicate };
    if (foreignKeyError(error)) return { ok: false, message: "A selected department, designation or manager no longer exists." };
    throw error;
  }
}

export async function updateUser(id: number, input: ParsedUserInput, actor: AdminActor): Promise<ServiceResult> {
  const existing = await getUserForAdmin(id);
  if (!existing) return { ok: false, message: "User not found." };
  const target = toTarget(existing);
  const edit = checkCanEdit(actor, target);
  if (!edit.ok) return { ok: false, message: edit.message };
  const roleCheck = checkRoleChange(actor, target, input.roles, await countActiveSuperAdmins());
  if (!roleCheck.ok) return { ok: false, message: roleCheck.message, fieldErrors: { roles: roleCheck.message } };
  const managers = await getManagerMap();
  const managerCheck = checkManager(id, input.reportingManagerId, (userId) => managers.get(userId) ?? null);
  if (!managerCheck.ok) return { ok: false, message: managerCheck.message, fieldErrors: { reportingManagerId: managerCheck.message } };
  const managerNotApprover = await checkChosenApprover(input.reportingManagerId, existing.reportingManagerId);
  if (managerNotApprover) return { ok: false, message: managerNotApprover, fieldErrors: { reportingManagerId: managerNotApprover } };

  const before = {
    loginId: existing.loginId,
    name: existing.name,
    email: existing.email,
    whatsappNumber: existing.whatsappNumber,
    departmentId: existing.departmentId,
    designationId: existing.designationId,
    reportingManagerId: existing.reportingManagerId,
    signInMethod: existing.signInMethod,
  };
  const after = record(input);
  const changes = diffFields(before, after);
  const contact = checkContactChange(actor, target, { email: before.email !== after.email, whatsappNumber: before.whatsappNumber !== after.whatsappNumber, signInMethod: before.signInMethod !== after.signInMethod });
  if (!contact.ok) return { ok: false, message: contact.message };
  const rolesChanged = existing.roles.join(",") !== input.roles.join(",");
  // D-168: modules change only when the form sent them and they differ, so
  // saving other details never touches them; changing them has its own rule.
  const modulesChanged = Boolean(input.modules) && !sameModules(existing.modules, input.modules!);
  if (modulesChanged) {
    const moduleCheck = checkModuleChange(actor, target);
    if (!moduleCheck.ok) return { ok: false, message: moduleCheck.message, fieldErrors: { modules: moduleCheck.message } };
  }
  // D-172: Pic bot chat access follows the same rule as modules.
  const chatBefore = { chatModes: existing.chatModes, salesforceScope: existing.salesforceScope };
  const chatChanged = Boolean(input.chatAccess) && JSON.stringify(chatBefore) !== JSON.stringify(input.chatAccess);
  if (chatChanged && !modulesChanged) {
    const chatCheck = checkModuleChange(actor, target);
    if (!chatCheck.ok) return { ok: false, message: chatCheck.message, fieldErrors: { chatModes: chatCheck.message } };
  }
  if (!Object.keys(changes).length && !rolesChanged && !modulesChanged && !chatChanged) return { ok: true, value: undefined };

  const effects = {
    unlinkGoogle: existing.googleLinked && (before.email !== after.email || !allowsGoogle(after.signInMethod)),
    clearPassword: !allowsPassword(after.signInMethod) && existing.hasPassword,
  };
  // A different way in, or a different account, ends the open sessions.
  const endSessions = before.signInMethod !== after.signInMethod || before.email !== after.email || before.loginId !== after.loginId;

  try {
    await withTransaction(async (connection) => {
      await updateUserRecord(id, after, effects, actor.id, connection);
      if (rolesChanged) await replaceUserRoles(id, input.roles, actor.id, connection);
      if (modulesChanged) await setUserModules(id, input.modules!, actor.id, connection);
      if (chatChanged) await setUserChatAccess(id, input.chatAccess!, actor.id, connection);
      if (endSessions) await revokeAllSessionsForUser(id, "ACCOUNT_CHANGED_BY_ADMIN", connection);
      await recordAudit(
        {
          actorUserId: actor.id,
          action: "USER_UPDATED",
          entityType: "USER",
          entityId: id,
          sessionId: actor.sessionId,
          ipAddress: actor.ipAddress,
          metadata: {
            changes,
            ...(rolesChanged ? { roles: { before: existing.roles, after: input.roles } } : {}),
            ...(modulesChanged ? { modules: { before: existing.modules, after: input.modules } } : {}),
            ...(chatChanged ? { chatAccess: { before: chatBefore, after: input.chatAccess } } : {}),
            ...(effects.unlinkGoogle ? { googleUnlinked: true } : {}),
            ...(effects.clearPassword ? { passwordRemoved: true } : {}),
            ...(endSessions ? { sessionsEnded: true } : {}),
          },
        },
        connection,
      );
    });
  } catch (error) {
    const duplicate = duplicateError(error);
    if (duplicate) return { ok: false, message: "Some values are already in use.", fieldErrors: duplicate };
    if (foreignKeyError(error)) return { ok: false, message: "A selected department, designation or manager no longer exists." };
    throw error;
  }

  // N-03 alerts, after the commit; failures never undo the change.
  try {
    if (changes.whatsappNumber) await notify({ eventType: "WHATSAPP_CHANGED", userId: id, ...whatsappChangedMessage(after.name) });
    if (changes.signInMethod) await notify({ eventType: "SIGN_IN_METHOD_CHANGED", userId: id, ...signInMethodChangedMessage(after.name, after.signInMethod) });
  } catch (error) {
    logError("updateUser: alert failed", error, { userId: id });
  }
  return { ok: true, value: undefined };
}

export async function setActive(id: number, active: boolean, actor: AdminActor): Promise<ServiceResult> {
  const existing = await getUserForAdmin(id);
  if (!existing) return { ok: false, message: "User not found." };
  const target = toTarget(existing);
  const check = active ? checkCanEdit(actor, target) : checkDeactivate(actor, target, await countActiveSuperAdmins());
  if (!check.ok) return { ok: false, message: check.message };
  if (existing.active === active) return { ok: true, value: undefined };
  // F-16: nobody leaves with approvals still waiting on them.
  if (!active) {
    const pending = await countPendingTasks(id);
    if (pending > 0) return { ok: false, message: `${existing.name} still has ${pending} pending approval${pending === 1 ? "" : "s"}. Hand them over first.` };
  }

  await withTransaction(async (connection) => {
    await setUserActive(id, active, actor.id, connection);
    const ended = active ? 0 : await revokeAllSessionsForUser(id, "USER_DEACTIVATED", connection);
    await recordAudit(
      {
        actorUserId: actor.id,
        action: active ? "USER_REACTIVATED" : "USER_DEACTIVATED",
        entityType: "USER",
        entityId: id,
        sessionId: actor.sessionId,
        ipAddress: actor.ipAddress,
        metadata: active ? null : { sessionsEnded: ended },
      },
      connection,
    );
  });
  return { ok: true, value: undefined };
}

export async function unlock(id: number, actor: AdminActor): Promise<ServiceResult> {
  const existing = await getUserForAdmin(id);
  if (!existing) return { ok: false, message: "User not found." };
  const check = checkCanEdit(actor, toTarget(existing));
  if (!check.ok) return { ok: false, message: check.message };
  await withTransaction(async (connection) => {
    await unlockUser(id, actor.id, connection);
    await recordAudit(
      { actorUserId: actor.id, action: "USER_UNLOCKED", entityType: "USER", entityId: id, sessionId: actor.sessionId, ipAddress: actor.ipAddress, metadata: { wasLocked: existing.locked } },
      connection,
    );
  });
  return { ok: true, value: undefined };
}

export async function forceSignOut(id: number, actor: AdminActor): Promise<ServiceResult<number>> {
  const existing = await getUserForAdmin(id);
  if (!existing) return { ok: false, message: "User not found." };
  const check = checkCanEdit(actor, toTarget(existing));
  if (!check.ok) return { ok: false, message: check.message };
  const count = await withTransaction(async (connection) => {
    const ended = await revokeAllSessionsForUser(id, "FORCED_BY_ADMIN", connection);
    await recordAudit(
      { actorUserId: actor.id, action: "SESSIONS_REVOKED", entityType: "USER", entityId: id, sessionId: actor.sessionId, ipAddress: actor.ipAddress, metadata: { reason: "FORCED_BY_ADMIN", count: ended } },
      connection,
    );
    return ended;
  });
  return { ok: true, value: count };
}

// v1.51.1 (owner): module access for several people at once (Users & roles,
// ticked rows). Each person goes through the same rule as the user page
// (checkModuleChange: not yourself, another IT Admin only by the Super Admin)
// and gets an audit entry; people whose modules don't change are skipped.
export async function bulkChangeModules(ids: readonly number[], change: ModuleChange, chosen: readonly ModuleCode[], actor: AdminActor): Promise<{ changed: number; unchanged: number; refused: Map<string, number> }> {
  let changed = 0;
  let unchanged = 0;
  const refused = new Map<string, number>();
  const refuse = (message: string) => refused.set(message, (refused.get(message) ?? 0) + 1);
  for (const id of ids) {
    const existing = await getUserForAdmin(id);
    if (!existing) {
      refuse("User not found.");
      continue;
    }
    const check = checkModuleChange(actor, toTarget(existing));
    if (!check.ok) {
      refuse(check.message);
      continue;
    }
    const after = applyModuleChange(existing.modules, change, chosen);
    // D-308: never Projects without Tasks (adding Projects alone, or removing Tasks).
    const problem = existing.roles.includes("SUPER_ADMIN") ? null : modulesProblem(after);
    if (problem) {
      refuse(problem);
      continue;
    }
    if (sameModules(existing.modules, after)) {
      unchanged += 1;
      continue;
    }
    await withTransaction(async (connection) => {
      await setUserModules(id, after, actor.id, connection);
      await recordAudit(
        { actorUserId: actor.id, action: "USER_UPDATED", entityType: "USER", entityId: id, sessionId: actor.sessionId, ipAddress: actor.ipAddress, metadata: { source: "BULK_MODULES", change, modules: { before: existing.modules, after } } },
        connection,
      );
    });
    changed += 1;
  }
  return { changed, unchanged, refused };
}
