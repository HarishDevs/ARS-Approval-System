import type { RoleCode } from "@/types/auth";

// Pure rules for managing users (D-047, F-06). Unit-tested; the services
// call these before touching the database.
//   - IT Admin and Super Admin manage users.
//   - Only a Super Admin grants or removes SUPER_ADMIN, or changes a Super
//     Admin or the break-glass account.
//   - Nobody deactivates themselves or removes their own admin role.
//   - The last active Super Admin can never be deactivated or demoted.
export interface Actor {
  id: number;
  roles: readonly RoleCode[];
}

export interface TargetUser {
  id: number;
  roles: readonly RoleCode[];
  active: boolean;
  isBreakGlass: boolean;
}

export type RuleResult = { ok: true } | { ok: false; message: string };

const OK: RuleResult = { ok: true };
const deny = (message: string): RuleResult => ({ ok: false, message });

export const ASSIGNABLE_ROLES: readonly RoleCode[] = ["USER", "EXPORTER", "IT_ADMIN", "SUPER_ADMIN"];

const isSuperAdmin = (subject: { roles: readonly RoleCode[] }) => subject.roles.includes("SUPER_ADMIN");
const isAdmin = (subject: { roles: readonly RoleCode[] }) => subject.roles.includes("IT_ADMIN") || isSuperAdmin(subject);

export function canManageUsers(actor: Actor): boolean {
  return isAdmin(actor);
}

// Can the actor change this account at all?
export function checkCanEdit(actor: Actor, target: TargetUser): RuleResult {
  if (!canManageUsers(actor)) return deny("You can't manage users.");
  if ((isSuperAdmin(target) || target.isBreakGlass) && !isSuperAdmin(actor)) {
    return deny("Only the Super Admin can change this account.");
  }
  return OK;
}

// Audit P-04: the email, WhatsApp number and sign-in method are how an
// account is reached (and how a set-password link arrives), so another IT
// Admin's are changed by the Super Admin only; otherwise one IT Admin could
// take over another's account. Your own you may change.
export function checkContactChange(actor: Actor, target: TargetUser, changes: { email?: boolean; whatsappNumber?: boolean; signInMethod?: boolean; setPasswordLink?: boolean }): RuleResult {
  const touchesAccess = Boolean(changes.email || changes.whatsappNumber || changes.signInMethod || changes.setPasswordLink);
  if (!touchesAccess || target.id === actor.id || isSuperAdmin(actor) || !isAdmin(target)) return OK;
  return deny("Only the Super Admin can change another IT Admin's email, WhatsApp number or sign-in method, or send them a set-password link.");
}

// USER is always present; it is added, never removed.
export function normaliseRoles(roles: readonly string[]): RoleCode[] {
  const set = new Set<RoleCode>(["USER"]);
  for (const role of roles) if ((ASSIGNABLE_ROLES as readonly string[]).includes(role)) set.add(role as RoleCode);
  return ASSIGNABLE_ROLES.filter((role) => set.has(role));
}

export function checkRoleChange(
  actor: Actor,
  target: TargetUser | null, // null when creating a user
  nextRoles: readonly RoleCode[],
  activeSuperAdminCount: number,
): RuleResult {
  const before = target?.roles ?? ["USER"];
  const grantsSuper = !before.includes("SUPER_ADMIN") && nextRoles.includes("SUPER_ADMIN");
  const removesSuper = before.includes("SUPER_ADMIN") && !nextRoles.includes("SUPER_ADMIN");
  if ((grantsSuper || removesSuper) && !isSuperAdmin(actor)) return deny("Only the Super Admin can grant or remove the Super Admin role.");

  if (target && target.id === actor.id) {
    if (removesSuper) return deny("You can't remove your own Super Admin role.");
    if (isAdmin(target) && !isAdmin({ roles: nextRoles })) return deny("You can't remove your own admin role.");
  }
  if (removesSuper && target?.active && activeSuperAdminCount <= 1) return deny("This is the last active Super Admin. Add another Super Admin first.");
  return OK;
}

export function checkDeactivate(actor: Actor, target: TargetUser, activeSuperAdminCount: number): RuleResult {
  const edit = checkCanEdit(actor, target);
  if (!edit.ok) return edit;
  if (target.id === actor.id) return deny("You can't deactivate your own account.");
  if (isSuperAdmin(target) && target.active && activeSuperAdminCount <= 1) return deny("This is the last active Super Admin. Add another Super Admin first.");
  return OK;
}

// Reporting line must not loop back to the user (A reports to B reports to A).
export function checkManager(userId: number | null, managerId: number | null, managerOf: (id: number) => number | null): RuleResult {
  if (managerId === null) return OK;
  if (userId !== null && managerId === userId) return deny("A person can't report to themselves.");
  if (userId === null) return OK;
  const seen = new Set<number>();
  let current: number | null = managerId;
  while (current !== null) {
    if (current === userId) return deny("This would make the reporting line loop back to this person.");
    if (seen.has(current)) break;
    seen.add(current);
    current = managerOf(current);
  }
  return OK;
}

// Digits only with country code. A 10-digit Indian mobile number gets 91.
export function normaliseWhatsAppNumber(raw: string): string | null {
  const digits = raw.replace(/\D/g, "");
  if (digits === "") return null;
  if (digits.length === 10 && /^[6-9]/.test(digits)) return `91${digits}`;
  return digits;
}

export function isValidWhatsAppNumber(digits: string): boolean {
  return /^[1-9]\d{9,14}$/.test(digits);
}
