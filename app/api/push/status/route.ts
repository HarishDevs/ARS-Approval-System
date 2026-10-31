import type { NextRequest } from "next/server";
import { requireApiArea } from "@/server/authorization/guards";
import { findDeviceByEndpoint } from "@/lib/db/repositories/push.repository";
import { overLimit, tooManyResponse, LIMITS } from "@/server/security/limits";
import { apiError } from "@/lib/http/api-response";

// D-252: is this browser registered for me? POST so the endpoint isn't in an
// address (or a log). Answers only about the caller's own devices.
export async function POST(request: NextRequest) {
  let session;
  try {
    session = await requireApiArea("users", { change: false });
  } catch {
    return apiError("NOT_FOUND", "Not found.", 404);
  }
  if (await overLimit(`push:${session.user.id}`, LIMITS.push)) return tooManyResponse();
  const body = (await request.json().catch(() => null)) as { endpoint?: unknown } | null;
  const endpoint = typeof body?.endpoint === "string" && body.endpoint.length <= 1000 ? body.endpoint : null;
  const device = endpoint ? await findDeviceByEndpoint(session.user.id, endpoint) : null;
  return Response.json({ registered: device?.status === "ACTIVE", status: device?.status ?? null, id: device?.id ?? null }, { headers: { "Cache-Control": "no-store, private" } });
}
