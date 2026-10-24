"use client";

import { useState } from "react";
import { Check, Copy } from "lucide-react";

// D-178: copy an answer's text (the Markdown, as written).
export function CopyAnswer({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      aria-label="Copy this answer"
      title={copied ? "Copied" : "Copy"}
      className="inline-flex h-7 w-7 items-center justify-center rounded-md text-ink-faint hover:bg-surface-muted hover:text-ink"
      onClick={() => {
        void navigator.clipboard?.writeText(text).then(() => {
          setCopied(true);
          setTimeout(() => setCopied(false), 1500);
        });
      }}
    >
      {copied ? <Check aria-hidden="true" className="h-4 w-4" /> : <Copy aria-hidden="true" className="h-4 w-4" />}
    </button>
  );
}
