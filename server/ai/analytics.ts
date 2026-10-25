// D-193: AI Analytics, the arithmetic and words (pure, unit-tested).

export const TOOL_LABEL: Record<string, string> = {
  approvals_waiting_for_me: "Approvals waiting",
  my_requests_summary: "My requests",
  my_tasks_summary: "Tasks",
  my_information_summary: "Information",
  salesforce_objects: "Salesforce: find objects",
  salesforce_fields: "Salesforce: read fields",
  salesforce_query: "Salesforce: read records",
  salesforce_count: "Salesforce: count",
  salesforce_group: "Salesforce: breakdowns",
  propose_action: "Suggested actions",
};
export const toolLabel = (tool: string) => TOOL_LABEL[tool] ?? tool.replace(/_/g, " ");

export const MODE_NAME: Record<string, string> = {
  GENERAL: "General chat",
  APPROVAL: "Approvals",
  TASK: "Tasks",
  INFORMATION: "Information",
  SALESFORCE: "Salesforce data",
  COMBINED: "Combined",
  LEGACY: "Earlier version",
};

// Why answers failed, in plain categories (the stored text is technical).
const REASONS: readonly [RegExp, string][] = [
  [/^stopped/i, "Stopped by the person"],
  [/rate limit|quota|too many/i, "Provider rate limit or quota"],
  [/insufficient balance|http 402/i, "Provider account out of credit"],
  [/refused the api key|needs an api key/i, "Provider key refused"],
  [/doesn't know this model/i, "Unknown model"],
  [/didn't answer in time|timeout|timed out/i, "Took too long"],
  [/unavailable|couldn't reach/i, "Provider unavailable"],
  [/tool call|tool choice|empty answer|ran out of room|kept asking|couldn't be read/i, "Couldn't put the answer together"],
  [/salesforce/i, "Salesforce problem"],
];
export function failureReason(error: string): string {
  for (const [pattern, label] of REASONS) if (pattern.test(error)) return label;
  return "Other";
}

export function groupFailures(rows: readonly { error: string; count: number }[]): { reason: string; count: number }[] {
  const totals = new Map<string, number>();
  for (const row of rows) totals.set(failureReason(row.error), (totals.get(failureReason(row.error)) ?? 0) + row.count);
  return [...totals].map(([reason, count]) => ({ reason, count })).sort((a, b) => b.count - a.count);
}

// a as a percentage of b, one decimal; null when b is 0.
export const percent = (a: number, b: number): number | null => (b > 0 ? Math.round((a / b) * 1000) / 10 : null);

// The change from the previous period, in words with a sign ("+12%", "−3%", "new", "same").
export function change(now: number | null, before: number | null): string | null {
  if (now === null || before === null) return null;
  if (before === 0) return now === 0 ? "same" : "new";
  const value = Math.round(((now - before) / before) * 100);
  return value === 0 ? "same" : `${value > 0 ? "+" : "−"}${Math.abs(value)}%`;
}

// An estimate from the prices entered in AI settings (₹ per million tokens).
export function costEstimate(inputTokens: number, outputTokens: number, priceIn: number | null, priceOut: number | null): number | null {
  if (priceIn === null || priceOut === null || !Number.isFinite(priceIn) || !Number.isFinite(priceOut)) return null;
  return Math.round(((inputTokens / 1e6) * priceIn + (outputTokens / 1e6) * priceOut) * 100) / 100;
}

export function duration(ms: number | null): string {
  if (ms === null) return "—";
  return ms < 1000 ? `${ms} ms` : `${(ms / 1000).toFixed(ms < 10_000 ? 1 : 0)} s`;
}

export const compact = (value: number) => (value >= 1e6 ? `${(value / 1e6).toFixed(1)}M` : value >= 1e4 ? `${Math.round(value / 1e3)}k` : value.toLocaleString("en-IN"));

export const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
