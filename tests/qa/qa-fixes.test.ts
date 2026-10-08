import { describe, expect, it, vi } from "vitest";
import { checkFormDefinition, parseFormSubmission, type FormField } from "@/server/forms/fields";
import { builderSpecSchema, checkDoaAmount, doaBandIndex } from "@/server/workflows/builder";
import { sendEmail } from "@/server/integrations/resend/client";

// Regression tests for the QA defects fixed in S8-06 (docs/qa §39).
const AMOUNT: FormField = { key: "amount", label: "Amount (₹)", type: "NUMBER", required: true, min: 0 };
const doaSpec = builderSpecSchema.parse({
  stages: [
    {
      kind: "DOA",
      id: "doa",
      label: "DoA",
      field: "amount",
      limits: [100000],
      levels: [
        { step: { id: "a", label: "A", approvers: { kind: "REQUESTER_MANAGER" }, rule: "ALL" }, bands: [true, true] },
        { step: { id: "b", label: "B", approvers: { kind: "REQUESTER_MANAGER" }, rule: "ALL" }, bands: [false, true] },
      ],
    },
  ],
});

describe("D-QA-04: amounts can't be negative", () => {
  it("a number field's minimum is enforced", () => {
    expect(parseFormSubmission([AMOUNT], { amount: "-50,000" }, new Set())).toEqual({ ok: false, errors: { amount: "Enter 0 or more." } });
    expect(parseFormSubmission([AMOUNT], { amount: "0" }, new Set())).toEqual({ ok: true, data: { amount: 0 } });
    expect(parseFormSubmission([{ ...AMOUNT, min: 1000 }], { amount: "999" }, new Set())).toMatchObject({ ok: false, errors: { amount: "Enter 1,000 or more." } });
  });

  it("a minimum only makes sense on a number field", () => {
    expect(checkFormDefinition([{ key: "t", label: "T", type: "TEXT", required: false, min: 0 }])).toEqual(['"T" has a minimum but isn\'t a number field.']);
  });

  it("the DoA amount is refused below ₹0 even when the form has no minimum", () => {
    expect(doaBandIndex([100000], -5_000_000)).toBe(0); // why it matters: the lowest band
    expect(checkDoaAmount(doaSpec, { amount: -1 })).toEqual({ amount: "Enter an amount of ₹0 or more." });
    expect(checkDoaAmount(doaSpec, { amount: 0 })).toEqual({});
    expect(checkDoaAmount(builderSpecSchema.parse({ stages: [{ kind: "STEP", step: { id: "x", label: "X", approvers: { kind: "REQUESTER_MANAGER" }, rule: "ALL" } }] }), { amount: -1 })).toEqual({});
  });
});

describe("D-QA-15: email subjects stay on one line", () => {
  it("strips line breaks before sending", async () => {
    const fetcher = vi.fn(async () => new Response(JSON.stringify({ id: "e1" }), { status: 200 }));
    await sendEmail({ apiKey: "test", fromAddress: "a@b.c", fromName: "ARS" }, { to: "x@y.z", subject: "Approval needed: A\r\nBcc: evil@x.com", text: "t" }, { fetch: fetcher });
    const body = JSON.parse(String((fetcher.mock.calls[0] as unknown as [string, RequestInit])[1].body));
    expect(body.subject).toBe("Approval needed: A Bcc: evil@x.com");
  });
});
