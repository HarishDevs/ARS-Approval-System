import Link from "next/link";
import { SearchX } from "lucide-react";

// FB-07: the same page whether something doesn't exist or isn't yours to
// see, so it never confirms that a private request exists (D-016).
export default function NotFound() {
  return (
    <div className="flex min-h-[50vh] flex-col items-center justify-center gap-4 px-4 py-12 text-center">
      <span aria-hidden="true" className="flex h-12 w-12 items-center justify-center rounded-full bg-surface-muted text-ink-faint">
        <SearchX className="h-6 w-6" />
      </span>
      <h1 className="text-title font-semibold">This page isn&apos;t available</h1>
      <p className="max-w-md text-ink-muted">The link may be wrong, the item may have been removed, or it may not be shared with you.</p>
      <form action="/users/search" method="get" className="flex w-full max-w-sm gap-2">
        <label htmlFor="nf-q" className="sr-only">
          Search your requests
        </label>
        <input id="nf-q" name="q" type="search" placeholder="Search by number or title" className="field-input" />
        <button type="submit" className="btn-secondary btn-compact h-11">
          Search
        </button>
      </form>
      <Link href="/users" className="link">
        Go to Home
      </Link>
    </div>
  );
}
