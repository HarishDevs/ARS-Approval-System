import type { NextRequest } from "next/server";
import { requireApiArea } from "@/server/authorization/guards";
import { finishConnect } from "@/server/ai/connectors/salesforce-auth";
import { redirectToPage } from "@/lib/http/redirect";
import { recordAudit } from "@/lib/db/repositories/audit.repository";
import { logError } from "@/lib/logging/logger";

// D-172: Salesforce sends the Super Admin back here. The state must match
// the one this Super Admin started (hash, unexpired, single use); the code is
// exchanged with the PKCE verifier on the server; tokens are stored
// encrypted. The one-time code never travels further (no-referrer).
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  let session;
  try {
    session = await requireApiArea("superadmin");
  } catch {
    return Response.json({ success: false, error: { code: "NOT_FOUND", message: "Not found." } }, { status: 404 });
  }
  const query = request.nextUrl.searchParams;
  try {
    const result = await finishConnect(session.user.id, { code: query.get("code"), state: query.get("state"), error: query.get("error") });
    await recordAudit({ actorUserId: session.user.id, action: result.ok ? "AI_SALESFORCE_CONNECTED" : "AI_SALESFORCE_CONNECT_FAILED", entityType: "AI_SOURCE", entityId: "salesforce", result: result.ok ? "SUCCESS" : "FAILURE", sessionId: session.sessionId, metadata: result.ok ? {} : { reason: result.error } });
    const response = redirectToPage(result.ok ? "/superadmin/salesforce?salesforce=CONNECTED" : `/superadmin/salesforce?salesforce=${result.error}`);
    response.headers.set("Referrer-Policy", "no-referrer");
    return response;
  } catch (error) {
    logError("salesforce callback failed", error);
    return redirectToPage("/superadmin/salesforce?salesforce=ERROR");
  }
}
