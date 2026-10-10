import type { EngineEvent } from "@/server/engine/types";
import type { NotifyInput } from "@/server/notifications/notify";

// Which engine events tell whom what (N-06 onwards). Pure and unit-tested.
// Email and in-app work now; WhatsApp uses the templates in
// server/notifications/templates.ts once each is approved and switched on
// (Q-013), filled from whatsappVariables by key.
export interface RequestSummary {
  id: number;
  requestNo: string;
  title: string;
  requesterId: number;
  requesterName: string;
}

export function requestLink(baseUrl: string, requestId: number): string {
  return `${baseUrl.replace(/\/$/, "")}/users/requests/${requestId}`;
}

export function messagesForEvents(
  events: readonly EngineEvent[],
  request: RequestSummary,
  context: {
    baseUrl: string;
    adminIds: readonly number[];
    labelOf?: (nodeId: string) => string;
    // D-097: a work step's task is "to do", not "to approve".
    isWorkStep?: (nodeId: string) => boolean;
    // v1.6.1: people following the request; told how it ends or comes back.
    collaboratorIds?: readonly number[];
  },
): NotifyInput[] {
  const link = requestLink(context.baseUrl, request.id);
  const ref = `${request.requestNo} · ${request.title}`;
  const out: NotifyInput[] = [];
  const vars = (extra: Record<string, string> = {}) => ({ request_no: request.requestNo, title: request.title, link, ...extra });

  for (const event of events) {
    switch (event.type) {
      case "TASK_CREATED":
        if (context.isWorkStep?.(event.nodeId)) {
          const step = context.labelOf?.(event.nodeId) ?? event.nodeId;
          out.push({
            eventType: "TASK_ASSIGNED",
            userId: event.approverId,
            title: "Task for you",
            message: `${step}: ${ref}`,
            deepLink: link,
            email: {
              subject: `Task for you: ${request.requestNo}`,
              text: `There is work for you on this request: ${step}.\n\n${ref}\n\nOpen it, do the work, then mark it done (sign-in required): ${link}`,
            },
            whatsappVariables: vars({ step, requester_name: request.requesterName }),
          });
          break;
        }
        out.push({
          eventType: "APPROVAL_NEEDED",
          userId: event.approverId,
          title: "Approval needed",
          message: `${request.requesterName} needs your approval: ${ref}`,
          deepLink: link,
          email: {
            subject: `Approval needed: ${request.requestNo}`,
            text: `${request.requesterName} needs your approval.\n\n${ref}\n\nOpen it here (sign-in required): ${link}`,
          },
          whatsappVariables: vars({ requester_name: request.requesterName }),
        });
        break;
      case "WITHDRAWN":
        for (const approverId of event.approverIds) {
          out.push({
            eventType: "REQUEST_WITHDRAWN",
            userId: approverId,
            title: "Request withdrawn",
            message: `No longer needed: ${ref} was withdrawn by ${request.requesterName}.`,
            deepLink: link,
            email: { subject: `Withdrawn: ${request.requestNo}`, text: `${request.requesterName} withdrew this request, so your approval is no longer needed.\n\n${ref}${event.reason ? `\nReason: ${event.reason}` : ""}\n\n${link}` },
            whatsappVariables: vars({ requester_name: request.requesterName }),
          });
        }
        break;
      case "REOPENED":
        out.push({
          eventType: "REQUEST_REOPENED",
          userId: request.requesterId,
          title: "Request reopened",
          message: `Reopened for approval again: ${ref}. Reason: ${event.reason}`,
          deepLink: link,
          email: { subject: `Reopened: ${request.requestNo}`, text: `Your approved request was reopened and goes through approval again.\n\n${ref}\nReason: ${event.reason}\n\n${link}` },
          whatsappVariables: vars({ reason: event.reason }),
        });
        break;
      case "TASK_REASSIGNED":
        out.push({
          eventType: "APPROVAL_NEEDED",
          userId: event.toId,
          title: "Approval handed to you",
          message: `An approval was handed over to you: ${ref}`,
          deepLink: link,
          email: {
            subject: `Approval needed: ${request.requestNo}`,
            text: event.byApprover
              ? `An approver passed this approval to you${event.reason ? ` (${event.reason})` : ""}.\n\n${ref}\n\nOpen it here (sign-in required): ${link}`
              : `An approval was handed over to you (the previous approver is no longer available).\n\n${ref}\n\nOpen it here (sign-in required): ${link}`,
          },
          whatsappVariables: vars({ requester_name: request.requesterName }),
        });
        break;
      case "RECALLED":
        for (const approverId of event.approverIds) {
          out.push({
            eventType: "REQUEST_RECALLED",
            userId: approverId,
            title: "Request recalled",
            message: `Not needed for now: ${request.requesterName} recalled ${ref} to change it. ${event.reason}`,
            deepLink: link,
            email: { subject: `Recalled: ${request.requestNo}`, text: `${request.requesterName} recalled this request to change it, so your approval isn't needed for now. You'll be asked again if it comes back to you.\n\n${ref}\nReason: ${event.reason}\n\n${link}` },
            whatsappVariables: null,
          });
        }
        break;
      case "INFO_REQUESTED":
        out.push({
          eventType: "INFORMATION_REQUESTED",
          userId: request.requesterId,
          title: "A question about your request",
          message: `An approver asked about ${ref}: ${event.question}`,
          deepLink: link,
          email: { subject: `Question about ${request.requestNo}`, text: `An approver needs more information before deciding.\n\n${ref}\nQuestion: ${event.question}\n\nAnswer it here (sign-in required): ${link}` },
          whatsappVariables: null,
        });
        break;
      case "INFO_ANSWERED":
        out.push({
          eventType: "INFORMATION_ANSWERED",
          userId: event.askedBy,
          title: "Your question was answered",
          message: `${request.requesterName} answered about ${ref}: ${event.answer.slice(0, 140)}`,
          deepLink: link,
          email: { subject: `Answered: ${request.requestNo}`, text: `${request.requesterName} answered your question. The request is waiting for your decision again.\n\n${ref}\nAnswer: ${event.answer}\n\n${link}` },
          whatsappVariables: null,
        });
        break;
      case "INSTANCE_APPROVED":
        out.push({
          eventType: "REQUEST_APPROVED",
          userId: request.requesterId,
          title: "Request approved",
          message: `Fully approved: ${ref}`,
          deepLink: link,
          email: { subject: `Approved: ${request.requestNo}`, text: `Your request is fully approved.\n\n${ref}\n\n${link}` },
          whatsappVariables: vars(),
        });
        break;
      case "INSTANCE_REJECTED":
        out.push({
          eventType: "REQUEST_REJECTED",
          userId: request.requesterId,
          title: "Request rejected",
          message: `Rejected: ${ref}. Reason: ${event.comment}`,
          deepLink: link,
          email: { subject: `Rejected: ${request.requestNo}`, text: `Your request was rejected.\n\n${ref}\nReason: ${event.comment}\n\n${link}` },
          whatsappVariables: vars({ reason: event.comment }),
        });
        break;
      case "CHANGES_REQUESTED":
        out.push({
          eventType: "CHANGES_REQUESTED",
          userId: request.requesterId,
          title: "Changes requested",
          message: `Changes needed: ${ref}. ${event.comment}`,
          deepLink: link,
          email: {
            subject: `Changes needed: ${request.requestNo}`,
            text: `An approver asked for changes before approving.\n\n${ref}\nWhat to change: ${event.comment}\n\nUpdate and resubmit it here: ${link}`,
          },
          whatsappVariables: vars({ reason: event.comment }),
        });
        break;
      case "PUT_ON_HOLD":
        out.push({
          eventType: "REQUEST_ON_HOLD",
          userId: request.requesterId,
          title: "Request on hold",
          message: `On hold: ${ref}${event.reason ? `. ${event.reason}` : ""}`,
          deepLink: link,
          email: { subject: `On hold: ${request.requestNo}`, text: `An approver put your request on hold.\n\n${ref}${event.reason ? `\nReason: ${event.reason}` : ""}\n\n${link}` },
          whatsappVariables: vars({ reason: event.reason ?? "" }),
        });
        break;
      case "NOTIFIED": {
        const step = context.labelOf?.(event.nodeId) ?? event.nodeId;
        for (const userId of event.userIds) {
          out.push({
            eventType: "REQUEST_FYI",
            userId,
            title: "For your information",
            message: `${step}: ${ref}${event.note ? `. ${event.note}` : ""}`,
            deepLink: link,
            email: {
              subject: `FYI: ${request.requestNo}`,
              text: `For your information (nothing to do): ${step}.\n\n${ref}${event.note ? `\n${event.note}` : ""}\n\n${link}`,
            },
            whatsappVariables: vars({ step, note: event.note ?? "" }),
          });
        }
        break;
      }
      case "RESUMED": {
        const told = new Set<number>([request.requesterId, ...(event.pendingApproverIds ?? [])]);
        told.delete(event.actorId);
        for (const userId of told) {
          out.push({
            eventType: "REQUEST_RESUMED",
            userId,
            title: "Request resumed",
            message: `Back in progress after a hold: ${ref}`,
            deepLink: link,
            email: { subject: `Resumed: ${request.requestNo}`, text: `This request is no longer on hold and is waiting for approval again.\n\n${ref}\n\n${link}` },
            whatsappVariables: vars(),
          });
        }
        break;
      }
      case "RESUBMITTED":
        // The approvers it now waits for are told by TASK_CREATED; the person
        // who asked for the changes hears that they were made.
        if (event.changesAskedBy && event.changesAskedBy !== request.requesterId) {
          out.push({
            eventType: "REQUEST_RESUBMITTED",
            userId: event.changesAskedBy,
            title: "Changes made",
            message: `${request.requesterName} made the changes you asked for: ${ref}`,
            deepLink: link,
            email: {
              subject: `Resubmitted: ${request.requestNo}`,
              text: `${request.requesterName} made the changes you asked for and resubmitted the request.\n\n${ref}\n\n${link}`,
            },
            whatsappVariables: vars({ requester_name: request.requesterName }),
          });
        }
        break;
      case "DELETED":
        for (const approverId of event.approverIds) {
          out.push({
            eventType: "REQUEST_WITHDRAWN",
            userId: approverId,
            title: "Request removed",
            message: `No longer needed: ${ref} was removed by IT.`,
            deepLink: null,
            email: { subject: `Removed: ${request.requestNo}`, text: `This request was removed by IT, so your approval is no longer needed.\n\n${ref}\nReason: ${event.reason}` },
            whatsappVariables: vars({ requester_name: request.requesterName }),
          });
        }
        out.push({
          eventType: "REQUEST_DELETED",
          userId: request.requesterId,
          title: "Request removed",
          message: `${ref} was removed by IT. Reason: ${event.reason}`,
          deepLink: null,
          email: { subject: `Removed: ${request.requestNo}`, text: `Your request was removed by IT.\n\n${ref}\nReason: ${event.reason}\n\nAsk IT if you think this is a mistake.` },
          whatsappVariables: vars({ reason: event.reason }),
        });
        break;
      case "BLOCK_RESOLVED": {
        const step = context.labelOf?.(event.nodeId) ?? event.nodeId;
        out.push({
          eventType: "REQUEST_UNBLOCKED",
          userId: request.requesterId,
          title: "Request moving again",
          message: `IT moved ${ref} on at step "${step}".`,
          deepLink: link,
          email: { subject: `Moving again: ${request.requestNo}`, text: `IT fixed the step that was holding up your request ("${step}").\n\n${ref}\nNote from IT: ${event.reason}\n\n${link}` },
          whatsappVariables: vars({ step }),
        });
        break;
      }
      case "NODE_BLOCKED": {
        // Never silently approved: IT must fix the missing approver (G-02).
        const step = context.labelOf?.(event.nodeId) ?? event.nodeId;
        const why = event.reason === "NO_MATCHING_BRANCH" ? "no path matches" : "no eligible approver";
        for (const adminId of context.adminIds) {
          out.push({
            eventType: "REQUEST_BLOCKED",
            userId: adminId,
            title: "Request blocked",
            message: `${ref} is stuck at step "${step}": ${why}.`,
            deepLink: link,
            email: {
              subject: `Blocked: ${request.requestNo}`,
              text: `A request can't move on and needs IT.\n\n${ref}\nStep: ${step}\nReason: ${why}\n\n${link}`,
            },
            whatsappVariables: vars({ step, reason: why }),
          });
        }
        break;
      }
      default:
        break;
    }
  }
  // v1.6.1 collaborators: an FYI when the request ends, is sent back,
  // comes back, or is withdrawn. Never a request to act.
  const followers = (context.collaboratorIds ?? []).filter((id) => id !== request.requesterId);
  if (followers.length) {
    for (const event of events) {
      const what =
        event.type === "INSTANCE_APPROVED" ? "was fully approved"
        : event.type === "INSTANCE_REJECTED" ? `was rejected: ${event.comment}`
        : event.type === "CHANGES_REQUESTED" ? "was sent back to the requester for changes"
        : event.type === "RESUBMITTED" ? "was resubmitted and is with the approvers again"
        : event.type === "WITHDRAWN" ? "was withdrawn by the requester"
        : null;
      if (!what) continue;
      for (const userId of followers) {
        out.push({
          eventType: "COLLABORATOR_UPDATE",
          userId,
          title: "Update on a request you follow",
          message: `${ref} ${what}.`,
          deepLink: link,
          email: { subject: `Update: ${request.requestNo}`, text: `A request you were added to ${what}.\n\n${ref}\nRaised by ${request.requesterName}\n\n${link}` },
          whatsappVariables: null,
        });
      }
    }
  }
  return out;
}
