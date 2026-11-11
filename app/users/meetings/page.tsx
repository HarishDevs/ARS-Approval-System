import type { Metadata } from "next";
import Link from "next/link";
import { CalendarClock } from "lucide-react";
import { requireArea } from "@/server/authorization/guards";
import { EmptyState, PageHeader } from "@/features/shell/PageHeader";
import { NoResults, Pagination } from "@/features/ui/Display";
import { ListToolbar } from "@/features/ui/ListToolbar";
import { MeetingSections, MeetingStatusBadge, PointsBadge, whenText } from "@/features/meetings/MeetingParts";
import { listMeetings, listMeetingTypes, type MeetingListFilter } from "@/lib/db/repositories/meetings.repository";
import { scopeFor } from "@/server/meetings/service";
import { MEETING_STATUSES, MODE_LABEL, STATUS_LABEL } from "@/server/meetings/rules";

export const metadata: Metadata = { title: "Meetings" };
export const dynamic = "force-dynamic";

const TABS = [
  { key: "upcoming", label: "Upcoming" },
  { key: "mine", label: "I run" },
  { key: "approve", label: "To approve" },
  { key: "past", label: "Past" },
  { key: "all", label: "All" },
] as const;
type Tab = (typeof TABS)[number]["key"];
const PAGE_SIZE = 25;

// v1.51.0 (D-300): the meetings the person is on (and, for HODs, their
// departments' meetings; ED, MD and IT see all).
export default async function MeetingsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const { user } = await requireArea("users");
  const query = await searchParams;
  const one = (key: string) => (typeof query[key] === "string" ? (query[key] as string) : "");
  const tab: Tab = (TABS.find((item) => item.key === one("tab"))?.key ?? "upcoming") as Tab;
  const q = one("q").trim().slice(0, 100);
  const typeId = /^\d{1,10}$/.test(one("type")) ? Number(one("type")) : null;
  const status = (MEETING_STATUSES as readonly string[]).includes(one("status")) ? one("status") : null;
  const page = /^\d{1,4}$/.test(one("page")) ? Math.max(1, Number(one("page"))) : 1;
  const scope = await scopeFor(user);
  const base: Omit<MeetingListFilter, "tab"> = { userId: user.id, q, typeId, departmentId: null, status, from: null, to: null, page, pageSize: PAGE_SIZE };
  const [list, types, approveCount] = await Promise.all([
    listMeetings(scope, { ...base, tab }),
    listMeetingTypes(true),
    listMeetings(scope, { ...base, tab: "approve", q: "", typeId: null, status: null, page: 1, pageSize: 1 }),
  ]);
  const pages = Math.max(1, Math.ceil(list.total / PAGE_SIZE));
  const href = (changes: Record<string, string | number | null>) => {
    const params = new URLSearchParams();
    const merged = { tab, q, type: typeId, status, page, ...changes };
    for (const [key, value] of Object.entries(merged))
      if (value !== null && value !== "" && !(key === "page" && value === 1) && !(key === "tab" && value === "upcoming")) params.set(key, String(value));
    const text = params.toString();
    return `/users/meetings${text ? `?${text}` : ""}`;
  };
  const filtered = Boolean(q || typeId || status);
  return (
    <>
      <PageHeader icon={CalendarClock} title="Meetings" description="Schedule meetings, approve points and MOM, and follow up the action items.">
        <Link href="/users/meetings/new" className="btn-primary btn-compact">
          Schedule a meeting
        </Link>
      </PageHeader>
      <MeetingSections current="/users/meetings" />
      <nav aria-label="Meeting lists" className="mb-3 flex flex-wrap gap-2">
        {TABS.map((item) => (
          <Link
            key={item.key}
            href={href({ tab: item.key, page: 1 })}
            aria-current={tab === item.key ? "page" : undefined}
            className={`rounded-full border px-3 py-1 text-label ${tab === item.key ? "border-primary-600 bg-primary-50 font-semibold text-primary-700" : "border-line text-ink-muted hover:text-ink"}`}
          >
            {item.label}
            {item.key === "approve" && approveCount.total > 0 ? ` (${approveCount.total})` : ""}
          </Link>
        ))}
      </nav>
      {/* v1.51.1 (owner): toolbar filters only (Filter, Search icon). */}
      <ListToolbar
        id="meeting-filters"
        path="/users/meetings"
        label="Filter meetings"
        keep={{ tab: tab !== "upcoming" ? tab : undefined }}
        search={{ name: "q", value: q, placeholder: "Title or meeting number" }}
        filterCount={[typeId, status].filter(Boolean).length}
        clearHref={filtered ? href({ q: "", type: null, status: null, page: 1 }) : null}
        filters={
          <>
            <div>
              <label htmlFor="mf-type" className="field-label">
                Type
              </label>
              <select id="mf-type" name="type" defaultValue={typeId ?? ""} className="field-input h-10">
                <option value="">Any type</option>
                {types.map((type) => (
                  <option key={type.id} value={type.id}>
                    {type.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label htmlFor="mf-status" className="field-label">
                Status
              </label>
              <select id="mf-status" name="status" defaultValue={status ?? ""} className="field-input h-10">
                <option value="">Any status</option>
                {MEETING_STATUSES.map((value) => (
                  <option key={value} value={value}>
                    {STATUS_LABEL[value]}
                  </option>
                ))}
              </select>
            </div>
          </>
        }
      />
      {list.rows.length === 0 ? (
        filtered ? (
          <NoResults query={q || null} resetHref={href({ q: "", type: null, status: null, page: 1 })} what="meetings" />
        ) : (
          <EmptyState
            title={tab === "approve" ? "Nothing to approve" : "No meetings here yet"}
            body={tab === "approve" ? "Meeting points and MOM sent to you as Meeting Owner show here." : "Meetings you are on show here. Schedule one to start."}
          />
        )
      ) : (
        <ul className="space-y-2" data-testid="meeting-list">
          {list.rows.map((row) => (
            <li key={row.id}>
              <Link href={`/users/meetings/${row.id}`} className="card block px-4 py-3 hover:border-primary-600">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="font-semibold">{row.title}</p>
                    <p className="text-label text-ink-muted">
                      {row.meetingNo} · {row.typeName} · {whenText(row.scheduledStart, row.scheduledEnd)} · {MODE_LABEL[row.mode]}
                    </p>
                    <p className="text-caption text-ink-muted">
                      Owner {row.ownerName} · Coordinator {row.coordinatorName} · {row.participants} invited
                      {row.departmentName ? ` · ${row.departmentName}` : ""}
                      {row.openActions > 0 ? ` · ${row.openActions} open action(s)` : ""}
                    </p>
                  </div>
                  <div className="flex shrink-0 flex-wrap gap-1.5">
                    <MeetingStatusBadge status={row.status} />
                    {(row.status === "SCHEDULED" || row.status === "IN_PROGRESS") && <PointsBadge status={row.pointsStatus} />}
                  </div>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
      {pages > 1 && (
        <div className="mt-4">
          <Pagination page={page} pages={pages} hrefFor={(next) => href({ page: next })} />
        </div>
      )}
    </>
  );
}
