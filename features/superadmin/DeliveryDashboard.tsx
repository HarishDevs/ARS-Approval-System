import Link from "next/link";
import { BarList, Heatmap, LineChart, StackedBar } from "@/features/analytics/Charts";
import { DELIVERY_STATUSES, type DeliveryFilter, type DeliverySummary } from "@/lib/db/repositories/notifications.repository";

// v1.54.16 (owner: "a dashboard for message deliveries"): how many messages,
// by channel, provider and status, over a period; daily volume; why sends
// failed; which events send the most. An email "SENT" is shown as Accepted:
// the mail server took it (delivery to the inbox can't be seen from here).
const CHANNEL_LABEL: Record<string, string> = { EMAIL: "Email", WHATSAPP: "WhatsApp" };
const STATUS_LABEL: Record<string, string> = { SENT: "Sent / accepted", DELIVERED: "Delivered", READ: "Read", FAILED: "Failed", SKIPPED: "Skipped", QUEUED: "Queued" };
const STATUS_COLOR: Record<string, string> = { SENT: "--color-primary-600", DELIVERED: "--color-success-600", READ: "--color-success-600", FAILED: "--color-error-600", SKIPPED: "--color-warning-600", QUEUED: "--color-text-secondary" };
const PERIOD_LABEL: Record<number, string> = { 1: "Last 24 hours", 7: "Last 7 days", 30: "Last 30 days", 90: "Last 90 days" };

