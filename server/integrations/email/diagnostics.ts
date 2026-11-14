import "server-only";
import { randomBytes } from "node:crypto";
import { promises as dns } from "node:dns";
import { access, constants as fsConstants, stat } from "node:fs/promises";
import net from "node:net";
import os from "node:os";
import tls from "node:tls";
import MailComposer from "nodemailer/lib/mail-composer";
import type { EmailConfig } from "@/server/settings/values";

// v1.54.14 (owner's email delivery audit): the only way to see what the live
// GoDaddy hosting allows is to look from inside it. This runs on the server,
// once per Super Admin request, and records evidence: DNS answers, whether
// each mail route can be reached, and every reply of a real SMTP
// conversation (EHLO, MAIL FROM, RCPT TO and, if asked, DATA). It never uses
// a password (the relay routes take none), never runs the sendmail program
// (only checks that it exists), and never repeats a blocked connection.

export type Verdict = "VERIFIED" | "LIKELY" | "UNVERIFIED" | "BLOCKED BY HOSTING PROVIDER" | "REQUIRES ADMINISTRATOR ACTION";

export interface DnsCheck {
  name: string;
  type: "A" | "MX" | "TXT" | "PTR";
  answers: string[];
  error?: string;
}
export interface PortCheck {
  route: string;
  host: string;
  port: number;
  tls: boolean;
  connected: boolean;
  ms: number;
  greeting?: string;
  certificate?: string;
  error?: string;
}
export interface SmtpStep {
  command: string;
  code: number | null;
  reply: string;
  ms: number;
}
export interface SmtpDialog {
  route: string;
  host: string;
  port: number;
  steps: SmtpStep[];
  startTlsOffered: boolean;
  authOffered: string | null;
  recipientAccepted: boolean | null;
  messageAccepted: boolean | null;
  queueId: string | null;
  error?: string;
}
export interface Finding {
  verdict: Verdict;
  text: string;
}
export interface EmailDiagnosticReport {
  id: string;
  startedAt: string;
  durationMs: number;
  runtime: { node: string; nodemailer: string; platform: string; osRelease: string; serverHostname: string };
  settings: { provider: string; smtpHost: string | null; smtpPort: number | null; security: string | null; mailbox: string | null; connectThrough: string | null; passwordSet: boolean; sendmailPath: string | null; hourlyLimit: number | null; resendFallback: boolean };
  recipient: string;
  sentThrough: string | null;
  dns: DnsCheck[];
  ports: PortCheck[];
  dialogs: SmtpDialog[];
  sendmail: { path: string; exists: boolean; executable: boolean; error?: string };
  findings: Finding[];
}

const STEP_TIMEOUT_MS = 5_000;
// The whole conversation stays well inside the page's 30 s wait.
const DIALOG_BUDGET_MS = 14_000;
const CONNECT_TIMEOUT_MS = 6_000;
const short = (text: string, max = 220) => text.replace(/\s+/g, " ").trim().slice(0, max);
const errorText = (error: unknown) => {
  const raw = error as { code?: string; message?: string } | null;
  return short(`${raw?.code ? `${raw.code}: ` : ""}${raw?.message ?? String(error)}`, 200);
};
// The relay's queue id: Exim "id=1tXyz-…", or GoDaddy's relay "250 2.0.0 SBo0x… mail accepted".
export function queueIdFrom(reply: string): string | null {
  return reply.match(/id=([A-Za-z0-9-]+)/)?.[1] ?? reply.match(/\b2\.0\.0 ([A-Za-z0-9]{10,}) mail accepted/i)?.[1] ?? null;
}

// Only plain addresses go into SMTP commands (no spaces, angle brackets or line breaks).
export function safeAddress(value: string): string | null {
  const address = value.trim().toLowerCase();
  return /^[a-z0-9._%+-]{1,64}@[a-z0-9.-]{1,190}\.[a-z]{2,24}$/.test(address) ? address : null;
}

