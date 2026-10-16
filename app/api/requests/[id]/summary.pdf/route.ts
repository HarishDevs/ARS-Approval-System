import type { NextRequest } from "next/server";
import { requireApiArea } from "@/server/authorization/guards";
import { loadRequestView } from "@/server/approvals/view";
import { buildRequestSummaryPdf } from "@/server/pdf/request-summary";
import { formatIndiaTime } from "@/server/notifications/security-messages";
import { formatPaise } from "@/server/forms/dynamic";
import { recordAudit } from "@/lib/db/repositories/audit.repository";
import { LIMITS, overLimit, tooManyResponse } from "@/server/security/limits";
import { apiError } from "@/lib/http/api-response";
import { logError } from "@/lib/logging/logger";
import type { MapStage } from "@/server/approvals/step-map";

// #10 PDF summary. The same record-level check as the request page
// (loadRequestView, D-057): anyone else gets the same plain 404. Audited.
const STATUS: Record<string, string> = {
  IN_PROGRESS: "In progress",
  ON_HOLD: "On hold",
  CHANGES_REQUIRED: "Changes required",
  APPROVED: "Approved",
  REJECTED: "Rejected",
  CANCELLED: "Withdrawn",
};

const india = (value: string | undefined) => (value ? formatIndiaTime(new Date(value)) : undefined);
const withIndiaTimes = (stages: MapStage[]): MapStage[] =>
  stages.map((stage) => ({
    ...stage,
    steps: stage.steps.map((step) => ({ ...step, people: step.people.map((person) => ({ ...person, decidedAt: india(person.decidedAt) })) })),
    paths: stage.paths?.map((path) => ({ ...path, stages: withIndiaTimes(path.stages) })),
  }));

export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await requireApiArea("users");
    if (await overLimit(`pdf:${session.user.id}`, LIMITS.pdf)) return tooManyResponse("Too many PDF summaries in a minute. Wait a minute and try again.");
    const { id } = await params;
    if (!/^\d+$/.test(id)) return apiError("NOT_FOUND", "Not found.", 404);
    const view = await loadRequestView(Number(id), { id: session.user.id, roles: session.user.roles });
    if (!view) return apiError("NOT_FOUND", "Not found.", 404);
    const bytes = await buildRequestSummaryPdf({
      requestNo: view.requestNo,
      title: view.title,
      workflowName: view.workflowName,
      statusLabel: STATUS[view.status] ?? view.status,
      requesterName: view.requesterName,
      progress: view.tracker.headline,
      // Line items are written out row by row under their total.
      fields: view.fields.map((field) => ({
        label: field.label,
        value: field.lines?.length ? [field.value, ...field.lines.map((line) => `${line.description}: ${line.quantity} × Rs. ${line.rate}${Number(line.gst) ? ` + ${line.gst}% GST` : ""} = ${formatPaise(line.totalPaise).replace("₹", "Rs. ")}`)].join("\n") : field.value,
      })),
      stages: withIndiaTimes(view.stages),
      timeline: view.timeline.map((entry) => ({ at: formatIndiaTime(entry.at), text: entry.text })),
      attachments: view.attachments.map((file) => ({ name: file.name, size: file.size })),
      generatedAt: formatIndiaTime(new Date()),
      generatedBy: session.user.name,
    });
    await recordAudit({ actorUserId: session.user.id, action: "REQUEST_SUMMARY_DOWNLOADED", entityType: "REQUEST", entityId: view.id, sessionId: session.sessionId });
    const filename = `${view.requestNo.replace(/[^A-Za-z0-9_-]/g, "_")}-summary.pdf`;
    return new Response(new Uint8Array(bytes), {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${filename}"`,
        "Content-Length": String(bytes.length),
        "Cache-Control": "private, no-store",
        "X-Content-Type-Options": "nosniff",
        "Content-Security-Policy": "default-src 'none'; sandbox",
      },
    });
  } catch (error) {
    if ((error as Error)?.name !== "ForbiddenError") logError("request summary pdf failed", error);
    return apiError("NOT_FOUND", "Not found.", 404);
  }
}
