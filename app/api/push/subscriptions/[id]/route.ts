import type { NextRequest } from "next/server";
import { requireApiArea } from "@/server/authorization/guards";
import { removeDevice } from "@/lib/db/repositories/push.repository";
import { recordAudit } from "@/lib/db/repositories/audit.repository";
import { apiError } from "@/lib/http/api-response";

// D-252: remove one of the signed-in person's own devices.
export async function DELETE(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  let session;
  try {
    session = await requireApiArea("users", { change: false });
  } catch {
    return apiError("NOT_FOUND", "Not found.", 404);
  }
  const id = Number((await params).id);
  if (!Number.isInteger(id) || id <= 0) return apiError("NOT_FOUND", "Not found.", 404);
  if (!(await removeDevice(session.user.id, id))) return apiError("NOT_FOUND", "Not found.", 404);
  await recordAudit({ actorUserId: session.user.id, action: "PUSH_DEVICE_REMOVED", entityType: "PUSH_DEVICE", entityId: id, sessionId: session.sessionId });
  return Response.json({ ok: true }, { headers: { "Cache-Control": "no-store, private" } });
}
