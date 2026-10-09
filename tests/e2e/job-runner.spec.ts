import { expect, test } from "@playwright/test";
import { db, sessionCookie } from "./db";

// D-094: Super Admin can see whether the cron job is calling the runner.
test("Message deliveries shows when the job runner last ran, and warns when it is stale", async ({ page, context }) => {
  await context.addCookies([await sessionCookie("E2E_SUPER")]);
  const connection = await db();
  try {
    await connection.query("DELETE FROM jobs WHERE job_type = 'RUNNER_HEARTBEAT'");
    await page.goto("/superadmin/deliveries");
    await expect(page.getByRole("status").filter({ hasText: "Job runner" })).toContainText("has never run");

    await connection.query("INSERT INTO jobs (job_type, status, locked_at, attempts) VALUES ('RUNNER_HEARTBEAT', 'DONE', DATE_SUB(CURRENT_TIMESTAMP, INTERVAL 40 MINUTE), 3)");
    await page.reload();
    await expect(page.getByRole("status").filter({ hasText: "Job runner" })).toContainText("last ran 40 min ago. It should run every 5 minutes");

    await connection.query("UPDATE jobs SET locked_at = CURRENT_TIMESTAMP WHERE job_type = 'RUNNER_HEARTBEAT'");
    await page.reload();
    await expect(page.getByRole("status").filter({ hasText: "Job runner" })).toHaveText("Job runner: last ran less than a minute ago.");
  } finally {
    await connection.query("DELETE FROM jobs WHERE job_type = 'RUNNER_HEARTBEAT'");
    await connection.end();
  }
});
