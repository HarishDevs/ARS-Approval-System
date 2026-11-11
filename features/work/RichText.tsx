import { SafeText } from "@/features/ui/SafeText";
import { richBlocks, type Inline } from "@/features/work/rich-text";

// D-238: a task description with its formatting and @mentions (rich-text.ts
// turns the text into data; nothing typed becomes HTML). Server and client.
function Parts({ parts }: { parts: Inline[] }) {
  return (
    <>
      {parts.map((part, index) =>
        part.kind === "mention" ? (
          <span key={index} className="rounded bg-primary-50 px-1 font-medium text-primary-700">
            @{part.label}
          </span>
        ) : part.kind === "bold" ? (
          <strong key={index} className="font-semibold">
            <SafeText text={part.text} />
          </strong>
        ) : part.kind === "italic" ? (
          <em key={index}>
            <SafeText text={part.text} />
          </em>
        ) : part.kind === "strike" ? (
          <s key={index}>
            <SafeText text={part.text} />
          </s>
        ) : part.kind === "underline" ? (
          <u key={index}>
            <SafeText text={part.text} />
          </u>
        ) : part.kind === "code" ? (
          <code key={index} className="rounded bg-surface-muted px-1 py-0.5 font-mono text-[0.9em]">
            {part.text}
          </code>
        ) : part.kind === "link" ? (
          <a key={index} href={part.href} target="_blank" rel="noopener noreferrer nofollow" className="link">
            {part.text}
          </a>
        ) : (
          <SafeText key={index} text={part.text} />
        ),
      )}
    </>
  );
}

export function RichText({ text, className = "" }: { text: string; className?: string }) {
  return (
    <div className={`break-words ${className}`} data-testid="rich-text">
      {richBlocks(text).map((block, index) =>
        block.kind === "line" ? (
          <p key={index} className="min-h-[1.5em]">
            <Parts parts={block.parts} />
          </p>
        ) : block.kind === "quote" ? (
          <blockquote key={index} className="border-l-4 border-line pl-3 text-ink-muted">
            <Parts parts={block.parts} />
          </blockquote>
        ) : block.kind === "heading" ? (
          <p key={index} className="text-body font-semibold">
            <Parts parts={block.parts} />
          </p>
        ) : block.kind === "bullets" ? (
          <ul key={index} className="list-disc pl-5">
            {block.items.map((item, at) => (
              <li key={at}>
                <Parts parts={item} />
              </li>
            ))}
          </ul>
        ) : (
          <ol key={index} className="list-decimal pl-5">
            {block.items.map((item, at) => (
              <li key={at}>
                <Parts parts={item} />
              </li>
            ))}
          </ol>
        ),
      )}
    </div>
  );
}
