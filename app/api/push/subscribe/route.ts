import type { NextRequest } from "next/server";
import { requireApiArea } from "@/server/authorization/guards";
import { upsertSubscription } from "@/lib/db/repositories/push.repository";
import { recordAudit } from "@/lib/db/repositories/audit.repository";
import { describeDevice } from "@/server/push/payload";
import { subscribeSchema } from "@/server/push/validate";
import { getPushConfig, pushReady } from "@/server/push/service";
import { overLimit, tooManyResponse, LIMITS } from "@/server/security/limits";
import { apiError } from "@/lib/http/api-response";
import { logError } from "@/lib/logging/logger";

// D-252: register this browser for the signed-in person. The owner is always
// the session's person (never a value from the request), so nobody can
// register a device against someone else.
const NO_STORE = { "Cache-Control": "no-store, private" };

export async function POST(request: NextRequest) {
  let session;
  try {
    session = await requireApiArea("users", { change: false });
  } catch {
    return apiError("NOT_FOUND", "Not found.", 404);
  }
  if (await overLimit(`push:${session.user.id}`, LIMITS.push)) return tooManyResponse();
  const parsed = subscribeSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return apiError("VALIDATION_ERROR", "That isn't a browser push subscription this app accepts.", 400);
  if (!pushReady(await getPushConfig())) return apiError("UNAVAILABLE", "Phone and desktop notifications aren't switched on yet. Ask IT.", 409);
  try {
    const device = describeDevice(request.headers.get("user-agent"), { touch: parsed.data.touch });
    const { subscription, installed, permission } = parsed.data;
    const saved = await upsertSubscription({ userId: session.user.id, keys: { endpoint: subscription.endpoint, p256dh: subscription.keys.p256dh, auth: subscription.keys.auth }, ...device, installed, permission });
    if (saved.created || saved.movedFrom) {
      await recordAudit({ actorUserId: session.user.id, action: "PUSH_DEVICE_REGISTERED", entityType: "PUSH_DEVICE", entityId: saved.id, sessionId: session.sessionId, metadata: { ...device, installed, movedFromUser: saved.movedFrom } });
    }
    return Response.json({ ok: true, id: saved.id, created: saved.created }, { headers: NO_STORE });
  } catch (error) {
    logError("push subscribe failed", error);
    return apiError("SYSTEM_ERROR", "Couldn't register this device. Please try again.", 500);
  }
}
