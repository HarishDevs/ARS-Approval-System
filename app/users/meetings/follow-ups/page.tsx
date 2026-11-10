import type { Metadata } from "next";
import Link from "next/link";
import { ListChecks } from "lucide-react";
import { requireArea } from "@/server/authorization/guards";
import { EmptyState, PageHeader } from "@/features/shell/PageHeader";
import { ActionReviewForm, CloseOpenPointForm } from "@/features/meetings/MeetingForms";
import { FollowUpBadge, MeetingSections } from "@/features/meetings/MeetingParts";
import { listFollowUps, listOpenPointRegister } from "@/lib/db/repositories/meetings.repository";
import { scopeFor } from "@/server/meetings/service";
import { actionState, FOLLOW_UP_LABEL, type FollowUpState } from "@/server/meetings/rules";
import { indiaDateTimeText } from "@/server/modules/settings";
import { isAdminActor } from "@/server/modules/tasks";

export const metadata: Metadata = { title: "Meeting follow-ups" };
export const dynamic = "force-dynamic";

const VIEWS = [
  { key: "open", label: "Open" },
  { key: "mine", label: "Mine to do" },
  { key: "confirm", label: "To confirm" },
  { key: "overdue", label: "Overdue" },
  { key: "all", label: "All" },
] as const;
type View = (typeof VIEWS)[number]["key"];

// v1.51.0 (D-300): the follow-up register. Every action item from approved
// MOMs (the latest meeting it was carried to), and every open point.
export default async function FollowUpsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const { user } = await requireArea("users");
  const query = await searchParams;
  const view: View = (VIEWS.find((item) => item.key === query.view)?.key ?? "open") as View;
  const q = typeof query.q === "string" ? query.q.trim().slice(0, 100) : "";
  const scope = await scopeFor(user);
  const [rows, openPoints] = await Promise.all([listFollowUps(scope, { ownerOnly: view === "mine" ? user.id : null, q, limit: 500 }), listOpenPointRegister(scope, 300)]);
  const now = new Date();
  const withState = rows.map((row) => ({ row, state: actionState({ taskStatus: row.taskStatus, dueAt: row.taskDueAt, confirmedAt: row.confirmedAt }, now) as FollowUpState }));
  const runs = (row: { meetingOwnerId: number; meetingCoordinatorId: number }) => row.meetingOwnerId === user.id || row.meetingCoordinatorId === user.id || isAdminActor(user);
  const shown = withState.filter(({ row, state }) => {
    if (view === "all") return true;
    if (view === "confirm") return state === "DONE_UNCONFIRMED" && runs(row);
    if (view === "overdue") return state === "OVERDUE";
    return state !== "CONFIRMED" && state !== "CANCELLED";
  });
  const counts = Object.fromEntries((["OPEN", "OVERDUE", "DONE_UNCONFIRMED", "CONFIRMED"] as FollowUpState[]).map((state) => [state, withState.filter((item) => item.state === state).length]));
  return (
    <>
      <PageHeader icon={ListChecks} title="Meeting follow-ups" description="Every action item and open point from approved MOMs, until it is confirmed done or closed." />
      <MeetingSections current="/users/meetings/follow-ups" />
      <dl className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
        {(["OPEN", "OVERDUE", "DONE_UNCONFIRMED", "CONFIRMED"] as FollowUpState[]).map((state) => (
          <div key={state} className="card px-4 py-3">
            <dt className="text-caption text-ink-muted">{FOLLOW_UP_LABEL[state]}</dt>
            <dd className="text-xl font-semibold">{counts[state]}</dd>
          </div>
        ))}
      </dl>
      <div className="mb-3 flex flex-wrap items-end justify-between gap-2">
        <nav aria-label="Follow-up views" className="flex flex-wrap gap-2">
          {VIEWS.map((item) => (
            <Link
              key={item.key}
              href={`/users/meetings/follow-ups?view=${item.key}${q ? `&q=${encodeURIComponent(q)}` : ""}`}
              aria-current={view === item.key ? "page" : undefined}
              className={`rounded-full border px-3 py-1 text-label ${view === item.key ? "border-primary-600 bg-primary-50 font-semibold text-primary-700" : "border-line text-ink-muted hover:text-ink"}`}
            >
              {item.label}
            </Link>
          ))}
        </nav>
        <form action="/users/meetings/follow-ups" method="get" role="search" aria-label="Find follow-ups" className="flex gap-2">
          <input type="hidden" name="view" value={view} />
          <label className="sr-only" htmlFor="fu-q">
            Search
          </label>
          <input id="fu-q" name="q" defaultValue={q} placeholder="Action or meeting" className="field-input" />
          <button type="submit" className="btn-secondary w-auto">
            Find
          </button>
        </form>
      </div>
      {shown.length === 0 ? (
        <EmptyState title="Nothing to follow up here" body="Action items appear once the Meeting Owner approves the MOM." />
      ) : (
        <div className="card overflow-x-auto">
          <table className="data-table" data-testid="follow-up-table">
            <thead>
              <tr>
                <th scope="col">Action</th>
                <th scope="col">Meeting</th>
                <th scope="col">Responsible</th>
                <th scope="col">Due</th>
                <th scope="col">Status</th>
                <th scope="col">Follow-up</th>
              </tr>
            </thead>
            <tbody>
              {shown.map(({ row, state }) => (
                <tr key={row.id}>
                  <td>
                    {row.taskId && (
                      <Link href={`/users/tasks/${row.taskId}`} className="text-primary-700 underline">
                        {row.taskNo}
                      </Link>
                    )}{" "}
                    {row.title}
                    {row.reviewNote && <p className="text-caption text-ink-muted">Note: {row.reviewNote}</p>}
                  </td>
                  <td className="text-label">
                    <Link href={`/users/meetings/${row.meetingId}`} className="text-primary-700 underline">
                      {row.meetingNo}
                    </Link>
                    <p className="text-caption text-ink-muted">{row.meetingTitle}</p>
                  </td>
                  <td className="text-label">{row.ownerName}</td>
                  <td className="text-label">{row.taskDueAt ? indiaDateTimeText(row.taskDueAt) : (row.dueOn ?? "—")}</td>
                  <td>
                    <FollowUpBadge state={state} />
                  </td>
                  <td>
                    {runs(row) && row.taskId && state !== "CONFIRMED" && state !== "CANCELLED" ? (
                      <ActionReviewForm actionId={row.id} canConfirm={state === "DONE_UNCONFIRMED"} canSendBack={state === "DONE_UNCONFIRMED"} />
                    ) : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <section className="mt-6" aria-labelledby="open-points">
        <h2 id="open-points" className="mb-2 font-semibold">
          Open points ({openPoints.length})
        </h2>
        {openPoints.length === 0 ? (
          <p className="text-label text-ink-muted">No open points.</p>
        ) : (
          <ul className="space-y-2">
            {openPoints.map((point) => (
              <li key={point.id} className="card flex flex-wrap items-start justify-between gap-2 px-4 py-3 text-label">
                <div>
                  <p>{point.text}</p>
                  <p className="text-caption text-ink-muted">
                    <Link href={`/users/meetings/${point.meetingId}`} className="text-primary-700 underline">
                      {point.meetingNo}
                    </Link>{" "}
                    · {point.ownerName ?? "No owner"} · {point.reviewOn ? `review on ${point.reviewOn}` : "no review date"}
                  </p>
                </div>
                {(point.meetingOwnerId === user.id || point.meetingCoordinatorId === user.id || isAdminActor(user)) && <CloseOpenPointForm pointId={point.id} />}
              </li>
            ))}
          </ul>
        )}
      </section>
    </>
  );
}
