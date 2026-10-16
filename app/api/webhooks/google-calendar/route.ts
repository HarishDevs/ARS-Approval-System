import type { NextRequest } from "next/server";
import { handleNotification } from "@/server/calendar/service";
import { overLimit } from "@/server/security/limits";
import { logError } from "@/lib/logging/logger";

// v1.11.0: Google Calendar push notifications. A notification is only a
// signal that something changed: it has no event data. The channel id,
// resource id and channel token must match a live connection (the token is
// compared by hash, in constant time); then a sync is queued. Duplicates
// collapse into one waiting sync. Unknown channels look like a missing route.
export async function POST(request: NextRequest) {
  try {
    if (await overLimit("webhook:google-calendar", 1200)) return new Response(null, { status: 429, headers: { "Retry-After": "60" } });
    const outcome = await handleNotification({
      channelId: request.headers.get("x-goog-channel-id"),
      resourceId: request.headers.get("x-goog-resource-id"),
      token: request.headers.get("x-goog-channel-token"),
      state: request.headers.get("x-goog-resource-state"),
    });
    if (outcome === "UNKNOWN") return new Response(null, { status: 404 });
    return new Response(null, { status: 200 });
  } catch (error) {
    logError("google calendar webhook failed", error);
    return new Response(null, { status: 500 }); // Google retries
  }
}
