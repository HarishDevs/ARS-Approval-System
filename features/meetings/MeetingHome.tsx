import Link from "next/link";
import { AlertTriangle, ArrowRight, CalendarClock, CalendarPlus, ClipboardCheck, FilePenLine, Lightbulb, ListChecks } from "lucide-react";
import { FollowUpBadge, MeetingStatusBadge, PointsBadge, whenText } from "@/features/meetings/MeetingParts";
import { KpiGrid, pct, TallyTable, tallyMeetings } from "@/features/meetings/MeetingStats";
import { PeriodPicker } from "@/features/home/HomeClient";
import { dashboardMeetings, listFollowUps, listMeetings, type MeetingListFilter } from "@/lib/db/repositories/meetings.repository";
import { scopeFor } from "@/server/meetings/service";
import { actionState, durationBand, minutesBetween, MODE_LABEL } from "@/server/meetings/rules";
import { indiaDateTimeText } from "@/server/modules/settings";
import { parsePeriod } from "@/server/work/period";
import { indiaDayOf } from "@/features/work/format";

// v1.51.1 (owner: "remove the meeting dashboard from the menu and show it in
// the overview; every card, insight and point needing attention"): Home's
// Meetings view. Count cards, Needs attention, Coming up, approvals, actions,
// then the period's figures, insights, by type and department, and the
// register. Every list is limited to the meetings the person may see; the
// figures follow the "Meetings: dashboard figures" page access.
type Attention = { key: string; text: string; detail: string; href: string; danger: boolean };

