// D-169 (AI module branch): numbers in an answer must come from the data.
// Every figure the model writes is looked for in the tool results (and the
// question); any it invented or calculated itself is listed, and the answer
// is shown with a warning instead of being passed off as verified. Pure.

// "1." or "2)" at the start of a line is a list marker, not a figure.
const LIST_MARKER = /^\s*\d{1,2}[.)]\s/gm;
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
  return [...text.replace(DATES, " ").replace(LIST_MARKER, " ").matchAll(FIGURE)].map((match) => normalise(match[0]));
}

export function unverifiedFigures(answer: string, sources: readonly string[]): string[] {
  const known = new Set(sources.flatMap((source) => figuresIn(source)));
  const missing = figuresIn(answer).filter((figure) => !known.has(figure));
  return [...new Set(missing)].slice(0, 20);
}
