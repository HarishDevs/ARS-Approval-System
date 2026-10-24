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

export function figuresIn(text: string): string[] {
  return [...text.replace(LIST_MARKER, " ").matchAll(FIGURE)].map((match) => normalise(match[0]));
}

export function unverifiedFigures(answer: string, sources: readonly string[]): string[] {
  const known = new Set(sources.flatMap((source) => figuresIn(source)));
  const missing = figuresIn(answer).filter((figure) => !known.has(figure));
  return [...new Set(missing)].slice(0, 20);
}
