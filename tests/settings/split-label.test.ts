import { describe, expect, it } from "vitest";
import { SETTING_DEFINITIONS } from "@/server/settings/definitions";
import { splitLabel } from "@/features/superadmin/split-label";

describe("setting labels: name plus hover hint (D-179)", () => {
  it("splits a trailing bracket or a long 'name: explanation'", () => {
    expect(splitLabel("Emergency stop (On refuses every AI request at once; Off for normal use)")).toEqual({ name: "Emergency stop", hint: "On refuses every AI request at once; Off for normal use" });
    expect(splitLabel("Groq API key (groq.com, starts with gsk_; not xAI's Grok)")).toEqual({ name: "Groq API key", hint: "groq.com, starts with gsk_; not xAI's Grok" });
    expect(splitLabel("Objects and fields Pico Bot may read: * for every object (Id is added)").name).toBe("Objects and fields Pico Bot may read");
    expect(splitLabel("Claude (Anthropic) API key")).toEqual({ name: "Claude (Anthropic) API key", hint: null });
    expect(splitLabel("Active provider")).toEqual({ name: "Active provider", hint: null });
  });
  it("handles every real label quickly (a regex here once hung the server)", () => {
    const started = Date.now();
    for (const definition of SETTING_DEFINITIONS) expect(splitLabel(definition.label).name.length).toBeGreaterThan(0);
    expect(splitLabel("x (".repeat(5000) + "y")).toEqual({ name: "x (".repeat(5000) + "y", hint: null });
    expect(Date.now() - started).toBeLessThan(500);
  });
});
