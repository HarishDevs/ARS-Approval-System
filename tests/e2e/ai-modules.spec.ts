import { expect, test } from "@playwright/test";
import type { ResultSetHeader } from "mysql2/promise";
import { db, sessionCookie } from "./db";

// D-168 (AI module branch): per-person module access through the real
// screens. Hiding a link is never the protection: typed addresses and
// direct API calls are refused too.
test.describe.configure({ mode: "serial" });
const tag = Date.now().toString(36).toUpperCase();

async function addPerson(loginId: string, modules: string): Promise<number> {
  const conn = await db();
  try {
    const [result] = await conn.query<ResultSetHeader>(
      "INSERT INTO users (login_id, name, email, sign_in_method, active, last_login_at, module_access) VALUES (?, ?, ?, 'GOOGLE', TRUE, CURRENT_TIMESTAMP, ?)",
      [loginId, `Person ${loginId}`, `${loginId.toLowerCase()}@example.test`, modules],
    );
    await conn.query("INSERT INTO user_roles (user_id, role_id) SELECT ?, id FROM roles WHERE code = 'USER'", [result.insertId]);
    return result.insertId;
  } finally {
    await conn.end();
  }
}

test("an admin sets module access on the user page; it persists, shows on the list and filters it", async ({ page, context }) => {
  const id = await addPerson(`MOD_A_${tag}`, "APPROVAL,TASK,INFORMATION");
  await context.addCookies([await sessionCookie("E2E_ADMIN")]);
  await page.goto(`/admin/users/${id}`);
  const access = page.getByTestId("module-access");
  for (const label of ["Approval", "Task", "Information"]) await expect(access.getByRole("checkbox", { name: new RegExp(`^${label}`) })).toBeChecked();
  await expect(access.getByRole("checkbox", { name: /^AI/ })).not.toBeChecked();
  await access.getByRole("checkbox", { name: /^Task/ }).uncheck();
  await access.getByRole("checkbox", { name: /^AI/ }).check();
  await page.getByRole("button", { name: "Save changes" }).click();
  await expect(page.getByText("Saved.")).toBeVisible();
  await page.reload();
  await expect(page.getByTestId("user-modules")).toHaveText("Approval, Information, AI");
  await expect(page.getByTestId("module-access").getByRole("checkbox", { name: /^Task/ })).not.toBeChecked();

  await page.goto(`/admin/users?q=MOD_A_${tag}&module=AI`);
  await expect(page.getByRole("row").filter({ hasText: `MOD_A_${tag}` })).toContainText("Approval, Information, AI");
  await page.goto(`/admin/users?q=MOD_A_${tag}&module=TASK`);
  await expect(page.getByRole("row").filter({ hasText: `MOD_A_${tag}` })).toHaveCount(0);
});

test("an admin can't change their own module access (the boxes are locked and say why)", async ({ page, context }) => {
  await context.addCookies([await sessionCookie("E2E_ADMIN")]);
  await page.goto("/admin/users?q=E2E_ADMIN");
  await page.getByRole("link", { name: "Elena Admin" }).click();
  const access = page.getByTestId("module-access");
  await expect(access).toContainText("You can't change your own module access");
  await expect(access.getByRole("checkbox", { name: /^AI/ })).toBeDisabled();
});

test("without the Task module: no Tasks in the sidebar, and typed task addresses are a plain 404", async ({ page, context }) => {
  await addPerson(`MOD_B_${tag}`, "APPROVAL,INFORMATION");
  await context.addCookies([await sessionCookie(`MOD_B_${tag}`)]);
  await page.goto("/users");
  const sidebar = page.getByTestId("sidebar");
  await expect(sidebar.getByTestId("nav-group-My Approvals")).toBeVisible();
  await expect(sidebar.getByTestId("nav-group-Tasks")).toHaveCount(0);
  for (const path of ["/users/tasks", "/users/tasks/new", "/users/tasks/assigned"]) {
    const response = await page.goto(path);
    expect(response?.status(), path).toBe(404);
  }
  // The calendar offers no task kind.
  await page.goto("/users/calendar");
  await expect(page.getByRole("link", { name: /^Tasks/ })).toHaveCount(0);
});

