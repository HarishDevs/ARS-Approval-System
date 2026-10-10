import Link from "next/link";
import { notFound } from "next/navigation";
import { featureOn } from "@/server/settings/features";
import { requireArea } from "@/server/authorization/guards";
import type { AnalyticsBase } from "@/features/analytics/AnalyticsScreen";
import { PageHeader } from "@/features/shell/PageHeader";
import { METRICS } from "@/server/analytics/metrics";
import { AGING_BUCKETS, APPROACHING_SHARE } from "@/server/analytics/semantics";

// The metric dictionary in the app (Addendum A): what each number means.
export async function MetricsScreen({ base }: { base: AnalyticsBase }) {
  const { user } = await requireArea("users");
  if (!(await featureOn("analytics", user))) notFound();
  return (
    <>
      <PageHeader title="How the numbers are worked out" description="Every figure on Analytics and in reports follows these definitions. Times are India time; deleted requests are never counted.">
        <Link href={base} className="link text-label">
          ← Analytics
        </Link>
      </PageHeader>
      <section className="card mb-6 space-y-2 px-5 py-4 text-label" aria-label="Key rules">
        <h2 className="font-semibold">Key rules</h2>
        <p>
          <strong>Pending is not overdue.</strong> A task is overdue only when its step has a response time and the due time has passed. Response times are in working hours and pause while a request is on hold.
        </p>
        <p>
          <strong>Requests and tasks are counted apart.</strong> One request can have several outstanding tasks (parallel steps); the two are never added up as one number.
        </p>
        <p>
          <strong>Approaching</strong> means {Math.round(APPROACHING_SHARE * 100)}% of the response time is used (the existing due-soon rule).
        </p>
        <p>
          <strong>Age buckets</strong> ({AGING_BUCKETS.map((bucket) => bucket.label).join(", ")}) use calendar time. Age since raised and time at the current step are shown separately.
        </p>
        <p>
          <strong>Periods:</strong> raised by the submission date, approved/rejected/withdrawn by the closing date, decisions by the decision date. The comparison is the equally long period just before.
        </p>
      </section>
      <div className="card overflow-x-auto">
        <table className="data-table">
          <caption className="sr-only">Metric dictionary</caption>
          <thead>
            <tr>
              <th scope="col">Metric</th>
              <th scope="col">Meaning and formula</th>
              <th scope="col">Included</th>
              <th scope="col">Left out</th>
              <th scope="col">When</th>
            </tr>
          </thead>
          <tbody>
            {METRICS.map((metric) => (
              <tr key={metric.key} id={metric.key}>
                <th scope="row" className="min-w-40 align-top font-semibold">
                  {metric.name}
                </th>
                <td className="min-w-64 align-top text-label">
                  {metric.meaning}
                  <span className="mt-1 block font-mono text-caption text-ink-muted">{metric.formula}</span>
                </td>
                <td className="min-w-48 align-top text-label">{metric.includes}</td>
                <td className="min-w-48 align-top text-label">{metric.excludes}</td>
                <td className="align-top text-label">{metric.timing === "Now" ? "Right now" : "In the period"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
