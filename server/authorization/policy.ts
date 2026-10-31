import type { AppArea, AuthenticatedUser, RoleCode } from "@/types/auth";

// Pure access rules for the three areas (D-034, D-039). Hiding a link is not
// security; this is the check every page, route handler and action runs on
// the server.
const AREA_ROLES: Record<AppArea, readonly RoleCode[]> = {
  users: ["USER", "IT_ADMIN", "SUPER_ADMIN"],
  admin: ["IT_ADMIN", "SUPER_ADMIN"],
  superadmin: ["SUPER_ADMIN"],
};

export type AreaDenialReason = "NO_SESSION" | "INACTIVE" | "MISSING_ROLE";

export type AreaAccessResult = { allowed: true } | { allowed: false; reason: AreaDenialReason };

export function evaluateAreaAccess(user: AuthenticatedUser | null, area: AppArea): AreaAccessResult {
  if (!user) return { allowed: false, reason: "NO_SESSION" };
  if (!user.active) return { allowed: false, reason: "INACTIVE" };
  if (!AREA_ROLES[area].some((role) => user.roles.includes(role))) return { allowed: false, reason: "MISSING_ROLE" };
  return { allowed: true };
}

export function areasForUser(user: AuthenticatedUser): AppArea[] {
  return (Object.keys(AREA_ROLES) as AppArea[]).filter((area) => evaluateAreaAccess(user, area).allowed);
}
