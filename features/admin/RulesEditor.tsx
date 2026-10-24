"use client";

import { useEffect, useRef, useState } from "react";
import { Bold, Eraser, Heading2, Heading3, Italic, Link2, List, ListOrdered, Quote, Redo2, Strikethrough, Table, Underline, Undo2 } from "lucide-react";
import { saveAiRuleAction } from "@/app/admin/ai-rules/actions";
import { ResultMessage, SubmitButton, useActionForm } from "@/features/ui/form";
import { parseBlocks } from "@/features/ai/RichAnswer";
import { Hint } from "@/features/ui/Hint";

// D-187 (owner): the AI Rules editor. A formatted document like an email
// body (bold, italic, underline, strikethrough, headings, lists, quotes,
// links, tables). It is saved as Markdown, which every AI provider reads
// with each question, and opened again from that Markdown. The page's HTML
// is never stored or sent anywhere.
export const SCOPE_LABEL: Record<string, string> = {
  ALL: "All chats",
  GENERAL: "General chat",
  APPROVAL: "Approvals",
  TASK: "Tasks",
  INFORMATION: "Information",
  SALESFORCE: "Salesforce data",
  COMBINED: "Combined",
};

const escapeHtml = (text: string) => text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

// Markdown inline → HTML, escaping everything first.
function inlineHtml(text: string): string {
  return escapeHtml(text)
    .replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+|mailto:[^\s)]+)\)/g, (_m, label: string, href: string) => `<a href="${href}">${label}</a>`)
    .replace(/\*\*([^*]+)\*\*/g, "<b>$1</b>")
    .replace(/~~([^~]+)~~/g, "<s>$1</s>")
    .replace(/&lt;u&gt;([\s\S]*?)&lt;\/u&gt;/g, "<u>$1</u>")
    .replace(/`([^`]+)`/g, "<code>$1</code>")
    .replace(/(^|[^*])\*([^*\s][^*]*)\*/g, "$1<i>$2</i>");
}

export function markdownToHtml(markdown: string): string {
  return parseBlocks(markdown)
    .map((block) => {
      switch (block.kind) {
        case "heading":
          return block.level <= 2 ? `<h2>${inlineHtml(block.text)}</h2>` : `<h3>${inlineHtml(block.text)}</h3>`;
        case "paragraph":
          return `<p>${block.lines.map(inlineHtml).join("<br>")}</p>`;
        case "list":
          return `<${block.ordered ? "ol" : "ul"}>${block.items.map((item) => `<li>${inlineHtml(item)}</li>`).join("")}</${block.ordered ? "ol" : "ul"}>`;
        case "table":
          return `<table><tr>${block.header.map((cell) => `<th>${inlineHtml(cell)}</th>`).join("")}</tr>${block.rows.map((row) => `<tr>${row.map((cell) => `<td>${inlineHtml(cell)}</td>`).join("")}</tr>`).join("")}</table>`;
        case "quote":
          return `<blockquote>${inlineHtml(block.text)}</blockquote>`;
        case "fence":
          return `<pre>${escapeHtml(block.body)}</pre>`;
      }
    })
    .join("");
}

// The editor's DOM → Markdown. Unknown elements keep their text only.
export function htmlToMarkdown(root: Node): string {
  const inline = (node: Node): string => {
    if (node.nodeType === Node.TEXT_NODE) return (node.textContent ?? "").replace(/\s+/g, " ");
    if (!(node instanceof HTMLElement)) return "";
    const inner = [...node.childNodes].map(inline).join("");
    const tag = node.tagName;
    const weight = node.style.fontWeight;
    if (!inner.trim() && tag !== "BR") return inner;
    if (tag === "B" || tag === "STRONG" || weight === "bold" || Number(weight) >= 600) return `**${inner.trim()}**`;
    if (tag === "I" || tag === "EM" || node.style.fontStyle === "italic") return `*${inner.trim()}*`;
    if (tag === "U" || node.style.textDecoration.includes("underline")) return `<u>${inner.trim()}</u>`;
    if (tag === "S" || tag === "STRIKE" || tag === "DEL" || node.style.textDecoration.includes("line-through")) return `~~${inner.trim()}~~`;
    if (tag === "CODE") return `\`${inner}\``;
    if (tag === "BR") return "\n";
    if (tag === "A") {
      const href = node.getAttribute("href") ?? "";
      return /^(https?:|mailto:)/.test(href) ? `[${inner.trim()}](${href})` : inner;
    }
    return inner;
  };
  const block = (node: Node): string => {
    if (node.nodeType === Node.TEXT_NODE) return (node.textContent ?? "").trim() ? `${inline(node).trim()}\n\n` : "";
    if (!(node instanceof HTMLElement)) return "";
    const tag = node.tagName;
    if (tag === "H1" || tag === "H2") return `## ${inline(node).trim()}\n\n`;
    if (tag === "H3" || tag === "H4") return `### ${inline(node).trim()}\n\n`;
    if (tag === "UL" || tag === "OL")
      return `${[...node.children]
        .filter((child) => child.tagName === "LI")
        .map((child, index) => `${tag === "OL" ? `${index + 1}.` : "-"} ${inline(child).trim()}`)
        .join("\n")}\n\n`;
    if (tag === "BLOCKQUOTE") return `> ${inline(node).trim()}\n\n`;
    if (tag === "PRE") return `\`\`\`\n${node.textContent ?? ""}\n\`\`\`\n\n`;
    if (tag === "TABLE") {
      const rows = [...node.querySelectorAll("tr")].map((row) => [...row.children].map((cell) => inline(cell).trim().replace(/\|/g, "/") || " "));
      if (!rows.length) return "";
      const width = Math.max(...rows.map((row) => row.length));
      const line = (row: string[]) => `| ${[...row, ...Array(width - row.length).fill(" ")].join(" | ")} |`;
      return `${[line(rows[0]!), `|${" --- |".repeat(width)}`, ...rows.slice(1).map(line)].join("\n")}\n\n`;
    }
    const hasBlocks = [...node.children].some((child) => /^(P|DIV|H[1-4]|UL|OL|BLOCKQUOTE|TABLE|PRE)$/.test(child.tagName));
    if (hasBlocks) return [...node.childNodes].map(block).join("");
    const text = inline(node).replace(/[ \t]+\n/g, "\n").trim();
    return text ? `${text}\n\n` : "";
  };
  return [...root.childNodes].map(block).join("").replace(/\n{3,}/g, "\n\n").trim();
}

