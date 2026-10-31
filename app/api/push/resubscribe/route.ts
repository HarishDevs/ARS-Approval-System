import type { NextRequest } from "next/server";
import { replaceSubscription } from "@/lib/db/repositories/push.repository";
import { resubscribeSchema } from "@/server/push/validate";
import { recordAudit } from "@/lib/db/repositories/audit.repository";
import { clientIpFrom } from "@/lib/http/client-ip";
import { overLimit, tooManyResponse, LIMITS } from "@/server/security/limits";
import { apiError } from "@/lib/http/api-response";

// D-252: the service worker's pushsubscriptionchange. It may run while the
// person is signed out (after midnight), so it has no session: the old
// endpoint proves it (only that browser and the server know it). It can only
// swap that row's endpoint and keys; the owner never changes.
export async function POST(request: NextRequest) {
  const ip = clientIpFrom((name) => request.headers.get(name)) ?? "unknown";
  if (await overLimit(`push-resub:${ip}`, LIMITS.push)) return tooManyResponse();
  const parsed = resubscribeSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return apiError("VALIDATION_ERROR", "Not accepted.", 400);
  const { oldEndpoint, subscription } = parsed.data;
  const owner = await replaceSubscription(oldEndpoint, { endpoint: subscription.endpoint, p256dh: subscription.keys.p256dh, auth: subscription.keys.auth });
  if (owner === null) return apiError("NOT_FOUND", "Not found.", 404);
  await recordAudit({ actorUserId: owner, action: "PUSH_DEVICE_RENEWED", entityType: "PUSH_DEVICE", entityId: owner, ipAddress: ip });
  return Response.json({ ok: true }, { headers: { "Cache-Control": "no-store" } });
}
