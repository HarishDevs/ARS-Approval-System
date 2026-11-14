"use client";

import { useEffect, useId, useRef, useState } from "react";
import { AtSign, Bold, Code, Heading, Italic, Link2, List, ListOrdered, Plus, Quote, RemoveFormatting, Smile, Strikethrough, Underline } from "lucide-react";
import { richBlocks, type Inline } from "@/features/work/rich-text";

// v1.52.2 (owner: "change all the comment section as a formattable like mail
// body, all formatting options"): a comment box you format as you type, like
// an email: bold, italic, underline, strike, code, link, bullets, numbers,
// quote, heading, emoji and @mentions. What it sends (hidden input `name`) is
// the app's plain formatting text (features/work/rich-text.ts), never HTML,
// so nothing typed or pasted can run when it is shown again.
export interface MentionPerson {
  id: number;
  label: string; // "Name - Code"
  detail?: string; // department
  name?: string; // plain name for the visible @Name
  token?: string; // what is saved, e.g. "@[Name](user:5)" or "@CODE"
}

const EMOJI = ["👍", "👏", "🙏", "✅", "❌", "⚠️", "🔥", "🎉", "😊", "🙂", "😀", "🤔", "👀", "📌", "📎", "⏰", "📅", "💡", "❗", "➡️"];
const SAFE_HREF = /^(https?:\/\/|mailto:)[^\s"'<>]{1,500}$/i;

// ---- the editor's content → the app's formatting text ----------------------------------
// v1.54.7: marks are tracked per run of text, so bold switched off inside bold
// (the browser writes <b>…<span style="font-weight:normal">…</span></b>) and
// marks inside marks (bold + italic) come out right; the format nests.
type MarkKey = "b" | "i" | "u" | "s";
type Marks = Record<MarkKey, boolean>;
type Run = { text: string; marks: Marks };
const MARK_ORDER: { key: MarkKey; mark: string }[] = [
  { key: "b", mark: "**" },
  { key: "i", mark: "_" },
  { key: "u", mark: "++" },
  { key: "s", mark: "~~" },
];
function collect(node: Node, marks: Marks, out: Run[]): void {
  if (node.nodeType === Node.TEXT_NODE) {
    out.push({ text: (node.textContent ?? "").replace(/\u00a0/g, " "), marks });
    return;
  }
  if (!(node instanceof HTMLElement)) return;
  if (node.dataset.mention) {
    out.push({ text: node.dataset.mention, marks });
    return;
  }
  const tag = node.tagName;
  if (tag === "BR") {
    out.push({ text: "\n", marks });
    return;
  }
  if (tag === "CODE") {
    const text = node.textContent ?? "";
    if (text.trim()) out.push({ text: `\`${text}\``, marks });
    return;
  }
  if (tag === "A") {
    const href = node.getAttribute("href") ?? "";
    const text = (node.textContent ?? "").replace(/[[\]\n]/g, " ").trim();
    if (text) out.push({ text: SAFE_HREF.test(href) ? `[${text}](${href})` : text, marks });
    return;
  }
  const style = node.style;
  const weight = style.fontWeight;
  const next: Marks = {
    b: tag === "B" || tag === "STRONG" || weight === "bold" || Number(weight) >= 600 ? true : weight === "normal" || (Number(weight) > 0 && Number(weight) < 600) ? false : marks.b,
    i: tag === "I" || tag === "EM" || style.fontStyle === "italic" ? true : style.fontStyle === "normal" ? false : marks.i,
    u: tag === "U" || style.textDecoration.includes("underline") ? true : marks.u,
    s: tag === "S" || tag === "STRIKE" || tag === "DEL" || style.textDecoration.includes("line-through") ? true : marks.s,
  };
  for (const child of node.childNodes) collect(child, next, out);
}
function render(runs: Run[], depth = 0): string {
  const step = MARK_ORDER[depth];
  if (!step) return runs.map((run) => run.text).join("");
  let result = "";
  let index = 0;
  while (index < runs.length) {
    const on = runs[index]!.marks[step.key];
    let stop = index;
    while (stop < runs.length && runs[stop]!.marks[step.key] === on) stop += 1;
    const inner = render(runs.slice(index, stop), depth + 1);
    result += on ? wrap(step.mark, inner) : inner;
    index = stop;
  }
  return result;
}
const NO_MARKS: Marks = { b: false, i: false, u: false, s: false };
function inline(node: Node): string {
  const runs: Run[] = [];
  collect(node, NO_MARKS, runs);
  return render(runs);
}
function wrap(mark: string, text: string): string {
  const core = text.trim();
  if (!core || core.includes("\n")) return text;
  const lead = text.slice(0, text.indexOf(core));
  const tail = text.slice(text.indexOf(core) + core.length);
  return `${lead}${mark}${core}${mark}${tail}`;
}
const BLOCKS = new Set(["DIV", "P", "UL", "OL", "LI", "BLOCKQUOTE", "H1", "H2", "H3", "H4", "PRE"]);
export function serialize(root: HTMLElement): string {
  const lines: string[] = [];
  let current = "";
  const flush = () => {
    lines.push(current);
    current = "";
  };
  const walk = (node: Node) => {
    if (node instanceof HTMLElement && BLOCKS.has(node.tagName)) {
      if (current) flush();
      const tag = node.tagName;
      if (tag === "UL" || tag === "OL") {
        let index = 0;
        for (const child of node.childNodes) {
          if (child instanceof HTMLElement && child.tagName === "LI") {
            index += 1;
            const mark = tag === "UL" ? "- " : `${index}. `;
            const text = inline(child).split("\n").filter(Boolean).join(" ");
            lines.push(`${mark}${text}`);
          }
        }
        return;
      }
      const lead = tag === "BLOCKQUOTE" ? "> " : /^H[1-4]$/.test(tag) ? "# " : "";
      const text = inline(node);
      for (const line of text.split("\n")) lines.push(`${lead}${line}`);
      return;
    }
    if (node instanceof HTMLElement && node.tagName === "BR") {
      flush();
      return;
    }
    current += inline(node);
  };
  for (const child of root.childNodes) walk(child);
  if (current) flush();
  while (lines.length && !lines[lines.length - 1]!.trim()) lines.pop();
  while (lines.length && !lines[0]!.trim()) lines.shift();
  return lines.join("\n");
}

// ---- the app's formatting text → editor content (built node by node, never as HTML) ----
function appendInline(parent: HTMLElement, parts: Inline[]) {
  for (const part of parts) {
    if (part.kind === "mention") {
      const span = document.createElement("span");
      span.dataset.mention = `@[${part.label}](user:${part.userId})`;
      span.contentEditable = "false";
      span.className = "rounded bg-primary-50 px-1 font-medium text-primary-700";
      span.textContent = `@${part.label}`;
      parent.append(span);
      continue;
    }
    if (part.kind === "text") {
      parent.append(document.createTextNode(part.text));
      continue;
    }
    if (part.kind === "link") {
      const link = document.createElement("a");
      link.href = part.href;
      link.textContent = part.text;
      parent.append(link);
      continue;
    }
    const tag = { bold: "b", italic: "i", underline: "u", strike: "s", code: "code" }[part.kind];
    const element = document.createElement(tag);
    // v1.54.7: marks nest (bold inside italic…).
    if ("children" in part && part.children) appendInline(element, part.children);
    else element.textContent = part.text;
    parent.append(element);
  }
}
function load(root: HTMLElement, text: string) {
  root.replaceChildren();
  if (!text) return;
  for (const block of richBlocks(text)) {
    if ("items" in block) {
      const list = document.createElement(block.kind === "bullets" ? "ul" : "ol");
      for (const item of block.items) {
        const li = document.createElement("li");
        appendInline(li, item);
        list.append(li);
      }
      root.append(list);
    } else {
      const element = document.createElement(block.kind === "quote" ? "blockquote" : block.kind === "heading" ? "h3" : "div");
      appendInline(element, "parts" in block ? block.parts : []);
      if (!element.childNodes.length) element.append(document.createElement("br"));
      root.append(element);
    }
  }
}

export function RichEditor({
  name,
  id,
  label,
  placeholder = "Add a comment or @mention a teammate",
  initialText = "",
  people = [],
  mentionToken = (person) => person.token ?? `@[${(person.name ?? person.label).replace(/[\]\n]/g, "")}](user:${person.id})`,
  minHeight = 96,
  autoFocus = false,
  maxLength = 4000,
  onText,
  onPasteFiles,
  ariaInvalid,
  ariaDescribedBy,
  ariaRequired,
  testId,
}: {
  name: string;
  id?: string;
  label: string; // the accessible name
  placeholder?: string;
  initialText?: string;
  people?: MentionPerson[];
  mentionToken?: (person: MentionPerson) => string;
  minHeight?: number;
  autoFocus?: boolean;
  maxLength?: number;
  onText?: (text: string) => void;
  onPasteFiles?: (files: File[]) => void; // v1.54.7: pasted files (e.g. an image) go here instead of the text
  ariaInvalid?: boolean; // v1.54.7: a form field's state (required and empty, or refused)
  ariaDescribedBy?: string;
  ariaRequired?: boolean;
  testId?: string;
}) {
  const auto = useId();
  const editorId = id ?? `${auto}-editor`;
  const editor = useRef<HTMLDivElement>(null);
  const hidden = useRef<HTMLInputElement>(null);
  const [text, setText] = useState(initialText);
  const [empty, setEmpty] = useState(!initialText);
  const [mention, setMention] = useState<{ query: string } | null>(null);
  const [active, setActive] = useState(0);
  const [emoji, setEmoji] = useState(false);
  // v1.54.9 (owner): Bold, Italic, Underline always; "+" opens the rest.
  const [more, setMore] = useState(false);
  const saved = useRef<Range | null>(null);

  const sync = () => {
    const root = editor.current;
    if (!root) return;
    const next = serialize(root).slice(0, maxLength);
    setText(next);
    setEmpty(!root.textContent?.trim() && !root.querySelector("[data-mention]"));
    if (hidden.current) hidden.current.value = next;
    onText?.(next);
  };

  useEffect(() => {
    if (editor.current) load(editor.current, initialText);
    if (autoFocus) editor.current?.focus();
    // Loaded once; later changes come from typing.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // A form reset (after a successful send) empties the box.
  useEffect(() => {
    const form = hidden.current?.form;
    if (!form) return;
    const reset = () =>
      window.setTimeout(() => {
        if (editor.current) editor.current.replaceChildren();
        setText("");
        setEmpty(true);
        if (hidden.current) hidden.current.value = "";
      }, 0);
    form.addEventListener("reset", reset);
    return () => form.removeEventListener("reset", reset);
  }, []);

  // v1.54.7: the browser forgets "bold off" (and the like) at the caret when
  // focus leaves for the emoji picker; it is remembered and put back.
  const typing = useRef<Record<string, boolean> | null>(null);
  const TYPING = ["bold", "italic", "underline", "strikeThrough"] as const;
  const remember = () => {
    const selection = window.getSelection();
    if (selection && selection.rangeCount && editor.current?.contains(selection.anchorNode)) {
      saved.current = selection.getRangeAt(0).cloneRange();
      typing.current = selection.isCollapsed ? Object.fromEntries(TYPING.map((name) => [name, document.queryCommandState(name)])) : null;
    }
  };
  const restore = () => {
    editor.current?.focus();
    const selection = window.getSelection();
    if (saved.current && selection) {
      selection.removeAllRanges();
      selection.addRange(saved.current);
      const state = typing.current;
      if (state && selection.isCollapsed) for (const name of TYPING) if (document.queryCommandState(name) !== state[name]) document.execCommand(name);
    }
  };
  const command = (name: string, value?: string) => {
    restore();
    document.execCommand(name, false, value);
    sync();
  };
  const codeMark = () => {
    restore();
    const selection = window.getSelection();
    const chosen = selection?.toString() || "code";
    const code = document.createElement("code");
    code.textContent = chosen;
    const range = selection?.rangeCount ? selection.getRangeAt(0) : null;
    if (range) {
      range.deleteContents();
      range.insertNode(code);
      range.setStartAfter(code);
      range.collapse(true);
      selection?.removeAllRanges();
      selection?.addRange(range);
    }
    sync();
  };
  const link = () => {
    restore();
    const href = window.prompt("Link address (https://…)", "https://");
    if (!href || !SAFE_HREF.test(href.trim())) return;
    const selection = window.getSelection();
    if (selection && selection.toString()) document.execCommand("createLink", false, href.trim());
    else {
      // No text chosen: the address itself becomes the link text (built as a node, never as HTML).
      const anchor = document.createElement("a");
      anchor.href = href.trim();
      anchor.textContent = href.trim();
      const range = selection?.rangeCount ? selection.getRangeAt(0) : null;
      if (range) {
        range.insertNode(anchor);
        range.setStartAfter(anchor);
        range.collapse(true);
      } else editor.current?.append(anchor);
    }
    sync();
  };
  const insertMention = (person: MentionPerson) => {
    restore();
    const selection = window.getSelection();
    const range = selection?.rangeCount ? selection.getRangeAt(0) : null;
    // Remove the "@query" typed before the caret.
    if (range && mention && range.startContainer.nodeType === Node.TEXT_NODE) {
      const node = range.startContainer as Text;
      const before = node.data.slice(0, range.startOffset);
      const at = before.lastIndexOf("@");
      if (at >= 0) {
        node.deleteData(at, range.startOffset - at);
        range.setStart(node, at);
        range.collapse(true);
      }
    }
    const span = document.createElement("span");
    span.dataset.mention = mentionToken(person);
    span.contentEditable = "false";
    span.className = "rounded bg-primary-50 px-1 font-medium text-primary-700";
    span.textContent = `@${person.name ?? person.label}`;
    const space = document.createTextNode(" ");
    if (range) {
      range.insertNode(space);
      range.insertNode(span);
      range.setStartAfter(space);
      range.collapse(true);
      selection?.removeAllRanges();
      selection?.addRange(range);
    } else editor.current?.append(span, space);
    setMention(null);
    sync();
  };
  const matches = mention
    ? people
        .filter((person) =>
          mention.query
            .toLowerCase()
            .split(/\s+/)
            .filter(Boolean)
            .every((word) => `${person.label} ${person.detail ?? ""}`.toLowerCase().includes(word)),
        )
        .slice(0, 8)
    : [];

  const tool = (labelText: string, icon: React.ReactNode, run: () => void) => (
    <button
      type="button"
      title={labelText}
      aria-label={labelText}
      onMouseDown={(event) => {
        event.preventDefault();
        remember();
      }}
      onClick={run}
      className="grid h-8 w-8 place-items-center rounded text-ink-muted hover:bg-surface-muted hover:text-ink"
    >
      {icon}
    </button>
  );
  const icon = "h-4 w-4";

  return (
    <div className="rounded-lg border border-line bg-surface focus-within:border-primary-600" data-testid={testId ?? "rich-editor"}>
      <input ref={hidden} type="hidden" name={name} defaultValue={text} />
      <div className="relative">
        {empty && (
          <span className="pointer-events-none absolute left-3 top-2.5 text-label text-ink-faint" aria-hidden="true">
            {placeholder}
          </span>
        )}
        <div
          ref={editor}
          id={editorId}
          role="textbox"
          aria-multiline="true"
          aria-label={label}
          aria-invalid={ariaInvalid || undefined}
          aria-describedby={ariaDescribedBy}
          aria-required={ariaRequired || undefined}
          contentEditable
          suppressContentEditableWarning
          className="max-h-[50vh] overflow-y-auto px-3 py-2 text-body outline-none [&_blockquote]:border-l-4 [&_blockquote]:border-line [&_blockquote]:pl-3 [&_blockquote]:text-ink-muted [&_code]:rounded [&_code]:bg-surface-muted [&_code]:px-1 [&_code]:font-mono [&_h3]:font-semibold [&_a]:text-primary-700 [&_a]:underline [&_ol]:list-decimal [&_ol]:pl-5 [&_ul]:list-disc [&_ul]:pl-5"
          style={{ minHeight }}
          onInput={() => {
            sync();
            // "@" then letters opens the people list.
            const selection = window.getSelection();
            const node = selection?.anchorNode;
            if (node?.nodeType === Node.TEXT_NODE) {
              const before = (node.textContent ?? "").slice(0, selection?.anchorOffset ?? 0);
              const match = /(?:^|\s)@([\p{L}\d._ -]{0,30})$/u.exec(before);
              if (match && people.length) {
                setMention({ query: match[1] ?? "" });
                setActive(0);
                remember();
                return;
              }
            }
            setMention(null);
          }}
          onKeyUp={remember}
          onMouseUp={remember}
          onBlur={() => window.setTimeout(() => setMention(null), 150)}
          onPaste={(event) => {
            const files = Array.from(event.clipboardData.files);
            if (files.length && onPasteFiles) {
              event.preventDefault();
              onPasteFiles(files);
              return;
            }
            // Pasted text keeps its lines, not the page's styling.
            event.preventDefault();
            document.execCommand("insertText", false, event.clipboardData.getData("text/plain"));
            sync();
          }}
          onKeyDown={(event) => {
            if (mention && matches.length) {
              if (event.key === "ArrowDown") {
                event.preventDefault();
                setActive((index) => Math.min(index + 1, matches.length - 1));
                return;
              }
              if (event.key === "ArrowUp") {
                event.preventDefault();
                setActive((index) => Math.max(index - 1, 0));
                return;
              }
              if (event.key === "Enter" || event.key === "Tab") {
                event.preventDefault();
                insertMention(matches[active]!);
                return;
              }
              if (event.key === "Escape") {
                setMention(null);
                return;
              }
            }
            if (event.key === "Enter" && (event.ctrlKey || event.metaKey)) {
              event.preventDefault();
              hidden.current?.form?.requestSubmit();
              return;
            }
            const key = event.key.toLowerCase();
            if (event.ctrlKey || event.metaKey) {
              if (key === "b" || key === "i" || key === "u") {
                event.preventDefault();
                document.execCommand(key === "b" ? "bold" : key === "i" ? "italic" : "underline");
                sync();
              }
            }
          }}
          aria-keyshortcuts="Control+Enter"
        />
        {mention && matches.length > 0 && (
          <ul role="listbox" aria-label="Mention someone" className="absolute left-2 top-full z-[70] mt-1 max-h-64 w-72 overflow-y-auto rounded-md border border-line bg-raised py-1 shadow-overlay">
            {matches.map((person, index) => (
              <li
                key={person.id}
                role="option"
                aria-selected={index === active}
                onMouseDown={(event) => {
                  event.preventDefault();
                  insertMention(person);
                }}
                onMouseEnter={() => setActive(index)}
                className={`cursor-pointer px-3 py-1.5 ${index === active ? "bg-primary-50 text-primary-700" : ""}`}
              >
                <span className="block text-label">{person.label}</span>
                {person.detail && <span className="block text-caption text-ink-muted">{person.detail}</span>}
              </li>
            ))}
          </ul>
        )}
      </div>
      <div className="relative flex flex-wrap items-center gap-0.5 border-t border-line px-1.5 py-1" role="toolbar" aria-label="Formatting">
        {tool("Bold (Ctrl+B)", <Bold className={icon} />, () => command("bold"))}
        {tool("Italic (Ctrl+I)", <Italic className={icon} />, () => command("italic"))}
        {tool("Underline (Ctrl+U)", <Underline className={icon} />, () => command("underline"))}
        <button
          type="button"
          title={more ? "Hide formatting options" : "All formatting options"}
          aria-label="All formatting options"
          aria-expanded={more}
          onMouseDown={(event) => {
            event.preventDefault();
            remember();
          }}
          onClick={() => {
            setMore((value) => !value);
            setEmoji(false);
          }}
          className={`grid h-8 w-8 place-items-center rounded hover:bg-surface-muted hover:text-ink ${more ? "bg-surface-muted text-ink" : "text-ink-muted"}`}
        >
          <Plus aria-hidden="true" className={`${icon} transition-transform ${more ? "rotate-45" : ""}`} />
        </button>
        {more && (
          <>
        <span aria-hidden="true" className="mx-1 h-5 w-px bg-line" />
        {tool("Strikethrough", <Strikethrough className={icon} />, () => command("strikeThrough"))}
        {tool("Inline code", <Code className={icon} />, codeMark)}
        {tool("Link", <Link2 className={icon} />, link)}
        <span aria-hidden="true" className="mx-1 h-5 w-px bg-line" />
        {tool("Bulleted list", <List className={icon} />, () => command("insertUnorderedList"))}
        {tool("Numbered list", <ListOrdered className={icon} />, () => command("insertOrderedList"))}
        {tool("Quote", <Quote className={icon} />, () => command("formatBlock", "blockquote"))}
        {tool("Heading", <Heading className={icon} />, () => command("formatBlock", "h3"))}
        {tool("Clear formatting", <RemoveFormatting className={icon} />, () => {
          command("removeFormat");
          command("formatBlock", "div");
        })}
        <span aria-hidden="true" className="mx-1 h-5 w-px bg-line" />
        {tool("Emoji", <Smile className={icon} />, () => setEmoji((value) => !value))}
        {people.length > 0 &&
          tool("Mention someone", <AtSign className={icon} />, () => {
            restore();
            document.execCommand("insertText", false, " @");
            setMention({ query: "" });
            setActive(0);
            remember();
          })}
          </>
        )}
        {emoji && (
          <div className="absolute bottom-full left-1 z-[70] mb-1 grid w-64 grid-cols-10 gap-0.5 rounded-md border border-line bg-raised p-1.5 shadow-overlay" role="dialog" aria-label="Emoji">
            {EMOJI.map((item) => (
              <button
                key={item}
                type="button"
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => {
                  restore();
                  document.execCommand("insertText", false, item);
                  setEmoji(false);
                  sync();
                }}
                className="grid h-6 w-6 place-items-center rounded text-[15px] hover:bg-surface-muted"
              >
                {item}
              </button>
            ))}
          </div>
        )}
        <span className="ml-auto pr-1 text-caption text-ink-faint">{text.length > maxLength - 200 ? `${maxLength - text.length} left` : ""}</span>
      </div>
    </div>
  );
}
