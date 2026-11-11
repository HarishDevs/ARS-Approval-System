import Link from "next/link";
import { ShieldAlert } from "lucide-react";
import { PAGES } from "@/server/authorization/pages";
import { MODULE_LABEL } from "@/server/modules/modules";

// v1.50.3 (owner: "if I don't have access to any screen, show an error screen
// for that"): a page the person may not open (hidden by Page access, or in a
// module they don't have) says so plainly, instead of "This page isn't
// available". Records (a request or task not shared with them) keep the
// plain not-found page, so it never confirms that a private record exists.
const WHY: Record<string, string> = {
  HIDDEN: "IT has turned this page off for you.",
  MODULE: "It belongs to a module that isn't switched on for you.",
  UNKNOWN_PAGE: "Your access doesn't include this page.",
};

export function NoAccess({ pageKey, why, home }: { pageKey: string | undefined; why: string | undefined; home: string }) {
  const page = pageKey ? PAGES.find((item) => item.key === pageKey) : undefined;
  const moduleName = why === "MODULE" && page?.module ? MODULE_LABEL[page.module] : null;
  return (
    <div className="flex min-h-[50vh] flex-col items-center justify-center gap-4 px-4 py-12 text-center" data-testid="no-access">
      <span aria-hidden="true" className="flex h-12 w-12 items-center justify-center rounded-full bg-warning-50 text-warning-600">
        <ShieldAlert className="h-6 w-6" />
      </span>
      <h1 className="text-title font-semibold">You don&apos;t have access to this page</h1>
      {page && <p className="font-semibold text-ink">{page.label}</p>}
      <p className="max-w-md text-ink-muted">{moduleName ? `It belongs to the ${moduleName} module: coming soon for you. It opens once IT switches it on for you.` : (WHY[why ?? ""] ?? WHY.UNKNOWN_PAGE)}</p>
      <p className="max-w-md text-label text-ink-muted">If you need it for your work, ask IT to give you access.</p>
      <Link href={home} className="btn-primary btn-compact">
        Go to Home
      </Link>
    </div>
  );
}
