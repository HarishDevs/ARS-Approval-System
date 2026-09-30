import { describe, expect, it } from "vitest";
import { buildCsp, createNonce } from "@/lib/security/csp";

const prod = { dev: false, firebaseAuthDomain: "power-bi-dashboard-3b29f.firebaseapp.com" };

function directives(csp: string): Map<string, string[]> {
  return new Map(csp.split("; ").map((part) => {
    const [name, ...values] = part.split(" ");
    return [name!, values];
  }));
}

describe("Content-Security-Policy (P1-34a)", () => {
  it("allows scripts only with this request's nonce, never eval or inline in production", () => {
    const policy = directives(buildCsp("abc123", prod));
    expect(policy.get("script-src")).toEqual(expect.arrayContaining(["'nonce-abc123'", "'strict-dynamic'"]));
    expect(policy.get("script-src")).not.toContain("'unsafe-eval'");
    expect(policy.get("script-src")).not.toContain("'unsafe-inline'");
    expect(policy.has("upgrade-insecure-requests")).toBe(true);
  });

  it("allows the Firebase Google sign-in popup and nothing else to frame", () => {
    const policy = directives(buildCsp("n", prod));
    expect(policy.get("frame-src")).toEqual(["https://power-bi-dashboard-3b29f.firebaseapp.com", "https://accounts.google.com"]);
    expect(policy.get("connect-src")).toContain("https://identitytoolkit.googleapis.com");
    expect(policy.get("frame-ancestors")).toEqual(["'none'"]);
    expect(policy.get("object-src")).toEqual(["'none'"]);
    expect(policy.get("form-action")).toEqual(["'self'"]);
  });

  it("dev adds only what hot reload needs", () => {
    const policy = directives(buildCsp("n", { ...prod, dev: true }));
    expect(policy.get("script-src")).toContain("'unsafe-eval'");
    expect(policy.get("connect-src")).toEqual(expect.arrayContaining(["ws:", "wss:"]));
    expect(policy.has("upgrade-insecure-requests")).toBe(false);
  });

  it("nonces are random and base64", () => {
    const a = createNonce();
    expect(a).toMatch(/^[A-Za-z0-9+/]+=*$/);
    expect(a).not.toBe(createNonce());
  });
});