async function lookup(name: string, type: DnsCheck["type"]): Promise<DnsCheck> {
  try {
    let answers: string[] = [];
    if (type === "A") answers = await dns.resolve4(name);
    else if (type === "MX") answers = (await dns.resolveMx(name)).sort((a, b) => a.priority - b.priority).map((mx) => `${mx.priority} ${mx.exchange}`);
    else if (type === "TXT") answers = (await dns.resolveTxt(name)).map((parts) => parts.join(""));
    else answers = await dns.reverse(name);
    return { name, type, answers };
  } catch (error) {
    return { name, type, answers: [], error: errorText(error) };
  }
}

// One connection, the server's first reply, then closed.
function probePort(route: string, host: string, port: number, useTls: boolean): Promise<PortCheck> {
  const started = Date.now();
  return new Promise((resolve) => {
    let done = false;
    const finish = (result: Partial<PortCheck>) => {
      if (done) return;
      done = true;
      socket.destroy();
      resolve({ route, host, port, tls: useTls, connected: false, ms: Date.now() - started, ...result });
    };
    const socket: net.Socket = useTls ? tls.connect({ host, port, servername: host, rejectUnauthorized: true }) : net.connect({ host, port });
    socket.setTimeout(CONNECT_TIMEOUT_MS, () => finish({ error: `timeout after ${CONNECT_TIMEOUT_MS / 1000} s` }));
    socket.once("error", (error) => finish({ error: errorText(error) }));
    socket.once(useTls ? "secureConnect" : "connect", () => {
      const certificate = useTls ? (socket as tls.TLSSocket).getPeerCertificate() : null;
      const certText = certificate?.subject ? `${String(certificate.subject.CN ?? "")}, valid to ${certificate.valid_to}` : undefined;
      socket.once("data", (data) => finish({ connected: true, greeting: short(data.toString()), certificate: certText }));
    });
  });
}

// A real SMTP conversation, step by step, without sign-in.
export async function smtpDialog(route: string, host: string, port: number, mailbox: string, recipient: string, message: string | null): Promise<SmtpDialog> {
  const dialog: SmtpDialog = { route, host, port, steps: [], startTlsOffered: false, authOffered: null, recipientAccepted: null, messageAccepted: null, queueId: null };
  let socket: net.Socket | null = null;
  let buffer = "";
  let waiting: ((reply: { code: number | null; text: string }) => void) | null = null;
  const readReply = () =>
    new Promise<{ code: number | null; text: string }>((resolve) => {
      const timer = setTimeout(() => {
        waiting = null;
        resolve({ code: null, text: `no reply within ${STEP_TIMEOUT_MS / 1000} s` });
      }, STEP_TIMEOUT_MS);
      waiting = (reply) => {
        clearTimeout(timer);
        resolve(reply);
      };
      pump();
    });
  // A reply is complete at a line "NNN text" (a "NNN-" line continues it).
  const pump = () => {
    if (!waiting) return;
    const lines = buffer.split("\r\n");
    for (let index = 0; index < lines.length - 1; index += 1) {
      if (/^\d{3} /.test(lines[index]!)) {
        const text = lines.slice(0, index + 1).join(" | ");
        buffer = lines.slice(index + 1).join("\r\n");
        const resolve = waiting;
        waiting = null;
        resolve({ code: Number(lines[index]!.slice(0, 3)), text });
        return;
      }
    }
  };
  const dialogStarted = Date.now();
  const step = async (command: string, shown = command) => {
    if (Date.now() - dialogStarted > DIALOG_BUDGET_MS) throw new Error(`stopped: the conversation took longer than ${DIALOG_BUDGET_MS / 1000} s`);
    const started = Date.now();
    if (command) socket!.write(`${command}\r\n`);
    const reply = await readReply();
    dialog.steps.push({ command: shown, code: reply.code, reply: short(reply.text, 300), ms: Date.now() - started });
    return reply;
  };
  try {
    socket = await new Promise<net.Socket>((resolve, reject) => {
      const s = net.connect({ host, port });
      const timer = setTimeout(() => {
        s.destroy();
        reject(new Error(`connect timeout after ${CONNECT_TIMEOUT_MS / 1000} s`));
      }, CONNECT_TIMEOUT_MS);
      s.once("connect", () => {
        clearTimeout(timer);
        resolve(s);
      });
      s.once("error", (error) => {
        clearTimeout(timer);
        reject(error);
      });
    });
    socket.on("data", (data) => {
      buffer += data.toString();
      pump();
    });
    socket.on("error", () => undefined);
    const greeting = await step("", "(connect: server greeting)");
    if (greeting.code !== 220) throw new Error("no 220 greeting");
    const ehlo = await step(`EHLO ${os.hostname().replace(/[^A-Za-z0-9.-]/g, "") || "ars-cms"}`, "EHLO <server hostname>");
    dialog.startTlsOffered = /STARTTLS/i.test(ehlo.text);
    dialog.authOffered = ehlo.text.match(/AUTH[ =]([A-Z0-9 _-]+)/i)?.[1]?.trim() ?? null;
    if (ehlo.code !== 250) throw new Error("EHLO refused");
    const from = await step(`MAIL FROM:<${mailbox}>`);
    if (from.code !== 250) throw new Error("MAIL FROM refused");
    const rcpt = await step(`RCPT TO:<${recipient}>`);
    dialog.recipientAccepted = rcpt.code === 250 || rcpt.code === 251;
    if (!dialog.recipientAccepted) throw new Error("RCPT TO refused");
    if (message) {
      const data = await step("DATA");
      if (data.code !== 354) throw new Error("DATA refused");
      const sent = await step(`${message}\r\n.`, "(message body, then end-of-message)");
      dialog.messageAccepted = sent.code === 250;
      dialog.queueId = queueIdFrom(sent.text);
    } else {
      await step("RSET");
    }
    await step("QUIT");
  } catch (error) {
    dialog.error = errorText(error);
  } finally {
    socket?.destroy();
  }
  return dialog;
}

