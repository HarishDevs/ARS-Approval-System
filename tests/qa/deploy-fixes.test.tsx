import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { Email, SafeText } from "@/features/ui/SafeText";
import { normalizePrivateKey } from "@/lib/firebase/admin";

// S8-11: problems seen on the first GoDaddy deploy.
const EMAIL_IN_HTML = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/;

describe("addresses survive Cloudflare email obfuscation", () => {
  it("no plain address appears in the HTML, but the text reads the same", () => {
    const html = renderToStaticMarkup(<Email address="itadmin@arssteels.co.in" />);
    expect(html).not.toMatch(EMAIL_IN_HTML);
    expect(html.replace(/<[^>]+>/g, "")).toBe("itadmin@arssteels.co.in");
  });

  it("SafeText splits every address inside running text", () => {
    const html = renderToStaticMarkup(<SafeText text="Ask IT (itadmin@arssteels.co.in) or approvals@arssteels.net today." />);
    expect(html).not.toMatch(EMAIL_IN_HTML);
    expect(html.replace(/<[^>]+>/g, "")).toBe("Ask IT (itadmin@arssteels.co.in) or approvals@arssteels.net today.");
    expect(renderToStaticMarkup(<SafeText text="No address here." />)).toBe("No address here.");
  });
});

describe("Firebase private key as pasted into hosting secrets", () => {
  const pem = "-----BEGIN PRIVATE KEY-----\nABC\nDEF\n-----END PRIVATE KEY-----\n";
  it("accepts quotes, literal \n, real line breaks and CRLF", () => {
    expect(normalizePrivateKey('"-----BEGIN PRIVATE KEY-----\nABC\nDEF\n-----END PRIVATE KEY-----\n"')).toBe(pem);
    expect(normalizePrivateKey("-----BEGIN PRIVATE KEY-----\nABC\nDEF\n-----END PRIVATE KEY-----\n")).toBe(pem);
    expect(normalizePrivateKey(pem)).toBe(pem);
    expect(normalizePrivateKey(pem.replace(/\n/g, "\r\n"))).toBe(pem);
    expect(normalizePrivateKey("'-----BEGIN PRIVATE KEY-----\r\nABC\r\nDEF\r\n-----END PRIVATE KEY-----'")).toBe(pem);
  });
});
