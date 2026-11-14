import { afterAll, beforeAll, describe, expect, it } from "vitest";
import net from "node:net";
import { sendSmtpEmail, smtpTransport } from "@/server/integrations/email/smtp";

// v1.54.12: GoDaddy's relay for scripts on cPanel hosting (port 25, no SSL, no
// sign-in). A tiny stand-in server checks the app speaks plain SMTP to it.
let server: net.Server;
let port = 0;
const seen: string[] = [];
beforeAll(async () => {
  server = net.createServer((socket) => {
    let inData = false;
    let buffer = "";
    socket.write("220 relay.test ESMTP\r\n");
    socket.on("data", (chunk) => {
      buffer += chunk.toString();
      let at: number;
      while ((at = buffer.indexOf("\r\n")) >= 0) {
        const line = buffer.slice(0, at);
        buffer = buffer.slice(at + 2);
        if (inData) {
          if (line === ".") {
            inData = false;
            socket.write("250 OK queued\r\n");
          } else seen.push(line);
          continue;
        }
        seen.push(line);
        if (/^EHLO/i.test(line)) socket.write("250-relay.test\r\n250 8BITMIME\r\n");
        else if (/^DATA/i.test(line)) {
          inData = true;
          socket.write("354 go ahead\r\n");
        } else if (/^QUIT/i.test(line)) socket.end("221 bye\r\n");
        else socket.write("250 OK\r\n");
      }
    });
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  port = (server.address() as net.AddressInfo).port;
});
afterAll(() => server.close());

describe("GoDaddy relay mode (RELAY)", () => {
  it("sends plain SMTP without sign-in, as the mailbox", async () => {
    const transport = smtpTransport({ host: "127.0.0.1", port, security: "RELAY", user: "no_reply@cms.arssteels.net", password: "" });
    const sent = await sendSmtpEmail({ name: "ARS CMS", address: "no_reply@cms.arssteels.net", replyTo: "itadmin@arssteels.co.in" }, { to: "harishkumar.t@arssteels.com", subject: "Relay test", text: "Hello" }, transport, "SMTP");
    expect(sent.id).toBeTruthy();
    expect(seen.some((line) => /^AUTH/i.test(line))).toBe(false);
    expect(seen.some((line) => /^STARTTLS/i.test(line))).toBe(false);
    expect(seen).toContain("MAIL FROM:<no_reply@cms.arssteels.net>");
    expect(seen).toContain("RCPT TO:<harishkumar.t@arssteels.com>");
    expect(seen).toContain("From: ARS CMS <no_reply@cms.arssteels.net>");
  });
});