export function DeliveryDashboard({ summary, filter, path }: { summary: DeliverySummary; filter: DeliveryFilter; path: string }) {
  const href = (change: Partial<Record<"days" | "channel" | "status" | "provider", string | number | null>>) => {
    const next = { days: filter.days, channel: filter.channel, status: filter.status, provider: filter.provider, ...change };
    const query = new URLSearchParams(Object.entries(next).filter(([, value]) => value !== null && value !== undefined && value !== "").map(([key, value]) => [key, String(value)]));
    return `${path}?${query.toString()}`;
  };
  const total = summary.byChannelStatus.reduce((sum, row) => sum + row.n, 0);
  const sum = (test: (row: DeliverySummary["byChannelStatus"][number]) => boolean) => summary.byChannelStatus.filter(test).reduce((value, row) => value + row.n, 0);
  const tiles = [
    { label: "All messages", value: total, note: PERIOD_LABEL[filter.days], href: href({ status: null, channel: null }) },
    { label: "Email accepted", value: sum((row) => row.channel === "EMAIL" && row.status === "SENT"), note: "taken by the mail server", href: href({ channel: "EMAIL", status: "SENT" }) },
    { label: "WhatsApp sent", value: sum((row) => row.channel === "WHATSAPP" && ["SENT", "DELIVERED", "READ"].includes(row.status)), note: `${sum((row) => row.channel === "WHATSAPP" && ["DELIVERED", "READ"].includes(row.status)).toLocaleString("en-IN")} delivered or read`, href: href({ channel: "WHATSAPP", status: null }) },
    { label: "Failed", value: sum((row) => row.status === "FAILED"), note: `${summary.retryPending.toLocaleString("en-IN")} waiting for a retry`, href: href({ status: "FAILED" }), tone: "text-danger-600" },
    { label: "Skipped", value: sum((row) => row.status === "SKIPPED"), note: "not sent on purpose", href: href({ status: "SKIPPED" }), tone: "text-warning-600" },
  ];

  // Daily volume per channel (India days), every day of the period shown.
  const days: string[] = [];
  const today = new Date(Date.now() + 330 * 60_000);
  for (let index = Math.min(filter.days, 90) - 1; index >= 0; index -= 1) days.push(new Date(today.getTime() - index * 86_400_000).toISOString().slice(0, 10));
  const volume = (channel: string) => days.map((day) => summary.daily.filter((row) => row.day === day && row.channel === channel).reduce((value, row) => value + row.n, 0));
  const dayLabel = (day: string) => new Date(`${day}T00:00:00Z`).toLocaleDateString("en-IN", { day: "numeric", month: "short", timeZone: "UTC" });

  // Channel · provider × status.
  const rowKey = (row: { channel: string; provider: string }) => `${CHANNEL_LABEL[row.channel] ?? row.channel} · ${row.provider}`;
  const rows = [...new Set(summary.byChannelStatus.map(rowKey))].sort();
  const columns = DELIVERY_STATUSES.filter((status) => summary.byChannelStatus.some((row) => row.status === status)).map((status) => STATUS_LABEL[status] ?? status);
  const cells: Record<string, Record<string, number>> = {};
  for (const row of summary.byChannelStatus) {
    const key = rowKey(row);
    const column = STATUS_LABEL[row.status] ?? row.status;
    cells[key] = { ...(cells[key] ?? {}), [column]: (cells[key]?.[column] ?? 0) + row.n };
  }
  const statusOf = (label: string) => DELIVERY_STATUSES.find((status) => STATUS_LABEL[status] === label) ?? null;
  const channelOf = (label: string) => (label.startsWith("Email") ? "EMAIL" : label.startsWith("WhatsApp") ? "WHATSAPP" : null);

  const select = "field-input h-9 py-0 text-label";
  return (
    <section aria-label="Delivery dashboard" className="mb-6 space-y-4" data-testid="delivery-dashboard">
      <form method="get" action={path} className="card flex flex-wrap items-end gap-3 px-4 py-3" aria-label="Delivery filters">
        <div>
          <label htmlFor="dd-days" className="field-label">
            Period
          </label>
          <select id="dd-days" name="days" defaultValue={String(filter.days)} className={select}>
            {Object.entries(PERIOD_LABEL).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="dd-channel" className="field-label">
            Channel
          </label>
          <select id="dd-channel" name="channel" defaultValue={filter.channel ?? ""} className={select}>
            <option value="">All channels</option>
            <option value="EMAIL">Email</option>
            <option value="WHATSAPP">WhatsApp</option>
          </select>
        </div>
        <div>
          <label htmlFor="dd-status" className="field-label">
            Status
          </label>
          <select id="dd-status" name="status" defaultValue={filter.status ?? ""} className={select}>
            <option value="">All statuses</option>
            {DELIVERY_STATUSES.map((status) => (
              <option key={status} value={status}>
                {STATUS_LABEL[status]}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="dd-provider" className="field-label">
            Provider
          </label>
          <select id="dd-provider" name="provider" defaultValue={filter.provider ?? ""} className={select}>
            <option value="">All providers</option>
            {summary.providers.map((provider) => (
              <option key={provider} value={provider}>
                {provider}
              </option>
            ))}
          </select>
        </div>
        <button type="submit" className="btn-primary btn-compact">
          Apply
        </button>
        {(filter.channel || filter.status || filter.provider || filter.days !== 7) && (
          <Link href={path} className="link text-label">
            Clear
          </Link>
        )}
      </form>

      <ul className="grid grid-cols-2 gap-3 md:grid-cols-5" aria-label="Totals">
        {tiles.map((tile) => (
          <li key={tile.label}>
            <Link href={tile.href} className="card block h-full px-4 py-3 hover:border-line-strong">
              <p className="text-label text-ink-muted">{tile.label}</p>
              <p className={`text-title font-semibold tabular-nums ${tile.tone ?? ""}`}>{tile.value.toLocaleString("en-IN")}</p>
              <p className="text-caption text-ink-muted">{tile.note}</p>
            </Link>
          </li>
        ))}
      </ul>

      <div className="grid gap-4 lg:grid-cols-2">
        <LineChart
          title="Messages per day"
          help="Every email and WhatsApp send in the period, by India day."
          labels={days.map(dayLabel)}
          series={[
            { key: "EMAIL", label: "Email", colorVar: "--color-primary-600", marker: "circle" },
            { key: "WHATSAPP", label: "WhatsApp", colorVar: "--color-success-600", dash: "6 4", marker: "square" },
          ]}
          values={{ EMAIL: volume("EMAIL"), WHATSAPP: volume("WHATSAPP") }}
          empty="No messages in this period."
        />
        <StackedBar
          title="By status"
          help="Email shows Sent / accepted when the mail server took it; WhatsApp reports Delivered and Read from the provider."
          parts={DELIVERY_STATUSES.map((status) => ({ key: status, label: STATUS_LABEL[status]!, value: sum((row) => row.status === status), colorVar: STATUS_COLOR[status]!, pattern: status === "SKIPPED", href: href({ status }) })).filter((part) => part.value > 0)}
        />
      </div>

      <Heatmap
        title="Channel and provider by status"
        help="Number of messages for each channel and provider, by status. Open a number to filter the list below."
        rows={rows}
        columns={columns}
        cells={cells}
        cellHref={(row, column) => href({ channel: channelOf(row), provider: row.split(" · ")[1] ?? null, status: statusOf(column) })}
        empty="No messages in this period."
        rowHeader="Channel · provider"
      />

      <div className="grid gap-4 lg:grid-cols-2">
        <BarList title="Why messages failed or were skipped" rows={summary.failures.map((row) => ({ label: `${CHANNEL_LABEL[row.channel] ?? row.channel}: ${row.code}`, value: row.n }))} empty="Nothing failed or was skipped in this period." />
        <BarList title="Events that sent the most" rows={summary.events.map((row) => ({ label: row.eventType, value: row.n }))} empty="No messages in this period." />
      </div>
    </section>
  );
}
