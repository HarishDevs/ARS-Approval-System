import { describe, expect, it } from "vitest";
import { userRecord } from "../helpers/user-fixtures";
import { checkSignInAllowed, maskWhatsAppNumber } from "@/server/auth/sign-in-rules";
import { areasForUser, evaluateAreaAccess } from "@/server/authorization/policy";
import { resolveSettingForDisplay } from "@/server/settings/resolve";
import type { SettingDefinition } from "@/server/settings/definitions";
import type { AuthenticatedUser, RoleCode } from "@/types/auth";
import { z } from "zod";

const authUser = (roles: RoleCode[], active = true): AuthenticatedUser => ({
  id: 1,
  loginId: "u",
  name: "U",
  email: "u@example.com",
  whatsappNumber: null,
  signInMethod: "GOOGLE",
  active,
  roles,
  modules: ["APPROVAL", "TASK", "INFORMATION"],
  chatModes: ["APPROVAL", "TASK", "INFORMATION"],
  salesforceScope: "NONE",
});

describe("sign-in rules", () => {
  it("allows an active user with the right method", () => {
    expect(checkSignInAllowed(userRecord(), "PASSWORD")).toEqual({ allowed: true });
  });

  it("denies inactive, wrong method, locked and disabled break-glass", () => {
    expect(checkSignInAllowed(userRecord({ active: false }), "PASSWORD")).toMatchObject({ reason: "INACTIVE" });
    expect(checkSignInAllowed(userRecord(), "GOOGLE")).toMatchObject({ reason: "WRONG_METHOD" });
    expect(checkSignInAllowed(userRecord({ lockedSecondsRemaining: 90 }), "PASSWORD")).toEqual({ allowed: false, reason: "LOCKED", retryAfterSeconds: 90 });
    expect(checkSignInAllowed(userRecord({ isBreakGlass: true }), "PASSWORD")).toMatchObject({ reason: "BREAK_GLASS_DISABLED" });
    expect(checkSignInAllowed(userRecord({ isBreakGlass: true, breakGlassSecondsRemaining: 600 }), "PASSWORD")).toEqual({ allowed: true });
  });

  it("masks WhatsApp numbers", () => {
    expect(maskWhatsAppNumber("+91 98765 43210")).toBe("91XXXXXXXX10");
    expect(maskWhatsAppNumber("123")).toBe("****");
  });
});

describe("area policy (D-034)", () => {
  it("users area for everyone; admin for IT; superadmin only for Super Admin", () => {
    expect(areasForUser(authUser(["USER"]))).toEqual(["users"]);
    expect(areasForUser(authUser(["USER", "IT_ADMIN"]))).toEqual(["users", "admin"]);
    expect(areasForUser(authUser(["USER", "IT_ADMIN", "SUPER_ADMIN"]))).toEqual(["users", "admin", "superadmin"]);
  });

  it("IT admin can't open the Super Admin area", () => {
    expect(evaluateAreaAccess(authUser(["USER", "IT_ADMIN"]), "superadmin")).toEqual({ allowed: false, reason: "MISSING_ROLE" });
  });

  it("no session or inactive is denied everywhere", () => {
    expect(evaluateAreaAccess(null, "users")).toEqual({ allowed: false, reason: "NO_SESSION" });
    expect(evaluateAreaAccess(authUser(["SUPER_ADMIN"], false), "users")).toEqual({ allowed: false, reason: "INACTIVE" });
  });
});

describe("settings display (D-016)", () => {
  const secret: SettingDefinition = { key: "whatsapp.api_key", group: "WHATSAPP", label: "API key", valueType: "STRING", encrypted: true, schema: z.string() };
  const plain: SettingDefinition = { key: "general.timezone", group: "GENERAL", label: "Timezone", valueType: "STRING", encrypted: false, schema: z.string(), defaultValue: "Asia/Kolkata" };

  it("never reveals an encrypted value", () => {
    const shown = resolveSettingForDisplay(secret, { key: secret.key, encrypted: true, value: "ciphertext", updatedAt: new Date() });
    expect(shown.status).toBe("CONFIGURED");
    expect(shown.value).toBeNull();
    expect(resolveSettingForDisplay(secret, null).status).toBe("NOT_CONFIGURED");
  });

  it("shows plain values or the default", () => {
    expect(resolveSettingForDisplay(plain, null)).toMatchObject({ status: "VALUE", value: "Asia/Kolkata" });
    expect(resolveSettingForDisplay(plain, { key: plain.key, encrypted: false, value: "UTC", updatedAt: new Date() }).value).toBe("UTC");
  });
});