const TOOLS: { label: string; icon: React.ReactNode; run: () => void }[] = [
  { label: "Bold", icon: <Bold className="h-4 w-4" />, run: () => document.execCommand("bold") },
  { label: "Italic", icon: <Italic className="h-4 w-4" />, run: () => document.execCommand("italic") },
  { label: "Underline", icon: <Underline className="h-4 w-4" />, run: () => document.execCommand("underline") },
  { label: "Strikethrough", icon: <Strikethrough className="h-4 w-4" />, run: () => document.execCommand("strikeThrough") },
  { label: "Heading", icon: <Heading2 className="h-4 w-4" />, run: () => document.execCommand("formatBlock", false, "h2") },
  { label: "Subheading", icon: <Heading3 className="h-4 w-4" />, run: () => document.execCommand("formatBlock", false, "h3") },
  { label: "Bulleted list", icon: <List className="h-4 w-4" />, run: () => document.execCommand("insertUnorderedList") },
  { label: "Numbered list", icon: <ListOrdered className="h-4 w-4" />, run: () => document.execCommand("insertOrderedList") },
  { label: "Quote", icon: <Quote className="h-4 w-4" />, run: () => document.execCommand("formatBlock", false, "blockquote") },
  {
    label: "Link",
    icon: <Link2 className="h-4 w-4" />,
    run: () => {
      const href = window.prompt("Link address (https://…)");
      if (href && /^(https?:|mailto:)/.test(href.trim())) document.execCommand("createLink", false, href.trim());
    },
  },
  { label: "Table", icon: <Table className="h-4 w-4" />, run: () => document.execCommand("insertHTML", false, "<table><tr><th>Term</th><th>Meaning</th></tr><tr><td>&nbsp;</td><td>&nbsp;</td></tr></table><p><br></p>") },
  { label: "Clear formatting", icon: <Eraser className="h-4 w-4" />, run: () => document.execCommand("removeFormat") },
  { label: "Undo", icon: <Undo2 className="h-4 w-4" />, run: () => document.execCommand("undo") },
  { label: "Redo", icon: <Redo2 className="h-4 w-4" />, run: () => document.execCommand("redo") },
];

