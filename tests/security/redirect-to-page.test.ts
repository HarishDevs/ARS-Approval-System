import { describe, expect, it } from "vitest";
import { redirectToPage } from "@/lib/http/redirect";

// v1.12.6 (D-165): own-page redirects are relative, so the proxy's
// localhost address never reaches the browser; other sites are refused.
describe("redirectToPage", () => {
  it("answers 303 with a relative Location and no caching", () => {
    const response = redirectToPage("/users/profile/calendar?connected=1");
    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toBe("/users/profile/calendar?connected=1");
    expect(response.headers.get("cache-control")).toBe("no-store");
  });
  it("refuses absolute and protocol-relative addresses", () => {
    expect(() => redirectToPage("http://localhost:20011/users")).toThrow();
    expect(() => redirectToPage("//evil.example/users")).toThrow();
  });
});
