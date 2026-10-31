import { requireApiArea } from "@/server/authorization/guards";
import { listDevicesForUser } from "@/lib/db/repositories/push.repository";
import { apiError } from "@/lib/http/api-response";

// D-252: the signed-in person's own devices. The endpoint itself is never
// returned (it works like a key); only its push service's host.
export async function GET() {
  try {
    const session = await requireApiArea("users", { change: false });
    const devices = await listDevicesForUser(session.user.id);
    return Response.json(
      {
        devices: devices.map((device) => ({
          id: device.id,
          deviceType: device.deviceType,
          browser: device.browser,
          operatingSystem: device.operatingSystem,
          installed: device.installed,
          status: device.status,
          service: device.endpointHost,
          createdAt: device.createdAt.toISOString(),
          lastSeenAt: device.lastSeenAt.toISOString(),
          lastUsedAt: device.lastUsedAt?.toISOString() ?? null,
        })),
      },
      { headers: { "Cache-Control": "no-store, private" } },
    );
  } catch {
    return apiError("NOT_FOUND", "Not found.", 404);
  }
}
