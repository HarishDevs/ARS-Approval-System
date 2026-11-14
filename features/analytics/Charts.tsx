import Link from "next/link";
import { ArrowDownRight, ArrowUpRight, Info, Minus } from "lucide-react";
import { percentChange } from "@/server/analytics/semantics";
import { METRIC } from "@/server/analytics/metrics";
import { heatStep } from "@/server/analytics/derived";
import { Hint } from "@/features/ui/Hint";

// Analytics building blocks (Addendum A, D-122). Server components, plain
// SVG/HTML, theme tokens only. Identity is never colour alone: lines differ
// by dash and marker, bars carry their numbers, every chart has a table.
const fmt = (value: number | null, unit: "count" | "percent" | "hours") =>
  value === null
    ? "—"
    : unit === "percent"
      ? `${value.toLocaleString("en-IN", { maximumFractionDigits: 1 })}%`
      : unit === "hours"
        ? hoursText(value)
        : value.toLocaleString("en-IN");

export function hoursText(hours: number | null): string {
  if (hours === null) return "—";
  if (hours < 1) return `${Math.round(hours * 60)} min`;
  if (hours < 48)
    return `${hours.toLocaleString("en-IN", { maximumFractionDigits: 1 })} h`;
  return `${(hours / 24).toLocaleString("en-IN", { maximumFractionDigits: 1 })} days`;
}

// For metrics where a rise is bad (time taken, overdue), the arrow colour flips.
export function KpiCard({
  metric,
  value,
  previous,
  lowerIsBetter = false,
  href,
  note,
  compareLabel = "previous period",
}: {
  metric: string;
  value: number | null;
  previous?: number | null;
  lowerIsBetter?: boolean;
  href?: string;
  note?: string;
  compareLabel?: string; // B04: what the change is against
}) {
  const definition = METRIC[metric];
  const unit = definition?.unit ?? "count";
  const change =
    previous === undefined || previous === null || value === null
      ? null
      : percentChange(value, previous);
  const good =
    change === null || change === 0
      ? null
      : lowerIsBetter
        ? change < 0
        : change > 0;
  const body = (
    <>
      <p className="flex items-start justify-between gap-2 text-label text-ink-muted">
        <span>{definition?.name ?? metric}</span>
        {definition && (
          <span
            title={`${definition.meaning} ${definition.formula}.`}
            className="shrink-0"
          >
            <Info aria-hidden="true" className="h-3.5 w-3.5" />
            <span className="sr-only">{definition.meaning}</span>
          </span>
        )}
      </p>
      <p className="mt-1 text-2xl font-semibold tabular-nums">
        {fmt(value, unit)}
      </p>
      {previous !== undefined && (
        <p className="mt-1 flex items-center gap-1 text-caption text-ink-muted">
          {change === null ? (
            <>
              <Minus aria-hidden="true" className="h-3.5 w-3.5" />
              No earlier figure to compare
            </>
          ) : (
            <>
              {change > 0 ? (
                <ArrowUpRight
                  aria-hidden="true"
                  className={`h-3.5 w-3.5 ${good ? "text-success-600" : "text-danger-600"}`}
                />
              ) : change < 0 ? (
                <ArrowDownRight
                  aria-hidden="true"
                  className={`h-3.5 w-3.5 ${good ? "text-success-600" : "text-danger-600"}`}
                />
              ) : (
                <Minus aria-hidden="true" className="h-3.5 w-3.5" />
              )}
              <span>
                {change > 0 ? "+" : ""}
                {change.toLocaleString("en-IN")}% vs {compareLabel} (
                {fmt(previous ?? null, unit)})
              </span>
            </>
          )}
        </p>
      )}
      {note && <p className="mt-1 text-caption text-ink-muted">{note}</p>}
    </>
  );
  return href ? (
    <Link href={href} className="card block px-4 py-3 hover:border-primary-600">
      {body}
    </Link>
  ) : (
    <div className="card px-4 py-3">{body}</div>
  );
}