// v1.54.15 (live: GoDaddy's relay refused the hand-built message with "552
// bare LF"): the test message is built by the same library as real email (which
// GoDaddy accepted), then every line ending is made CRLF and lines starting
// with "." are doubled, as SMTP requires.
export async function testMessage(id: string, mailbox: string, recipient: string, fromName: string): Promise<string> {
  const domain = mailbox.split("@")[1] ?? "localhost";
  const built = await new MailComposer({
    from: { name: fromName.replace(/[^A-Za-z0-9 ._-]/g, ""), address: mailbox },
    to: recipient,
    subject: `ARS CMS email diagnostic ${id}`,
    messageId: `<${id}@${domain}>`,
    headers: { "X-ARS-Diagnostic-ID": id },
    text: [
      "This is an ARS CMS email delivery diagnostic.",
      `Diagnostic ID: ${id}`,
      `Sent at: ${new Date().toISOString()}`,
      "",
      "If you received this, the route works. Open the message's original (Gmail: More > Show original) to see SPF, DKIM and DMARC.",
    ].join("\n"),
  })
    .compile()
    .build();
  return smtpData(built.toString("utf8"));
}

// Every line ends in CRLF; a line starting with "." gets a second "." (RFC 5321 4.5.2).
export function smtpData(message: string): string {
  return message
    .replace(/\r\n|\r|\n/g, "\r\n")
    .replace(/\r\n$/, "")
    .split("\r\n")
    .map((line) => (line.startsWith(".") ? `.${line}` : line))
    .join("\r\n");
}

export interface DiagnosticOptions {
  recipient: string;
  // Which route carries a real test message (one only, so no duplicates); "none" = stop after RCPT TO.
  sendVia: "localhost" | "relay" | "none";
}

