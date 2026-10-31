"use client";

import { useState } from "react";
import { Check, Copy } from "lucide-react";
import { COPY_BLOCKED, copyText } from "@/features/ui/clipboard";

// D-178: copy an answer's text (the Markdown, as written).
export function CopyAnswer({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  const [blocked, setBlocked] = useState(false);
  return (
    <>
      <button
        type="button"
        aria-label="Copy this answer"
        title={blocked ? COPY_BLOCKED : copied ? "Copied" : "Copy"}
        className="inline-flex h-7 w-7 items-center justify-center rounded-md text-ink-faint hover:bg-surface-muted hover:text-ink"
        onClick={() => {
          void copyText(text).then((done) => {
            setBlocked(!done);
            if (!done) return;
            setCopied(true);
            setTimeout(() => setCopied(false), 1500);
          });
        }}
      >
        {copied ? <Check aria-hidden="true" className="h-4 w-4" /> : <Copy aria-hidden="true" className="h-4 w-4" />}
      </button>
      {blocked && (
        <span role="status" className="text-caption text-warning-600">
          {COPY_BLOCKED}
        </span>
      )}
    </>
  );
}
