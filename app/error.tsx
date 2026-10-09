"use client";

import Link from "next/link";
import { CopyForIt } from "@/features/help/CopyForIt";

// Anything that still goes wrong while showing a page lands here, inside the
// app's own look, instead of Next's blank "Application error" (QA session 14,
// DEF-02 / TC-083). Nothing technical is shown (D-016).
export default function ErrorPage({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <main className="flex min-h-full flex-col items-center justify-center gap-4 px-4 py-16 text-center">
      <p className="text-caption font-semibold uppercase tracking-wider text-ink-muted">Something went wrong</p>
      <h1 className="text-title font-semibold">This page couldn&apos;t be shown</h1>
      <p className="max-w-sm text-ink-muted">It may be a connection problem. Try again; if it keeps happening, tell IT what you were doing.</p>
      <div className="flex flex-wrap justify-center gap-3">
        <button type="button" onClick={reset} className="btn-primary btn-compact">
          Try again
        </button>
        <Link href="/users" className="btn-secondary btn-compact">
          Go to my approvals
        </Link>
      </div>
      {/* #14: a reference IT can find in the server log. */}
      <CopyForIt digest={error.digest} />
    </main>
  );
}