export async function runEmailDiagnostics(config: EmailConfig, options: DiagnosticOptions, nodemailerVersion: string): Promise<EmailDiagnosticReport> {
  const started = Date.now();
  const id = `ars-diag-${new Date().toISOString().slice(0, 10).replace(/-/g, "")}-${randomBytes(4).toString("hex")}`;
  const mailbox = safeAddress(config.smtp?.user ?? "") ?? safeAddress(config.fromAddress) ?? "no_reply@cms.arssteels.net";
  const recipient = safeAddress(options.recipient);
  if (!recipient) throw new Error("Enter a valid recipient address.");
  const mailboxDomain = mailbox.split("@")[1]!;
  const recipientDomain = recipient.split("@")[1]!;
  const relay = "relay-hosting.secureserver.net";
  // The hosting's own mail server (for the 465/587 checks), not the relay.
  const host = config.smtp?.host && config.smtp.host !== "localhost" && config.smtp.host !== relay ? config.smtp.host : "bom1plzcpnl493872.prod.bom1.secureserver.net";

  const [dnsChecks, ports, sendmail] = await Promise.all([
    Promise.all([
      lookup(mailboxDomain, "MX"),
      lookup(mailboxDomain, "TXT"),
      lookup(`_dmarc.${mailboxDomain}`, "TXT"),
      lookup(`default._domainkey.${mailboxDomain}`, "TXT"),
      lookup(`mail.${mailboxDomain}`, "A"),
      lookup(host, "A"),
      lookup(relay, "A"),
      lookup(recipientDomain, "MX"),
    ]),
    Promise.all([
      probePort("Local relay (GoDaddy, no sign-in)", "localhost", 25, false),
      probePort("GoDaddy hosting relay (no sign-in)", relay, 25, false),
      probePort("Hosting mail server, SSL", host, 465, true),
      probePort("Hosting mail server, STARTTLS", host, 587, false),
      // Whether ANY outside SMTP service is reachable (decides SMTP vs HTTPS-API providers).
      probePort("Outside SMTP provider (Brevo), port 587", "smtp-relay.brevo.com", 587, false),
      probePort("Outside SMTP provider (Brevo), port 2525", "smtp-relay.brevo.com", 2525, false),
    ]),
    (async () => {
      const path = config.sendmailPath || "/usr/sbin/sendmail";
      try {
        await stat(path);
        const executable = await access(path, fsConstants.X_OK).then(
          () => true,
          () => false,
        );
        return { path, exists: true, executable };
      } catch (error) {
        return { path, exists: false, executable: false, error: errorText(error) };
      }
    })(),
  ]);
  // Reverse DNS of the addresses the hosting server and relay resolve to.
  const ptrTargets = [...new Set(dnsChecks.filter((check) => check.type === "A" && (check.name === host || check.name === relay)).flatMap((check) => check.answers.slice(0, 2)))];
  const ptrs = await Promise.all(ptrTargets.map((ip) => lookup(ip, "PTR")));

  // Real conversations only where the port answered (a blocked route is not retried).
  const built = options.sendVia === "none" ? null : await testMessage(id, mailbox, recipient, config.fromName);
  const message = (route: "localhost" | "relay") => (options.sendVia === route ? built : null);
  const reachable = (name: string) => ports.find((port) => port.host === name && port.port === 25)?.connected === true;
  const dialogs = await Promise.all([
    reachable("localhost") ? smtpDialog("Local relay (GoDaddy, no sign-in)", "localhost", 25, mailbox, recipient, message("localhost")) : null,
    reachable(relay) ? smtpDialog("GoDaddy hosting relay (no sign-in)", relay, 25, mailbox, recipient, message("relay")) : null,
  ]);

  const report: EmailDiagnosticReport = {
    id,
    startedAt: new Date(started).toISOString(),
    durationMs: 0,
    runtime: { node: process.version, nodemailer: nodemailerVersion, platform: process.platform, osRelease: os.release(), serverHostname: os.hostname() },
    settings: {
      provider: config.provider ?? "RESEND",
      smtpHost: config.smtp?.host ?? null,
      smtpPort: config.smtp?.port ?? null,
      security: config.smtp?.security ?? null,
      mailbox,
      connectThrough: config.smtp?.connectHost || null,
      passwordSet: Boolean(config.smtp?.password),
      sendmailPath: config.sendmailPath ?? null,
      hourlyLimit: config.smtpHourlyLimit ?? null,
      resendFallback: Boolean(config.fallbackToResend && config.apiKey),
    },
    recipient,
    sentThrough: options.sendVia === "none" ? null : options.sendVia,
    dns: [...dnsChecks, ...ptrs],
    ports,
    dialogs: dialogs.filter((dialog): dialog is SmtpDialog => dialog !== null),
    sendmail,
    findings: [],
  };
  report.findings = findingsFor(report);
  report.durationMs = Date.now() - started;
  return report;
}

