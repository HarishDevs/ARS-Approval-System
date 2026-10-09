import fs from "node:fs";
import path from "node:path";
import { expect, request as playwrightRequest, test } from "@playwright/test";
import type { ResultSetHeader } from "mysql2/promise";
import { db, sessionCookie } from "../e2e/db";

// Load test (GL-03, D-105). ARS has a few hundred staff; at a busy moment
// perhaps 50 are on the app at once. 50 virtual users each open their own
// session and load the pages people use most, 8 rounds each (2,400
// requests with the health checks). Every response must succeed and the
// 95th percentile must stay under 2 seconds on a developer machine.
const USERS = 50;
const ROUNDS = 8;
const P95_LIMIT_MS = 2000;

function percentile(sorted: number[], p: number): number {
  return sorted[Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1)] ?? 0;
}

test("50 people at once: no errors, 95% of pages in under 2 s", async ({ baseURL }) => {
  // People and some requests to look at.
  const connection = await db();
  const loginIds: string[] = [];
  let requestId = 0;
  try {
    const stamp = Date.now();
    for (let i = 0; i < USERS; i += 1) {
      const loginId = `LOAD_${stamp}_${i}`;
      const [user] = await connection.query<ResultSetHeader>("INSERT INTO users (login_id, name, email, sign_in_method, active) VALUES (?, ?, ?, 'GOOGLE', TRUE)", [loginId, `Load User ${i}`, `${loginId.toLowerCase()}@example.test`]);
      await connection.query("INSERT INTO user_roles (user_id, role_id) SELECT ?, id FROM roles WHERE code = 'USER'", [user.insertId]);
      loginIds.push(loginId);
    }
    const [rows] = await connection.query<import("mysql2/promise").RowDataPacket[]>("SELECT id FROM approval_requests WHERE deleted_at IS NULL ORDER BY id DESC LIMIT 1");
    requestId = Number(rows[0]?.id ?? 0);
  } finally {
    await connection.end();
  }

  const pages = ["/users", "/users/queue", "/users/requests", "/users/notifications", "/users/profile", "/api/health"];
  const timings: { url: string; ms: number; status: number }[] = [];
  const started = Date.now();
  await Promise.all(
    loginIds.map(async (loginId) => {
      const cookie = await sessionCookie(loginId);
      const context = await playwrightRequest.newContext({ baseURL, extraHTTPHeaders: { cookie: `${cookie.name}=${cookie.value}` } });
      try {
        for (let round = 0; round < ROUNDS; round += 1) {
          for (const url of requestId ? [...pages, `/users/requests/${requestId}`] : pages) {
            const t0 = Date.now();
            const response = await context.get(url, { maxRedirects: 0 });
            timings.push({ url, ms: Date.now() - t0, status: response.status() });
          }
        }
      } finally {
        await context.dispose();
      }
    }),
  );
  const seconds = (Date.now() - started) / 1000;
  const sorted = timings.map((item) => item.ms).sort((a, b) => a - b);
  // A request page the load user isn't part of answers 404 by design (D-057).
  const errors = timings.filter((item) => item.status >= 500 || (item.status >= 400 && !item.url.startsWith("/users/requests/")));
  const byPage = Object.fromEntries(
    [...new Set(timings.map((item) => item.url.replace(/\d+$/, ":id")))].map((url) => {
      const ms = timings.filter((item) => item.url.replace(/\d+$/, ":id") === url).map((item) => item.ms).sort((a, b) => a - b);
      return [url, { p50: percentile(ms, 50), p95: percentile(ms, 95), max: ms.at(-1) }];
    }),
  );
  const result = {
    at: new Date().toISOString(),
    users: USERS,
    rounds: ROUNDS,
    requests: timings.length,
    seconds,
    requestsPerSecond: Math.round(timings.length / seconds),
    p50: percentile(sorted, 50),
    p95: percentile(sorted, 95),
    p99: percentile(sorted, 99),
    max: sorted.at(-1),
    errors: errors.length,
    byPage,
  };
  fs.mkdirSync(path.join("test-results", "perf"), { recursive: true });
  fs.writeFileSync(path.join("test-results", "perf", "load.json"), JSON.stringify(result, null, 2));
  console.log(JSON.stringify(result, null, 2));
  expect(errors).toEqual([]);
  expect(result.p95).toBeLessThan(P95_LIMIT_MS);
});
