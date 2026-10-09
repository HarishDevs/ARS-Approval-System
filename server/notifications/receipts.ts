// Delivery and read receipts from CEOITBox (S8-03). The payload may be
// Meta's webhook shape (entry[].changes[].value.statuses[]) or a flat
// { waMessageId | messageId | id, status } (or a list of them); anything
// else is ignored. Pure and unit-tested.
export interface Receipt {
  messageId: string;
  status: "DELIVERED" | "READ";
}

function fromStatus(item: unknown): Receipt | null {
  if (!item || typeof item !== "object") return null;
  const record = item as Record<string, unknown>;
  const id = [record.waMessageId, record.messageId, record.id, record.wamid].find((value) => typeof value === "string" && value.length > 0 && value.length <= 255) as string | undefined;
  const status = typeof record.status === "string" ? record.status.toLowerCase() : "";
  if (!id) return null;
  if (status === "delivered") return { messageId: id, status: "DELIVERED" };
  if (status === "read" || status === "seen") return { messageId: id, status: "READ" };
  return null;
}

export function parseReceipts(body: unknown): Receipt[] {
  const out: Receipt[] = [];
  const visit = (value: unknown, depth: number) => {
    if (depth > 12 || out.length >= 500) return;
    if (Array.isArray(value)) {
      value.forEach((item) => visit(item, depth + 1));
      return;
    }
    if (!value || typeof value !== "object") return;
    const record = value as Record<string, unknown>;
    const receipt = fromStatus(record);
    if (receipt) out.push(receipt);
    for (const key of ["entry", "changes", "value", "statuses", "data", "receipts"]) {
      if (key in record) visit(record[key], depth + 1);
    }
  };
  visit(body, 0);
  return out;
}
