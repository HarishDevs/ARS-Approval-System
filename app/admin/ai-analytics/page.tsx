import type { Metadata } from "next";
import Link from "next/link";
import { PageHeader } from "@/features/shell/PageHeader";
import { BarList, Heatmap, LineChart } from "@/features/analytics/Charts";
import { Hint } from "@/features/ui/Hint";
import { requireArea } from "@/server/authorization/guards";
import { getSettingValue } from "@/server/settings/values";
import { bucketKey, bucketLabel, buckets, grainFor, indiaToday, PERIOD_LABEL, previousPeriod, resolvePeriod, type Period } from "@/server/analytics/periods";
import { indiaDayStartUtc, nextIndiaDayStartUtc } from "@/server/records/filters";
import { aiByDepartment, aiByMode, aiByPerson, aiByProvider, aiDaily, aiEnabledPeople, aiFailureReasons, aiLimitDays, aiTools, aiTotals, aiWeekHours, type Range } from "@/lib/db/repositories/ai-analytics.repository";
import { change, compact, costEstimate, duration, groupFailures, MODE_NAME, percent, toolLabel, WEEKDAYS } from "@/server/ai/analytics";
import { PROVIDER_LABEL } from "@/server/ai/providers";
import { formatIndiaTime } from "@/server/notifications/security-messages";

export const metadata: Metadata = { title: "AI Analytics" };
export const dynamic = "force-dynamic";

// D-193 (owner): how Pico Bot is used, for the IT team (Admin area):
// adoption, questions, answers and failures, speed, tokens and estimated
// cost, which chats, providers, departments and people, when people ask,
// which data lookups answers used, and the daily limit. Compared with the
// period just before. Read-only.
const PERIODS = ["7d", "30d", "90d", "this_month", "last_month", "this_quarter", "this_fy"] as const;
const range = (period: Period): Range => ({ from: indiaDayStartUtc(period.from), to: nextIndiaDayStartUtc(period.to) });

