import { Fragment, type ReactNode } from "react";

// D-178: Pic bot answers as a business analyst. The model writes Markdown,
// plus two fenced blocks for visuals:
//   ```metrics  [{"label":"Open","value":12,"change":"+3 this week","note":"…"}]
//   ```chart    {"type":"bar"|"line","title":"…","labels":[…],"values":[…],"unit":"…"}
// This renders that into React elements (never raw HTML), so an answer can't
// inject markup. Anything malformed falls back to plain text.

type Block =
  | { kind: "heading"; level: number; text: string }
  | { kind: "paragraph"; lines: string[] }
  | { kind: "list"; ordered: boolean; items: string[] }
  | { kind: "table"; header: string[]; rows: string[][] }
  | { kind: "quote"; text: string }
  | { kind: "fence"; lang: string; body: string };

const BULLET = /^\s*[-*•]\s+(.*)$/;
const NUMBERED = /^\s*\d{1,3}[.)]\s+(.*)$/;
const TABLE_RULE = /^\s*\|?\s*:?-{2,}:?\s*(\|\s*:?-{2,}:?\s*)*\|?\s*$/;

const cells = (line: string) =>
  line
    .trim()
    .replace(/^\|/, "")
    .replace(/\|$/, "")
    .split("|")
    .map((cell) => cell.trim());

