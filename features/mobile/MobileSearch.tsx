import Link from "next/link";
import { CheckCircle2, FileCheck2, FolderKanban, Search } from "lucide-react";

// v1.45.0 (owner's Asana Search screen): on a phone, Search opens on one box
// with what to search (requests or tasks), then quick filters and shortcuts.
// Every chip is an existing search (request search, task search, lists).
const CHIP = "inline-flex min-h-11 items-center gap-2 rounded-full border border-line px-4 text-[15px]";
const PILL = "inline-flex min-h-12 items-center rounded-2xl border border-line px-4 text-[15px]";

export function MobileSearch({ tasks, projects }: { tasks: boolean; projects: boolean }) {
  const filters = [
    { href: "/users/search?role=raised", label: "Requests I raised" },
    { href: "/users/search?role=approver", label: "Requests I approve" },
    { href: "/users/search?status=IN_PROGRESS", label: "Requests in progress" },
    { href: "/users/search?status=APPROVED", label: "Approved requests" },
  ];
  const shortcuts = tasks
    ? [
        { href: "/users/work/search?created_by=me", label: "Tasks I've created" },
        { href: "/users/work/search?status=completed", label: "Recently completed tasks" },
        { href: "/users/work/my-tasks?tab=assigned", label: "Tasks I've assigned to others" },
        { href: "/users/work/search?overdue=1", label: "Overdue tasks" },
        { href: "/users/work/search?followed=1", label: "Tasks I follow" },
      ]
    : [];
  return (
    <div className="space-y-6" data-testid="mobile-search">
      <h1 className="sr-only">Search</h1>
      <form method="get" action="/users/search" role="search" className="space-y-3">
        <label className="flex min-h-14 items-center gap-3 rounded-full bg-surface-muted px-5">
          <Search aria-hidden="true" className="h-5 w-5 text-ink-muted" />
          <span className="sr-only">Search ARS CMS</span>
          <input name="q" type="search" maxLength={100} placeholder="Search ARS CMS" enterKeyHint="search" className="min-w-0 flex-1 bg-transparent text-[16px] outline-none placeholder:text-ink-faint" />
        </label>
        <div className="mob-chips -mx-4 flex gap-2 overflow-x-auto px-4">
          <button type="submit" className={`${CHIP} shrink-0`}>
            <FileCheck2 aria-hidden="true" className="h-4 w-4" /> Requests
          </button>
          {tasks && (
            <button type="submit" formAction="/users/work/search" className={`${CHIP} shrink-0`}>
              <CheckCircle2 aria-hidden="true" className="h-4 w-4" /> Tasks
            </button>
          )}
          {projects && (
            <Link href="/users/work/projects" className={`${CHIP} shrink-0`}>
              <FolderKanban aria-hidden="true" className="h-4 w-4" /> Projects
            </Link>
          )}
        </div>
      </form>
      <section aria-labelledby="m-quick">
        <h2 id="m-quick" className="mb-3 text-[20px] font-semibold">
          Quick filters
        </h2>
        <div className="flex flex-wrap gap-2.5">
          {filters.map((item) => (
            <Link key={item.href} href={item.href} className={PILL}>
              {item.label}
            </Link>
          ))}
        </div>
      </section>
      {shortcuts.length > 0 && (
        <section aria-labelledby="m-shortcuts">
          <h2 id="m-shortcuts" className="mb-3 text-[20px] font-semibold">
            Shortcuts
          </h2>
          <div className="flex flex-wrap gap-2.5">
            {shortcuts.map((item) => (
              <Link key={item.href} href={item.href} className={PILL}>
                {item.label}
              </Link>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