export default async function AiAnalyticsPage({ searchParams }: { searchParams: Promise<{ period?: string; from?: string; to?: string }> }) {
  await requireArea("admin");
  const query = await searchParams;
  const period = resolvePeriod({ key: query.period, from: query.from, to: query.to }, indiaToday(new Date()));
  const before = previousPeriod(period);
  const now = range(period);
  const [totals, previous, enabled, daily, modes, providers, people, departments, weekHours, tools, failures, dailyLimit, priceIn, priceOut] = await Promise.all([
    aiTotals(now),
    aiTotals(range(before)),
    aiEnabledPeople(),
    aiDaily(now),
    aiByMode(now),
    aiByProvider(now),
    aiByPerson(now),
    aiByDepartment(now),
    aiWeekHours(now),
    aiTools(now),
    aiFailureReasons(now),
    getSettingValue("ai.daily_questions_per_person").then((value) => Number(value) || 50),
    getSettingValue("ai.price_in_per_million").then((value) => (value ? Number(value) : null)),
    getSettingValue("ai.price_out_per_million").then((value) => (value ? Number(value) : null)),
  ]);
  const limitDays = await aiLimitDays(now, dailyLimit);
  const finished = totals.answers + totals.failures;
  const finishedBefore = previous.answers + previous.failures;
  const cost = costEstimate(totals.inputTokens, totals.outputTokens, priceIn, priceOut);
  const grain = grainFor(period);
  const keys = buckets(period, grain);
  const byBucket = new Map<string, { questions: number; failures: number }>();
  for (const day of daily) {
    const key = bucketKey(day.day, grain);
    const entry = byBucket.get(key) ?? { questions: 0, failures: 0 };
    entry.questions += day.questions;
    entry.failures += day.failures;
    byBucket.set(key, entry);
  }
  const heat: Record<string, Record<string, number>> = {};
  for (const cell of weekHours) (heat[WEEKDAYS[cell.weekday]!] ??= {})[String(cell.hour).padStart(2, "0")] = cell.questions;
  const hours = Array.from({ length: 24 }, (_, hour) => String(hour).padStart(2, "0"));

  return (
    <>
      <PageHeader
        title="AI Analytics"
        description="How Pico Bot is used: adoption, questions, answers, speed, tokens and cost, by chat, provider, department and person. Changes compare with the period just before. Cost is an estimate from the prices entered in AI settings."
        meta={`${period.label}: ${period.from} to ${period.to} · compared with ${before.from} to ${before.to}`}
      />

      <form method="get" className="card mb-6 flex flex-wrap items-end gap-3 px-4 py-3" data-testid="ai-analytics-period">
        <div>
          <label htmlFor="ai-period" className="field-label">
            Period
          </label>
          <select id="ai-period" name="period" defaultValue={period.key} className="field-input h-10 w-48">
            {PERIODS.map((key) => (
              <option key={key} value={key}>
                {PERIOD_LABEL[key]}
              </option>
            ))}
            <option value="custom">Custom dates</option>
          </select>
        </div>
        <div>
          <label htmlFor="ai-from" className="field-label">
            From
          </label>
          <input id="ai-from" type="date" name="from" defaultValue={period.key === "custom" ? period.from : ""} className="field-input h-10" />
        </div>
        <div>
          <label htmlFor="ai-to" className="field-label">
            To
          </label>
          <input id="ai-to" type="date" name="to" defaultValue={period.key === "custom" ? period.to : ""} className="field-input h-10" />
        </div>
        <button type="submit" className="btn-primary btn-compact w-auto">
          Apply
        </button>
      </form>

      <div className="mb-6 grid grid-cols-2 gap-3 md:grid-cols-4" data-testid="ai-kpis">
        <Tile label="Questions asked" value={compact(totals.questions)} delta={change(totals.questions, previous.questions)} hint="Questions people sent to Pico Bot in this period." />
        <Tile label="Active users" value={`${totals.askers}`} sub={`of ${enabled} with AI · ${percent(totals.askers, enabled) ?? 0}% adoption`} delta={change(totals.askers, previous.askers)} hint="People who asked at least one question, out of the active people who may use AI." />
        <Tile label="Answered" value={`${percent(totals.answers, finished) ?? 0}%`} sub={`${totals.answers} answered · ${totals.failures} failed`} delta={change(percent(totals.answers, finished), percent(previous.answers, finishedBefore))} hint="Share of questions Pico Bot answered; the rest failed (see Why answers failed)." />
        <Tile label="Average answer time" value={duration(totals.avgLatencyMs)} sub={`90% within ${duration(totals.p90LatencyMs)}`} delta={change(totals.avgLatencyMs, previous.avgLatencyMs)} lowerIsBetter hint="Time from the question to the answer, including data lookups." />
        <Tile label="Conversations" value={compact(totals.conversations)} sub={`${totals.askers ? (totals.questions / totals.askers).toFixed(1) : "0"} questions per active user`} delta={change(totals.conversations, previous.conversations)} hint="New chats started in this period." />
        <Tile label="Tokens used" value={compact(totals.inputTokens + totals.outputTokens)} sub={`${compact(totals.inputTokens)} in · ${compact(totals.outputTokens)} out`} delta={change(totals.inputTokens + totals.outputTokens, previous.inputTokens + previous.outputTokens)} hint="What the AI providers count and bill." />
        <Tile label="Estimated cost" value={cost === null ? "—" : `₹${cost.toLocaleString("en-IN")}`} sub={cost === null ? "Enter prices in AI settings" : "from the prices in AI settings"} hint="An estimate only; the provider's bill is the real figure." />
        <Tile label="Answers using company data" value={`${percent(totals.withData, totals.answers) ?? 0}%`} sub={`${totals.calculated} with figures Pico Bot calculated`} delta={change(percent(totals.withData, totals.answers), percent(previous.withData, previous.answers))} hint="Answers that read ARS or Salesforce data, rather than general answers." />
      </div>

      <div className="mb-6">
        <LineChart
          title="Questions and failures over time"
          help={`Per ${grain}, India time.`}
          labels={keys.map((key) => bucketLabel(key, grain))}
          series={[
            { key: "questions", label: "Questions", colorVar: "--color-primary-600", marker: "circle" },
            { key: "failures", label: "Failed answers", colorVar: "--color-error-600", dash: "2 4", marker: "diamond" },
          ]}
          values={{ questions: keys.map((key) => byBucket.get(key)?.questions ?? 0), failures: keys.map((key) => byBucket.get(key)?.failures ?? 0) }}
          empty="No questions in this period."
        />
      </div>

      <div className="mb-6 grid gap-6 lg:grid-cols-3">
        <BarList title="Questions by chat" rows={modes.map((row) => ({ label: MODE_NAME[row.mode] ?? row.mode, value: row.questions, note: `${row.people} ${row.people === 1 ? "person" : "people"}` }))} empty="No questions in this period." />
        <BarList title="Questions by department" rows={departments.map((row) => ({ label: row.department, value: row.questions, note: `${row.people} ${row.people === 1 ? "person" : "people"}` }))} empty="No questions in this period." />
        <BarList title="Data lookups used" rows={tools.map((row) => ({ label: toolLabel(row.tool), value: row.uses }))} empty="No answers used company data." />
      </div>

      <section className="card mb-6 overflow-x-auto" aria-labelledby="ai-providers-usage">
        <h2 id="ai-providers-usage" className="flex items-center gap-1.5 px-5 pt-4 font-semibold">
          Providers and models
          <Hint text="Each provider and model that answered: how many, how often it failed, how fast, and the tokens it used." align="start" />
        </h2>
        {providers.length === 0 ? (
          <p className="px-5 py-4 text-label text-ink-muted">No answers in this period.</p>
        ) : (
          <table className="data-table" data-testid="ai-analytics-providers">
            <thead>
              <tr>
                <th scope="col">Provider</th>
                <th scope="col">Model</th>
                <th scope="col">Answers</th>
                <th scope="col">Failed</th>
                <th scope="col">Failure rate</th>
                <th scope="col">Average time</th>
                <th scope="col">Tokens in / out</th>
                <th scope="col">Estimated cost</th>
              </tr>
            </thead>
            <tbody>
              {providers.map((row) => {
                const rowCost = costEstimate(row.inputTokens, row.outputTokens, priceIn, priceOut);
                return (
                  <tr key={`${row.provider}:${row.model}`}>
                    <td className="font-medium">{PROVIDER_LABEL[row.provider as keyof typeof PROVIDER_LABEL] ?? row.provider}</td>
                    <td className="text-label">{row.model}</td>
                    <td className="tabular-nums">{row.answers}</td>
                    <td className="tabular-nums">{row.failures}</td>
                    <td className="tabular-nums">{percent(row.failures, row.answers + row.failures) ?? 0}%</td>
                    <td className="tabular-nums">{duration(row.avgLatencyMs)}</td>
                    <td className="tabular-nums text-label">
                      {compact(row.inputTokens)} / {compact(row.outputTokens)}
                    </td>
                    <td className="tabular-nums">{rowCost === null ? "—" : `₹${rowCost.toLocaleString("en-IN")}`}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </section>

      <section className="card mb-6 overflow-x-auto" aria-labelledby="ai-people-usage">
        <h2 id="ai-people-usage" className="flex items-center gap-1.5 px-5 pt-4 font-semibold">
          Top users
          <Hint text="The 25 people who asked the most in this period." align="start" />
        </h2>
        {people.length === 0 ? (
          <p className="px-5 py-4 text-label text-ink-muted">No questions in this period.</p>
        ) : (
          <table className="data-table" data-testid="ai-analytics-people">
            <thead>
              <tr>
                <th scope="col">Person</th>
                <th scope="col">Department</th>
                <th scope="col">Questions</th>
                <th scope="col">Conversations</th>
                <th scope="col">Failed answers</th>
                <th scope="col">Tokens</th>
                <th scope="col">Last used</th>
              </tr>
            </thead>
            <tbody>
              {people.map((row) => (
                <tr key={row.userId}>
                  <td className="font-medium">
                    <Link href={`/admin/users/${row.userId}`} className="link">
                      {row.name}
                    </Link>
                  </td>
                  <td className="text-label">{row.department ?? "—"}</td>
                  <td className="tabular-nums">{row.questions}</td>
                  <td className="tabular-nums">{row.conversations}</td>
                  <td className="tabular-nums">{row.failures}</td>
                  <td className="tabular-nums">{compact(row.tokens)}</td>
                  <td className="text-label text-ink-muted">{row.lastAt ? formatIndiaTime(row.lastAt) : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      <div className="mb-6 grid gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <Heatmap title="When people ask" help="Questions by weekday and hour, India time." rows={WEEKDAYS.filter((day) => heat[day])} columns={hours} cells={heat} empty="No questions in this period." />
        </div>
        <div className="space-y-6">
          <BarList title="Why answers failed" rows={groupFailures(failures).map((row) => ({ label: row.reason, value: row.count }))} empty="No failed answers in this period." />
          <section className="card px-4 py-3" aria-labelledby="ai-limit">
            <h2 id="ai-limit" className="flex items-center gap-1.5 font-semibold">
              Daily limit
              <Hint text="Days on which someone used up their daily question limit. Raise the limit in AI settings if this is common." align="start" />
            </h2>
            <p className="mt-1 text-label">
              <strong className="tabular-nums">{limitDays.people}</strong> {limitDays.people === 1 ? "person" : "people"} reached the limit of {dailyLimit} questions, on <strong className="tabular-nums">{limitDays.personDays}</strong> {limitDays.personDays === 1 ? "day" : "days"}.
            </p>
          </section>
        </div>
      </div>
    </>
  );
}

function Tile({ label, value, sub, delta, hint, lowerIsBetter = false }: { label: string; value: string; sub?: string; delta?: string | null; hint: string; lowerIsBetter?: boolean }) {
  const rising = delta?.startsWith("+");
  const falling = delta?.startsWith("−");
  const good = (rising && !lowerIsBetter) || (falling && lowerIsBetter);
  const bad = (falling && !lowerIsBetter) || (rising && lowerIsBetter);
  return (
    <div className="card px-4 py-3">
      <p className="flex items-center gap-1 text-label text-ink-muted">
        {label}
        <Hint text={hint} align="start" />
      </p>
      <p className="mt-1 text-[1.5rem] font-semibold leading-tight tabular-nums text-ink">{value}</p>
      {sub && <p className="mt-0.5 text-caption text-ink-muted">{sub}</p>}
      {delta && delta !== "same" && (
        <p className={`mt-1 text-caption font-medium ${good ? "text-success-600" : bad ? "text-danger-600" : "text-ink-muted"}`}>
          {rising ? "▲" : falling ? "▼" : ""} {delta} vs previous period
        </p>
      )}
    </div>
  );
}