test("AI alone doesn't open Approval, Task or Information: pages, sidebar, quick search and API", async ({ page, context }) => {
  await addPerson(`MOD_C_${tag}`, "AI");
  await context.addCookies([await sessionCookie(`MOD_C_${tag}`)]);
  await page.goto("/users");
  await expect(page.getByTestId("modules-home")).toBeVisible();
  const sidebar = page.getByTestId("sidebar");
  for (const group of ["My Approvals", "Tasks", "Information"]) await expect(sidebar.getByTestId(`nav-group-${group}`)).toHaveCount(0);
  for (const path of ["/users/queue", "/users/new", "/users/requests", "/users/search", "/users/information", "/users/tasks"]) {
    const response = await page.goto(path);
    expect(response?.status(), path).toBe(404);
  }
  // A direct API call of the Approval module (quick search) is refused too.
  const api = await page.request.get("/api/me/quick?q=PR");
  expect(api.status()).toBeGreaterThanOrEqual(400);
});

test("a Super Admin's page says every module instead of showing boxes that would mislead", async ({ page, context }) => {
  await context.addCookies([await sessionCookie("E2E_ADMIN")]);
  await page.goto("/admin/users?q=E2E_SUPER");
  await page.getByRole("link", { name: "Sam Super" }).click();
  await expect(page.getByTestId("module-access")).toContainText("Every module: Approval, Task, Information, AI");
  await expect(page.getByTestId("module-access").getByRole("checkbox")).toHaveCount(0);
  await expect(page.getByTestId("user-modules")).toHaveText("All (Super Admin)");
});

const AI_PAGES = ["/users/ai", "/users/ai/assistant", "/users/ai/intelligence", "/users/ai/insights", "/users/ai/data-sources", "/users/ai/reports", "/users/ai/history"];

test("with the AI module: an AI sidebar group of its own, and every AI page opens with honest 'not connected' states", async ({ page, context }) => {
  await addPerson(`MOD_D_${tag}`, "APPROVAL,AI");
  await context.addCookies([await sessionCookie(`MOD_D_${tag}`)]);
  await page.goto("/users");
  const group = page.getByTestId("sidebar").getByTestId("nav-group-AI");
  await expect(group).toBeVisible();
  await group.getByRole("button", { name: /AI/ }).click();
  await group.getByRole("link", { name: "AI Dashboard" }).click();
  await expect(page.getByRole("heading", { level: 1, name: "AI Dashboard" })).toBeVisible();
  await expect(page.getByTestId("ai-dashboard")).toContainText("No data yet");
  for (const path of AI_PAGES) {
    const response = await page.goto(path);
    expect(response?.status(), path).toBe(200);
  }
  await page.goto("/users/ai/reports");
  await expect(page.getByTestId("ai-not-connected")).toBeVisible();
  await page.goto("/users/ai/history");
  await expect(page.getByText("No conversations yet")).toBeVisible();
  await page.goto("/users/ai/assistant");
  await expect(page.getByText("No AI provider is set up yet")).toBeVisible();
  await expect(page.getByLabel("Your question")).toBeDisabled();
  await page.goto("/users/ai/data-sources");
  await expect(page.getByTestId("ai-sources")).toContainText("Salesforce");
  await expect(page.getByTestId("ai-sources")).toContainText("Not connected");
});

test("without the AI module: no AI group, every AI address is a 404, and AI settings stay Super Admin only", async ({ page, context }) => {
  await context.addCookies([await sessionCookie("E2E_ADMIN")]); // IT Admin, default modules (no AI)
  await page.goto("/users");
  await expect(page.getByTestId("sidebar").getByTestId("nav-group-AI")).toHaveCount(0);
  for (const path of [...AI_PAGES, "/superadmin/ai"]) {
    const response = await page.goto(path);
    expect(response?.status(), path).toBe(404);
  }
});

test("the Super Admin's AI settings: four providers, encrypted key fields, usage and the Salesforce section", async ({ page, context }) => {
  await context.addCookies([await sessionCookie("E2E_SUPER")]);
  await page.goto("/superadmin/ai");
  const providers = page.getByTestId("ai-providers");
  for (const name of ["Claude (Anthropic)", "ChatGPT (OpenAI)", "Grok (xAI)", "DeepSeek"]) await expect(providers).toContainText(name);
  await expect(providers.getByText("Not set up")).toHaveCount(4);
  await expect(page.getByLabel("Claude (Anthropic) API key")).toHaveAttribute("type", "password");
  await expect(page.getByLabel("Active provider: NONE, CLAUDE, OPENAI (ChatGPT), GROK or DEEPSEEK")).toBeVisible();
  await expect(page.getByText("Salesforce sync")).toBeVisible();
  await expect(page.getByText("No questions yet.").first()).toBeVisible();
});