export interface Series {
  key: string;
  label: string;
  colorVar: string; // CSS colour token
  dash?: string;
  marker: "circle" | "square" | "diamond";
}

function Marker({
  x,
  y,
  shape,
  color,
  label,
}: {
  x: number;
  y: number;
  shape: Series["marker"];
  color: string;
  label: string;
}) {
  const common = {
    fill: "var(--color-surface-raised)",
    stroke: color,
    strokeWidth: 2,
  };
  return (
    <g>
      <title>{label}</title>
      {shape === "circle" ? (
        <circle cx={x} cy={y} r={4} {...common} />
      ) : shape === "square" ? (
        <rect x={x - 4} y={y - 4} width={8} height={8} {...common} />
      ) : (
        <path
          d={`M ${x} ${y - 5} L ${x + 5} ${y} L ${x} ${y + 5} L ${x - 5} ${y} Z`}
          {...common}
        />
      )}
      <circle cx={x} cy={y} r={10} fill="transparent" />
    </g>
  );
}

// Multi-series line chart over time buckets. One y-axis only.
export function LineChart({
  title,
  labels,
  series,
  values,
  help,
  empty = "Nothing raised or decided in this period.",
}: {
  title: string;
  labels: string[];
  series: Series[];
  values: Record<string, number[]>;
  help?: string;
  empty?: string;
}) {
  const width = 720;
  const height = 240;
  const pad = { top: 16, right: 16, bottom: 32, left: 40 };
  const max = Math.max(1, ...series.flatMap((item) => values[item.key] ?? []));
  const niceMax = max <= 5 ? max : Math.ceil(max / 5) * 5;
  const x = (index: number) =>
    pad.left +
    (labels.length <= 1
      ? 0
      : (index / (labels.length - 1)) * (width - pad.left - pad.right));
  const y = (value: number) =>
    pad.top + (1 - value / niceMax) * (height - pad.top - pad.bottom);
  const ticks = [0, 0.25, 0.5, 0.75, 1].map((share) =>
    Math.round(niceMax * share),
  );
  const every = Math.max(1, Math.ceil(labels.length / 8));
  return (
    <figure className="card px-4 py-3">
      <figcaption className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <span className="flex items-center gap-1.5 font-semibold">
          {title}
          <Hint text={help} align="start" />
        </span>
        <span
          className="flex flex-wrap gap-3 text-caption text-ink-muted"
          aria-hidden="true"
        >
          {series.map((item) => (
            <span key={item.key} className="inline-flex items-center gap-1.5">
              <svg width="22" height="10">
                <line
                  x1="0"
                  y1="5"
                  x2="22"
                  y2="5"
                  stroke={`var(${item.colorVar})`}
                  strokeWidth="2"
                  strokeDasharray={item.dash}
                />
              </svg>
              {item.label}
            </span>
          ))}
        </span>
      </figcaption>
      {series.every((item) =>
        (values[item.key] ?? []).every((value) => value === 0),
      ) ? (
        <p className="py-6 text-center text-label text-ink-muted">
          {empty}
        </p>
      ) : (
        <svg
          viewBox={`0 0 ${width} ${height}`}
          className="h-auto w-full"
          role="img"
          aria-label={`${title}. Table below.`}
        >
          {[...new Set(ticks)].map((tick) => (
            <g key={tick}>
              <line
                x1={pad.left}
                x2={width - pad.right}
                y1={y(tick)}
                y2={y(tick)}
                stroke="var(--color-border-default)"
                strokeWidth="1"
              />
              <text
                x={pad.left - 6}
                y={y(tick) + 4}
                textAnchor="end"
                fontSize="11"
                fill="var(--color-text-secondary)"
              >
                {tick}
              </text>
            </g>
          ))}
          {labels.map((label, index) =>
            index % every === 0 || index === labels.length - 1 ? (
              <text
                key={label + index}
                x={x(index)}
                y={height - 10}
                textAnchor="middle"
                fontSize="11"
                fill="var(--color-text-secondary)"
              >
                {label}
              </text>
            ) : null,
          )}
          {series.map((item) => {
            const points = (values[item.key] ?? [])
              .map((value, index) => `${x(index)},${y(value)}`)
              .join(" ");
            return (
              <polyline
                key={item.key}
                points={points}
                fill="none"
                stroke={`var(${item.colorVar})`}
                strokeWidth="2"
                strokeDasharray={item.dash}
                strokeLinejoin="round"
              />
            );
          })}
          {series.map((item) =>
            (values[item.key] ?? []).map((value, index) =>
              labels.length <= 31 || value > 0 ? (
                <Marker
                  key={`${item.key}-${index}`}
                  x={x(index)}
                  y={y(value)}
                  shape={item.marker}
                  color={`var(${item.colorVar})`}
                  label={`${labels[index]}: ${item.label} ${value}`}
                />
              ) : null,
            ),
          )}
        </svg>
      )}
      <details className="mt-2 text-label">
        <summary className="cursor-pointer text-primary-600">
          Show as a table
        </summary>
        <div className="mt-2 overflow-x-auto">
          <table className="data-table">
            <caption className="sr-only">{title}</caption>
            <thead>
              <tr>
                <th scope="col">Period</th>
                {series.map((item) => (
                  <th key={item.key} scope="col" className="text-right">
                    {item.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {labels.map((label, index) => (
                <tr key={label + index}>
                  <th scope="row" className="font-normal">
                    {label}
                  </th>
                  {series.map((item) => (
                    <td key={item.key} className="text-right tabular-nums">
                      {values[item.key]?.[index] ?? 0}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
    </figure>
  );
}

// Labelled horizontal bars (magnitude). Numbers are always printed.
export function BarList({
  title,
  rows,
  unit = "count",
  empty = "Nothing to show for this period.",
}: {
  title: string;
  rows: { label: string; value: number | null; href?: string; note?: string }[];
  unit?: "count" | "percent" | "hours";
  empty?: string;
}) {
  const max = Math.max(1, ...rows.map((row) => row.value ?? 0));
  return (
    <section aria-label={title} className="card px-4 py-3">
      <h2 className="mb-2 font-semibold">{title}</h2>
      {rows.length === 0 ? (
        <p className="text-label text-ink-muted">{empty}</p>
      ) : (
        <ul className="space-y-2">
          {rows.map((row) => (
            <li key={row.label} className="text-label">
              <div className="flex items-baseline justify-between gap-3">
                {row.href ? (
                  <Link href={row.href} className="link min-w-0 truncate">
                    {row.label}
                  </Link>
                ) : (
                  <span className="min-w-0 truncate">{row.label}</span>
                )}
                <span className="shrink-0 tabular-nums font-medium">
                  {fmt(row.value, unit)}
                </span>
              </div>
              <div
                className="mt-1 h-2 rounded-full bg-surface-muted"
                aria-hidden="true"
              >
                <div
                  className="h-2 rounded-full bg-primary-solid"
                  style={{ width: `${((row.value ?? 0) / max) * 100}%` }}
                />
              </div>
              {row.note && (
                <p className="mt-0.5 text-caption text-ink-muted">{row.note}</p>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

// One bar split into parts (a distribution). The legend carries the numbers.
export function StackedBar({
  title,
  parts,
  help,
}: {
  title: string;
  parts: {
    key: string;
    label: string;
    value: number;
    colorVar: string;
    pattern?: boolean;
    href?: string; // B01: open the requests behind this part
  }[];
  help?: string;
}) {
  const total = parts.reduce((sum, part) => sum + part.value, 0);
  return (
    <section aria-label={title} className="card px-4 py-3">
      <h2 className="flex items-center gap-1.5 font-semibold">
        {title}
        <Hint text={help} align="start" />
      </h2>
      {total === 0 ? (
        <p className="mt-2 text-label text-ink-muted">None right now.</p>
      ) : (
        <>
          <div
            className="mt-3 flex h-4 overflow-hidden rounded-full bg-surface-muted"
            aria-hidden="true"
          >
            {parts
              .filter((part) => part.value > 0)
              .map((part) => (
                <div
                  key={part.key}
                  title={`${part.label}: ${part.value}`}
                  className="h-4 border-r-2 border-[color:var(--color-surface-raised)] last:border-r-0"
                  style={{
                    width: `${(part.value / total) * 100}%`,
                    background: part.pattern
                      ? `repeating-linear-gradient(45deg, var(${part.colorVar}) 0 4px, transparent 4px 7px)`
                      : `var(${part.colorVar})`,
                  }}
                />
              ))}
          </div>
          <ul className="mt-3 grid gap-1.5 text-label sm:grid-cols-2">
            {parts.map((part) => (
              <li
                key={part.key}
                className="flex items-center justify-between gap-2"
              >
                <span className="inline-flex items-center gap-2">
                  <span
                    aria-hidden="true"
                    className="inline-block h-3 w-3 rounded-sm"
                    style={{
                      background: part.pattern
                        ? `repeating-linear-gradient(45deg, var(${part.colorVar}) 0 3px, transparent 3px 5px)`
                        : `var(${part.colorVar})`,
                    }}
                  />
                  {part.href && part.value > 0 ? (
                    <Link href={part.href} className="link">
                      {part.label}
                    </Link>
                  ) : (
                    part.label
                  )}
                </span>
                <span className="tabular-nums font-medium">
                  {part.value.toLocaleString("en-IN")}
                  <span className="ml-1 text-caption font-normal text-ink-muted">
                    ({Math.round((part.value / total) * 100)}%)
                  </span>
                </span>
              </li>
            ))}
          </ul>
        </>
      )}
    </section>
  );
}

// v1.7.0 (B05): a grid of counts, shaded by size in one hue (five steps).
// Every cell prints its number, so the shade is never the only cue.
const HEAT_MIX = [0, 12, 28, 46, 66, 86];

export function Heatmap({ title, help, rows, columns, cells, cellHref, empty = "Nothing is waiting right now.", rowHeader = "Department" }: { title: string; help?: string; rows: string[]; columns: string[]; cells: Record<string, Record<string, number>>; cellHref?: (row: string, column: string) => string; empty?: string; rowHeader?: string }) {
  const max = Math.max(0, ...rows.flatMap((row) => columns.map((column) => cells[row]?.[column] ?? 0)));
  return (
    <section aria-label={title} className="card px-4 py-3">
      <h2 className="flex items-center gap-1.5 font-semibold">
        {title}
        <Hint text={help} align="start" />
      </h2>
      {rows.length === 0 || columns.length === 0 ? (
        <p className="mt-2 text-label text-ink-muted">{empty}</p>
      ) : (
        <div className="mt-3 overflow-x-auto">
          <table className="w-full border-separate text-caption" style={{ borderSpacing: 2 }}>
            <caption className="sr-only">{title}</caption>
            <thead>
              <tr>
                <th scope="col" className="px-2 py-1 text-left font-semibold text-ink-muted">
                  {rowHeader}
                </th>
                {columns.map((column) => (
                  <th key={column} scope="col" className="max-w-28 truncate px-2 py-1 text-left font-semibold text-ink-muted" title={column}>
                    {column}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row}>
                  <th scope="row" className="whitespace-nowrap px-2 py-1 text-left font-normal">
                    {row}
                  </th>
                  {columns.map((column) => {
                    const value = cells[row]?.[column] ?? 0;
                    const step = heatStep(value, max);
                    const style = step ? { background: `color-mix(in srgb, var(--color-primary-600) ${HEAT_MIX[step]}%, transparent)` } : undefined;
                    const text = step >= 4 ? "text-on-solid font-semibold" : "text-ink";
                    return (
                      <td key={column} className={`min-w-12 rounded px-2 py-1.5 text-right tabular-nums ${step ? text : "text-ink-faint"}`} style={style} title={`${row} · ${column}: ${value}`}>
                        {value > 0 && cellHref ? (
                          <Link href={cellHref(row, column)} className="underline-offset-2 hover:underline">
                            {value}
                          </Link>
                        ) : (
                          value || "·"
                        )}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
