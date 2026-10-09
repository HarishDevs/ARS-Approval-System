"use client";

import { AlertTriangle, RotateCcw } from "lucide-react";
import Link from "next/link";
import { CopyForIt } from "@/features/help/CopyForIt";

// FB-02: one error component in three sizes. The message is plain words;
// nothing technical (stack, payload, server names) is ever shown. "Copy
// details for IT" carries the request reference that matches the server log.
export function ErrorState({
  variant = "card",
  title = "Something went wrong",
  body = "This part couldn't be shown. Try again; if it keeps happening, tell IT.",
  onRetry,
  digest,
  homeHref,
}: {
  variant?: "inline" | "card" | "page";
  title?: string;
  body?: string;
  onRetry?: () => void;
  digest?: string;
  homeHref?: string;
}) {
  if (variant === "inline") {
    return (
      <p role="alert" className="flex flex-wrap items-center gap-2 rounded-md border border-danger-200 bg-danger-50 px-3 py-2 text-label text-danger-600">
        <AlertTriangle aria-hidden="true" className="h-4 w-4" />
        {body}
        {onRetry && (
          <button type="button" onClick={onRetry} className="font-semibold underline">
            Try again
          </button>
        )}
      </p>
    );
  }
  const page = variant === "page";
  return (
    <div role="alert" className={page ? "flex min-h-[50vh] flex-col items-center justify-center gap-4 px-4 py-16 text-center" : "card flex flex-col items-start gap-3 px-5 py-5"}>
      <span aria-hidden="true" className="flex h-10 w-10 items-center justify-center rounded-full bg-danger-50 text-danger-600">
        <AlertTriangle className="h-5 w-5" />
      </span>
      <div>
        <p className={page ? "text-title font-semibold" : "font-semibold"}>{title}</p>
        <p className={`mt-1 text-ink-muted ${page ? "mx-auto max-w-md" : "text-label"}`}>{body}</p>
      </div>
      <div className={`flex flex-wrap gap-2 ${page ? "justify-center" : ""}`}>
        {onRetry && (
          <button type="button" onClick={onRetry} className="btn-primary btn-compact">
            <RotateCcw aria-hidden="true" className="h-4 w-4" />
            Try again
          </button>
        )}
        {homeHref && (
          <Link href={homeHref} className="btn-secondary btn-compact">
            Go to My work
          </Link>
        )}
      </div>
      <CopyForIt digest={digest} />
    </div>
  );
}