export function parseBlocks(text: string): Block[] {
  const lines = text.replace(/\r\n?/g, "\n").split("\n");
  const blocks: Block[] = [];
  let index = 0;
  while (index < lines.length) {
    const line = lines[index]!;
    const fence = /^\s*```\s*([\w-]*)\s*$/.exec(line);
    if (fence) {
      const body: string[] = [];
      index += 1;
      while (index < lines.length && !/^\s*```\s*$/.test(lines[index]!)) body.push(lines[index++]!);
      index += 1;
      blocks.push({ kind: "fence", lang: (fence[1] ?? "").toLowerCase(), body: body.join("\n") });
      continue;
    }
    if (!line.trim()) {
      index += 1;
      continue;
    }
    const heading = /^\s*(#{1,4})\s+(.*)$/.exec(line);
    if (heading) {
      blocks.push({ kind: "heading", level: heading[1]!.length, text: heading[2]!.trim() });
      index += 1;
      continue;
    }
    if (line.includes("|") && index + 1 < lines.length && TABLE_RULE.test(lines[index + 1]!)) {
      const header = cells(line);
      const rows: string[][] = [];
      index += 2;
      while (index < lines.length && lines[index]!.includes("|") && lines[index]!.trim()) rows.push(cells(lines[index++]!));
      blocks.push({ kind: "table", header, rows });
      continue;
    }
    if (BULLET.test(line) || NUMBERED.test(line)) {
      const ordered = !BULLET.test(line);
      const pattern = ordered ? NUMBERED : BULLET;
      const items: string[] = [];
      while (index < lines.length && pattern.test(lines[index]!)) items.push(pattern.exec(lines[index++]!)![1]!);
      blocks.push({ kind: "list", ordered, items });
      continue;
    }
    if (/^\s*>\s?/.test(line)) {
      const quoted: string[] = [];
      while (index < lines.length && /^\s*>\s?/.test(lines[index]!)) quoted.push(lines[index++]!.replace(/^\s*>\s?/, ""));
      blocks.push({ kind: "quote", text: quoted.join(" ") });
      continue;
    }
    const paragraph: string[] = [];
    while (index < lines.length && lines[index]!.trim() && !/^\s*(```|#{1,4}\s|>)/.test(lines[index]!) && !BULLET.test(lines[index]!) && !NUMBERED.test(lines[index]!)) paragraph.push(lines[index++]!.trim());
    if (paragraph.length) blocks.push({ kind: "paragraph", lines: paragraph });
    else index += 1;
  }
  return blocks;
}

// **bold**, *italic* / _italic_, `code`. Underscores inside words (IDs like
// PB_A_1, field names) stay as they are.
export function Inline({ text }: { text: string }) {
  const parts = text.split(/(\*\*[^*]+\*\*|(?<!\w)__[^_]+__(?!\w)|`[^`]+`|\*[^*\s][^*]*\*|(?<!\w)_[^_\s][^_]*_(?!\w))/g).filter(Boolean);
  return (
    <>
      {parts.map((part, index) => {
        if (/^(\*\*|__)[\s\S]+(\*\*|__)$/.test(part)) return <strong key={index} className="font-semibold text-ink">{part.slice(2, -2)}</strong>;
        if (/^`[\s\S]+`$/.test(part)) return <code key={index} className="rounded bg-surface-muted px-1 text-[0.9em]">{part.slice(1, -1)}</code>;
        if (/^[*_][\s\S]+[*_]$/.test(part)) return <em key={index}>{part.slice(1, -1)}</em>;
        return <Fragment key={index}>{part}</Fragment>;
      })}
    </>
  );
}

type Metric = { label: string; value: string; change?: string; note?: string };

function toMetrics(body: string): Metric[] | null {
  try {
    const raw = JSON.parse(body) as unknown;
    const list = Array.isArray(raw) ? raw : Array.isArray((raw as { items?: unknown })?.items) ? (raw as { items: unknown[] }).items : null;
    if (!list) return null;
    const metrics = list
      .slice(0, 8)
      .map((item) => item as Record<string, unknown>)
      .filter((item) => item && typeof item.label === "string" && (typeof item.value === "string" || typeof item.value === "number"))
      .map((item) => ({ label: String(item.label), value: formatValue(item.value as string | number), change: typeof item.change === "string" ? item.change : undefined, note: typeof item.note === "string" ? item.note : undefined }));
    return metrics.length ? metrics : null;
  } catch {
    return null;
  }
}

type Chart = { type: "bar" | "line"; title: string; labels: string[]; values: number[]; unit: string };

function toCharts(body: string): Chart[] | null {
  try {
    const raw = JSON.parse(body) as Record<string, unknown>;
    const type = raw.type === "line" ? "line" : "bar";
    const labels = Array.isArray(raw.labels) ? raw.labels.map(String).slice(0, 30) : [];
    const unit = typeof raw.unit === "string" ? raw.unit : "";
    const title = typeof raw.title === "string" ? raw.title : "";
    const numbers = (values: unknown) => (Array.isArray(values) ? values.slice(0, labels.length).map((value) => Number(value)) : []);
    // Several series become small multiples: one chart each, same scale rules.
    const series = Array.isArray(raw.series) ? (raw.series as { name?: unknown; values?: unknown }[]).slice(0, 4).map((item) => ({ title: `${title}${title && item.name ? " · " : ""}${String(item.name ?? "")}`, values: numbers(item.values) })) : [{ title, values: numbers(raw.values) }];
    const charts = series.filter((item) => labels.length > 0 && item.values.length === labels.length && item.values.every(Number.isFinite)).map((item) => ({ type, title: item.title, labels, values: item.values, unit }) as Chart);
    return charts.length ? charts : null;
  } catch {
    return null;
  }
}

const formatValue = (value: string | number) => (typeof value === "number" ? value.toLocaleString("en-IN", { maximumFractionDigits: 2 }) : value);
const withUnit = (value: number, unit: string) => `${formatValue(value)}${unit ? ` ${unit}` : ""}`;

function MetricCards({ metrics }: { metrics: Metric[] }) {
  return (
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-3" data-testid="ai-metrics">
      {metrics.map((metric, index) => (
        <div key={index} className="rounded-lg border border-line bg-surface px-3 py-2.5" title={metric.note}>
          <p className="truncate text-caption text-ink-muted">{metric.label}</p>
          <p className="text-[1.375rem] font-semibold leading-tight text-ink">{metric.value}</p>
          {metric.change && <p className="mt-0.5 truncate text-caption text-ink-muted">{metric.change}</p>}
        </div>
      ))}
    </div>
  );
}

function BarChart({ chart }: { chart: Chart }) {
  const max = Math.max(...chart.values.map((value) => Math.abs(value)), 1);
  return (
    <figure className="rounded-lg border border-line bg-surface px-3 py-3" data-testid="ai-chart">
      {chart.title && <figcaption className="mb-2 text-label font-medium text-ink">{chart.title}</figcaption>}
      <ul className="space-y-1.5">
        {chart.labels.map((label, index) => {
          const value = chart.values[index]!;
          return (
            <li key={index} className="grid grid-cols-[minmax(0,9rem)_1fr_auto] items-center gap-2 text-caption" title={`${label}: ${withUnit(value, chart.unit)}`}>
              <span className="truncate text-ink-muted">{label}</span>
              <span className="h-3 rounded-r bg-surface-muted">
                <span className="block h-3 rounded-r bg-primary-solid" style={{ width: `${Math.max(2, (Math.abs(value) / max) * 100)}%` }} />
              </span>
              <span className="tabular-nums text-ink">{formatValue(value)}</span>
            </li>
          );
        })}
      </ul>
    </figure>
  );
}

function LineChart({ chart }: { chart: Chart }) {
  const width = 600;
  const height = 180;
  const pad = { left: 8, right: 8, top: 12, bottom: 22 };
  const min = Math.min(...chart.values, 0);
  const max = Math.max(...chart.values, 1);
  const x = (index: number) => pad.left + (chart.values.length === 1 ? 0.5 : index / (chart.values.length - 1)) * (width - pad.left - pad.right);
  const y = (value: number) => pad.top + (1 - (value - min) / (max - min || 1)) * (height - pad.top - pad.bottom);
  const points = chart.values.map((value, index) => `${x(index)},${y(value)}`).join(" ");
  const ticks = [...new Set([0, Math.floor((chart.labels.length - 1) / 2), chart.labels.length - 1])];
  return (
    <figure className="rounded-lg border border-line bg-surface px-3 py-3" data-testid="ai-chart">
      {chart.title && <figcaption className="mb-1 text-label font-medium text-ink">{chart.title}</figcaption>}
      <svg viewBox={`0 0 ${width} ${height}`} className="h-auto w-full" role="img" aria-label={chart.title || "Trend"}>
        <line x1={pad.left} x2={width - pad.right} y1={y(min)} y2={y(min)} stroke="var(--color-border-default)" strokeWidth="1" />
        <polyline points={points} fill="none" stroke="var(--color-primary-solid)" strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
        {chart.values.map((value, index) => (
          <circle key={index} cx={x(index)} cy={y(value)} r="4" fill="var(--color-primary-solid)" stroke="var(--color-surface-white)" strokeWidth="2">
            <title>{`${chart.labels[index]}: ${withUnit(value, chart.unit)}`}</title>
          </circle>
        ))}
        {ticks.map((tick) => (
          <text key={tick} x={x(tick)} y={height - 6} textAnchor={tick === 0 ? "start" : tick === chart.labels.length - 1 ? "end" : "middle"} fontSize="12" fill="var(--color-text-secondary)">
            {chart.labels[tick]}
          </text>
        ))}
      </svg>
    </figure>
  );
}

function Visual({ block }: { block: Extract<Block, { kind: "fence" }> }) {
  if (block.lang === "metrics") {
    const metrics = toMetrics(block.body);
    if (metrics) return <MetricCards metrics={metrics} />;
  }
  if (block.lang === "chart") {
    const charts = toCharts(block.body);
    if (charts)
      return (
        <div className="space-y-2">
          {charts.map((chart, index) => (chart.type === "line" ? <LineChart key={index} chart={chart} /> : <BarChart key={index} chart={chart} />))}
        </div>
      );
  }
  if (block.lang === "metrics" || block.lang === "chart") return null; // malformed visual: leave it out rather than show JSON
  return <pre className="overflow-x-auto rounded-md bg-surface-muted px-3 py-2 text-caption">{block.body}</pre>;
}

export function RichAnswer({ text, compact = false }: { text: string; compact?: boolean }) {
  const blocks = parseBlocks(text);
  const nodes: ReactNode[] = blocks.map((block, index) => {
    switch (block.kind) {
      case "heading":
        return (
          <p key={index} className={`font-semibold text-ink ${block.level <= 2 && !compact ? "text-[1.0625rem]" : ""}`}>
            <Inline text={block.text} />
          </p>
        );
      case "paragraph":
        return (
          <p key={index}>
            {block.lines.map((line, lineIndex) => (
              <Fragment key={lineIndex}>
                {lineIndex > 0 && <br />}
                <Inline text={line} />
              </Fragment>
            ))}
          </p>
        );
      case "list": {
        const List = block.ordered ? "ol" : "ul";
        return (
          <List key={index} className={`space-y-1 pl-5 ${block.ordered ? "list-decimal" : "list-disc"} marker:text-ink-faint`}>
            {block.items.map((item, itemIndex) => (
              <li key={itemIndex}>
                <Inline text={item} />
              </li>
            ))}
          </List>
        );
      }
      case "table":
        return (
          <div key={index} className="overflow-x-auto rounded-lg border border-line">
            <table className="w-full text-left text-label">
              <thead className="bg-surface-muted text-ink-muted">
                <tr>
                  {block.header.map((cell, cellIndex) => (
                    <th key={cellIndex} scope="col" className="px-3 py-2 font-medium">
                      <Inline text={cell} />
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {block.rows.map((row, rowIndex) => (
                  <tr key={rowIndex} className="border-t border-line">
                    {row.map((cell, cellIndex) => (
                      <td key={cellIndex} className="px-3 py-2 align-top">
                        <Inline text={cell} />
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        );
      case "quote":
        return (
          <p key={index} className="border-l-2 border-primary-100 pl-3 text-ink-muted">
            <Inline text={block.text} />
          </p>
        );
      case "fence":
        return <Visual key={index} block={block} />;
    }
  });
  return <div className={`space-y-3 break-words leading-relaxed ${compact ? "text-label" : ""}`}>{nodes}</div>;
}
