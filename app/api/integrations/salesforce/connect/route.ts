import { requireApiArea } from "@/server/authorization/guards";
import { startConnect } from "@/server/ai/connectors/salesforce-auth";
import { redirectToPage } from "@/lib/http/redirect";
import { recordAudit } from "@/lib/db/repositories/audit.repository";
import { logError } from "@/lib/logging/logger";

// D-172: "Connect Salesforce" (Super Admin only). Starts the OAuth 2.0 web
// server flow with PKCE; the state is tied to this Super Admin and expires in
// 10 minutes.
export const dynamic = "force-dynamic";

export async function GET() {
  let session;
  try {
    session = await requireApiArea("superadmin");
  } catch {
    return Response.json({ success: false, error: { code: "NOT_FOUND", message: "Not found." } }, { status: 404 });
  }
  try {
    const started = await startConnect(session.user.id);
    if (!started.ok) return redirectToPage("/superadmin/salesforce?salesforce=CONFIG");
    await recordAudit({ actorUserId: session.user.id, action: "AI_SALESFORCE_CONNECT_STARTED", entityType: "AI_SOURCE", entityId: "salesforce", sessionId: session.sessionId });
    return new Response(null, { status: 303, headers: { Location: started.url, "Cache-Control": "no-store", "Referrer-Policy": "no-referrer" } });
  } catch (error) {
    logError("salesforce connect failed", error);
    return redirectToPage("/superadmin/salesforce?salesforce=ERROR");
  }
}
