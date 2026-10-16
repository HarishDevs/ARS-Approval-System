import { featureOn } from "@/server/settings/features";
import { notFound } from "next/navigation";
import Link from "next/link";
import { requireArea } from "@/server/authorization/guards";
import { EmptyState, PageHeader } from "@/features/shell/PageHeader";
import { Badge, type Tone } from "@/features/ui/Display";
import { countInfo, listInfo } from "@/lib/db/repositories/info.repository";
import { listModuleTypes, listTypeVersions } from "@/lib/db/repositories/module-types.repository";
import { listActiveUserOptions } from "@/lib/db/repositories/admin-users.repository";
import { INFO_TAB_LABEL, infoListSql, infoQuery, parseInfoFilters, tabsFor, type InfoBase } from "@/server/modules/info-lists";
import { infoState, INFO_STATE_LABEL, type InfoState } from "@/server/modules/info-rules";
import { indiaDateTimeText, INFO_PRIORITIES, INFO_PRIORITY_LABEL, type InfoPriority } from "@/server/modules/settings";
import { PAGE_SIZES } from "@/server/modules/task-lists";
import { indiaToday } from "@/server/modules/information";

// v1.9.0 (D-143): Information inbox and Sent by me.
const TITLE: Record<InfoBase, string> = { INBOX: "Information inbox", SENT: "Information sent by me" };
const PATH: Record<InfoBase, string> = { INBOX: "/users/information", SENT: "/users/information/sent" };
export const INFO_STATE_TONE: Record<InfoState, Tone> = { DRAFT: "warning", PUBLISHED: "success", WITHDRAWN: "neutral", ARCHIVED: "neutral", EXPIRED: "neutral" };
export const INFO_PRIORITY_TONE: Record<InfoPriority, Tone> = { NORMAL: "neutral", IMPORTANT: "warning", URGENT: "danger" };

