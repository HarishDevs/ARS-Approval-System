import { describe, expect, it } from "vitest";
import { calendarKindAllowed, DEFAULT_MODULES, hasModule, MODULES, normaliseModules, parseModuleSet, sameModules } from "@/server/modules/modules";
import { checkModuleChange } from "@/server/admin/user-rules";
import { parseUserForm } from "@/server/admin/user-input";
import { PAGES } from "@/server/authorization/pages";

// D-168 (AI module branch): per-person module access.
describe("modules", () => {
  it("reads the database SET value in a fixed order and drops unknown parts", () => {
    expect(parseModuleSet("TASK,APPROVAL")).toEqual(["APPROVAL", "TASK"]);
    expect(parseModuleSet("AI,NOPE")).toEqual(["AI"]);
    expect(parseModuleSet("")).toEqual([]);
    expect(parseModuleSet(null)).toEqual([]);
  });
  it("refuses anything that isn't a module instead of ignoring it", () => {
    expect(normaliseModules(["AI", "APPROVAL", "AI"])).toEqual({ ok: true, value: ["APPROVAL", "AI"] });
    expect(normaliseModules(["APPROVAL", "ADMIN"])).toEqual({ ok: false, invalid: ["ADMIN"] });
    expect(normaliseModules([])).toEqual({ ok: true, value: [] });
  });
  it("defaults to Approval, Task, Information and (v1.51.0) Meeting; never AI", () => {
    expect(DEFAULT_MODULES).toEqual(["APPROVAL", "TASK", "INFORMATION", "MEETING"]);
    expect(DEFAULT_MODULES).not.toContain("AI");
  });
  it("each module is separate; only the Super Admin is exempt", () => {
    const aiOnly = { roles: ["USER"], modules: ["AI" as const] };
    expect(hasModule(aiOnly, "AI")).toBe(true);
    for (const other of ["APPROVAL", "TASK", "INFORMATION"] as const) expect(hasModule(aiOnly, other)).toBe(false);
    expect(hasModule({ roles: ["USER", "IT_ADMIN"], modules: [] }, "APPROVAL")).toBe(false); // admin roles don't imply modules
    for (const code of MODULES) expect(hasModule({ roles: ["USER", "SUPER_ADMIN"], modules: [] }, code)).toBe(true);
    expect(sameModules(["AI", "TASK"], ["TASK", "AI"])).toBe(true);
    expect(sameModules(["AI"], ["AI", "TASK"])).toBe(false);
  });
  it("the calendar shows only the kinds the person's modules cover", () => {
    const taskOnly = { roles: ["USER"], modules: ["TASK" as const] };
    expect(calendarKindAllowed(taskOnly, "task")).toBe(true);
    expect(calendarKindAllowed(taskOnly, "approval")).toBe(false);
    expect(calendarKindAllowed(taskOnly, "needed")).toBe(false);
    expect(calendarKindAllowed(taskOnly, "info")).toBe(false);
    expect(calendarKindAllowed(taskOnly, "personal")).toBe(true);
  });
});

describe("who may change module access", () => {
  const itAdmin = { id: 2, roles: ["USER", "IT_ADMIN"] as const };
  const superAdmin = { id: 1, roles: ["USER", "IT_ADMIN", "SUPER_ADMIN"] as const };
  const staff = { id: 5, roles: ["USER"] as const, active: true, isBreakGlass: false };
  const otherAdmin = { id: 3, roles: ["USER", "IT_ADMIN"] as const, active: true, isBreakGlass: false };
  it("an IT Admin changes a staff member's; nobody changes their own", () => {
    expect(checkModuleChange({ ...itAdmin, roles: [...itAdmin.roles] }, { ...staff, roles: [...staff.roles] })).toEqual({ ok: true });
    expect(checkModuleChange({ ...itAdmin, roles: [...itAdmin.roles] }, { ...otherAdmin, id: 2, roles: [...otherAdmin.roles] }).ok).toBe(false);
    expect(checkModuleChange({ ...superAdmin, roles: [...superAdmin.roles] }, { id: 1, roles: [...superAdmin.roles], active: true, isBreakGlass: false }).ok).toBe(false);
  });
  it("another IT Admin's: the Super Admin only; a plain user can't manage anyone", () => {
    expect(checkModuleChange({ ...itAdmin, roles: [...itAdmin.roles] }, { ...otherAdmin, roles: [...otherAdmin.roles] })).toMatchObject({ ok: false, message: expect.stringContaining("Super Admin") });
    expect(checkModuleChange({ ...superAdmin, roles: [...superAdmin.roles] }, { ...otherAdmin, roles: [...otherAdmin.roles] })).toEqual({ ok: true });
    expect(checkModuleChange({ id: 9, roles: ["USER"] }, { ...staff, roles: [...staff.roles] }).ok).toBe(false);
  });
});

describe("the user form", () => {
  const fields = { loginId: "EMP9", name: "New Person", email: "new@example.com", signInMethod: "GOOGLE" };
  it("module access is left alone unless the form sent it", () => {
    const untouched = parseUserForm(fields, ["USER"]);
    expect(untouched.ok && untouched.value.modules).toBeNull();
    const chosen = parseUserForm(fields, ["USER"], ["AI", "TASK"]);
    expect(chosen.ok && chosen.value.modules).toEqual(["TASK", "AI"]);
    const none = parseUserForm(fields, ["USER"], []);
    expect(none.ok && none.value.modules).toEqual([]);
  });
  it("an unknown module is an error on the form, not silently dropped", () => {
    expect(parseUserForm(fields, ["USER"], ["SUPER_ADMIN"])).toEqual({ ok: false, fieldErrors: { modules: "Choose modules from the list." } });
  });
});

describe("every page of the user space has a module decision", () => {
  // Shared by every module on purpose; anything else must name its module.
  // D-210: users.menu (Classic view menus) lists only pages the person may already open.
  const SHARED = ["users.overview", "users.menu", "users.calendar", "users.analytics", "users.help", "users.profile", "users.notifications", "users.delegation"];
  it("approval, task and information pages name their module; nothing is left undecided", () => {
    for (const page of PAGES.filter((item) => item.area === "users")) {
      if (SHARED.includes(page.key)) expect(page.module, page.key).toBeUndefined();
      else expect(page.module, `${page.key} needs a module (or a reason to be shared)`).toBeDefined();
    }
    expect(PAGES.find((page) => page.key === "users.task")?.module).toBe("TASK");
    expect(PAGES.find((page) => page.key === "users.request")?.module).toBe("APPROVAL");
    expect(PAGES.find((page) => page.key === "users.information_item")?.module).toBe("INFORMATION");
    expect(PAGES.filter((page) => page.area === "admin").every((page) => page.module === undefined)).toBe(true); // admin is by role
  });
});

// v1.51.1 (owner): modules for several people at once.
describe("applyModuleChange", () => {
  it("adds, removes or sets, always in the fixed module order", async () => {
    const { applyModuleChange } = await import("@/server/modules/modules");
    expect(applyModuleChange(["APPROVAL"], "ADD", ["MEETING", "TASK"])).toEqual(["APPROVAL", "TASK", "MEETING"]);
    expect(applyModuleChange(["APPROVAL", "TASK", "AI"], "REMOVE", ["AI", "MEETING"])).toEqual(["APPROVAL", "TASK"]);
    expect(applyModuleChange(["APPROVAL", "TASK"], "SET", ["INFORMATION"])).toEqual(["INFORMATION"]);
    expect(applyModuleChange(["APPROVAL"], "SET", [])).toEqual([]);
  });
});
