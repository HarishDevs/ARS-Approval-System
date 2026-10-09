"use client";

import { useEffect, useState } from "react";
import { Spinner } from "@/features/ui/Spinner";

// A plain link that shows it's working once clicked (QA session 14,
// DEF-01/04/09). Used where only the query changes (periods, pages): the
// browser does a normal page load, so the latest click always wins, and it
// works even before the page's scripts have loaded.
export function PendingLink({ href, className, children }: { href: string; className?: string; children: React.ReactNode }) {
  const [pending, setPending] = useState(false);
  // Coming back with the browser's Back button restores the page as it was.
  useEffect(() => {
    const reset = () => setPending(false);
    window.addEventListener("pageshow", reset);
    return () => window.removeEventListener("pageshow", reset);
  }, []);
  return (
    <a
      href={href}
      aria-busy={pending || undefined}
      className={`inline-flex items-center gap-1.5 ${className ?? ""}`}
      onClick={(event) => {
        if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
        setPending(true);
      }}
    >
      {children}
      {pending && <Spinner className="h-3.5 w-3.5" label="Loading" />}
    </a>
  );
}
