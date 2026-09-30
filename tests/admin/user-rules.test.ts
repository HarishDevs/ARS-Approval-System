import { describe, expect, it } from "vitest";
import {
  checkCanEdit,
  checkDeactivate,
  checkManager,
  checkRoleChange,
  isValidWhatsAppNumber,
  normaliseRoles,
  normaliseWhatsAppNumber,
  type Actor,
  type TargetUser,
} from "@/server/admin/user-rules";

const superAdmin: Actor = { id: 1, roles: ["USER", "IT_ADMIN", "SUPER_ADMIN"] };
const itAdmin: Actor = { id: 2, roles: ["USER", "IT_ADMIN"] };
const staff: Actor = { id: 3, roles: ["USER"] };
const target = (overrides: Partial<TargetUser> = {}): TargetUser => ({ id: 10, roles: ["USER"], active: true, isBreakGlass: false, ...overrides });

describe("who can change whom (D-047)", () => {
  it("IT Admins manage ordinary users; staff can't", () => {
    expect(checkCanEdit(itAdmin, target()).ok).toBe(true);
    expect(checkCanEdit(staff, target()).ok).toBe(false);
  });

  it("only the Super Admin changes a Super Admin or the break-glass account", () => {
    expect(checkCanEdit(itAdmin, target({ roles: ["USER", "SUPER_ADMIN"] })).ok).toBe(false);
    expect(checkCanEdit(itAdmin, target({ isBreakGlass: true })).ok).toBe(false);
    expect(checkCanEdit(superAdmin, target({ isBreakGlass: true })).ok).toBe(true);
  });
});

describe("role changes", () => {
  it("USER is always kept and unknown roles are dropped", () => {
    expect(normaliseRoles(["IT_ADMIN", "HACKER"])).toEqual(["USER", "IT_ADMIN"]);
    expect(normaliseRoles([])).toEqual(["USER"]);
  });

  it("an IT Admin can grant IT_ADMIN but not SUPER_ADMIN", () => {
    expect(checkRoleChange(itAdmin, target(), ["USER", "IT_ADMIN"], 1).ok).toBe(true);
    expect(checkRoleChange(itAdmin, target(), ["USER", "SUPER_ADMIN"], 1).ok).toBe(false);
    expect(checkRoleChange(itAdmin, null, ["USER", "SUPER_ADMIN"], 1).ok).toBe(false);
    expect(checkRoleChange(superAdmin, null, ["USER", "SUPER_ADMIN"], 1).ok).toBe(true);
  });

  it("nobody removes their own admin role", () => {
    expect(checkRoleChange(itAdmin, target({ id: 2, roles: ["USER", "IT_ADMIN"] }), ["USER"], 1).ok).toBe(false);
    expect(checkRoleChange(superAdmin, target({ id: 1, roles: superAdmin.roles }), ["USER", "IT_ADMIN"], 2).ok).toBe(false);
  });

  it("the last active Super Admin can't be demoted", () => {
    const other = target({ id: 20, roles: ["USER", "SUPER_ADMIN"] });
    expect(checkRoleChange(superAdmin, other, ["USER"], 1).ok).toBe(false);
    expect(checkRoleChange(superAdmin, other, ["USER"], 2).ok).toBe(true);
  });
});

describe("deactivation", () => {
  it("nobody deactivates themselves", () => {
    expect(checkDeactivate(itAdmin, target({ id: 2, roles: itAdmin.roles }), 1).ok).toBe(false);
  });

  it("the last active Super Admin is protected", () => {
    expect(checkDeactivate(superAdmin, target({ id: 20, roles: ["USER", "SUPER_ADMIN"] }), 1).ok).toBe(false);
    expect(checkDeactivate(superAdmin, target({ id: 20, roles: ["USER", "SUPER_ADMIN"] }), 2).ok).toBe(true);
  });

  it("an IT Admin can deactivate staff", () => {
    expect(checkDeactivate(itAdmin, target(), 1).ok).toBe(true);
  });
});

describe("reporting line", () => {
  const managers: Record<number, number> = { 10: 11, 11: 12 };
  const managerOf = (id: number) => managers[id] ?? null;

  it("rejects self-reporting and loops", () => {
    expect(checkManager(10, 10, managerOf).ok).toBe(false);
    expect(checkManager(12, 10, managerOf).ok).toBe(false);
    expect(checkManager(10, 12, managerOf).ok).toBe(true);
    expect(checkManager(null, 12, managerOf).ok).toBe(true);
  });
});

describe("WhatsApp numbers", () => {
  it("adds 91 to a 10-digit Indian mobile and keeps full numbers", () => {
    expect(normaliseWhatsAppNumber("98765 43210")).toBe("919876543210");
    expect(normaliseWhatsAppNumber("+91 98765-43210")).toBe("919876543210");
    expect(normaliseWhatsAppNumber("+971 50 123 4567")).toBe("971501234567");
    expect(normaliseWhatsAppNumber("")).toBeNull();
    expect(isValidWhatsAppNumber("919876543210")).toBe(true);
    expect(isValidWhatsAppNumber("12345")).toBe(false);
  });
});
