import Link from "next/link";
import { ArrowUpDown, Check, Filter, Layers, Search, Settings2, X } from "lucide-react";
import { Drop } from "@/features/ui/Drop";

// D-226 (owner: "change all these Filters like the one we did in Task
// management"): the lists' filters in the task table's toolbar: Filter
// (a panel with the fields and Apply), Sort, Group and Options (per page,
// save the view) as small dropdowns, and Search, all on one line. The lists
// stay plain GET forms, so every choice is in the address (bookmarks, Back,
// saved views). Sort, Group and Per page are links.
export type ToolbarChoice = { label: string; href: string; active: boolean };

const ghost = "btn-ghost btn-compact inline-flex items-center gap-1";
const lit = "btn-secondary btn-compact inline-flex items-center gap-1 border-primary-600 bg-primary-50 text-primary-700";

export function ListToolbar({
  id,
  path,
  label,
  keep,
  search,
  filterCount,
  clearHref,
  filters,
  sort,
  group,
  sizes,
  options,
  lead,
}: {
  id: string;
  path: string;
  label: string;
  keep: Record<string, string | undefined>;
  search: { name: string; value: string; placeholder: string };
  filterCount: number;
  clearHref: string | null;
  filters: React.ReactNode;
  sort?: { label: string; changed: boolean; choices: ToolbarChoice[] };
  group?: { label: string | null; clearHref: string; choices: ToolbarChoice[] };
  sizes?: ToolbarChoice[];
  options?: React.ReactNode;
  lead?: React.ReactNode;
}) {
  const links = (choices: ToolbarChoice[]) => (
    <ul className="space-y-0.5">
      {choices.map((choice) => (
        <li key={choice.href + choice.label}>
          <Link
            href={choice.href}
            aria-current={choice.active ? "true" : undefined}
            className={`flex items-center gap-2 rounded px-2 py-1.5 text-label ${choice.active ? "font-semibold text-primary-700" : "hover:bg-surface-muted"}`}
          >
            <Check aria-hidden="true" className={`h-3.5 w-3.5 shrink-0 ${choice.active ? "" : "invisible"}`} />
            {choice.label}
          </Link>
        </li>
      ))}
    </ul>
  );
  return (
    <div className="mb-3 flex flex-wrap items-center gap-2" role="toolbar" aria-label="View options" data-testid="list-toolbar">
      {lead}
      <span className="ml-auto flex flex-wrap items-center gap-1">
        <form id={id} method="get" action={path} role="search" aria-label={label} className="contents">
          {Object.entries(keep).map(([name, value]) => (value ? <input key={name} type="hidden" name={name} value={value} /> : null))}
          <span className="inline-flex items-center">
            <Drop
              label={filterCount ? `Filters: ${filterCount}` : "Filter"}
              icon={
                <>
                  <Filter aria-hidden="true" className="h-4 w-4" /> {filterCount ? `Filters: ${filterCount}` : "Filter"}
                </>
              }
              buttonClass={filterCount ? lit : ghost}
              panelClass="right-0 w-[min(640px,calc(100vw-2rem))] max-h-[70vh] overflow-y-auto"
              testId="filter-menu"
            >
              <p className="mb-3 text-label font-semibold">Filters</p>
              <div className="grid gap-4 sm:grid-cols-2">{filters}</div>
              <div className="mt-4 flex items-center gap-3 border-t border-line pt-3">
                <button type="submit" className="btn-primary btn-compact w-auto">
                  Apply
                </button>
                {clearHref && (
                  <Link href={clearHref} className="link text-label">
                    Clear all
                  </Link>
                )}
              </div>
            </Drop>
            {filterCount > 0 && clearHref && (
              <Link href={clearHref} aria-label="Clear filters" className="rounded p-1 text-primary-700 hover:bg-primary-50">
                <X aria-hidden="true" className="h-3.5 w-3.5" />
              </Link>
            )}
          </span>
          <span className="order-last inline-flex items-center">
            <label htmlFor={`${id}-q`} className="sr-only">
              Search
            </label>
            <span className="relative">
              <Search aria-hidden="true" className="pointer-events-none absolute left-2 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-faint" />
              <input id={`${id}-q`} type="search" name={search.name} defaultValue={search.value} placeholder={search.placeholder} className="field-input h-8 w-48 pl-8 text-label sm:w-64" />
            </span>
          </span>
        </form>
        {sort && (
          <Drop
            label="Sort"
            icon={
              <>
                <ArrowUpDown aria-hidden="true" className="h-4 w-4" /> {sort.changed ? `Sort: ${sort.label}` : "Sort"}
              </>
            }
            buttonClass={sort.changed ? lit.replace(" bg-primary-50", "") : ghost}
            panelClass="right-0 w-60"
            testId="sort-menu"
          >
            <p className="mb-1 px-2 text-label font-semibold">Sort by</p>
            {links(sort.choices)}
          </Drop>
        )}
        {group && (
          <span className="inline-flex items-center">
            <Drop
              label="Group"
              icon={
                <>
                  <Layers aria-hidden="true" className="h-4 w-4" /> {group.label ? `Group: ${group.label}` : "Group"}
                </>
              }
              buttonClass={group.label ? lit : ghost}
              panelClass="right-0 w-56"
              testId="group-menu"
            >
              <p className="mb-1 px-2 text-label font-semibold">Group by</p>
              {links(group.choices)}
            </Drop>
            {group.label && (
              <Link href={group.clearHref} aria-label="Remove grouping" className="rounded p-1 text-primary-700 hover:bg-primary-50">
                <X aria-hidden="true" className="h-3.5 w-3.5" />
              </Link>
            )}
          </span>
        )}
        {(sizes || options) && (
          <Drop
            label="Options"
            icon={
              <>
                <Settings2 aria-hidden="true" className="h-4 w-4" /> Options
              </>
            }
            buttonClass={ghost}
            panelClass="right-0 w-[min(360px,calc(100vw-2rem))]"
            testId="options-menu"
          >
            {sizes && (
              <>
                <p className="mb-1 px-2 text-label font-semibold">Per page</p>
                {links(sizes)}
              </>
            )}
            {options && <div className={sizes ? "mt-2 border-t border-line pt-2" : ""}>{options}</div>}
          </Drop>
        )}
      </span>
    </div>
  );
}
