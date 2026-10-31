import { requireApiArea } from "@/server/authorization/guards";
import { notify } from "@/server/notifications/notify";
import { overLimit, tooManyResponse } from "@/server/security/limits";
import { apiError } from "@/lib/http/api-response";

// D-252: "Send a test" on App & devices: a notification to my own devices
// (and my Inbox), so I can see it arrive.
export async function POST() {
  let session;
  try {
    session = await requireApiArea("users", { change: false });
  } catch {
    return apiError("NOT_FOUND", "Not found.", 404);
  }
  if (await overLimit(`push-test:${session.user.id}`, 5)) return tooManyResponse("You can send 5 tests a minute.");
  const summary = await notify({
    eventType: "PUSH_TEST",
    userId: session.user.id,
    title: "Test notification",
    message: "Notifications from ARS-CMS reach this device.",
    deepLink: "/users/profile/devices",
    email: null,
    whatsappVariables: null,
  });
  return Response.json({ ok: true, devices: summary.push?.devices ?? 0, queued: summary.push?.status === "QUEUED" }, { headers: { "Cache-Control": "no-store, private" } });
}