// Plain conclusions from the evidence, each with how sure it is.
export function findingsFor(report: EmailDiagnosticReport): Finding[] {
  const findings: Finding[] = [];
  const port = (host: string, number: number) => report.ports.find((item) => item.host === host && item.port === number);
  for (const item of report.ports) {
    if (item.connected) findings.push({ verdict: "VERIFIED", text: `${item.route} (${item.host}:${item.port}) is reachable from the server. Greeting: "${item.greeting ?? ""}".` });
    else if (/EACCES|EPERM/i.test(item.error ?? "")) findings.push({ verdict: "BLOCKED BY HOSTING PROVIDER", text: `${item.route} (${item.host}:${item.port}) is blocked for this app: ${item.error}.` });
    else findings.push({ verdict: "VERIFIED", text: `${item.route} (${item.host}:${item.port}) could not be reached: ${item.error ?? "no answer"}.` });
  }
  for (const dialog of report.dialogs) {
    const last = dialog.steps.at(-1);
    if (dialog.messageAccepted) {
      findings.push({ verdict: "VERIFIED", text: `${dialog.route} accepted the test message${dialog.queueId ? ` with queue id ${dialog.queueId}` : ""}. That is acceptance only, not delivery: whether it reached the recipient is decided after this point.` });
      findings.push({ verdict: "REQUIRES ADMINISTRATOR ACTION", text: `To see what happened next, GoDaddy can search its mail log for ${dialog.queueId ? `id ${dialog.queueId}` : `diagnostic ${report.id}`}; the recipient's admin can search for the subject "ARS CMS email diagnostic ${report.id}" (Google Admin: Reporting > Email log search).` });
    } else if (dialog.recipientAccepted && report.sentThrough === null) {
      findings.push({ verdict: "VERIFIED", text: `${dialog.route} accepted the sender and the recipient (no message was sent: "stop before sending" was chosen).` });
    } else if (dialog.error) {
      findings.push({ verdict: "VERIFIED", text: `${dialog.route} stopped at "${last?.command ?? "connect"}": ${last?.code ?? ""} ${last?.reply ?? dialog.error}.` });
    }
    if (dialog.authOffered === null && dialog.startTlsOffered === false) findings.push({ verdict: "LIKELY", text: `${dialog.route} offers no sign-in and no STARTTLS: it is an internal relay that trusts the hosting itself.` });
  }
  if (!report.sendmail.exists) findings.push({ verdict: "VERIFIED", text: `The sendmail program ${report.sendmail.path} is not visible to the app (${report.sendmail.error ?? "missing"}).` });
  else if (!report.sendmail.executable) findings.push({ verdict: "BLOCKED BY HOSTING PROVIDER", text: `The sendmail program ${report.sendmail.path} exists but the app may not run it.` });
  else findings.push({ verdict: "UNVERIFIED", text: `The sendmail program ${report.sendmail.path} exists and may be run; it was not run (an earlier live test did not finish within 30 s and delivered nothing).` });
  const spf = report.dns.find((check) => check.type === "TXT" && !check.name.startsWith("_dmarc") && !check.name.includes("_domainkey"))?.answers.find((answer) => answer.startsWith("v=spf1"));
  findings.push(spf ? { verdict: "VERIFIED", text: `SPF for the sending domain: ${spf}` } : { verdict: "VERIFIED", text: "The sending domain has no SPF record." });
  const dkim = report.dns.find((check) => check.name.startsWith("default._domainkey"));
  if (!dkim?.answers.length) findings.push({ verdict: "LIKELY", text: "No DKIM key at default._domainkey for the sending domain, so relayed mail is not DKIM-signed; Google relies on SPF alone." });
  const relayPtr = report.dns.filter((check) => check.type === "PTR");
  for (const ptr of relayPtr) findings.push({ verdict: "VERIFIED", text: `Reverse DNS of ${ptr.name}: ${ptr.answers.join(", ") || ptr.error || "none"}.` });
  const local = port("localhost", 25);
  if (local?.connected && report.dialogs.some((dialog) => dialog.host === "localhost" && dialog.messageAccepted)) {
    findings.push({ verdict: "UNVERIFIED", text: "The final hop (GoDaddy relay to the recipient's mail server) can't be seen from inside the app. Only GoDaddy's mail log or the recipient's mail log can confirm delivery." });
  }
  return findings;
}

