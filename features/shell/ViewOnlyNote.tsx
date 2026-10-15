"use client";

import { Eye } from "lucide-react";
import { usePathname } from "next/navigation";

// v1.8.0: on a page the Super Admin set to "view only" for this person, say
// so up front: they can read it, but nothing they try to change is saved
// (the server refuses it).
export function ViewOnlyNote({ patterns }: { patterns: string[] }) {
  const pathname = usePathname();
  if (!patterns.some((source) => new RegExp(source).test(pathname))) return null;
  return (
    <p role="status" data-testid="view-only" className="flex items-center gap-2 border-b border-line bg-surface-muted px-4 py-2 text-label text-ink-muted sm:px-8">
      <Eye aria-hidden="true" className="h-4 w-4 shrink-0" />
      View only: you can look at this page, but changes here aren&apos;t allowed for you. Ask IT if you need more.
    </p>
  );
}