export function RulesEditor({ rules, maxChars }: { rules: { scope: string; content: string; updatedBy: string | null; updatedAt: string | null }[]; maxChars: number }) {
  const [scope, setScope] = useState("ALL");
  const [length, setLength] = useState(0);
  const editor = useRef<HTMLDivElement>(null);
  const content = useRef<HTMLInputElement>(null);
  const { result, pending, onSubmit } = useActionForm(saveAiRuleAction);
  const current = rules.find((rule) => rule.scope === scope);

  useEffect(() => {
    if (!editor.current) return;
    editor.current.innerHTML = markdownToHtml(current?.content ?? "") || "<p><br></p>";
    setLength((current?.content ?? "").length);
  }, [scope, current?.content]);

  const sync = () => {
    if (!editor.current || !content.current) return;
    content.current.value = htmlToMarkdown(editor.current);
    setLength(content.current.value.length);
  };

  return (
    <form
      onSubmit={(event) => {
        sync();
        onSubmit(event);
      }}
      className="card"
      data-testid="ai-rules"
    >
      <input type="hidden" name="scope" value={scope} />
      <input ref={content} type="hidden" name="content" />
      <div className="flex flex-wrap items-center gap-3 border-b border-line px-5 py-4">
        <label htmlFor="rules-scope" className="text-label font-medium">
          Rules for
        </label>
        <select id="rules-scope" value={scope} onChange={(event) => setScope(event.target.value)} className="field-input h-9 w-56">
          {Object.entries(SCOPE_LABEL).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
        <Hint text={scope === "ALL" ? "Applies to every chat, before that chat's own rules." : `Applies to ${SCOPE_LABEL[scope]} chats, after the rules for all chats.`} align="start" />
        <span className="ml-auto text-caption text-ink-muted">{current?.updatedAt ? `Last saved by ${current.updatedBy ?? "someone"}, ${new Date(current.updatedAt).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" })}` : "Not written yet"}</span>
      </div>
      <div role="toolbar" aria-label="Formatting" className="flex flex-wrap gap-0.5 border-b border-line px-3 py-1.5">
        {TOOLS.map((tool) => (
          <button
            key={tool.label}
            type="button"
            title={tool.label}
            aria-label={tool.label}
            onMouseDown={(event) => event.preventDefault()}
            onClick={() => {
              editor.current?.focus();
              tool.run();
              sync();
            }}
            className="inline-flex h-8 w-8 items-center justify-center rounded text-ink-muted hover:bg-surface-muted hover:text-ink"
          >
            {tool.icon}
          </button>
        ))}
      </div>
      <div
        ref={editor}
        contentEditable
        suppressContentEditableWarning
        role="textbox"
        aria-multiline="true"
        aria-label={`AI rules for ${SCOPE_LABEL[scope]}`}
        onInput={sync}
        onPaste={(event) => {
          // Pasted text keeps its words, not another site's markup.
          event.preventDefault();
          document.execCommand("insertText", false, event.clipboardData.getData("text/plain"));
        }}
        className="rules-editor min-h-[22rem] px-5 py-4 text-body leading-relaxed text-ink focus:outline-none"
      />
      <div className="flex flex-wrap items-center gap-3 border-t border-line px-5 py-4">
        <SubmitButton pending={pending} className="btn-compact">
          Save rules
        </SubmitButton>
        <span className={`text-caption ${length > maxChars ? "text-danger-600" : "text-ink-muted"}`}>
          {length.toLocaleString("en-IN")} / {maxChars.toLocaleString("en-IN")} characters
        </span>
        <div className="min-w-0 flex-1">
          <ResultMessage result={result} />
        </div>
      </div>
    </form>
  );
}