export function reportAsText(report: EmailDiagnosticReport): string {
  const lines: string[] = [];
  lines.push(`ARS CMS email diagnostic ${report.id}`, `Started ${report.startedAt} (UTC), took ${report.durationMs} ms`, "");
  lines.push("RUNTIME", `  Node ${report.runtime.node}, Nodemailer ${report.runtime.nodemailer}, ${report.runtime.platform} ${report.runtime.osRelease}, host ${report.runtime.serverHostname}`, "");
  const s = report.settings;
  lines.push("SETTINGS (no passwords)", `  provider ${s.provider}; SMTP ${s.smtpHost ?? "-"}:${s.smtpPort ?? "-"} ${s.security ?? "-"}; mailbox ${s.mailbox}; connect through ${s.connectThrough ?? "-"}; password set: ${s.passwordSet ? "yes" : "no"}; sendmail ${s.sendmailPath ?? "-"}; hourly limit ${s.hourlyLimit ?? "-"}; Resend fallback ${s.resendFallback ? "on" : "off"}`, "");
  lines.push(`RECIPIENT ${report.recipient}; test message sent through: ${report.sentThrough ?? "none (stopped before sending)"}`, "");
  lines.push("DNS");
  for (const check of report.dns) lines.push(`  ${check.type.padEnd(3)} ${check.name}: ${check.answers.join(" | ") || `(none${check.error ? `: ${check.error}` : ""})`}`);
  lines.push("", "CONNECTIONS");
  for (const port of report.ports) lines.push(`  ${port.route} ${port.host}:${port.port}${port.tls ? " (TLS)" : ""}: ${port.connected ? `connected in ${port.ms} ms; greeting "${port.greeting ?? ""}"${port.certificate ? `; certificate ${port.certificate}` : ""}` : `NOT connected (${port.error ?? "no answer"})`}`);
  for (const dialog of report.dialogs) {
    lines.push("", `SMTP CONVERSATION: ${dialog.route} ${dialog.host}:${dialog.port}`);
    for (const step of dialog.steps) lines.push(`  > ${step.command}`, `  < ${step.code ?? "---"} ${step.reply} (${step.ms} ms)`);
    lines.push(`  STARTTLS offered: ${dialog.startTlsOffered ? "yes" : "no"}; AUTH offered: ${dialog.authOffered ?? "no"}; recipient accepted: ${dialog.recipientAccepted ?? "-"}; message accepted: ${dialog.messageAccepted ?? "-"}; queue id: ${dialog.queueId ?? "-"}${dialog.error ? `; stopped: ${dialog.error}` : ""}`);
  }
  lines.push("", `SENDMAIL ${report.sendmail.path}: exists ${report.sendmail.exists ? "yes" : "no"}, executable ${report.sendmail.executable ? "yes" : "no"} (not run)`);
  lines.push("", "FINDINGS");
  for (const finding of report.findings) lines.push(`  [${finding.verdict}] ${finding.text}`);
  return lines.join("\n");
}
