import { describe, expect, it } from "vitest";
import { SETTING_DEFINITIONS } from "@/server/settings/definitions";
import { planSettingChanges } from "@/server/settings/plan-changes";

const email = SETTING_DEFINITIONS.filter((definition) => definition.group === "EMAIL");
const auth = SETTING_DEFINITIONS.filter((definition) => definition.group === "AUTHENTICATION");

describe("settings save plan (F-52)", () => {
  it("a blank secret keeps the stored key; a new one replaces it", () => {
    const current = new Map([["email.resend_api_key", { value: "ciphertext" }]]);
    expect(planSettingChanges(email, { "email.resend_api_key": "" }, new Set(), current).changes).toEqual([]);
    const plan = planSettingChanges(email, { "email.resend_api_key": " re_new_key " }, new Set(), current);
    expect(plan.changes).toHaveLength(1);
    expect(plan.changes[0]).toMatchObject({ kind: "SET", value: "re_new_key", before: null });
  });

  it("remove clears only a configured secret", () => {
    expect(planSettingChanges(email, {}, new Set(["email.resend_api_key"]), new Map()).changes).toEqual([]);
    const plan = planSettingChanges(email, { "email.resend_api_key": "ignored" }, new Set(["email.resend_api_key"]), new Map([["email.resend_api_key", { value: "x" }]]));
    expect(plan.changes.map((change) => change.kind)).toEqual(["CLEAR"]);
  });

  it("plain values change only when they differ from the value in force (default included)", () => {
    const unchanged = planSettingChanges(email, { "email.from_address": "no_reply@approval.arssteels.net", "email.from_name": "ARS CMS" }, new Set(), new Map());
    expect(unchanged.changes).toEqual([]);
    const changed = planSettingChanges(email, { "email.from_name": "ARS Steels Approvals" }, new Set(), new Map());
    expect(changed.changes[0]).toMatchObject({ kind: "SET", value: "ARS Steels Approvals", before: "ARS CMS" });
  });

  it("rejects values outside the safe limits, so security can't be weakened by accident", () => {
    const plan = planSettingChanges(auth, { "auth.lockout_threshold": "50", "auth.otp_length": "3", "auth.lockout_minutes": "30" }, new Set(), new Map());
    expect(Object.keys(plan.errors).sort()).toEqual(["auth.lockout_threshold", "auth.otp_length"]);
    expect(plan.changes.map((change) => change.definition.key)).toEqual(["auth.lockout_minutes"]);
  });

  it("normalises numbers before comparing", () => {
    const plan = planSettingChanges(auth, { "auth.lockout_minutes": "015" }, new Set(), new Map());
    expect(plan.changes).toEqual([]);
  });

  it("an optional value left empty stays unset, so unused providers don't block a save", () => {
    const ai = SETTING_DEFINITIONS.filter((definition) => definition.group === "AI");
    const plan = planSettingChanges(ai, { "ai.openai.model": "", "ai.grok.model": " ", "ai.active_provider": "DEEPSEEK" }, new Set(), new Map());
    expect(plan.errors).toEqual({});
    expect(plan.changes.map((change) => change.definition.key)).toEqual(["ai.active_provider"]);
    expect(planSettingChanges(ai, { "ai.openai.model": "x" }, new Set(), new Map()).errors["ai.openai.model"]).toBe("Use at least 2 characters.");
  });

  it("rejects a bad email address", () => {
    expect(planSettingChanges(email, { "email.from_address": "not-an-email" }, new Set(), new Map()).errors).toHaveProperty("email.from_address");
  });
});

describe("settings error wording", () => {
  it("explains limits in plain words", () => {
    const plan = planSettingChanges(auth, { "auth.lockout_minutes": "2", "auth.lockout_threshold": "99" }, new Set(), new Map());
    expect(plan.errors["auth.lockout_minutes"]).toBe("Use 5 or more.");
    expect(plan.errors["auth.lockout_threshold"]).toBe("Use 10 or less.");
  });
});
