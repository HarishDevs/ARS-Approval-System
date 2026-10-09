import { expect, test } from "@playwright/test";
import { sessionCookie } from "./db";

// D-081: the live site sits behind Cloudflare, whose "email obfuscation"
// rewrites any address that appears as plain page text; the app then fails
// to hydrate (React #418, seen live on /admin/import and /superadmin/audit
// on 9 Oct 2026). Addresses must reach the HTML split by <SafeText>/<Email>.
// Attribute values (e.g. an input's value) are not rewritten, so they're fine.
const EMAIL = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g;

function plainTextAddresses(html: string): string[] {
  const text = html
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<[^>]*>/g, "<>"); // keep tag boundaries, drop attributes
  return [...text.matchAll(EMAIL)].map((match) => match[0]);
}

test("no page shows an email address as plain text that Cloudflare would rewrite", async ({ page, context }) => {
  await context.addCookies([await sessionCookie("E2E_SUPER")]);
  const found: Record<string, string[]> = {};
  for (const url of ["/admin/import", "/admin/import?kind=users", "/superadmin/audit", "/superadmin/settings", "/admin/users", "/users", "/superadmin/requests"]) {
    const html = await (await page.request.get(url)).text();
    const addresses = plainTextAddresses(html);
    if (addresses.length) found[url] = addresses;
  }
  expect(found).toEqual({});
});