export async function InfoListScreen({ base, query }: { base: InfoBase; query: Record<string, string | string[] | undefined> }) {
  const { user } = await requireArea("users");
  if (!(await featureOn("information", user))) notFound();
  const filters = parseInfoFilters(query, base);
  const today = indiaToday();
  const [types, people] = await Promise.all([listModuleTypes("INFO"), listActiveUserOptions()]);
  const versions = (await Promise.all(types.map((type) => listTypeVersions(type.id)))).flat();
  const searchable = [...new Set(versions.flatMap((version) => version.form.filter((field) => field.searchable).map((field) => field.key)))];
  const sql = infoListSql(filters, base, user.id, today, searchable);
  const [list, counts] = await Promise.all([
    listInfo(sql.where, sql.params, sql.orderBy, filters.size, (filters.page - 1) * filters.size, user.id),
    Promise.all(
      tabsFor(base).map(async (tab) => {
        const counted = infoListSql(filters, base, user.id, today, searchable, tab);
        return [tab, await countInfo(counted.where, counted.params, user.id)] as const;
      }),
    ),
  ]);
  const pages = Math.max(1, Math.ceil(list.total / filters.size));
  const path = PATH[base];
  return (
    <>
      <PageHeader title={TITLE[base]} description={base === "INBOX" ? "Information sent to you. Opening one marks it read; acknowledging is a separate button." : "Information you wrote: drafts, published, withdrawn and archived, with who read and acknowledged it."}>
        <Link href="/users/information/new" className="btn-primary btn-compact">
          New information
        </Link>
      </PageHeader>
      <nav aria-label="Quick filters" className="mb-4 flex flex-wrap gap-2">
        {counts.map(([tab, count]) => (
          <Link key={tab} href={`${path}${infoQuery(filters, base, { tab })}`} aria-current={filters.tab === tab ? "page" : undefined} className={`rounded-full border px-3 py-1 text-label ${filters.tab === tab ? "border-primary-600 bg-primary-50 font-semibold text-primary-700" : "border-line text-ink-muted hover:bg-surface-muted"}`}>
            {INFO_TAB_LABEL[tab]} ({count})
          </Link>
        ))}
      </nav>
      <details className="card mb-4 px-5 py-3" open={Boolean(filters.q || filters.typeId || filters.priority || filters.senderId || filters.from || filters.to)}>
        <summary className="cursor-pointer font-medium">More filters</summary>
        <form method="get" action={path} className="mt-3 grid gap-3 md:grid-cols-4">
          <input type="hidden" name="tab" value={filters.tab} />
          <label className="text-label md:col-span-2">
            Search (number, subject, message, searchable fields)
            <input name="q" defaultValue={filters.q} maxLength={100} className="field-input" />
          </label>
          <label className="text-label">
            Type
            <select name="type" defaultValue={filters.typeId ?? ""} className="field-input">
              <option value="">Any</option>
              {types.map((type) => (
                <option key={type.id} value={type.id}>
                  {type.name}
                </option>
              ))}
            </select>
          </label>
          <label className="text-label">
            Importance
            <select name="priority" defaultValue={filters.priority ?? ""} className="field-input">
              <option value="">Any</option>
              {INFO_PRIORITIES.map((priority) => (
                <option key={priority} value={priority}>
                  {INFO_PRIORITY_LABEL[priority]}
                </option>
              ))}
            </select>
          </label>
          {base === "INBOX" && (
            <label className="text-label">
              From
              <select name="sender" defaultValue={filters.senderId ?? ""} className="field-input">
                <option value="">Anyone</option>
                {people.map((person) => (
                  <option key={person.id} value={person.id}>
                    {person.name}
                  </option>
                ))}
              </select>
            </label>
          )}
          <label className="text-label">
            {base === "INBOX" ? "Published from" : "Created from"}
            <input type="date" name="from" defaultValue={filters.from ?? ""} className="field-input" />
          </label>
          <label className="text-label">
            To
            <input type="date" name="to" defaultValue={filters.to ?? ""} className="field-input" />
          </label>
          <label className="text-label">
            Sort
            <select name="sort" defaultValue={filters.sort} className="field-input">
              <option value="newest">Newest</option>
              <option value="oldest">Oldest</option>
              <option value="expiry">Expiring first</option>
            </select>
          </label>
          <label className="text-label">
            Per page
            <select name="size" defaultValue={filters.size} className="field-input">
              {PAGE_SIZES.map((size) => (
                <option key={size}>{size}</option>
              ))}
            </select>
          </label>
          <div className="flex items-end gap-2 md:col-span-4">
            <button type="submit" className="btn-primary btn-compact">
              Apply
            </button>
            <Link href={path} className="btn-secondary btn-compact">
              Clear all
            </Link>
          </div>
        </form>
      </details>
      {list.rows.length === 0 ? (
        <EmptyState title="Nothing here" body="Try another tab or clear the filters." />
      ) : (
        <div className="card overflow-x-auto">
          <table className="data-table" data-testid="info-table">
            <caption className="sr-only">{TITLE[base]}</caption>
            <thead>
              <tr>
                <th scope="col">Subject</th>
                <th scope="col">Type</th>
                <th scope="col">{base === "INBOX" ? "From" : "Recipients"}</th>
                <th scope="col">Importance</th>
                <th scope="col">{base === "INBOX" ? "You" : "Read / acknowledged"}</th>
                <th scope="col">{base === "INBOX" ? "Published" : "Status"}</th>
              </tr>
            </thead>
            <tbody>
              {list.rows.map((item) => {
                const state = infoState(item, today);
                const unread = base === "INBOX" && !item.readAt;
                return (
                  <tr key={item.id}>
                    <td>
                      <Link href={`/users/information/${item.id}`} className={`link ${unread ? "font-semibold" : ""}`}>
                        {unread && <span role="img" aria-label="Unread" className="mr-1.5 inline-block h-2 w-2 rounded-full bg-primary-600 align-middle" />}
                        {item.title}
                      </Link>
                      <p className="font-mono text-caption text-ink-muted">{item.infoNo}</p>
                    </td>
                    <td className="text-label">{item.typeName}</td>
                    <td className="text-label">{base === "INBOX" ? item.createdByName : item.status === "DRAFT" ? "—" : item.recipients}</td>
                    <td>
                      <Badge tone={INFO_PRIORITY_TONE[item.priority]}>{INFO_PRIORITY_LABEL[item.priority]}</Badge>
                    </td>
                    <td className="text-label">
                      {base === "INBOX"
                        ? item.ackRequired
                          ? item.acknowledgedAt
                            ? "Acknowledged"
                            : "To acknowledge"
                          : item.readAt
                            ? "Read"
                            : "Unread"
                        : item.status === "DRAFT"
                          ? "—"
                          : `${item.read} / ${item.ackRequired ? item.acknowledged : "—"}`}
                    </td>
                    <td className="text-label">
                      {base === "INBOX" ? (item.publishedAt ? indiaDateTimeText(item.publishedAt) : "—") : <Badge tone={INFO_STATE_TONE[state]}>{INFO_STATE_LABEL[state]}</Badge>}
                      {base === "INBOX" && state !== "PUBLISHED" && <span className="block text-caption text-ink-muted">{INFO_STATE_LABEL[state]}</span>}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      {pages > 1 && (
        <nav aria-label="Pages" className="mt-4 flex items-center justify-between text-label">
          {filters.page > 1 ? <Link href={`${path}${infoQuery(filters, base, { page: filters.page - 1 })}`} className="link">← Previous</Link> : <span />}
          <span className="text-ink-muted">
            Page {filters.page} of {pages} · {list.total} items
          </span>
          {filters.page < pages ? <Link href={`${path}${infoQuery(filters, base, { page: filters.page + 1 })}`} className="link">Next →</Link> : <span />}
        </nav>
      )}
    </>
  );
}
