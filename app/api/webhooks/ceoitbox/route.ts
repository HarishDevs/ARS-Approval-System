import crypto from "node:crypto";
import type { NextRequest } from "next/server";
import { getSettingValue } from "@/server/settings/values";
import { parseReceipts } from "@/server/notifications/receipts";
import { recordDeliveryReceipt } from "@/lib/db/repositories/notifications.repository";
import { logError, logInfo } from "@/lib/logging/logger";

// CEOITBox delivery/read receipts (S8-03). Set in CEOITBox: this URL, and the
// header x-webhook-secret = Super Admin → WhatsApp → Webhook secret. Without
// the right secret (or with none configured) it looks like any missing route.
function sameSecret(given: string | null, expected: string | null): boolean {
  if (!given || !expected) return false;
  const a = crypto.createHash("sha256").update(given).digest();
  const b = crypto.createHash("sha256").update(expected).digest();
  return crypto.timingSafeEqual(a, b);
}

export async function POST(request: NextRequest) {
  const expected = await getSettingValue("whatsapp.webhook_secret").catch(() => null);
  if (!sameSecret(request.headers.get("x-webhook-secret"), expected)) {
    return Response.json({ success: false, error: { code: "NOT_FOUND", message: "Not found." } }, { status: 404 });
  }
  const text = await request.text();
  if (text.length > 256_000) return Response.json({ success: false, error: { code: "TOO_LARGE", message: "Too large." } }, { status: 413 });
  let body: unknown = null;
  try {
    body = JSON.parse(text);
  } catch {
    return Response.json({ success: false, error: { code: "INVALID", message: "Not JSON." } }, { status: 400 });
  }
  try {
    let updated = 0;
    const receipts = parseReceipts(body);
    for (const receipt of receipts) updated += await recordDeliveryReceipt(receipt.messageId, receipt.status);
    logInfo("ceoitbox webhook", { receipts: receipts.length, updated });
    return Response.json({ success: true, data: { receipts: receipts.length, updated } });
  } catch (error) {
    logError("ceoitbox webhook failed", error);
    return Response.json({ success: false, error: { code: "SYSTEM_ERROR", message: "Failed." } }, { status: 500 });
  }
}
