import { describe, expect, it } from "vitest";
import { checkFormDefinition, displayValue, formSchema, parseFormSubmission, type FormField } from "@/server/forms/fields";
import { messagesForEvents } from "@/server/approvals/messages";

// v1.6.1 attachment fields and collaborator updates (pure).
const form: FormField[] = [
  { key: "kind", label: "Kind", type: "CHOICE", required: true, options: ["Capex", "Opex"] },
  { key: "quotes", label: "Quotes", type: "ATTACHMENT", required: true, maxFiles: 3 },
  { key: "drawings", label: "Drawings", type: "ATTACHMENT", required: false, requiredIf: { field: "kind", operator: "EQ", value: "Capex" } },
];
const parse = (raw: Record<string, string>) => parseFormSubmission(form, raw, new Set());

describe("attachment field", () => {
  it("is a valid field type with a file limit of 1–5", () => {
    expect(formSchema.safeParse(form).success).toBe(true);
    expect(formSchema.safeParse([{ key: "x", label: "X", type: "ATTACHMENT", required: false, maxFiles: 6 }]).success).toBe(false);
    expect(checkFormDefinition(form)).toEqual([]);
  });

  it("the builder refuses a file limit on another type, a default, and value rules on it", () => {
    expect(checkFormDefinition([{ key: "t", label: "T", type: "TEXT", required: false, maxFiles: 2 }])[0]).toMatch(/file limit/);
    expect(checkFormDefinition([{ key: "a", label: "A", type: "ATTACHMENT", required: false, defaultValue: "1" }])[0]).toMatch(/default value/);
    const rule: FormField[] = [
      { key: "a", label: "A", type: "ATTACHMENT", required: false },
      { key: "b", label: "B", type: "TEXT", required: false, showIf: { field: "a", operator: "EQ", value: 2 } },
    ];
    expect(checkFormDefinition(rule).join(" ")).toMatch(/only check whether files were added/);
    expect(checkFormDefinition([rule[0]!, { ...rule[1]!, showIf: { field: "a", operator: "IS_NOT_EMPTY" } }])).toEqual([]);
  });

  it("required means at least one file; the count is the value; the limit applies", () => {
    expect(parse({ kind: "Opex", quotes: "0" })).toMatchObject({ ok: false, errors: { quotes: "Attach at least one file to Quotes." } });
    expect(parse({ kind: "Opex", quotes: "2" })).toMatchObject({ ok: true, data: { quotes: 2 } });
    expect(parse({ kind: "Opex", quotes: "4" })).toMatchObject({ ok: false, errors: { quotes: "Add at most 3 files here." } });
    expect(parse({ kind: "Opex", quotes: "abc" })).toMatchObject({ ok: false, errors: { quotes: expect.stringMatching(/couldn't be read/) } });
  });

  it("required-when works on attachment fields", () => {
    expect(parse({ kind: "Capex", quotes: "1", drawings: "0" })).toMatchObject({ ok: false, errors: { drawings: "Attach at least one file to Drawings." } });
    expect(parse({ kind: "Capex", quotes: "1", drawings: "1" }).ok).toBe(true);
  });

  it("shows as a file count", () => {
    expect(displayValue(form[1]!, 2, new Map())).toBe("2 files");
    expect(displayValue(form[1]!, 1, new Map())).toBe("1 file");
  });
});

describe("collaborator updates", () => {
  const request = { id: 7, requestNo: "PUR-2026-000007", title: "Motor", requesterId: 1, requesterName: "Ravi" };
  it("collaborators get an FYI when the request is approved, rejected, sent back or withdrawn; never the requester twice", () => {
    const messages = messagesForEvents(
      [{ type: "INSTANCE_APPROVED" }, { type: "INSTANCE_REJECTED", nodeId: "a", actorId: 5, comment: "No budget" }],
      request,
      { baseUrl: "https://example.test", adminIds: [], collaboratorIds: [1, 8, 9] },
    );
    const updates = messages.filter((message) => message.eventType === "COLLABORATOR_UPDATE");
    expect(updates.map((message) => message.userId).sort()).toEqual([8, 8, 9, 9]);
    expect(updates[0]!.message).toMatch(/was fully approved/);
    expect(updates.some((message) => /rejected: No budget/.test(message.message))).toBe(true);
  });

  it("no update for steps that don't change the outcome", () => {
    const messages = messagesForEvents([{ type: "TASK_CREATED", taskId: "t1", nodeId: "a", approverId: 5 }], request, { baseUrl: "https://example.test", adminIds: [], collaboratorIds: [8] });
    expect(messages.some((message) => message.eventType === "COLLABORATOR_UPDATE")).toBe(false);
  });
});
