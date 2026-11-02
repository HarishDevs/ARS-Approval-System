import Link from "next/link";
import { Megaphone, Plus, Search, Send, Inbox } from "lucide-react";
import { EmptyState } from "@/features/ui/Display";
import { SafeText } from "@/features/ui/SafeText";
import { ScreenTitle, SheetChoices, SheetLink, ViewDock, type SheetView } from "@/features/mobile/BottomSheet";
import { ADD_CLASS } from "@/features/mobile/dock";

// v1.46.0 (V143-16, owner's Asana pattern): Information on a phone: the
// big title with … (Received / Sent by me), flat rows, the quick filters in
// Choose view, search and sort in Manage view, + for new information. The
// same rows and filters as the computer's list (features/modules/InfoListScreen).
export interface MobileInfoRow {
  id: number;
  title: string;
  infoNo: string;
  detail: string; // type · from (or recipients)
  priority: "NORMAL" | "IMPORTANT" | "URGENT";
  unread: boolean;
  chip: { text: string; tone: "danger" | "warning" | "success" | "neutral" };
}

const DOT = { URGENT: "bg-[color:var(--m-red)]", IMPORTANT: "bg-warning-solid", NORMAL: "" } as const;
const PRIORITY_TEXT = { URGENT: "Urgent", IMPORTANT: "Important", NORMAL: "" } as const;
const CHIP = {
  danger: "bg-danger-50 text-danger-600",
  warning: "bg-warning-50 text-warning-600",
  success: "bg-success-50 text-success-600",
  neutral: "bg-surface-muted text-ink-muted",
} as const;

export function MobileInfoList({
  title,
  sent,
  rows,
  views,
  sorts,
  search,
  canNew,
  pages,
}: {
  title: string;
  sent: boolean;
  rows: MobileInfoRow[];
  views: SheetView[];
  sorts: SheetView[];
  search: { action: string; value: string; keep: Record<string, string> };
  canNew: boolean;
  pages: { prev: string | null; next: string | null; text: string } | null;
}) {
  const menu = (
    <nav aria-label="Information pages">
      <SheetLink href="/users/information" icon={<Inbox className="h-5 w-5" />} label="Received" value={sent ? undefined : "Open"} />
      <SheetLink href="/users/information/sent" icon={<Send className="h-5 w-5" />} label="Sent by me" value={sent ? "Open" : undefined} />
      {canNew && <SheetLink href="/users/information/new" icon={<Megaphone className="h-5 w-5" />} label="New information" />}
    </nav>
  );
  const manage = (
    <div>
      <form method="get" action={search.action} role="search" className="pt-2">
        {Object.entries(search.keep).map(([name, value]) => (
          <input key={name} type="hidden" name={name} value={value} />
        ))}
        <label className="flex min-h-12 items-center gap-3 rounded-full bg-surface-muted px-4">
          <Search aria-hidden="true" className="h-5 w-5 text-ink-muted" />
          <span className="sr-only">Search information</span>
          <input name="q" type="search" defaultValue={search.value} maxLength={100} placeholder="Number, subject or message" enterKeyHint="search" className="min-w-0 flex-1 bg-transparent text-[16px] outline-none" />
        </label>
      </form>
      <p className="pt-4 text-[13px] font-semibold uppercase tracking-wide text-ink-muted">Sort</p>
      <SheetChoices label="Sort" items={sorts} />
    </div>
  );
  return (
    <div className="pb-20" data-testid="mobile-information">
      <ScreenTitle title={title} menu={menu} menuLabel="Information pages" />
      {search.value && (
        <p className="pt-3 text-[14px] text-ink-muted">
          Searching: “{search.value}” ·{" "}
          <Link href={views.find((view) => view.current)?.href ?? search.action} className="font-semibold text-[color:var(--m-navy-text)]">
            Clear
          </Link>
        </p>
      )}
      {rows.length === 0 ? (
        <div className="pt-4">
          <EmptyState title={sent ? "Nothing sent yet" : "Nothing here"} body={sent ? "Information you write shows here with who read it." : "Information sent to you shows here."} />
        </div>
      ) : (
        <ul className="-mx-4">
          {rows.map((row) => (
            <li key={row.id}>
              <Link href={`/users/information/${row.id}`} className="flex min-h-[72px] items-center gap-3 border-b border-line px-4 py-3" data-testid="m-info-row">
                <span aria-hidden="true" className={`h-2.5 w-2.5 shrink-0 rounded-full ${row.unread ? "bg-primary-600" : "bg-transparent"}`} />
                <span className="min-w-0 flex-1">
                  <span className={`block truncate text-[16px] ${row.unread ? "font-semibold" : ""}`}>
                    {row.unread && <span className="sr-only">Unread: </span>}
                    <SafeText text={row.title} />
                  </span>
                  <span className="block truncate text-[13px] text-ink-muted">
                    <span className="font-mono">{row.infoNo}</span> · {row.detail}
                  </span>
                  {row.priority !== "NORMAL" && (
                    <span className="flex items-center gap-1.5 text-[13px] text-ink-muted">
                      <span aria-hidden="true" className={`h-2.5 w-2.5 rounded-full ${DOT[row.priority]}`} />
                      {PRIORITY_TEXT[row.priority]}
                    </span>
                  )}
                </span>
                <span className={`shrink-0 rounded-md px-2.5 py-1 text-[12px] font-medium ${CHIP[row.chip.tone]}`}>{row.chip.text}</span>
              </Link>
            </li>
          ))}
        </ul>
      )}
      {pages && (
        <nav aria-label="Pages" className="flex items-center justify-between pt-4 text-[14px]">
          {pages.prev ? (
            <Link href={pages.prev} className="min-h-11 content-center font-semibold text-[color:var(--m-navy-text)]">
              ← Previous
            </Link>
          ) : (
            <span />
          )}
          <span className="text-ink-muted">{pages.text}</span>
          {pages.next ? (
            <Link href={pages.next} className="min-h-11 content-center font-semibold text-[color:var(--m-navy-text)]">
              Next →
            </Link>
          ) : (
            <span />
          )}
        </nav>
      )}
      <ViewDock
        label="Information lists"
        views={views}
        manage={manage}
        add={
          canNew ? (
            <Link href="/users/information/new" aria-label="New information" className={ADD_CLASS} data-testid="m-new-info">
              <Plus aria-hidden="true" className="h-6 w-6" strokeWidth={2.5} />
            </Link>
          ) : undefined
        }
      />
    </div>
  );
}
