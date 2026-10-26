// D-169 (AI module branch): numbers in an answer must come from the data.
// Every figure the model writes is looked for in the tool results (and the
// question); any it invented is listed. D-201: the list is enforced (see
// assistant.ts), so figures the model may legitimately work out from the
// data (totals, differences, percentages, averages, rounding) count as known.
// Pure.

// "1." or "2)" at the start of a line is a list marker, not a figure.
const LIST_MARKER = /^\s*\d{1,2}[.)]\s/gm;
// "Insight 1", "Step 2", "Top 5", "#3": labels, not figures (D-201).
const LABEL = /\b(?:insights?|steps?|next steps?|options?|points?|tips?|priority|phase|level|top|rank|questions?|charts?|tables?|parts?)\s*#?\d{1,2}\b|#\d{1,2}\b/gi;
const FIGURE = /(?<![\w.])\d{1,3}(?:,\d{2,3})+(?:\.\d+)?(?![\w])|(?<![\w.])\d+(?:\.\d+)?(?![\w])/g;

const normalise = (figure: string) => {
  const plain = figure.replace(/,/g, "");
  const value = Number(plain);
  return Number.isFinite(value) ? String(value) : plain;
};

// Dates and times aren't figures (D-178: "24 Oct 2026" was flagged as "24").
const MONTH = "(?:jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)[a-z]*";
const DATES = new RegExp(
  [
    String.raw`\b\d{4}-\d{2}-\d{2}(?:[T ]\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?(?:Z|[+-]\d{2}:?\d{2})?)?\b`,
    String.raw`\b\d{1,2}[/-]\d{1,2}[/-]\d{2,4}\b`,
    String.raw`\b\d{1,2}(?:st|nd|rd|th)?\s+${MONTH}(?:,?\s+\d{4})?\b`,
    String.raw`\b${MONTH}\s+\d{1,2}(?:st|nd|rd|th)?(?:,?\s+\d{4})?\b`,
    String.raw`\b${MONTH}\s+\d{4}\b`,
    String.raw`\b\d{1,2}:\d{2}(?::\d{2})?\s*(?:am|pm)?\b`,
    String.raw`\b(?:19|20)\d{2}\b`,
  ].join("|"),
  "gi",
);

export function figuresIn(text: string): string[] {
  return [...text.replace(DATES, " ").replace(LIST_MARKER, " ").replace(LABEL, " ").matchAll(FIGURE)].map((match) => normalise(match[0]));
}

const key = (value: number) => String(Number(value.toFixed(6)));
// A value and its usual roundings (70837.759 -> 70838, 70837.8, 70837.76).
const roundings = (value: number) => [value, Math.round(value), Number(value.toFixed(1)), Number(value.toFixed(2))];

// Totals and averages of each list of numbers in a tool result (per field
// for lists of records), e.g. the sum of the groups of a breakdown.
function listTotals(data: unknown, out: number[]): void {
  if (Array.isArray(data)) {
    out.push(data.length); // "3 regions"
    const numbers = data.filter((item): item is number => typeof item === "number");
    if (numbers.length > 1) out.push(numbers.reduce((a, b) => a + b, 0), numbers.reduce((a, b) => a + b, 0) / numbers.length);
    const records = data.filter((item): item is Record<string, unknown> => !!item && typeof item === "object" && !Array.isArray(item));
    if (records.length > 1) {
      for (const field of new Set(records.flatMap((record) => Object.keys(record)))) {
        const values = records.map((record) => record[field]).filter((value): value is number => typeof value === "number");
        if (values.length > 1) out.push(values.reduce((a, b) => a + b, 0), values.reduce((a, b) => a + b, 0) / values.length);
      }
    }
    for (const item of data) listTotals(item, out);
  } else if (data && typeof data === "object") for (const value of Object.values(data)) listTotals(value, out);
}

// Every figure the answer may use: the figures in the sources, the totals of
// their lists, and sums, differences and percentages of two of them.
export function knownFigures(sources: readonly string[], results: readonly unknown[] = []): Set<string> {
  const base = [...new Set(sources.flatMap((source) => figuresIn(source)).map(Number).filter(Number.isFinite))];
  const totals: number[] = [];
  for (const result of results) listTotals(result, totals);
  const values = [...new Set([...base, ...totals])].slice(0, 160);
  const known = new Set<string>();
  const add = (value: number) => {
    if (Number.isFinite(value)) for (const rounded of roundings(value)) known.add(key(rounded));
  };
  values.forEach(add);
  for (let i = 0; i < values.length; i += 1) {
    for (let j = 0; j < values.length; j += 1) {
      if (i === j) continue;
      const a = values[i]!;
      const b = values[j]!;
      if (i < j) add(a + b);
      add(a - b);
      if (b !== 0) add((a / b) * 100);
    }
  }
  return known;
}

export function unverifiedFigures(answer: string, sources: readonly string[], results: readonly unknown[] = []): string[] {
  const known = knownFigures(sources, results);
  const missing = figuresIn(answer).filter((figure) => !known.has(key(Number(figure))));
  return [...new Set(missing)].slice(0, 20);
}

// D-201: the metrics and chart blocks (```metrics / ```chart) that show any
// of the given figures are removed, so a made-up number never appears as a
// headline card or a bar.
export function withoutBlocksShowing(text: string, figures: readonly string[]): string {
  if (!figures.length) return text;
  const bad = new Set(figures.map((figure) => key(Number(figure))));
  return text.replace(/```(?:metrics|chart)\s*\n[\s\S]*?```/g, (block) => (figuresIn(block).some((figure) => bad.has(key(Number(figure)))) ? "" : block)).replace(/\n{3,}/g, "\n\n").trim();
}
