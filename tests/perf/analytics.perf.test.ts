import fs from "node:fs";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { RowDataPacket } from "mysql2/promise";
import { getDbPool } from "@/lib/db/client";
import { createWorkflow, decideTask, publishVersion, submitRequest, type Actor } from "@/server/approvals/service";
import { loadAging, loadApproverLoad, loadBreakdown, loadKpis, loadNow, loadSla, loadSteps, loadTrend, type AnalyticsFilter } from "@/lib/db/repositories/analytics.repository";
import { loadDrill, loadDueSoon, loadFilterChoices, loadHeatmap, loadHistory, loadQuality, loadStatusMix } from "@/lib/db/repositories/analytics-more.repository";
import { indiaToday, resolvePeriod } from "@/server/analytics/periods";
import type { Scope } from "@/server/analytics/scope";
import { runReport } from "@/server/reports/run";
import { percentile } from "@/server/analytics/semantics";
import { createDepartment, createUser, pendingTaskKey } from "../integration/helpers";

// v1.7.0 (C01): p95 timings of every Analytics query on a database with a
// few thousand requests. 300 requests are raised through the service (real
// states and tasks), then copied 20 times by SQL with earlier dates, so the
// queries scan about 6,300 requests and their tasks. Each query runs 20
// times; p95 must stay under its target. Results go to
// test-results/perf/analytics.json (and docs/PERFORMANCE_ANALYTICS.md).
const BASE = 300;
const COPIES = 20;
const RUNS = 20;
const TARGET_MS = { query: 1000, dashboard: 3000 };

let admin: Actor;
const ORG: Scope = { kind: "ORGANISATION", label: "Whole organisation" };
const results: { name: string; p50: number; p95: number; max: number }[] = [];
let requestCount = 0;
let taskCount = 0;

async function time(name: string, run: () => Promise<unknown>, target = TARGET_MS.query) {
  const samples: number[] = [];
  await run(); // warm up
  for (let index = 0; index < RUNS; index += 1) {
    const started = performance.now();
    await run();
    samples.push(performance.now() - started);
  }
  const round = (value: number | null) => Math.round((value ?? 0) * 10) / 10;
  const entry = { name, p50: round(percentile(samples, 50)), p95: round(percentile(samples, 95)), max: round(Math.max(...samples)) };
  results.push(entry);
  expect(entry.p95, `${name} p95 ${entry.p95} ms`).toBeLessThan(target);
}

beforeAll(async () => {
  const approvers = await Promise.all([1, 2, 3].map((index) => createUser({ name: `Perf Approver ${index}` })));
  const departments = await Promise.all([1, 2, 3, 4].map(() => createDepartment(null)));
  const requesters = await Promise.all(departments.map((departmentId, index) => createUser({ name: `Perf Requester ${index}`, departmentId })));
  const adminId = await createUser({ roles: ["USER", "IT_ADMIN"] });
  admin = { id: adminId, roles: ["USER", "IT_ADMIN"] };
  const created = await createWorkflow(
    {
      code: `PERF_${Date.now()}`,
      name: "Perf type",
      kind: "PREDEFINED",
      requestPrefix: "PF",
      form: [{ key: "amount", label: "Amount", type: "NUMBER", required: true }],
      definition: {
        nodes: [
          { id: "start", kind: "START", label: "Start" },
          { id: "a", kind: "APPROVAL", label: "Perf check", approvers: approvers.map((userId) => ({ type: "USER", userId })), completion: { type: "ANY_ONE" }, slaHours: 8 },
          { id: "end", kind: "END", label: "End" },
        ],
        edges: [
          { id: "e1", from: "start", to: "a" },
          { id: "e2", from: "a", to: "end" },
        ],
      },
    },
    admin,
  );
  if (!created.ok) throw new Error(created.message);
  await publishVersion(created.value.versionId, admin);
  for (let index = 0; index < BASE; index += 1) {
    const requester = requesters[index % requesters.length]!;
    const result = await submitRequest({ workflowId: created.value.workflowId, title: `Perf ${index}`, fields: { amount: String(1000 + index) }, allowDuplicate: true }, { id: requester, roles: ["USER"] });
    if (!result.ok) throw new Error(result.message);
    if (index % 3 !== 0) {
      const approver = approvers[index % approvers.length]!;
      await decideTask({ requestId: result.value.requestId, taskKey: await pendingTaskKey(result.value.requestId, approver), decision: index % 7 === 0 ? "REJECT" : "APPROVE" }, { id: approver, roles: ["USER"] });
    }
  }
  const db = getDbPool();
  for (let copy = 1; copy <= COPIES; copy += 1) {
    await db.query(
      `INSERT INTO approval_requests (request_no, workflow_version_id, requester_id, title, form_data_json, status, round, state_json, state_version, submitted_at, closed_at)
       SELECT CONCAT(request_no, 'x', ?), workflow_version_id, requester_id, title, form_data_json, status, round, state_json, state_version,
              DATE_SUB(submitted_at, INTERVAL ? * 9 DAY), IF(closed_at IS NULL, NULL, DATE_SUB(closed_at, INTERVAL ? * 9 DAY))
       FROM approval_requests WHERE request_no LIKE 'PF-%' AND request_no NOT LIKE '%x%'`,
      [copy, copy, copy],
    );
    await db.query(
      `INSERT INTO approval_tasks (request_id, task_key, node_id, node_label, task_type, round, approver_id, status, decided_by, created_at, due_at, escalate_at, decided_at)
       SELECT r2.id, t.task_key, t.node_id, t.node_label, t.task_type, t.round, t.approver_id, t.status, t.decided_by,
              DATE_SUB(t.created_at, INTERVAL ? * 9 DAY), DATE_SUB(t.due_at, INTERVAL ? * 9 DAY), DATE_SUB(t.escalate_at, INTERVAL ? * 9 DAY), DATE_SUB(t.decided_at, INTERVAL ? * 9 DAY)
       FROM approval_tasks t JOIN approval_requests r ON r.id = t.request_id JOIN approval_requests r2 ON r2.request_no = CONCAT(r.request_no, 'x', ?)
       WHERE r.request_no LIKE 'PF-%' AND r.request_no NOT LIKE '%x%'`,
      [copy, copy, copy, copy, copy],
    );
  }
  const [[counts]] = await db.query<RowDataPacket[]>("SELECT (SELECT COUNT(*) FROM approval_requests) AS requests, (SELECT COUNT(*) FROM approval_tasks) AS tasks");
  requestCount = Number(counts!.requests);
  taskCount = Number(counts!.tasks);
  await db.query("ANALYZE TABLE approval_requests, approval_tasks");
});

