import { Info } from "lucide-react";

// D-179 (owner: "make all the instructions a hover text"): an ⓘ that shows its
// text on hover or keyboard focus. The text lives only in attributes (a CSS
// tooltip from data-tip, and aria-description for screen readers), so it
// never duplicates or hides page text and isn't a button or a label.
// No hooks: usable on server pages.
export function Hint({ text, align = "center", className = "" }: { text: string | null | undefined; align?: "center" | "start" | "end"; className?: string }) {
  if (!text) return null;
  const position = align === "start" ? "after:left-0" : align === "end" ? "after:right-0" : "after:left-1/2 after:-translate-x-1/2";
  return (
    <span
      tabIndex={0}
      data-tip={text}
      aria-description={text}
      className={`relative inline-flex h-5 w-5 shrink-0 cursor-help items-center justify-center rounded-full align-middle text-ink-faint outline-none hover:text-ink-muted focus-visible:text-ink-muted focus-visible:ring-2 focus-visible:ring-primary-100 after:pointer-events-none after:absolute after:top-full after:z-50 after:mt-1 after:hidden after:w-max after:max-w-[min(20rem,80vw)] after:whitespace-normal after:rounded-md after:bg-ink after:px-2.5 after:py-1.5 after:text-left after:text-caption after:font-normal after:normal-case after:leading-snug after:tracking-normal after:text-surface after:shadow-lg after:content-[attr(data-tip)] hover:after:block focus-visible:after:block ${position} ${className}`}
    >
      <Info aria-hidden="true" className="h-3.5 w-3.5" />
    </span>
  );
}
