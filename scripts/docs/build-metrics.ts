// Writes docs/ANALYTICS_METRIC_DICTIONARY.md from server/analytics/metrics.ts.
// Run: npx tsx scripts/docs/build-metrics.ts
import fs from "node:fs";
import { ALL_METRICS as METRICS } from "../../server/analytics/metrics";
import { AGING_BUCKETS, APPROACHING_SHARE, SLA_LABEL } from "../../server/analytics/semantics";

const cell = (text: string) => text.replace(/\|/g, "\\|").replace(/\n/g, " ");
const lines = [
  "# Analytics metric dictionary",
  "",
  "Generated from `server/analytics/metrics.ts` by `npx tsx scripts/docs/build-metrics.ts`. Shown in the app at **Analytics → How these are worked out** (`/users/analytics/metrics`). A unit test (`tests/analytics/semantics.test.ts`) fails if a metric is missing here.",
  "",
  "## Rules that apply to every metric",
  "",
  "- **Time zone and periods.** India time throughout.",
  "  - Raised counts by submission date.",
  "  - Approved, rejected and withdrawn count by closing date.",
  "  - Decisions count by decision date.",
  "  - The comparison is the equally long period just before; for this month or last month it is the previous calendar month (the same days for this month); \"Same period last year\" compares the same dates a year earlier (v1.7.0).",
  "- **Drill-down.** A number with a list behind it opens that list (Analytics → the card or bar) with the same scope and filters, worked out by the same conditions (v1.7.0).",
  "- **Extra filters** (status now, approver, step, response time, age) narrow the requests counted by every number on the page (v1.7.0).",
  "- **Deleted requests** are never counted.",
  "- **Scope is enforced on the server** (`server/analytics/scope.ts`):",
  "  - *My requests*: requests the person raised.",
  "  - *My approvals*: tasks given to or decided by the person.",
  "  - *My team*: requests raised by direct reports.",
  "  - *My department*: requests raised in departments the person is HOD of.",
  "  - *Whole organisation*: IT team and Super Admin only.",
  "- **Pending is not overdue.**",
  "  - A task is overdue only when its step has a response time (`slaHours`) and the due time has passed.",
  "  - Due times are in working hours (working calendar, holidays) and move on by the time a request spends on hold.",
  "  - Steps without a response time are never overdue.",
  "- **Requests and tasks are counted separately.** A request can have several outstanding tasks (parallel steps), and the two are never added together. Any-one and any-N steps create only the tasks the engine needs; the rest are closed as not needed and don't count as pending.",
  `- **Approaching** means ${Math.round(APPROACHING_SHARE * 100)}% of the response time has been used. This is the platform's existing due-soon rule (F-91, D-112), not a new policy.`,
  `- **Response-time statuses:** ${Object.values(SLA_LABEL).join(", ")}. "Paused" is a task on a request that is on hold. There is no exclusion status, because the platform records no SLA exclusions.`,
  `- **Age buckets** (${AGING_BUCKETS.map((bucket) => bucket.label).join(", ")}) use elapsed calendar time. They are a display choice, not a business rule. Age since raised and time at the current step are separate measures.`,
  "- **Figures are live.** They are computed when the page or report is opened; the time is shown as \"As of …\".",
  "",
  "## Metrics",
  "",
  "| Key | Board | Metric | Meaning | Formula | Included | Left out | When | Unit | Source | Who sees it | Reliability | Limits |",
  "|---|---|---|---|---|---|---|---|---|---|---|---|---|",
  ...METRICS.map((metric) => `| \`${metric.key}\` | ${cell(metric.board ?? "")} | ${cell(metric.name)} | ${cell(metric.meaning)} | ${cell(metric.formula)} | ${cell(metric.includes)} | ${cell(metric.excludes)} | ${metric.timing} | ${metric.unit} | ${cell(metric.source)} | ${cell(metric.scopes)} | ${metric.reliability ?? "Reliable"} | ${cell(metric.limits ?? "—")} |`),
  "",
];
fs.writeFileSync("docs/ANALYTICS_METRIC_DICTIONARY.md", lines.join("\n"));
console.log(`wrote ${METRICS.length} metrics`);
