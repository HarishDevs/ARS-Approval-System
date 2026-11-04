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
import { EXPIRED_LABEL, isExpiredApproval } from "@/server/approvals/expiry-rules";
import { personProfile } from "@/lib/db/repositories/profile.repository";
import { loadJourney } from "@/server/journey/load";
import { TASK_STATUS_LABEL } from "@/server/modules/task-rules";
import { STATUS_WORD } from "@/features/ui/labels";
import { readFile } from "node:fs/promises";
import path from "node:path";

// v1.50.0: the ARS logo for the PDF header (read once; the PDF works without it).
let logoBytes: Promise<Uint8Array | null> | null = null;
const logo = () => (logoBytes ??= readFile(path.join(process.cwd(), "public", "branding", "ars-cms-logo-light-clear.png")).then((bytes) => new Uint8Array(bytes)).catch(() => null));

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
    // v1.50.0 (owner): the same cards as the request page.
    const [requester, journey, logoPng] = await Promise.all([
      personProfile(view.requesterId).catch(() => null),
      loadJourney(view.id, { id: session.user.id, roles: session.user.roles }).catch(() => null),
      logo(),
    ]);
    const expired = isExpiredApproval(view.status, view.validUntil);
    const bytes = await buildRequestSummaryPdf({
      statusKey: expired ? "EXPIRED" : view.status,
      requester: requester
        ? { loginId: requester.loginId, department: requester.departmentName, designation: requester.designationName, email: requester.email, manager: requester.managerName }
        : null,
      raisedOn: view.timeline.length ? formatIndiaTime(view.timeline[0]!.at) : null, // the timeline is oldest first
      tasks: (journey?.tasks ?? []).map((task) => ({ taskNo: task.taskNo, title: task.title, assignee: task.assignee, due: task.dueAt ? formatIndiaTime(new Date(task.dueAt)) : null, status: task.overdue ? "Overdue" : TASK_STATUS_LABEL[task.status] })),
      links: view.links.map((link) => ({ requestNo: link.requestNo, title: link.title, status: STATUS_WORD[link.status] ?? link.status, relation: link.kind === "RELATED" ? "Related" : link.direction === "to" ? "Follow-up" : "Follow-up of" })),
      logo: logoPng,
      requestNo: view.requestNo,
      title: view.title,
      workflowName: view.workflowName,
      // DR-05 (owner, 2 Nov 2026): an approval past its valid-until date reads Expired.
      statusLabel: expired ? `${EXPIRED_LABEL} (approved; valid until ${formatIndiaTime(view.validUntil!)})` : (STATUS[view.status] ?? view.status),
      requesterName: view.requesterName,
      progress: view.tracker.headline,
      priority: view.priority && !view.priority.hidden ? { label: view.priority.label, color: view.priority.color } : null, // v1.47.0
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