export async function MeetingHome({
  user,
  greetingName,
  switcher,
  query,
  base,
  figures,
}: {
  user: { id: number; roles: readonly string[] };
  greetingName: string;
  switcher: React.ReactNode;
  query: Record<string, string | undefined>;
  base: Record<string, string>;
  figures: boolean;
}) {
  const scope = await scopeFor(user);
  const period = parsePeriod({ period: query.period, from: query.from, to: query.to }, indiaDayOf(new Date()), "month");
  const list = (tab: MeetingListFilter["tab"], pageSize: number) => listMeetings(scope, { tab, userId: user.id, q: "", typeId: null, departmentId: null, status: null, from: null, to: null, page: 1, pageSize });
  const [upcoming, toApprove, mine, actions, periodRows] = await Promise.all([
    list("upcoming", 6),
    list("approve", 5),
    list("mine", 200),
    listFollowUps(scope, { ownerOnly: null, q: "", limit: 1000 }),
    figures ? dashboardMeetings(scope, period.from, period.to) : Promise.resolve([]),
  ]);
  const now = new Date();
  const soon = now.getTime() + 86_400_000;
  const coordinated = mine.rows.filter((row) => row.coordinatorId === user.id);
  const momToWrite = coordinated.filter((row) => ["AWAITING_MOM", "MOM_RETURNED"].includes(row.status));
  const withState = actions.map((row) => ({ row, state: actionState({ taskStatus: row.taskStatus, dueAt: row.taskDueAt, confirmedAt: row.confirmedAt }, now) }));
  const runs = (row: { meetingOwnerId: number; meetingCoordinatorId: number }) => row.meetingOwnerId === user.id || row.meetingCoordinatorId === user.id;
  const myActions = withState.filter(({ row, state }) => row.ownerId === user.id && (state === "OPEN" || state === "OVERDUE"));
  const toConfirm = withState.filter(({ row, state }) => state === "DONE_UNCONFIRMED" && runs(row));
  const myOverdue = myActions.filter(({ state }) => state === "OVERDUE");
  const runOverdue = withState.filter(({ row, state }) => state === "OVERDUE" && runs(row) && row.ownerId !== user.id);

  // Needs attention: what is late or about to be, for the person.
  const attention: Attention[] = [];
  for (const row of coordinated) {
    const at = `/users/meetings/${row.id}`;
    if (row.status === "SCHEDULED" && (row.pointsStatus === "DRAFT" || row.pointsStatus === "RETURNED") && row.agendaDueAt && row.agendaDueAt.getTime() < soon)
      attention.push({ key: `p${row.id}`, text: row.agendaDueAt < now ? "Meeting points overdue" : "Meeting points due soon", detail: `${row.title} · due ${indiaDateTimeText(row.agendaDueAt)}`, href: at, danger: row.agendaDueAt < now });
    else if (row.status === "SCHEDULED" && row.pointsStatus === "RETURNED") attention.push({ key: `r${row.id}`, text: "Points returned to you", detail: row.title, href: at, danger: false });
    if (row.status === "SCHEDULED" && row.scheduledEnd < now) attention.push({ key: `s${row.id}`, text: "Meeting time has passed", detail: `${row.title} · start it or record it as held`, href: at, danger: true });
    if (row.status === "IN_PROGRESS" && row.scheduledEnd.getTime() < now.getTime() - 3_600_000) attention.push({ key: `e${row.id}`, text: "Meeting still running", detail: `${row.title} · end it and write the MOM`, href: at, danger: false });
    if (row.status === "MOM_RETURNED") attention.push({ key: `mr${row.id}`, text: "MOM returned to you", detail: row.title, href: at, danger: false });
    if ((row.status === "AWAITING_MOM" || row.status === "MOM_RETURNED") && row.momDueAt && row.momDueAt.getTime() < soon)
      attention.push({ key: `m${row.id}`, text: row.momDueAt < now ? "MOM overdue" : "MOM due soon", detail: `${row.title} · due ${indiaDateTimeText(row.momDueAt)}`, href: at, danger: row.momDueAt < now });
  }
  for (const { row } of myOverdue.slice(0, 5)) attention.push({ key: `a${row.id}`, text: "Your action is overdue", detail: `${row.title} · ${row.meetingNo}`, href: row.taskId ? `/users/tasks/${row.taskId}` : `/users/meetings/${row.meetingId}`, danger: true });
  if (runOverdue.length) attention.push({ key: "ro", text: `${runOverdue.length} overdue action${runOverdue.length === 1 ? "" : "s"} in meetings you run`, detail: "Follow them up, or carry them to a follow-up meeting", href: "/users/meetings/follow-ups?view=overdue", danger: true });
  if (toConfirm.length) attention.push({ key: "tc", text: `${toConfirm.length} completed action${toConfirm.length === 1 ? "" : "s"} to confirm`, detail: "Confirm them as done, or send them back", href: "/users/meetings/follow-ups?view=confirm", danger: false });
  attention.sort((a, b) => Number(b.danger) - Number(a.danger));

  const { total, byType, byDepartment } = tallyMeetings(periodRows);
  const insights = figures ? insightsOf(periodRows, total, byDepartment) : [];
  const tiles = [
    { label: "Upcoming meetings", note: "Scheduled, not yet held", value: upcoming.total, href: "/users/meetings", icon: CalendarClock, tone: "bg-primary-50 text-primary-700", alert: false, danger: false },
    { label: "To approve", note: "Points and MOM sent to you", value: toApprove.total, href: "/users/meetings?tab=approve", icon: ClipboardCheck, tone: "bg-warning-50 text-warning-600", alert: toApprove.total > 0, danger: false },
    { label: "MOM to write", note: "Meetings you coordinate", value: momToWrite.length, href: "/users/meetings?tab=mine", icon: FilePenLine, tone: "bg-[color:var(--violet-bg)] text-[color:var(--violet-fg)]", alert: momToWrite.length > 0, danger: false },
    {
      label: "My open actions",
      note: myOverdue.length ? `${myOverdue.length} overdue` : "From approved MOMs",
      value: myActions.length,
      href: "/users/meetings/follow-ups?view=mine",
      icon: myOverdue.length ? AlertTriangle : ListChecks,
      tone: myOverdue.length ? "bg-danger-50 text-danger-600" : "bg-success-50 text-success-600",
      alert: myOverdue.length > 0,
      danger: myOverdue.length > 0,
    },
  ];

  return (
    <div data-testid="meeting-overview">
      <header className="mb-6 flex flex-wrap items-center justify-between gap-4">
        <div className="flex min-w-0 items-center gap-3">
          <span className="page-icon grid h-12 w-12 shrink-0 place-items-center rounded-xl bg-primary-50 text-primary-700" aria-hidden="true">
            <CalendarClock className="h-6 w-6" />
          </span>
          <div className="min-w-0">
            <h1 className="text-title font-semibold tracking-tight">Meeting Overview</h1>
            <p className="text-label text-ink-muted">Welcome back, {greetingName}. What needs you, what&apos;s coming up and how meetings are running.</p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          {switcher}
          <Link href="/users/meetings/new" className="btn-primary btn-compact inline-flex items-center gap-1.5">
            <CalendarPlus aria-hidden="true" className="h-4 w-4" /> Schedule meeting
          </Link>
        </div>
      </header>

      <div className="grid grid-cols-1 gap-3 min-[420px]:grid-cols-2 xl:grid-cols-4" data-testid="meeting-tiles">
        {tiles.map((tile) => (
          <Link key={tile.label} href={tile.href} className="card-link status-card flex items-center gap-3 px-4 py-3">
            <span className={`grid h-11 w-11 shrink-0 place-items-center rounded-xl ${tile.tone}`} aria-hidden="true">
              <tile.icon className="h-5 w-5" />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-label font-semibold">{tile.label}</span>
              <span className="block text-caption leading-snug text-ink-muted">{tile.note}</span>
            </span>
            <span className={`text-2xl font-bold tabular-nums ${tile.alert ? (tile.danger ? "text-danger-600" : "text-primary-700") : "text-ink"}`}>{tile.value}</span>
          </Link>
        ))}
      </div>

      <div className="mt-6 grid gap-6 xl:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
        <div className="min-w-0 space-y-6">
          <section className="card min-w-0 px-4 py-4 sm:px-5" aria-labelledby="mh-attention" data-testid="meeting-attention">
            <SectionHead id="mh-attention" title="Needs attention" />
            {attention.length === 0 ? (
              <p className="py-6 text-center text-label text-ink-muted">Nothing late or due soon. Well done.</p>
            ) : (
              <ul className="divide-y divide-line">
                {attention.slice(0, 10).map((item) => (
                  <li key={item.key}>
                    <Link href={item.href} className="flex items-start gap-3 py-2.5 hover:text-primary-700">
                      <AlertTriangle aria-hidden="true" className={`mt-0.5 h-4 w-4 shrink-0 ${item.danger ? "text-danger-600" : "text-warning-600"}`} />
                      <span className="min-w-0">
                        <span className="block text-label font-semibold">{item.text}</span>
                        <span className="block truncate text-caption text-ink-muted">{item.detail}</span>
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className="card min-w-0 px-4 py-4 sm:px-5" aria-labelledby="mh-upcoming">
            <SectionHead id="mh-upcoming" title="Coming up" href="/users/meetings" count={upcoming.total} />
            {upcoming.rows.length === 0 ? (
              <p className="py-6 text-center text-label text-ink-muted">No meetings scheduled.</p>
            ) : (
              <ul className="divide-y divide-line">
                {upcoming.rows.map((row) => (
                  <li key={row.id}>
                    <Link href={`/users/meetings/${row.id}`} className="flex flex-wrap items-start justify-between gap-2 py-2.5 hover:text-primary-700">
                      <span className="min-w-0">
                        <span className="block font-medium">{row.title}</span>
                        <span className="block text-caption text-ink-muted">
                          {whenText(row.scheduledStart, row.scheduledEnd)} · {MODE_LABEL[row.mode]} · {row.typeName}
                        </span>
                      </span>
                      <span className="flex shrink-0 gap-1.5">
                        <MeetingStatusBadge status={row.status} />
                        {row.status === "SCHEDULED" && <PointsBadge status={row.pointsStatus} />}
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className="card min-w-0 px-4 py-4 sm:px-5" aria-labelledby="mh-actions">
            <SectionHead id="mh-actions" title="My action items" href="/users/meetings/follow-ups?view=mine" count={myActions.length} />
            {myActions.length === 0 ? (
              <p className="py-6 text-center text-label text-ink-muted">No open action items for you.</p>
            ) : (
              <ul className="divide-y divide-line">
                {myActions.slice(0, 6).map(({ row, state }) => (
                  <li key={row.id} className="flex flex-wrap items-start justify-between gap-2 py-2.5">
                    <span className="min-w-0">
                      {row.taskId ? (
                        <Link href={`/users/tasks/${row.taskId}`} className="font-medium hover:text-primary-700">
                          {row.title}
                        </Link>
                      ) : (
                        <span className="font-medium">{row.title}</span>
                      )}
                      <span className="block text-caption text-ink-muted">
                        {row.meetingNo} · {row.taskDueAt ? `due ${indiaDateTimeText(row.taskDueAt)}` : "no due date"}
                      </span>
                    </span>
                    <FollowUpBadge state={state} />
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>

        <div className="min-w-0 space-y-6">
          <section className="card min-w-0 px-4 py-4 sm:px-5" aria-labelledby="mh-approve">
            <SectionHead id="mh-approve" title="Waiting for my approval" href="/users/meetings?tab=approve" count={toApprove.total} />
            {toApprove.rows.length === 0 ? (
              <p className="py-4 text-label text-ink-muted">Nothing to approve.</p>
            ) : (
              <ul className="space-y-2">
                {toApprove.rows.map((row) => (
                  <li key={row.id}>
                    <Link href={`/users/meetings/${row.id}`} className="block rounded-md border border-line px-3 py-2 hover:border-primary-600">
                      <span className="block text-label font-medium">{row.title}</span>
                      <span className="block text-caption text-ink-muted">
                        {row.status === "MOM_SUBMITTED" ? "MOM" : "Meeting points"} from {row.coordinatorName}
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className="card min-w-0 px-4 py-4 sm:px-5" aria-labelledby="mh-confirm">
            <SectionHead id="mh-confirm" title="Done, to confirm" href="/users/meetings/follow-ups?view=confirm" count={toConfirm.length} />
            {toConfirm.length === 0 ? (
              <p className="py-4 text-label text-ink-muted">No completed actions waiting for you to confirm.</p>
            ) : (
              <ul className="space-y-2">
                {toConfirm.slice(0, 5).map(({ row }) => (
                  <li key={row.id}>
                    <Link href={`/users/meetings/${row.meetingId}`} className="block rounded-md border border-line px-3 py-2 hover:border-primary-600">
                      <span className="block text-label font-medium">{row.title}</span>
                      <span className="block text-caption text-ink-muted">
                        {row.ownerName} · {row.meetingNo}
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </section>

          {figures && (
            <section className="card min-w-0 px-4 py-4 sm:px-5" aria-labelledby="mh-insights" data-testid="meeting-insights">
              <h2 id="mh-insights" className="mb-3 flex items-center gap-2 text-[calc(17px*var(--text-scale,1))] font-semibold">
                <Lightbulb aria-hidden="true" className="h-4 w-4 text-warning-600" /> Insights · {period.label}
              </h2>
              {insights.length === 0 ? (
                <p className="text-label text-ink-muted">No meetings in this period yet.</p>
              ) : (
                <ul className="list-disc space-y-1.5 pl-5 text-label">
                  {insights.map((text) => (
                    <li key={text}>{text}</li>
                  ))}
                </ul>
              )}
            </section>
          )}
        </div>
      </div>

      {figures && (
        <section className="mt-6 space-y-6" aria-labelledby="mh-figures" data-testid="meeting-figures">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 id="mh-figures" className="text-[calc(17px*var(--text-scale,1))] font-semibold">
              How meetings are running
            </h2>
            <PeriodPicker value={period.key} from={period.fromDay} to={period.toDay} base={base} />
          </div>
          <KpiGrid total={total} />
          {periodRows.length > 0 && (
            <>
              <div className="grid gap-6 2xl:grid-cols-2">
                <TallyTable caption="By meeting type" rows={byType} />
                <TallyTable caption="By department" rows={byDepartment} />
              </div>
              <div className="card overflow-x-auto">
                <table className="data-table" data-testid="meeting-register">
                  <caption className="px-4 py-2 text-left font-semibold">Register</caption>
                  <thead>
                    <tr>
                      <th scope="col">Meeting</th>
                      <th scope="col">Type</th>
                      <th scope="col">Department</th>
                      <th scope="col">Duration</th>
                      <th scope="col">Present</th>
                      <th scope="col">Actions</th>
                      <th scope="col">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {periodRows.slice(0, 100).map((row) => {
                      const minutes = minutesBetween(row.actualStart, row.actualEnd);
                      return (
                        <tr key={row.id}>
                          <td>
                            <Link href={`/users/meetings/${row.id}`} className="text-primary-700 underline">
                              {row.meetingNo}
                            </Link>
                            <p className="text-caption text-ink-muted">{row.title}</p>
                          </td>
                          <td className="text-label">{row.typeName}</td>
                          <td className="text-label">{row.departmentName ?? "—"}</td>
                          <td className="text-label">{minutes === null ? "—" : `${minutes} min (${durationBand(minutes)})`}</td>
                          <td className="text-label">
                            {row.present} of {row.participants}
                          </td>
                          <td className="text-label">
                            {row.actionsDone} of {row.actions}
                            {row.actionsOverdue ? `, ${row.actionsOverdue} overdue` : ""}
                          </td>
                          <td>
                            <MeetingStatusBadge status={row.status} />
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
                {periodRows.length > 100 && <p className="px-4 py-2 text-caption text-ink-muted">The latest 100 of {periodRows.length}. Choose a shorter period to see the rest.</p>}
              </div>
            </>
          )}
        </section>
      )}
    </div>
  );
}

// Plain-language findings for the period (only what the figures show).
function insightsOf(rows: Awaited<ReturnType<typeof dashboardMeetings>>, total: ReturnType<typeof tallyMeetings>["total"], byDepartment: ReturnType<typeof tallyMeetings>["byDepartment"]): string[] {
  if (rows.length === 0) return [];
  const out: string[] = [];
  const late = rows.filter((row) => row.startedOnTime === false).length;
  if (total.startJudged) out.push(late ? `${late} of ${total.startJudged} meetings started late (more than 5 minutes).` : total.startJudged === 1 ? "The meeting held started on time." : `All ${total.startJudged} meetings held started on time.`);
  if (total.momJudged) out.push(`MOM sent in time for ${pct(total.momOnTime, total.momJudged)} of meetings (${total.momOnTime} of ${total.momJudged}).`);
  const awaiting = rows.filter((row) => row.status === "AWAITING_MOM" || row.status === "MOM_RETURNED").length;
  if (awaiting) out.push(`${awaiting} meeting${awaiting === 1 ? " is" : "s are"} still waiting for the MOM.`);
  if (total.invited) out.push(`Attendance was ${pct(total.present, total.invited)} (${total.present} of ${total.invited} invited).`);
  if (total.actions) out.push(`${total.done} of ${total.actions} action items are done${total.overdue ? `; ${total.overdue} overdue` : ""}.`);
  const worst = [...byDepartment].filter((row) => row.overdue > 0).sort((a, b) => b.overdue - a.overdue)[0];
  if (worst) out.push(`Most overdue actions: ${worst.name} (${worst.overdue}).`);
  if (total.cancelled) out.push(`${total.cancelled} meeting${total.cancelled === 1 ? " was" : "s were"} cancelled.`);
  return out.slice(0, 6);
}

function SectionHead({ id, title, href, count = 0 }: { id: string; title: string; href?: string; count?: number }) {
  return (
    <div className="mb-3 flex items-baseline justify-between gap-2">
      <h2 id={id} className="text-[calc(17px*var(--text-scale,1))] font-semibold">
        {title}
      </h2>
      {href && count > 0 && (
        <Link href={href} className="link inline-flex items-center gap-1 text-label">
          View all <ArrowRight aria-hidden="true" className="h-4 w-4" />
        </Link>
      )}
    </div>
  );
}
