import { describe, expect, it } from "vitest";
import { canTryAs } from "@/server/auth/try-as";

// D-185: who may try the app as whom.
const person = (id: number, roles: string[], extra: Partial<{ active: boolean; isBreakGlass: boolean }> = {}) => ({ id, roles, active: true, isBreakGlass: false, ...extra });

describe("Try as rules (D-185)", () => {
  const superAdmin = person(1, ["USER", "IT_ADMIN", "SUPER_ADMIN"]);
  const itAdmin = person(2, ["USER", "IT_ADMIN"]);
  const staff = person(3, ["USER"]);
  it("the IT team may try staff; plain users may not try anyone", () => {
    expect(canTryAs(superAdmin, staff).ok).toBe(true);
    expect(canTryAs(itAdmin, staff).ok).toBe(true);
    expect(canTryAs(staff, person(4, ["USER"])).ok).toBe(false);
  });
  it("another IT Admin or a Super Admin: the Super Admin only", () => {
    expect(canTryAs(itAdmin, person(5, ["USER", "IT_ADMIN"])).ok).toBe(false);
    expect(canTryAs(itAdmin, superAdmin).ok).toBe(false);
    expect(canTryAs(superAdmin, itAdmin).ok).toBe(true);
  });
  it("never yourself, an inactive person or the break-glass account", () => {
    expect(canTryAs(superAdmin, superAdmin).ok).toBe(false);
    expect(canTryAs(superAdmin, person(6, ["USER"], { active: false })).ok).toBe(false);
    expect(canTryAs(superAdmin, person(7, ["USER"], { isBreakGlass: true })).ok).toBe(false);
  });
});
