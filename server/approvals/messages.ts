import type { EngineEvent } from "@/server/engine/types";
import type { NotifyInput } from "@/server/notifications/notify";

// Which engine events tell whom what (N-06 onwards). Pure and unit-tested.
// Email and in-app work now; WhatsApp uses the owner's templates once they
// are approved (Q-013), filled from whatsappVariables.
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
  context: { baseUrl: string; adminIds: readonly number[] },
): NotifyInput[] {
  const link = requestLink(context.baseUrl, request.id);
  const ref = `${request.requestNo} · ${request.title}`;
  const out: NotifyInput[] = [];
  const vars = (extra: Record<string, string> = {}) => ({ request_no: request.requestNo, title: request.title, link, ...extra });

  for (const event of events) {
    switch (event.type) {
      case "TASK_CREATED":
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
            text: `An approval was handed over to you (the previous approver is no longer available).\n\n${ref}\n\nOpen it here (sign-in required): ${link}`,
          },
          whatsappVariables: vars({ requester_name: request.requesterName }),
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
      case "NODE_BLOCKED":
        // Never silently approved: IT must fix the missing approver (G-02).
        for (const adminId of context.adminIds) {
          out.push({
            eventType: "REQUEST_BLOCKED",
            userId: adminId,
            title: "Request blocked",
            message: `${ref} is stuck at step "${event.nodeId}": ${event.reason === "NO_MATCHING_BRANCH" ? "no path matches" : "no eligible approver"}.`,
            deepLink: link,
            email: {
              subject: `Blocked: ${request.requestNo}`,
              text: `A request can't move on and needs IT.\n\n${ref}\nStep: ${event.nodeId}\nReason: ${event.reason}\n\n${link}`,
            },
            whatsappVariables: null,
          });
        }
        break;
      default:
        break;
    }
  }
  return out;
}
