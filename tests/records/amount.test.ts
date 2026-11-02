import { describe, expect, it } from "vitest";
import { amountText, HIDDEN_AMOUNT, requestAmount } from "@/server/records/amount";
import { requestColumns } from "@/server/records/columns";

// PB-34 (owner, 2 Nov 2026): the Amount column in Admin → Records.
const form = [
  { key: "item", label: "Item", type: "TEXT", required: true },
  { key: "amount", label: "Amount", type: "CURRENCY", required: true },
  { key: "secret_cost", label: "Cost", type: "CURRENCY", required: false, confidential: true },
];

describe("Records amount (PB-34)", () => {
  it("uses the first currency field, or the budget amount field when budget checks are on", () => {
    expect(requestAmount(form, { amount: 1250.5, secret_cost: 9 }, null)).toEqual({ value: 1250.5, confidential: false });
    expect(requestAmount(JSON.stringify(form), JSON.stringify({ amount: 10, secret_cost: 99 }), JSON.stringify({ budget: { enabled: true, amountField: "secret_cost" } }))).toEqual({ value: 99, confidential: true });
    expect(requestAmount([{ key: "item", label: "Item", type: "TEXT", required: true }], {}, null)).toEqual({ value: null, confidential: false });
    expect(requestAmount("not json", "{", null)).toEqual({ value: null, confidential: false });
  });

  it("a confidential amount reads Hidden unless the viewer may see confidential values", () => {
    expect(amountText({ value: 1250.5, confidential: false }, false)).toBe("₹1,250.50");
    expect(amountText({ value: 99, confidential: true }, false)).toBe(HIDDEN_AMOUNT);
    expect(amountText({ value: null, confidential: true }, false)).toBe(HIDDEN_AMOUNT);
    expect(amountText({ value: 99, confidential: true }, true)).toBe("₹99.00");
    expect(amountText({ value: null, confidential: false }, true)).toBe("");
  });

  it("the table and CSV column follow the same rule", () => {
    const row = { amount: { value: 5000, confidential: true } } as Parameters<ReturnType<typeof requestColumns>[number]["value"]>[0];
    const column = (see: boolean) => requestColumns(see).find((item) => item.key === "amount")!;
    expect(column(false).value(row)).toBe("Hidden");
    expect(column(true).value(row)).toBe("₹5,000.00");
  });
});
