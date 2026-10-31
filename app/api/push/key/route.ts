import { getPushConfig, pushReady } from "@/server/push/service";
import { requireApiArea } from "@/server/authorization/guards";
import { apiError } from "@/lib/http/api-response";

// D-252: the VAPID public key the browser subscribes with (public by design;
// asked only by signed-in people). enabled=false: push is off or not set up.
const NO_STORE = { "Cache-Control": "no-store, private" };

export async function GET() {
  try {
    await requireApiArea("users", { change: false });
    const config = await getPushConfig();
    return Response.json({ enabled: pushReady(config), publicKey: pushReady(config) ? config.publicKey : null }, { headers: NO_STORE });
  } catch {
    return apiError("NOT_FOUND", "Not found.", 404);
  }
}
