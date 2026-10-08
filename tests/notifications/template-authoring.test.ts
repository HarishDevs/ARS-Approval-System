import { describe, expect, it, vi } from "vitest";
import { checkFooter, checkTemplateName, compileNamedBody, defaultDraft, outcomeOf, previewNamed, toNamedBody, versionedName } from "@/server/notifications/template-authoring";
import { createTemplatePayload, readProviderTemplates, sendTemplateMessage, CeoitboxError } from "@/server/integrations/ceoitbox/client";
import { WHATSAPP_TEMPLATES } from "@/server/notifications/templates";

// S7 / D-076: the WhatsApp template creator's rules and the CEOITBox calls,
// as described in the owner's CEOITBOX API Master Documentation.
const vars = WHATSAPP_TEMPLATES[0]!.variables; // requester_name, request_no, title, link

describe("named placeholders → Meta's numbered ones", () => {
  it("numbers placeholders in order of first use, reusing a repeated one", () => {
    const result = compileNamedBody("Hi, {{request_no}} from {{requester_name}} needs you. Ref {{request_no}} again, thanks.", vars);
    expect(result).toEqual({
      ok: true,
      value: {
        body: "Hi, {{1}} from {{2}} needs you. Ref {{1}} again, thanks.",
        variables: [vars[1], vars[0]],
        examples: [vars[1]!.sample, vars[0]!.sample],
      },
    });
  });

  it("refuses what Meta refuses", () => {
    const errors = (text: string) => (compileNamedBody(text, vars) as { ok: false; errors: string[] }).errors.join(" ");
    expect(errors("{{title}} is waiting.")).toContain("start with a placeholder");
    expect(errors("Waiting: {{title}}")).toContain("end with a placeholder");
    expect(errors("See {{title}}{{link}} now.")).toContain("side by side");
    expect(errors("Hello {{amount}} today.")).toContain("{{amount}} isn't available");
    expect(errors("Hello {{1}} today.")).toContain("named placeholders");
    expect(errors("a {{title}} b {{link}} c.")).toContain("mostly placeholders");
    expect(errors("Line\n\n\n\nmore {{title}} words here.")).toContain("one empty line");
    expect(errors(`Long ${"x".repeat(1100)} {{title}} end.`)).toContain("under 1,024");
    expect(compileNamedBody("   ", vars)).toEqual({ ok: false, errors: ["Write the message first."] });
  });

  it("round-trips the suggested wording, and every suggestion compiles", () => {
    for (const entry of WHATSAPP_TEMPLATES) {
      const named = defaultDraft(entry).body;
      const compiled = compileNamedBody(named, entry.variables);
      expect(compiled.ok, entry.code).toBe(true);
      if (compiled.ok) expect(compiled.value.body, entry.code).toBe(entry.body);
    }
    expect(toNamedBody("A {{2}} b {{1}} c.", vars)).toBe("A {{request_no}} b {{requester_name}} c.");
    expect(previewNamed("Hi {{requester_name}}.", vars)).toBe(`Hi ${vars[0]!.sample}.`);
  });

  it("names, footers, versions and Meta statuses", () => {
    expect(checkTemplateName("ars_approval_needed_v1")).toBeNull();
    expect(checkTemplateName("Approval Needed")).not.toBeNull();
    expect(checkFooter("ARS Steels")).toBeNull();
    expect(checkFooter("Hi {{1}}")).not.toBeNull();
    expect(checkFooter("x".repeat(61))).not.toBeNull();
    expect(versionedName("ars_approval_needed_v1", 1)).toBe("ars_approval_needed_v1");
    expect(versionedName("ars_approval_needed_v1", 2)).toBe("ars_approval_needed_v2");
    expect(versionedName("custom_name", 3)).toBe("custom_name_v3");
    expect(["APPROVED", "pending", "IN_APPEAL", "REJECTED", "PAUSED", "DISABLED"].map(outcomeOf)).toEqual(["APPROVED", "PENDING", "PENDING", "REJECTED", "PAUSED", "PAUSED"]);
  });
});

describe("CEOITBox calls (Master Documentation)", () => {
  it("builds the CreateTemplate body with BODY example values and an optional FOOTER", () => {
    expect(createTemplatePayload({ name: "n", language: "en", category: "UTILITY", body: "Hi {{1}}.", examples: ["Ravi"], footer: "ARS" })).toEqual({
      name: "n",
      language: "en",
      category: "UTILITY",
      components: [
        { type: "BODY", text: "Hi {{1}}.", example: { body_text: [["Ravi"]] } },
        { type: "FOOTER", text: "ARS" },
      ],
    });
    expect(createTemplatePayload({ name: "n", language: "en", category: "UTILITY", body: "Hi.", examples: [] }).components).toEqual([{ type: "BODY", text: "Hi." }]);
  });

  it("reads Meta's template status from getTemplates results", () => {
    expect(
      readProviderTemplates({
        results: [
          { id: "1", template: { name: "a", language: "en", status: "APPROVED", category: "UTILITY" } },
          { id: "2", template: { name: "b", language: "en", status: "REJECTED", rejected_reason: "INVALID_FORMAT" } },
          { id: "3", template: {} },
        ],
        total: 3,
      }),
    ).toEqual([
      { name: "a", language: "en", status: "APPROVED", category: "UTILITY", rejectedReason: null },
      { name: "b", language: "en", status: "REJECTED", category: null, rejectedReason: "INVALID_FORMAT" },
    ]);
  });

  const config = { baseUrl: "https://official.ceoitbox.com/", phoneId: null, apiKey: "test-key", timeoutMs: 1000, rateLimitPerMinute: 60, retryLimit: 3 };
  const reply = (status: number, body: unknown) => vi.fn(async () => new Response(JSON.stringify(body), { status }));

  it("sends with the key in the header and our userMessageId; a 200 with an error object is a failure", async () => {
    const ok = reply(200, { id: "1", waMessageId: "wamid.1" });
    await sendTemplateMessage(config, { to: "+91 98765 43210", templateName: "t", language: "en", templateVariables: ["a"], userMessageId: "ars-n1" }, { fetch: ok, tryConsumeRateLimit: async () => true });
    const [url, init] = ok.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://official.ceoitbox.com/api/v1/whatsapp/sendMessage");
    expect((init.headers as Record<string, string>)["x-api-key"]).toBe("test-key");
    expect(JSON.parse(String(init.body))).toEqual({ templateName: "t", language: "en", to: "919876543210", templateVariables: ["a"], userMessageId: "ars-n1" });

    const blocked = reply(200, { error: { message: "Insufficient wallet balance" } });
    await expect(sendTemplateMessage(config, { to: "91", templateName: "t", language: "en", templateVariables: [] }, { fetch: blocked, tryConsumeRateLimit: async () => true })).rejects.toMatchObject({
      code: "CEOITBOX_BLOCKED",
    });
  });

  it("maps 401 and 400 to errors that are not retried", async () => {
    const send = (status: number) => sendTemplateMessage(config, { to: "91", templateName: "t", language: "en", templateVariables: [] }, { fetch: reply(status, { title: "Bad", detail: "Meta send message error" }), tryConsumeRateLimit: async () => true });
    await expect(send(401)).rejects.toMatchObject({ code: "CEOITBOX_UNAUTHORIZED" });
    await expect(send(400)).rejects.toMatchObject({ code: "CEOITBOX_REJECTED", message: expect.stringContaining("Meta send message error") });
    await expect(send(503)).rejects.toBeInstanceOf(CeoitboxError);
    await expect(send(503)).rejects.toMatchObject({ code: "CEOITBOX_REQUEST_FAILED" });
  });
});
