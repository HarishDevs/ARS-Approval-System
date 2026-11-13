// D-238: the small set of formatting a task description may carry (the Draft
// task's Formatting bar and "/" menu write it as plain text): **bold**,
// _italic_, ~~struck~~, "- " bullets, "1. " numbered lines and @mentions
// (@[Name](user:id)). Parsed into data, never HTML, so nothing typed can run.
// v1.52.2 (owner: "the comment section formattable like a mail body"):
// also ++underline++, `code`, [links](https://…), "> " quotes and "# "
// headings. Links keep only http(s) and mailto addresses.
// v1.54.7 (owner: "formatting is not working in the description"): marks nest
// (bold inside italic, italic inside a link…): a marked part also carries its
// own parts (`children`), parsed the same way, a few levels deep at most.
export type Inline =
  | { kind: "text" | "code"; text: string }
  | { kind: "bold" | "italic" | "strike" | "underline"; text: string; children?: Inline[] }
  | { kind: "mention"; userId: number; label: string }
  | { kind: "link"; text: string; href: string };
export type Block = { kind: "line"; parts: Inline[] } | { kind: "quote"; parts: Inline[] } | { kind: "heading"; parts: Inline[] } | { kind: "bullets" | "numbers"; items: Inline[][] };

const INLINE =
  /@\[([^\]\n]{1,80})\]\(user:(\d{1,10})\)|\*\*([^*\n]+)\*\*|~~([^~\n]+)~~|(?<![\w*])_([^_\n]+)_(?!\w)|(?<![\w*])\*([^*\n]+)\*(?!\w)|\+\+([^+\n]+)\+\+|`([^`\n]+)`|\[([^\]\n]{1,200})\]\(((?:https?:\/\/|mailto:)[^\s)]{1,500})\)/g;

const withChildren = (part: { kind: "bold" | "italic" | "strike" | "underline"; text: string }, children: Inline[] | undefined): Inline => (children ? { ...part, children } : part);

export function inlineParts(text: string, depth = 0): Inline[] {
  const parts: Inline[] = [];
  // Only when there is formatting inside (a plain marked part stays as it was).
  const inner = (value: string): Inline[] | undefined => {
    if (depth >= 3) return undefined;
    const parts = inlineParts(value, depth + 1);
    return parts.length === 1 && parts[0]!.kind === "text" ? undefined : parts;
  };
  let last = 0;
  for (const match of text.matchAll(INLINE)) {
    const index = match.index ?? 0;
    if (index > last) parts.push({ kind: "text", text: text.slice(last, index) });
    if (match[1] !== undefined) parts.push({ kind: "mention", label: match[1], userId: Number(match[2]) });
    else if (match[3] !== undefined) parts.push(withChildren({ kind: "bold", text: match[3] }, inner(match[3])));
    else if (match[4] !== undefined) parts.push(withChildren({ kind: "strike", text: match[4] }, inner(match[4])));
    else if (match[7] !== undefined) parts.push(withChildren({ kind: "underline", text: match[7] }, inner(match[7])));
    else if (match[8] !== undefined) parts.push({ kind: "code", text: match[8] });
    else if (match[9] !== undefined && match[10] !== undefined) parts.push({ kind: "link", text: match[9], href: match[10] });
    else parts.push(withChildren({ kind: "italic", text: match[5] ?? match[6] ?? "" }, inner(match[5] ?? match[6] ?? "")));
    last = index + match[0].length;
  }
  if (last < text.length) parts.push({ kind: "text", text: text.slice(last) });
  return parts;
}

const BULLET = /^\s*[-*•]\s+/;
const NUMBER = /^\s*\d{1,3}[.)]\s+/;
const QUOTE = /^\s*>\s?/;
const HEADING = /^#{1,3}\s+/;

export function richBlocks(text: string): Block[] {
  const blocks: Block[] = [];
  for (const line of text.replace(/\r\n?/g, "\n").split("\n")) {
    const kind = BULLET.test(line) ? "bullets" : NUMBER.test(line) ? "numbers" : null;
    if (kind) {
      const parts = inlineParts(line.replace(kind === "bullets" ? BULLET : NUMBER, ""));
      const previous = blocks.at(-1);
      if (previous && previous.kind === kind) previous.items.push(parts);
      else blocks.push({ kind, items: [parts] });
    } else if (QUOTE.test(line)) blocks.push({ kind: "quote", parts: inlineParts(line.replace(QUOTE, "")) });
    else if (HEADING.test(line)) blocks.push({ kind: "heading", parts: inlineParts(line.replace(HEADING, "")) });
    else blocks.push({ kind: "line", parts: inlineParts(line) });
  }
  return blocks;
}

// Who is @mentioned (the Draft task makes them collaborators).
export function mentionIds(text: string): number[] {
  const ids = new Set<number>();
  for (const part of richBlocks(text).flatMap((block) => ("parts" in block ? block.parts : block.items.flat()))) if (part.kind === "mention") ids.add(part.userId);
  return [...ids];
}

// The Draft task shows "@Name" while typing; on Create each "@Name" of a
// person picked from the list becomes @[Name](user:id).
export function encodeMentions(text: string, picked: readonly { id: number; name: string }[]): string {
  let out = text;
  for (const person of [...picked].sort((a, b) => b.name.length - a.name.length)) {
    const escaped = person.name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    out = out.replace(new RegExp(`(^|[^\\w\\[])@${escaped}(?![\\w])`, "g"), `$1@[${person.name}](user:${person.id})`);
  }
  return out;
}

// Wrap the selection (or insert a placeholder) for the Formatting bar.
export function wrapSelection(value: string, start: number, end: number, mark: string, placeholder: string): { value: string; start: number; end: number } {
  const chosen = value.slice(start, end) || placeholder;
  const next = `${value.slice(0, start)}${mark}${chosen}${mark}${value.slice(end)}`;
  return { value: next, start: start + mark.length, end: start + mark.length + chosen.length };
}

// Start the current line (or each selected line) with a list mark.
export function prefixLines(value: string, start: number, end: number, numbered: boolean): { value: string; start: number; end: number } {
  const lineStart = value.lastIndexOf("\n", start - 1) + 1;
  const lineEnd = value.indexOf("\n", end) === -1 ? value.length : value.indexOf("\n", end);
  const lines = value.slice(lineStart, lineEnd).split("\n");
  const marked = lines.map((line, index) => `${numbered ? `${index + 1}. ` : "- "}${line.replace(BULLET, "").replace(NUMBER, "")}`).join("\n");
  const next = `${value.slice(0, lineStart)}${marked}${value.slice(lineEnd)}`;
  return { value: next, start: lineStart + marked.length, end: lineStart + marked.length };
}
