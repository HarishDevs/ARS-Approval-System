// QA load test (v1.42.1 QA pass, Phase 14). Runs against a LOCAL test server
// (never production): staged virtual users, each looping through a realistic
// mix of pages with think time, measuring latency percentiles, errors and
// throughput per stage. Sessions are made in the throw-away test database.
//
//   node scripts/qa/load-test.mjs [baseUrl] [stageSeconds]
//   e.g. node scripts/qa/load-test.mjs http://localhost:3100 30
//
// Needs the e2e test database (ars_approvals_test on 127.0.0.1:3307) with the
// seeded E2E_* users, and the server started with the test SESSION_SECRET.
import crypto from "node:crypto";
import { writeFileSync, mkdirSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const require = createRequire(path.join(root, "package.json"));
const mysql = require("mysql2/promise");

const BASE = process.argv[2] ?? "http://localhost:3100";
const STAGE_SECONDS = Number(process.argv[3] ?? 30);
const STAGES = [10, 25, 50, 100, 150, 200, 250, 300];
const SECRET = "e2e-session-secret-that-is-only-for-tests-0123456789";
const LOGINS = ["E2E_REQ", "E2E_MGR", "E2E_HOD", "E2E_STAFF", "E2E_ADMIN"];
// What people open, weighted (Home and the queue most often).
const MIX = [
  ["home", "/users", 5],
  ["queue", "/users/queue", 3],
  ["myTasks", "/users/work/my-tasks", 3],
  ["requests", "/users/requests", 2],
  ["inbox", "/users/inbox", 2],
  ["search", "/users/search?q=E2E", 1],
  ["analytics", "/users/analytics", 1],
  ["progressApi", "/api/requests/{id}/progress", 2],
  ["notificationsApi", "/api/me/notifications", 2],
];
const bag = MIX.flatMap(([name, url, weight]) => Array.from({ length: weight }, () => [name, url]));

async function sessions(count) {
  const conn = await mysql.createConnection({ host: "127.0.0.1", port: 3307, user: "ars_dev", password: "ars_dev_password", database: "ars_approvals_test" });
  const [users] = await conn.query("SELECT id, login_id FROM users WHERE login_id IN (?)", [LOGINS]);
  // Each person polls the progress of requests they may see (their own, or
  // ones with a step for them): a 404 there would be the access check working.
  const [requests] = await conn.query(
    `SELECT r.id, r.requester_id AS user_id FROM approval_requests r WHERE r.deleted_at IS NULL
     UNION SELECT t.request_id, t.approver_id FROM approval_tasks t JOIN approval_requests r ON r.id = t.request_id AND r.deleted_at IS NULL`,
  );
  const cookies = [];
  const visible = [];
  for (let i = 0; i < count; i += 1) {
    const user = users[i % users.length];
    const sid = crypto.randomUUID();
    await conn.query("INSERT INTO user_sessions (id, user_id, auth_method, user_agent, expires_at) VALUES (?, ?, 'GOOGLE', 'load-test', DATE_ADD(CURRENT_TIMESTAMP, INTERVAL 2 HOUR))", [sid, user.id]);
    const now = Math.floor(Date.now() / 1000);
    const encoded = Buffer.from(JSON.stringify({ sid, uid: user.id, iat: now, exp: now + 7200 })).toString("base64url");
    const signature = crypto.createHmac("sha256", SECRET).update(`session:${encoded}`).digest("base64url");
    cookies.push(`ars_session=${encoded}.${signature}`);
    visible.push(requests.filter((row) => row.user_id === user.id).map((row) => row.id));
  }
  await conn.query("INSERT IGNORE INTO user_flags (user_id, flag) SELECT id, 'TOUR_DONE' FROM users WHERE login_id IN (?)", [LOGINS]);
  await conn.query("INSERT IGNORE INTO user_flags (user_id, flag) SELECT id, 'ONBOARDING_DONE' FROM users WHERE login_id IN (?)", [LOGINS]);
  await conn.end();
  return { cookies, requestIds: visible };
}

const pct = (sorted, p) => (sorted.length ? sorted[Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length))] : null);

async function stage(users, cookies, requestIds) {
  const samples = [];
  const until = Date.now() + STAGE_SECONDS * 1000;
  const worker = async (index) => {
    const cookie = cookies[index % cookies.length];
    const mine = requestIds[index % cookies.length];
    while (Date.now() < until) {
      let [name, template] = bag[Math.floor(Math.random() * bag.length)];
      if (template.includes("{id}") && mine.length === 0) [name, template] = ["home", "/users"];
      const url = BASE + template.replace("{id}", String(mine[Math.floor(Math.random() * mine.length)]));
      const started = performance.now();
      let status = 0;
      try {
        const response = await fetch(url, { headers: { cookie }, redirect: "manual", signal: AbortSignal.timeout(30_000) });
        await response.arrayBuffer();
        status = response.status;
      } catch {
        status = -1;
      }
      samples.push({ name, status, ms: performance.now() - started, ok: status >= 200 && status < 400 && status !== 0 });
      // Think time: a person reads for 1-3 s before the next click.
      await new Promise((resolve) => setTimeout(resolve, 1000 + Math.random() * 2000));
    }
  };
  await Promise.all(Array.from({ length: users }, (_, index) => worker(index)));
  const all = samples.map((sample) => sample.ms).sort((a, b) => a - b);
  const byRoute = Object.fromEntries(
    MIX.map(([name]) => {
      const list = samples.filter((sample) => sample.name === name).map((sample) => sample.ms).sort((a, b) => a - b);
      return [name, { n: list.length, p50: Math.round(pct(list, 50) ?? 0), p95: Math.round(pct(list, 95) ?? 0) }];
    }),
  );
  return {
    users,
    requests: samples.length,
    rps: Math.round((samples.length / STAGE_SECONDS) * 10) / 10,
    errors: samples.filter((sample) => !sample.ok).length,
    // What the errors were, by status (-1: no answer within 30 s; 429: a rate limit).
    errorStatuses: samples.filter((sample) => !sample.ok).reduce((counts, sample) => ({ ...counts, [`${sample.name}:${sample.status}`]: (counts[`${sample.name}:${sample.status}`] ?? 0) + 1 }), {}),
    errorRate: samples.length ? Math.round((samples.filter((sample) => !sample.ok).length / samples.length) * 10000) / 100 : 0,
    avg: Math.round(all.reduce((sum, value) => sum + value, 0) / Math.max(1, all.length)),
    p50: Math.round(pct(all, 50) ?? 0),
    p90: Math.round(pct(all, 90) ?? 0),
    p95: Math.round(pct(all, 95) ?? 0),
    p99: Math.round(pct(all, 99) ?? 0),
    byRoute,
  };
}

const { cookies, requestIds } = await sessions(Math.max(...STAGES));
const results = [];
for (const users of STAGES) {
  const result = await stage(users, cookies, requestIds);
  results.push(result);
  console.log(`${String(users).padStart(3)} users: ${result.requests} req, ${result.rps}/s, errors ${result.errorRate}%, p50 ${result.p50} ms, p95 ${result.p95} ms, p99 ${result.p99} ms`);
}
mkdirSync(path.join(root, "qa/evidence"), { recursive: true });
writeFileSync(path.join(root, "qa/evidence/load-test.json"), JSON.stringify({ base: BASE, stageSeconds: STAGE_SECONDS, at: new Date().toISOString(), results }, null, 1));
console.log("written qa/evidence/load-test.json");
