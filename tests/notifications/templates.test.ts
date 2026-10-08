import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { messagesForEvents } from "@/server/approvals/messages";
import {
  accountLockedMessage,
  accountSecuredMessage,
  newSignInMessage,
  passwordChangedMessage,
  signInMethodChangedMessage,
  superAdminSignInMessage,
  whatsappChangedMessage,
} from "@/server/notifications/security-messages";
import { checkTemplateEntry, previewBody, renderTemplatesDoc, templateLabel, WHATSAPP_TEMPLATES, whatsappValue } from "@/server/notifications/templates";
import type { EngineEvent } from "@/server/engine/types";

// S6-04: the catalogue, the code that sends and the shared document must
// never drift apart, or Meta templates would get the wrong values.
const root = path.resolve(__dirname, "../..");
const keysFor = (eventType: string) => WHATSAPP_TEMPLATES.find((entry) => entry.eventType === eventType)?.variables.map((variable) => variable.key).sort();

describe("WhatsApp template catalogue", () => {
  it("every entry follows Meta's rules", () => {
    expect(WHATSAPP_TEMPLATES.flatMap(checkTemplateEntry)).toEqual([]);
  });

  it("codes, names and events are unique", () => {
    for (const key of ["code", "name", "eventType"] as const) {
      expect(new Set(WHATSAPP_TEMPLATES.map((entry) => entry[key])).size).toBe(WHATSAPP_TEMPLATES.length);
    }
  });

  it("the preview fills every variable", () => {
    for (const entry of WHATSAPP_TEMPLATES) expect(previewBody(entry)).not.toMatch(/\{\{\d+\}\}/);
  });

  it("request messages send exactly the variables their template uses", () => {
    const request = { id: 7, requestNo: "PUR-2026-000007", title: "Crane motor", requesterId: 1, requesterName: "Asha" };
    const events: EngineEvent[] = [
      { type: "TASK_CREATED", taskId: "t1", nodeId: "hod", approverId: 2 },
      { type: "INSTANCE_APPROVED" },
      { type: "INSTANCE_REJECTED", nodeId: "md", actorId: 3, comment: "Over budget" },
      { type: "CHANGES_REQUESTED", nodeId: "md", actorId: 3, comment: "Add quotes" },
      { type: "PUT_ON_HOLD", nodeId: "md", actorId: 3 },
      { type: "WITHDRAWN", actorId: 1, closedTaskIds: ["t1"], approverIds: [2] },
      { type: "REOPENED", actorId: 9, reason: "Price changed", round: 2 },
      { type: "NODE_BLOCKED", nodeId: "hod", reason: "NO_ELIGIBLE_APPROVER" },
    ] as EngineEvent[];
    const messages = messagesForEvents(events, request, { baseUrl: "https://x", adminIds: [4], labelOf: () => "HOD approval" });
    expect(messages.length).toBe(events.length);
    for (const message of messages) {
      expect(message.whatsappVariables, message.eventType).not.toBeNull();
      expect(Object.keys(message.whatsappVariables!).sort(), message.eventType).toEqual(keysFor(message.eventType));
    }
    expect(messages.at(-1)!.whatsappVariables).toMatchObject({ step: "HOD approval", reason: "no eligible approver" });
  });

  it("security messages send exactly the variables their template uses", () => {
    const details = { userName: "Ravi", when: new Date("2026-10-07T05:00:00Z"), userAgent: null, ipAddress: "1.2.3.4" };
    const cases: [string, Record<string, string> | null][] = [
      ["NEW_LOGIN", newSignInMessage(details, "https://x/not-me").whatsappVariables],
      ["ACCOUNT_LOCKED", accountLockedMessage("Ravi", 15).whatsappVariables],
      ["ACCOUNT_SECURED", accountSecuredMessage("Ravi").whatsappVariables],
      ["SUPER_ADMIN_SIGNIN", superAdminSignInMessage("IT", details).whatsappVariables],
      ["BREAK_GLASS_USED", superAdminSignInMessage("IT", details).whatsappVariables],
      ["PASSWORD_CHANGED", passwordChangedMessage("Ravi", new Date()).whatsappVariables],
      ["WHATSAPP_CHANGED", whatsappChangedMessage("Ravi").whatsappVariables],
      ["SIGN_IN_METHOD_CHANGED", signInMethodChangedMessage("Ravi", "PASSWORD").whatsappVariables],
    ];
    for (const [eventType, variables] of cases) expect(Object.keys(variables ?? {}).sort(), eventType).toEqual(keysFor(eventType));
  });

  it("messages sent from other files use the same keys (source check)", () => {
    const sources: [string, string][] = [
      ["server/approvals/collab.ts", "REQUEST_COMMENT"],
      ["server/jobs/sla.ts", "APPROVAL_REMINDER"],
      ["server/jobs/sla.ts", "APPROVAL_ESCALATED"],
      ["server/auth/session.ts", "SECURITY_ALERT"],
    ];
    for (const [file, eventType] of sources) {
      const text = readFileSync(path.join(root, file), "utf8");
      const start = text.indexOf(`eventType: "${eventType}"`);
      const block = text.slice(start, text.indexOf("});", start));
      const object = /whatsappVariables: \{([^}]*)\}/.exec(block)?.[1] ?? "";
      const keys = object
        .split(",")
        .map((part) => part.split(":")[0]!.trim())
        .filter(Boolean)
        .sort();
      expect(keys, eventType).toEqual(keysFor(eventType));
    }
  });

  it("docs/NOTIFICATION-TEMPLATES.md is up to date", () => {
    const doc = readFileSync(path.join(root, "docs/NOTIFICATION-TEMPLATES.md"), "utf8").replace(/\r\n/g, "\n");
    expect(doc).toBe(renderTemplatesDoc());
  });

  it("values go to Meta on one line, never empty, never too long", () => {
    expect(whatsappValue("Add\n\ntwo   quotes\t please")).toBe("Add two quotes please");
    expect(whatsappValue("   ")).toBe("-");
    expect(whatsappValue("x".repeat(400))).toHaveLength(300);
  });
});

describe("short labels (S9-15)", () => {
  it("every message has its own short screen name, not the raw event code", () => {
    const labels = WHATSAPP_TEMPLATES.map((entry) => templateLabel(entry.eventType));
    for (const [index, label] of labels.entries()) {
      expect(label).not.toMatch(/_/);
      expect(label.length).toBeLessThanOrEqual(28);
      expect(label).not.toBe(WHATSAPP_TEMPLATES[index]!.purpose);
    }
    expect(new Set(labels).size).toBe(labels.length);
    expect(templateLabel("SOME_NEW_EVENT")).toBe("Some new event");
  });
});
