import { appendFileSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { expect, test, type Page } from "@playwright/test";
import { E2E_ENV } from "../../playwright.config";
import { as, count, sql } from "../qa-loaders/helpers";
import { sessionCookie } from "../e2e/db";

// End-to-end QA suite (QA session 14). Every title starts with its test id;
// every test asserts the required behaviour. Measurements go to
// test-results/qa-e2e/observations.jsonl for the report.
mkdirSync("test-results/qa-e2e", { recursive: true });
const note = (id: string, data: Record<string, unknown>) =>
  appendFileSync("test-results/qa-e2e/observations.jsonl", `${JSON.stringify({ id, at: new Date().toISOString(), ...data })}\n`);

const STATE = "test-results/qa-e2e/state.json";
let stamp = Date.now().toString(36);
test.beforeEach(({}, info) => {
  if (!info.title.startsWith("QA-SETUP")) stamp = JSON.parse(readFileSync(STATE, "utf8")).stamp;
});

async function raise(page: Page, title: string, amount = "50,000"): Promise<{ path: string; id: number }> {
  await page.goto("/users/new");
  await page.getByRole("link", { name: /QA E2E Type/ }).click();
  await page.getByLabel("Title").fill(title);
  await page.getByLabel(/Amount/).fill(amount);
  await page.getByRole("button", { name: "Submit request" }).click();
  await expect(page).toHaveURL(/\/users\/requests\/\d+\?submitted=1/, { timeout: 15_000 });
  const path = new URL(page.url()).pathname;
  return { path, id: Number(path.split("/").pop()) };
}

async function decide(page: Page, path: string, button: string, comment?: string) {
  await page.goto(path);
  if (comment) await page.getByLabel(/Comment/).first().fill(comment);
  await page.getByRole("button", { name: button, exact: true }).click();
}

test("QA-SETUP publish the default type (DoA: manager, HOD, senior above ₹10 lakh)", async ({ page, context }) => {
  await as(context, "E2E_ADMIN");
  await page.goto("/admin/workflows/new");
  await page.getByLabel("Name", { exact: true }).fill("QA E2E Type");
  await page.getByLabel("Code").fill("QA_E2E");
  await page.getByLabel("Number prefix").fill("QAE");
  await page.getByRole("button", { name: "Create workflow (as draft)" }).click();
  await expect(page).toHaveURL(/\/admin\/workflows\/\d+\?created=1/);
  await page.getByRole("button", { name: "Publish version 1" }).click();
  await page.getByRole("button", { name: "Yes, continue" }).click();
  await expect(page.getByText("Live", { exact: true })).toBeVisible();
  writeFileSync(STATE, JSON.stringify({ stamp }));
});

// ---- Smoke / build / operations ---------------------------------------------------------
test("QA-SMOKE-01 sign-in page, brand assets and an unknown page answer correctly", async ({ request }) => {
  const login = await request.get("/login");
  const logo = await request.get("/brand/ars-green-steel.svg");
  const unknown = await request.get("/definitely-not-a-page", { maxRedirects: 0 });
  note("QA-SMOKE-01", { login: login.status(), logo: logo.status(), logoType: logo.headers()["content-type"], unknown: unknown.status() });
  expect(login.status()).toBe(200);
  expect(logo.status()).toBe(200);
  expect([307, 404]).toContain(unknown.status());
});

test("QA-OPS-01 the scheduled-jobs endpoint refuses callers without the secret and runs with it", async ({ request }) => {
  const anonymous = await request.post("/api/jobs/run");
  const wrong = await request.post("/api/jobs/run", { headers: { "x-job-secret": "wrong" } });
  const right = await request.post("/api/jobs/run", { headers: { "x-job-secret": E2E_ENV.JOB_RUNNER_SECRET } });
  const body = await right.json().catch(() => null);
  note("QA-OPS-01", { anonymous: anonymous.status(), wrong: wrong.status(), right: right.status(), body });
  expect(anonymous.status()).toBe(404);
  expect(wrong.status()).toBe(404);
  expect(right.status()).toBe(200);
});

// ---- Session ---------------------------------------------------------------------------------
test("QA-AUTH-01 sign out ends the session on the server; Back can't show protected pages", async ({ page, context }) => {
  await as(context, "E2E_STAFF");
  await page.goto("/users");
  const cookie = (await context.cookies()).find((item) => item.name === "ars_session")!;
  await page.getByRole("button", { name: /Account menu for/ }).click();
  await page.getByRole("menuitem", { name: "Sign out" }).click();
  await expect(page).toHaveURL(/\/login/);
  const sid = JSON.parse(Buffer.from(cookie.value.split(".")[0]!, "base64url").toString()).sid as string;
  const revoked = await count("SELECT revoked_at IS NOT NULL AS n FROM user_sessions WHERE id = ?", [sid]);
  // Re-using the old cookie value must not work.
  await context.addCookies([{ ...cookie }]);
  await page.goto("/users");
  note("QA-AUTH-01", { sessionRevoked: revoked, oldCookieUrl: new URL(page.url()).pathname });
  expect(revoked).toBe(1);
  await expect(page).toHaveURL(/\/login/);
});

test("QA-AUTH-02 a deactivated person is locked out at once", async ({ page, context }) => {
  await as(context, "E2E_HOD");
  await page.goto("/users");
  await expect(page.getByRole("heading", { name: /Welcome back/ })).toBeVisible();
  await sql("UPDATE users SET active = FALSE WHERE login_id = 'E2E_HOD'");
  try {
    const response = await page.goto("/users");
    note("QA-AUTH-02", { status: response?.status(), url: new URL(page.url()).pathname });
    expect(new URL(page.url()).pathname === "/login" || response?.status() === 404).toBe(true);
    await expect(page.getByRole("heading", { name: /Welcome back, Harini/ })).toHaveCount(0);
  } finally {
    await sql("UPDATE users SET active = TRUE WHERE login_id = 'E2E_HOD'");
  }
});

test("QA-AUTH-03 a forged or tampered session cookie is not accepted", async ({ page, context }) => {
  const good = await sessionCookie("E2E_STAFF");
  const [payload, signature] = good.value.split(".") as [string, string];
  const forged = JSON.parse(Buffer.from(payload, "base64url").toString());
  forged.uid = 1; // try to become user 1 (bootstrap Super Admin)
  await context.clearCookies();
  await context.addCookies([{ ...good, value: `${Buffer.from(JSON.stringify(forged)).toString("base64url")}.${signature}` }]);
  await page.goto("/superadmin");
  const url = new URL(page.url()).pathname;
  const superVisible = await page.getByRole("heading", { name: "Super Admin" }).count();
  note("QA-AUTH-03", { landedOn: url, superAdminShown: superVisible });
  expect(superVisible).toBe(0);
  expect(url).toMatch(/\/login|\/superadmin/);
  await expect(page.getByText(/Providers & security/)).toHaveCount(0);
});

test("QA-AUTH-04 wrong passwords: one generic answer, lockout after 5, a per-User-ID limit", async ({ request }) => {
  const post = (loginId: string, ip: string) =>
    request.post("/api/auth/password/start", { data: { loginId, password: "wrong-password-123" }, headers: { "x-forwarded-for": ip } });
  const message = async (response: Awaited<ReturnType<typeof post>>) => ((await response.json().catch(() => ({}))) as { error?: { message?: string } }).error?.message ?? "";
  // 1. Same answer for a real and an unknown User ID (no enumeration).
  const real = await message(await post("E2E_STAFF", "198.51.100.1"));
  const unknown = await message(await post(`nobody-${stamp}`, "198.51.100.1"));
  // 2. Lockout: a password-sign-in user is locked on the 5th wrong password.
  await sql("UPDATE users SET sign_in_method = 'PASSWORD', whatsapp_number = '919800000001', failed_login_count = 0, locked_until = NULL WHERE login_id = 'E2E_HOD'");
  const lockMessages: string[] = [];
  try {
    for (let i = 0; i < 5; i += 1) lockMessages.push(await message(await post("E2E_HOD", "198.51.100.2")));
  } finally {
    await sql("UPDATE users SET sign_in_method = 'GOOGLE', whatsapp_number = NULL, failed_login_count = 0, locked_until = NULL WHERE login_id = 'E2E_HOD'");
  }
  // 3. Per-User-ID limit: the 11th try in 15 minutes is refused.
  const statuses: number[] = [];
  for (let i = 0; i < 11; i += 1) statuses.push((await post(`limit-${stamp}`, "198.51.100.3")).status());
  note("QA-AUTH-04", { realVsUnknown: [real, unknown], lockMessages, perLoginStatuses: statuses });
  expect(real).toBe(unknown);
  expect(lockMessages[4]).toMatch(/locked/i);
  expect(statuses[10]).toBe(429);
});

test("QA-SEC-06 the per-IP sign-in limit can't be dodged by sending a different X-Forwarded-For", async ({ request }) => {
  // 22 tries from one machine, each claiming a new client address and a new User ID.
  const statuses: number[] = [];
  for (let i = 0; i < 22; i += 1) {
    const response = await request.post("/api/auth/password/start", { data: { loginId: `spoof-${stamp}-${i}`, password: "wrong-password-123" }, headers: { "x-forwarded-for": `203.0.113.${i + 1}` } });
    statuses.push(response.status());
  }
  const sameIp: number[] = [];
  for (let i = 0; i < 22; i += 1) {
    const response = await request.post("/api/auth/password/start", { data: { loginId: `sameip-${stamp}-${i}`, password: "wrong-password-123" }, headers: { "x-forwarded-for": "192.0.2.200" } });
    sameIp.push(response.status());
  }
  note("QA-SEC-06", { spoofedStatuses: statuses, sameClaimedIpStatuses: sameIp });
  expect(sameIp.includes(429), "the limit works when the claimed address stays the same").toBe(true);
  expect(statuses.includes(429), "changing the claimed address doesn't reset the per-IP limit").toBe(true);
});

// ---- Authorization ------------------------------------------------------------------------
test("QA-AZ-01 people only see their own requests (direct URL and attachments)", async ({ page, context }) => {
  await as(context, "E2E_REQ");
  const { path, id } = await raise(page, `QA private ${stamp}`);
  await as(context, "E2E_STAFF");
  const response = await page.goto(path);
  const api = await page.request.get(`/api/attachments/999999`);
  note("QA-AZ-01", { otherUsersRequest: response?.status(), requestId: id, attachmentApi: api.status() });
  expect(response?.status()).toBe(404);
  expect(api.status()).toBe(404);
});

test("QA-AZ-02 an IT Admin can't use Super Admin pages or grant the Super Admin role", async ({ page, context }) => {
  await as(context, "E2E_ADMIN");
  const pages = await Promise.all(["/superadmin", "/superadmin/settings", "/superadmin/requests", "/superadmin/audit"].map(async (url) => (await page.request.get(url)).status()));
  await page.goto("/admin/users/new");
  const superBox = await page.getByRole("checkbox", { name: /Super Admin/ }).count();
  const superEnabled = superBox ? await page.getByRole("checkbox", { name: /Super Admin/ }).first().isEnabled() : false;
  note("QA-AZ-02", { superadminPages: pages, superAdminCheckboxShown: superBox, enabled: superEnabled });
  expect(pages.every((status) => status === 404)).toBe(true);
  expect(superEnabled).toBe(false);
});

test("QA-AZ-03 a decision replayed by someone who isn't the approver is refused", async ({ page, context, browser }) => {
  await as(context, "E2E_REQ");
  const { path, id } = await raise(page, `QA replay-other ${stamp}`);
  await as(context, "E2E_MGR");
  await page.goto(path);
  let captured: { url: string; headers: Record<string, string>; body: string } | null = null;
  await page.route("**/*", (route) => {
    if (route.request().method() === "POST" && route.request().headers()["next-action"]) {
      captured = { url: route.request().url(), headers: route.request().headers(), body: route.request().postData() ?? "" };
      return route.abort();
    }
    return route.fallback();
  });
  await page.getByRole("button", { name: "Approve", exact: true }).click();
  await expect.poll(() => captured).not.toBeNull();
  const other = await browser.newContext();
  await as(other, "E2E_STAFF");
  const otherPage = await other.newPage();
  const c = captured as unknown as { url: string; headers: Record<string, string>; body: string };
  const replay = await otherPage.request.post(c.url, { headers: { "next-action": c.headers["next-action"]!, "content-type": c.headers["content-type"]!, accept: "text/x-component" }, data: c.body });
  const approved = await count("SELECT COUNT(*) AS n FROM approval_tasks WHERE request_id = ? AND status = 'APPROVED'", [id]);
  note("QA-AZ-03", { replayStatus: replay.status(), approvedTasks: approved });
  await other.close();
  expect(approved).toBe(0);
});

// ---- Business rules -------------------------------------------------------------------------
test("QA-BL-01 DoA routing: ₹50,000 needs manager + HOD; ₹15,00,000 adds the senior level", async ({ page, context }) => {
  await as(context, "E2E_REQ");
  const small = await raise(page, `QA DoA small ${stamp}`, "50,000");
  const smallText = await page.locator("main").innerText();
  const large = await raise(page, `QA DoA large ${stamp}`, "15,00,000");
  const largeText = await page.locator("main").innerText();
  note("QA-BL-01", { smallSeniorSkipped: /Senior approval[\s\S]{0,80}Not needed at this amount/.test(smallText), largeSeniorNeeded: !/Senior approval[\s\S]{0,80}Not needed at this amount/.test(largeText), small: small.id, large: large.id });
  expect(smallText).toMatch(/Senior approval[\s\S]{0,80}Not needed at this amount \(DoA\)/);
  expect(largeText).not.toMatch(/Senior approval[\s\S]{0,80}Not needed at this amount/);
});

test("QA-BL-02 hold → resume → approve by both levels → Approved; audit and timeline recorded", async ({ page, context }) => {
  await as(context, "E2E_REQ");
  const { path, id } = await raise(page, `QA lifecycle ${stamp}`);
  await as(context, "E2E_MGR");
  await decide(page, path, "Put on hold", "Waiting for a quote");
  await expect(page.getByText(/On hold/).first()).toBeVisible();
  await page.getByRole("button", { name: "Resume" }).click();
  await expect(page.getByRole("button", { name: "Approve", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Approve", exact: true }).click();
  await expect(page.getByText(/Approved by Manoj Manager/).first()).toBeVisible();
  await as(context, "E2E_HOD");
  await decide(page, path, "Approve");
  await expect(page.getByText("Fully approved", { exact: true })).toBeVisible();
  const status = await count("SELECT status = 'APPROVED' AS n FROM approval_requests WHERE id = ?", [id]);
  const events = await count("SELECT COUNT(*) AS n FROM approval_events WHERE request_id = ?", [id]);
  const outbox = await count("SELECT COUNT(*) AS n FROM notification_outbox WHERE request_id = ?", [id]);
  note("QA-BL-02", { approved: status, timelineEvents: events, outboxMessages: outbox });
  expect(status).toBe(1);
  expect(events).toBeGreaterThanOrEqual(5);
  expect(outbox).toBeGreaterThan(0);
});

test("QA-BL-03 withdraw: the request closes and leaves the approver's queue", async ({ page, context }) => {
  await as(context, "E2E_REQ");
  const { id } = await raise(page, `QA withdraw ${stamp}`);
  await page.getByLabel("Reason for withdrawing").fill("Raised twice");
  await page.getByRole("button", { name: "Withdraw" }).click();
  await page.getByRole("button", { name: "Yes, continue" }).click();
  await expect(page.getByText(/Withdrawn/).first()).toBeVisible();
  await as(context, "E2E_MGR");
  await page.goto("/users/queue");
  const inQueue = await page.getByRole("link", { name: `QA withdraw ${stamp}` }).count();
  const status = await count("SELECT status = 'CANCELLED' AS n FROM approval_requests WHERE id = ?", [id]);
  note("QA-BL-03", { cancelled: status, stillInManagerQueue: inQueue });
  expect(status).toBe(1);
  expect(inQueue).toBe(0);
});

test("QA-BL-04 reject needs a reason; the requester can't approve their own request", async ({ page, context }) => {
  await as(context, "E2E_REQ");
  const { path } = await raise(page, `QA reject-reason ${stamp}`);
  const ownButtons = await page.getByRole("button", { name: "Approve", exact: true }).count();
  await as(context, "E2E_MGR");
  await decide(page, path, "Reject");
  await expect(page.getByText("A reason is required.")).toBeVisible();
  note("QA-BL-04", { requesterSeesApprove: ownButtons });
  expect(ownButtons).toBe(0);
});

test("QA-BL-05 the Super Admin reopens an approved request; it runs through the levels again", async ({ page, context }) => {
  await as(context, "E2E_REQ");
  const { path, id } = await raise(page, `QA reopen ${stamp}`);
  await as(context, "E2E_MGR");
  await decide(page, path, "Approve");
  await expect(page.getByText(/Approved by Manoj Manager/).first()).toBeVisible();
  await as(context, "E2E_HOD");
  await decide(page, path, "Approve");
  await expect(page.getByText("Fully approved", { exact: true })).toBeVisible();
  await as(context, "E2E_SUPER");
  await page.goto(path);
  await page.getByLabel("Reason for reopening").fill("Amount corrected by finance");
  await page.getByRole("button", { name: "Reopen" }).click();
  await page.getByRole("button", { name: "Yes, continue" }).click();
  await expect.poll(() => count("SELECT status = 'IN_PROGRESS' AS n FROM approval_requests WHERE id = ?", [id])).toBe(1);
  const pending = await count("SELECT COUNT(*) AS n FROM approval_tasks WHERE request_id = ? AND status = 'PENDING'", [id]);
  note("QA-BL-05", { reopened: true, pendingTasks: pending });
  expect(pending).toBeGreaterThan(0);
});

// ---- Security ---------------------------------------------------------------------------------
test("QA-SEC-01 stored XSS in a title and a comment is shown as text, never run", async ({ page, context }) => {
  const payload = `<img src=x onerror="window.__xss=1"><script>window.__xss=2</script>`;
  await as(context, "E2E_REQ");
  const { path } = await raise(page, `QA xss ${stamp} ${payload}`);
  await page.getByLabel("Add a comment").fill(payload);
  await page.getByRole("button", { name: "Post comment" }).click();
  await expect(page.getByText(payload).first()).toBeVisible();
  await as(context, "E2E_MGR");
  await page.goto(path);
  await page.goto("/users/queue");
  const fired = await page.evaluate(() => (window as unknown as { __xss?: number }).__xss ?? null);
  await page.goto(path);
  const firedOnRequest = await page.evaluate(() => (window as unknown as { __xss?: number }).__xss ?? null);
  const injectedImgs = await page.locator('img[src="x"]').count();
  note("QA-SEC-01", { firedInQueue: fired, firedOnRequestPage: firedOnRequest, injectedImgElements: injectedImgs });
  expect(fired).toBeNull();
  expect(firedOnRequest).toBeNull();
  expect(injectedImgs).toBe(0);
});

test("QA-SEC-02 SQL-injection text in searches is treated as text", async ({ page, context }) => {
  await as(context, "E2E_SUPER");
  const probes = ["' OR 1=1 -- ", "%' UNION SELECT password_hash FROM users -- ", "\\' ; DROP TABLE users; --"];
  const results: Record<string, unknown>[] = [];
  for (const q of probes) {
    const response = await page.goto(`/superadmin/requests?q=${encodeURIComponent(q)}`);
    results.push({ q, status: response?.status(), rows: await page.getByRole("row").count(), shown: await page.getByText(/No requests match|request/).first().isVisible() });
  }
  const users = await count("SELECT COUNT(*) AS n FROM users");
  note("QA-SEC-02", { results, usersTableIntact: users > 0 });
  for (const result of results) expect(result.status).toBe(200);
  expect(users).toBeGreaterThan(0);
  for (const result of results) expect(Number(result.rows)).toBeLessThanOrEqual(1);
});

test("QA-SEC-03 security headers on pages and APIs; nothing reveals the stack", async ({ request, context, page }) => {
  await as(context, "E2E_STAFF");
  const pageResponse = await page.goto("/users");
  const headers = pageResponse!.headers();
  const api = await request.get("/api/admin/dashboards/utilisation");
  const wanted = ["content-security-policy", "x-frame-options", "x-content-type-options", "referrer-policy", "strict-transport-security", "cross-origin-opener-policy"];
  const present = Object.fromEntries(wanted.map((name) => [name, headers[name] ?? null]));
  const apiBody = await api.text();
  note("QA-SEC-03", { present, poweredBy: headers["x-powered-by"] ?? null, apiStatus: api.status(), apiBody: apiBody.slice(0, 200) });
  for (const name of wanted) expect(headers[name], name).toBeTruthy();
  expect(headers["content-security-policy"]).toContain("frame-ancestors 'none'");
  expect(headers["x-powered-by"]).toBeUndefined();
  expect(apiBody).not.toMatch(/stack|at .*\.js|SELECT|mysql/i);
});

test("QA-SEC-04 a Server Action posted from another site (CSRF) is refused", async ({ page, context }) => {
  await as(context, "E2E_REQ");
  const { path, id } = await raise(page, `QA csrf ${stamp}`);
  let captured: { url: string; headers: Record<string, string>; body: string } | null = null;
  await page.route("**/*", (route) => {
    if (route.request().method() === "POST" && route.request().headers()["next-action"]) {
      captured = { url: route.request().url(), headers: route.request().headers(), body: route.request().postData() ?? "" };
      return route.abort();
    }
    return route.fallback();
  });
  await page.goto(path);
  await page.getByLabel("Add a comment").fill("CSRF probe");
  await page.getByRole("button", { name: "Post comment" }).click();
  await expect.poll(() => captured).not.toBeNull();
  const c = captured as unknown as { url: string; headers: Record<string, string>; body: string };
  const cookies = (await context.cookies()).map((cookie) => `${cookie.name}=${cookie.value}`).join("; ");
  const forged = await page.request.post(c.url, {
    headers: { "next-action": c.headers["next-action"]!, "content-type": c.headers["content-type"]!, origin: "https://evil.example", cookie: cookies, accept: "text/x-component" },
    data: c.body,
  });
  const saved = await count("SELECT COUNT(*) AS n FROM request_comments WHERE request_id = ? AND body = 'CSRF probe'", [id]);
  note("QA-SEC-04", { forgedStatus: forged.status(), commentSaved: saved });
  expect(saved).toBe(0);
});

test("QA-SEC-05 a disguised executable named .pdf is refused", async ({ page, context }) => {
  await as(context, "E2E_REQ");
  const { id } = await raise(page, `QA disguised ${stamp}`);
  await page.getByLabel("Choose files to attach").setInputFiles({ name: "invoice.pdf", mimeType: "application/pdf", buffer: Buffer.concat([Buffer.from("MZ"), Buffer.alloc(2000, 0)]) });
  await page.getByRole("button", { name: "Attach", exact: true }).click();
  await expect(page.getByText(/isn't a real|doesn't look like|content|not a valid|isn't a valid/i).first()).toBeVisible({ timeout: 15_000 });
  const saved = await count("SELECT COUNT(*) AS n FROM request_attachments WHERE request_id = ?", [id]);
  note("QA-SEC-05", { saved });
  expect(saved).toBe(0);
});

// ---- Files and reports -----------------------------------------------------------------------
test("QA-FILE-01 dashboard CSV matches the page; attachment downloads keep name and type", async ({ page, context }) => {
  await as(context, "E2E_REQ");
  await raise(page, `QA file ${stamp}`);
  await page.getByLabel("Choose files to attach").setInputFiles({ name: "quote 1.pdf", mimeType: "application/pdf", buffer: Buffer.from("%PDF-1.4\n%QA\n%%EOF") });
  await page.getByRole("button", { name: "Attach", exact: true }).click();
  await expect(page.getByText("quote 1.pdf").first()).toBeVisible();
  const href = await page.getByRole("link", { name: /quote 1\.pdf/ }).first().getAttribute("href");
  const file = await page.request.get(href!);
  await as(context, "E2E_ADMIN");
  await page.goto("/admin/dashboards/raisers");
  const raisedOnScreen = await page.getByRole("row", { name: /Ravi Requester/ }).getByRole("cell").nth(1).innerText();
  const csvHref = await page.getByRole("link", { name: "Download CSV" }).getAttribute("href");
  const csv = await (await page.request.get(csvHref!)).text();
  const ravi = csv.split(/\r?\n/).find((line) => line.includes("Ravi Requester")) ?? "";
  note("QA-FILE-01", { downloadStatus: file.status(), contentType: file.headers()["content-type"], disposition: file.headers()["content-disposition"], raisedOnScreen, csvRow: ravi });
  expect(file.status()).toBe(200);
  expect(file.headers()["content-type"]).toBe("application/pdf");
  expect(file.headers()["content-disposition"]).toContain("attachment");
  expect(ravi.split(",")[2]).toBe(raisedOnScreen.trim());
});

// ---- Performance ------------------------------------------------------------------------------
test("QA-PERF-01 key pages respond within budget (median of 5 < 1.5 s locally)", async ({ page, context }) => {
  await as(context, "E2E_ADMIN");
  const pages = ["/users", "/users/requests", "/admin", "/admin/dashboards/utilisation", "/admin/dashboards/approvers", "/admin/users"];
  const medians: Record<string, number> = {};
  for (const url of pages) {
    const times: number[] = [];
    for (let i = 0; i < 5; i += 1) {
      const t0 = Date.now();
      await page.goto(url, { waitUntil: "domcontentloaded" });
      times.push(Date.now() - t0);
    }
    medians[url] = times.sort((a, b) => a - b)[2]!;
  }
  note("QA-PERF-01", { medianMs: medians });
  for (const ms of Object.values(medians)) expect(ms).toBeLessThan(1500);
});

test("QA-PERF-02 20 people at once (server only, no browsers): every page loads, p95 under 3 s", async ({ playwright }) => {
  // Measured with plain HTTP clients, so the time is the server's, not 20
  // browsers starting on the same test machine.
  const logins = ["E2E_REQ", "E2E_MGR", "E2E_HOD", "E2E_STAFF", "E2E_ADMIN"];
  const clients = await Promise.all(
    Array.from({ length: 20 }, async (_, i) => {
      const cookie = await sessionCookie(logins[i % logins.length]!);
      return playwright.request.newContext({ baseURL: `http://localhost:3100`, extraHTTPHeaders: { cookie: `${cookie.name}=${cookie.value}` } });
    }),
  );
  const t0 = Date.now();
  const results = await Promise.all(
    clients.map(async (client, i) => {
      const start = Date.now();
      const response = await client.get(i % 2 ? "/users" : "/users/requests");
      return { status: response.status(), ms: Date.now() - start };
    }),
  );
  const times = results.map((result) => result.ms).sort((a, b) => a - b);
  const p95 = times[Math.ceil(times.length * 0.95) - 1]!;
  note("QA-PERF-02", { users: 20, totalMs: Date.now() - t0, p50: times[9], p95, max: times.at(-1), statuses: [...new Set(results.map((result) => result.status))] });
  await Promise.all(clients.map((client) => client.dispose()));
  expect(results.every((result) => result.status === 200)).toBe(true);
  expect(p95).toBeLessThan(3000);
});

// ---- Accessibility and layout ---------------------------------------------------------------
test("QA-A11Y-01 every form control has a name; one h1; page language set; images have alt", async ({ page, context }) => {
  const report: Record<string, unknown> = {};
  const check = async (label: string) =>
    page.evaluate(() => {
      const controls = [...document.querySelectorAll("input:not([type=hidden]), select, textarea")] as HTMLElement[];
      const unnamed = controls.filter((el) => {
        const id = el.id;
        const labelled = el.getAttribute("aria-label") || el.getAttribute("aria-labelledby") || (id && document.querySelector(`label[for="${id}"]`)) || el.closest("label") || el.getAttribute("title");
        return !labelled;
      });
      return {
        controls: controls.length,
        unnamed: unnamed.map((el) => `${el.tagName.toLowerCase()}[name=${el.getAttribute("name")}]`).slice(0, 10),
        h1: document.querySelectorAll("h1").length,
        lang: document.documentElement.lang,
        imagesWithoutAlt: [...document.querySelectorAll("img")].filter((img) => !img.hasAttribute("alt")).length,
      };
    }).then((result) => (report[label] = result));
  await context.clearCookies();
  await page.goto("/login");
  await check("/login");
  await as(context, "E2E_ADMIN");
  for (const url of ["/users", "/users/new", "/admin/workflows/new", "/admin/import", "/admin/dashboards/utilisation", "/admin/organisation"]) {
    await page.goto(url);
    await check(url);
  }
  note("QA-A11Y-01", report);
  for (const value of Object.values(report) as { unnamed: string[]; h1: number; lang: string; imagesWithoutAlt: number }[]) {
    expect(value.unnamed).toEqual([]);
    expect(value.h1).toBe(1);
    expect(value.lang).toBeTruthy();
    expect(value.imagesWithoutAlt).toBe(0);
  }
});

test("QA-A11Y-02 keyboard focus is visible on the sign-in page", async ({ page, context }) => {
  await context.clearCookies();
  await page.goto("/login");
  const seen: { tag: string; outline: string; shadow: string }[] = [];
  for (let i = 0; i < 8; i += 1) {
    await page.keyboard.press("Tab");
    // Past the last control, focus leaves the page (body): that's the end of the walk.
    if (await page.evaluate(() => document.activeElement === document.body)) break;
    seen.push(
      await page.evaluate(() => {
        const el = document.activeElement as HTMLElement;
        const style = getComputedStyle(el);
        return { tag: `${el.tagName.toLowerCase()}:${el.textContent?.trim().slice(0, 20) || el.getAttribute("aria-label") || el.id}`, outline: style.outlineStyle + " " + style.outlineWidth, shadow: style.boxShadow };
      }),
    );
  }
  note("QA-A11Y-02", { focusSequence: seen });
  for (const item of seen) expect(item.outline.startsWith("none") && item.shadow === "none", `focus visible on ${item.tag}`).toBe(false);
});

test("QA-UI-01 phone width: key pages have no sideways scrolling", async ({ page, context }) => {
  await page.setViewportSize({ width: 375, height: 800 });
  await as(context, "E2E_ADMIN");
  const results: Record<string, boolean> = {};
  for (const url of ["/users", "/users/new", "/users/requests", "/admin", "/admin/dashboards/utilisation", "/admin/import", "/admin/workflows/new"]) {
    await page.goto(url);
    results[url] = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1);
  }
  note("QA-UI-01", { sidewaysScroll: results });
  for (const [url, scrolls] of Object.entries(results)) expect(scrolls, url).toBe(false);
});
