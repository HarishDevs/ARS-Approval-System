import { afterAll, beforeAll, describe, expect, it } from "vitest";
import net from "node:net";
import { findingsFor, queueIdFrom, reportAsText, safeAddress, smtpData, smtpDialog, testMessage, type EmailDiagnosticReport } from "@/server/integrations/email/diagnostics";
import { sendSmtpEmail } from "@/server/integrations/email/smtp";
import { isRetryableCode } from "@/server/notifications/retry-policy";
import { deliveryReference } from "@/server/notifications/notify";
import { EmailSendError } from "@/server/integrations/email/send";

// v1.54.14 (owner's email delivery audit).
let server: net.Server;
let port = 0;
const commands: string[] = [];
beforeAll(async () => {
  server = net.createServer((socket) => {
    let inData = false;
    let buffer = "";
    socket.write("220-relay.test ESMTP\r\n220 We do not authorize UCE\r\n");
    socket.on("data", (chunk) => {
      buffer += chunk.toString();
      let at: number;
      while ((at = buffer.indexOf("\r\n")) >= 0) {
        const line = buffer.slice(0, at);
        buffer = buffer.slice(at + 2);
        if (inData) {
          if (line === ".") {
            inData = false;
            socket.write("250 OK id=1tAbCd-0007Xy-9Z\r\n");
          }
          continue;
        }
        commands.push(line);
        if (/^EHLO/i.test(line)) socket.write("250-relay.test Hello\r\n250-SIZE 52428800\r\n250 HELP\r\n");
        else if (/^RCPT TO:<blocked@/i.test(line)) socket.write("550 5.7.1 Relaying denied\r\n");
        else if (/^DATA/i.test(line)) {
          inData = true;
          socket.write("354 Enter message\r\n");
        } else if (/^QUIT/i.test(line)) socket.end("221 bye\r\n");
        else socket.write("250 OK\r\n");
      }
    });
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  port = (server.address() as net.AddressInfo).port;
});
afterAll(() => server.close());

describe("email diagnostic: the SMTP conversation", () => {
  it("records each step and the relay's queue id; no AUTH is sent", async () => {
    const dialog = await smtpDialog("Local relay", "127.0.0.1", port, "no_reply@cms.arssteels.net", "itsupport@arsenergy.co.in", "Subject: test\r\n\r\nbody");
    expect(dialog.steps.map((step) => step.code)).toEqual([220, 250, 250, 250, 354, 250, 221]);
    expect(dialog.recipientAccepted).toBe(true);
    expect(dialog.messageAccepted).toBe(true);
    expect(dialog.queueId).toBe("1tAbCd-0007Xy-9Z");
    expect(dialog.authOffered).toBeNull();
    expect(commands.some((line) => /^AUTH/i.test(line))).toBe(false);
  });

  it("stops at a refused recipient and says so", async () => {
    const dialog = await smtpDialog("Local relay", "127.0.0.1", port, "no_reply@cms.arssteels.net", "blocked@example.test", null);
    expect(dialog.recipientAccepted).toBe(false);
    expect(dialog.steps.at(-1)).toMatchObject({ command: "RCPT TO:<blocked@example.test>", code: 550 });
  });

  it("a closed port is reported, not retried", async () => {
    const dialog = await smtpDialog("Nothing", "127.0.0.1", 1, "a@b.co", "c@d.co", null);
    expect(dialog.error).toMatch(/ECONNREFUSED|connect/);
    expect(dialog.steps).toHaveLength(0);
  });
});

describe("email diagnostic: safety and findings", () => {
  it("only plain addresses go into SMTP commands (no header or command injection)", () => {
    expect(safeAddress("Itsupport@ArsEnergy.co.in")).toBe("itsupport@arsenergy.co.in");
    for (const bad of ["a@b.co\r\nRCPT TO:<x@y.z>", "<a@b.co>", "a b@c.co", "a@b"]) expect(safeAddress(bad)).toBeNull();
  });

  it("findings separate acceptance from delivery and label blocked routes", () => {
    const report = {
      id: "ars-diag-test",
      startedAt: "",
      durationMs: 1,
      runtime: { node: "v20", nodemailer: "6.9.16", platform: "linux", osRelease: "x", serverHostname: "h" },
      settings: { provider: "SMTP", smtpHost: "localhost", smtpPort: 25, security: "RELAY", mailbox: "no_reply@cms.arssteels.net", connectThrough: null, passwordSet: true, sendmailPath: "/usr/sbin/sendmail", hourlyLimit: 100, resendFallback: true },
      recipient: "itsupport@arsenergy.co.in",
      sentThrough: "localhost",
      dns: [{ name: "cms.arssteels.net", type: "TXT", answers: ["v=spf1 +a +mx ~all"] }],
      ports: [
        { route: "Local relay", host: "localhost", port: 25, tls: false, connected: true, ms: 3, greeting: "220 ok" },
        { route: "Hosting mail server, SSL", host: "h", port: 465, tls: true, connected: false, ms: 1, error: "EACCES: connect EACCES 1.2.3.4:465" },
      ],
      dialogs: [{ route: "Local relay", host: "localhost", port: 25, steps: [], startTlsOffered: false, authOffered: null, recipientAccepted: true, messageAccepted: true, queueId: "1tAbCd" }],
      sendmail: { path: "/usr/sbin/sendmail", exists: true, executable: true },
      findings: [],
    } as EmailDiagnosticReport;
    report.findings = findingsFor(report);
    const text = reportAsText(report);
    expect(report.findings.some((f) => f.verdict === "BLOCKED BY HOSTING PROVIDER" && f.text.includes(":465"))).toBe(true);
    expect(report.findings.some((f) => f.verdict === "VERIFIED" && /acceptance only, not delivery/.test(f.text))).toBe(true);
    expect(report.findings.some((f) => f.verdict === "REQUIRES ADMINISTRATOR ACTION" && f.text.includes("1tAbCd"))).toBe(true);
    expect(text).toContain("password set: yes");
    expect(text).not.toMatch(/password set: yes.*pw/);
  });
});

describe("sending: permanent refusals and the queue id (v1.54.14)", () => {
  it("SMTP 5xx is EMAIL_REJECTED and not retried", async () => {
    const transport = { sendMail: async () => Promise.reject(Object.assign(new Error("550 5.7.1 Relaying denied"), { responseCode: 550 })) };
    const error = (await sendSmtpEmail({ name: "ARS CMS", address: "no_reply@cms.arssteels.net" }, { to: "x@y.co", subject: "s", text: "t" }, transport).catch((caught: unknown) => caught)) as EmailSendError;
    expect(error.code).toBe("EMAIL_REJECTED");
    expect(isRetryableCode(error.code)).toBe(false);
  });
  it("the delivery keeps the relay's queue id", () => {
    expect(deliveryReference({ id: "<m1@cms>", receipt: "250 OK id=1tAbCd-0007Xy-9Z" })).toBe("queue 1tAbCd-0007Xy-9Z | <m1@cms>");
    expect(deliveryReference({ id: null })).toBeNull();
  });
});

describe("v1.54.15: what GoDaddy's relay needs", () => {
  it("the test message has CRLF line endings only (GoDaddy refused a bare LF) and escapes leading dots", async () => {
    const message = await testMessage("ars-diag-x", "no_reply@cms.arssteels.net", "itsupport@arsenergy.co.in", "ARS CMS");
    expect(/(^|[^\r])\n/.test(message)).toBe(false);
    expect(message).toContain("Subject: ARS CMS email diagnostic ars-diag-x");
    expect(message).toMatch(/^X-ARS-Diagnostic-ID: ars-diag-x$/im);
    expect(smtpData("a\n.b\r\nc\n")).toBe("a\r\n..b\r\nc");
  });
  it("reads the queue id from Exim and from GoDaddy's relay", () => {
    expect(queueIdFrom("250 OK id=1tAbCd-0007Xy-9Z")).toBe("1tAbCd-0007Xy-9Z");
    expect(queueIdFrom("250 2.0.0 SBo0xUPmLhTTXSBo0xmMGL mail accepted for delivery")).toBe("SBo0xUPmLhTTXSBo0xmMGL");
    expect(queueIdFrom("250 2.0.0 OK: queued")).toBeNull();
    expect(deliveryReference({ id: "<m@cms>", receipt: "250 2.0.0 SBo0xUPmLhTTXSBo0xmMGL mail accepted for delivery" })).toBe("queue SBo0xUPmLhTTXSBo0xmMGL | <m@cms>");
  });
});
