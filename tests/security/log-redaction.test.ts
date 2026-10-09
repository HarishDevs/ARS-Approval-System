import { describe, expect, it } from "vitest";
import { redactProviderBody } from "@/lib/logging/logger";

// Audit P-06: provider error bodies keep their reason but not personal data.
describe("provider bodies in the log", () => {
  it("keep the reason, mask emails and phone numbers, and stay short", () => {
    const body = { message: "API key not authorized for domain arssteels.net", to: "ravi.kumar@arssteels.net", phone: "919876543210", alt: "+91 98765 43210" };
    const text = redactProviderBody(body);
    expect(text).toContain("not authorized for domain arssteels.net");
    expect(text).toContain("•••@arssteels.net");
    expect(text).not.toContain("ravi.kumar");
    expect(text).not.toContain("919876543210");
    expect(text).toContain("•••3210");
    expect(redactProviderBody("x".repeat(2000))).toHaveLength(600);
  });
});