afterAll(async () => {
  fs.mkdirSync(path.join("test-results", "perf"), { recursive: true });
  const report = { measuredAt: new Date().toISOString(), requests: requestCount, tasks: taskCount, runsPerQuery: RUNS, targetsMs: TARGET_MS, results };
  fs.writeFileSync(path.join("test-results", "perf", "analytics.json"), JSON.stringify(report, null, 2));
  console.table(results);
  await getDbPool().end();
});

describe(`Analytics p95 (organisation scope, about ${BASE * (COPIES + 1)} requests)`, () => {
  const periods = { "30 days": "30d", "this financial year": "this_fy" } as const;
  for (const [label, key] of Object.entries(periods)) {
    it(`each query, ${label}`, async () => {
      const filter: AnalyticsFilter = { period: resolvePeriod({ key }, indiaToday(new Date())), workflowId: null, departmentId: null };
      await time(`kpis (${label})`, () => loadKpis(ORG, admin, filter));
      await time(`now (${label})`, () => loadNow(ORG, admin, filter));
      await time(`trend (${label})`, () => loadTrend(ORG, admin, filter));
      await time(`aging (${label})`, () => loadAging(ORG, admin, filter));
      await time(`sla (${label})`, () => loadSla(ORG, admin, filter));
      await time(`by type (${label})`, () => loadBreakdown("type", ORG, admin, filter));
      await time(`by department (${label})`, () => loadBreakdown("department", ORG, admin, filter));
      await time(`steps (${label})`, () => loadSteps(ORG, admin, filter));
      await time(`approver load (${label})`, () => loadApproverLoad(ORG, admin, filter));
      await time(`due soon (${label})`, () => loadDueSoon(ORG, admin, filter));
      await time(`quality (${label})`, () => loadQuality(ORG, admin, filter));
      await time(`status mix (${label})`, () => loadStatusMix(ORG, admin, filter));
      await time(`history (${label})`, () => loadHistory(ORG, admin, filter));
      await time(`heatmap (${label})`, () => loadHeatmap(ORG, admin, filter));
      await time(`filter choices (${label})`, () => loadFilterChoices(ORG, admin, filter));
      await time(`drill: raised (${label})`, () => loadDrill("raised", ORG, admin, filter));
      await time(`drill: pending (${label})`, () => loadDrill("pending", ORG, admin, filter));
      await time(`filtered kpis: step + SLA (${label})`, () => loadKpis(ORG, admin, { ...filter, step: "Perf check", sla: "BREACHED" }));
      await time(`report: request register (${label})`, () => runReport("request_register", { scope: "ORGANISATION", period: key }, admin));
    });
  }

  it("the whole dashboard (every query at once, as the page runs them)", async () => {
    const filter: AnalyticsFilter = { period: resolvePeriod({ key: "30d" }, indiaToday(new Date())), workflowId: null, departmentId: null };
    await time(
      "whole dashboard (30 days)",
      () =>
        Promise.all([
          loadKpis(ORG, admin, filter),
          loadNow(ORG, admin, filter),
          loadTrend(ORG, admin, filter),
          loadAging(ORG, admin, filter),
          loadSla(ORG, admin, filter),
          loadBreakdown("type", ORG, admin, filter),
          loadBreakdown("department", ORG, admin, filter),
          loadSteps(ORG, admin, filter),
          loadApproverLoad(ORG, admin, filter),
          loadDueSoon(ORG, admin, filter),
          loadQuality(ORG, admin, filter),
          loadStatusMix(ORG, admin, filter),
          loadHistory(ORG, admin, filter),
          loadHeatmap(ORG, admin, filter),
          loadFilterChoices(ORG, admin, filter),
        ]),
      TARGET_MS.dashboard,
    );
  });
});
