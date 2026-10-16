import type { Metadata } from "next";
import Link from "next/link";
import { requireArea } from "@/server/authorization/guards";
import { PageHeader } from "@/features/shell/PageHeader";
import { ProfileTabs } from "@/features/shell/ProfileTabs";
import { Badge } from "@/features/ui/Display";
import { CommandButton } from "@/features/integrations/CalendarForms";
import { CalendarChoiceForm, DisconnectForm } from "@/features/integrations/ConnectionForms";
import { connectionCommandAction } from "@/app/users/calendar-actions";
import { availability, myCalendars } from "@/server/calendar/service";
import { connectionByUser, listConflicts, pendingJobCount } from "@/lib/db/repositories/gcal.repository";
import { formatIndiaTime } from "@/server/notifications/security-messages";

export const metadata: Metadata = { title: "Calendar integration" };
export const dynamic = "force-dynamic";

const ERRORS: Record<string, string> = {
  DENIED: "You didn't give permission on Google's screen, so nothing was connected.",
  STATE: "That connection attempt expired or didn't start here. Please try again.",
  UNAVAILABLE: "Google Calendar isn't available right now.",
  SCOPE: "Google didn't grant calendar access. Try again and tick the calendar permission.",
  GOOGLE: "Google didn't complete the connection. Please try again.",
  LIMIT: "Too many attempts. Wait a minute and try again.",
};

const MODULES: { key: "approvalDue" | "neededBy" | "taskDue" | "infoEvents" | "personal"; label: string }[] = [
  { key: "approvalDue", label: "Approvals waiting on you" },
  { key: "neededBy", label: "Your requests' needed-by dates" },
  { key: "taskDue", label: "Your tasks' due times" },
  { key: "infoEvents", label: "Information events" },
  { key: "personal", label: "Your personal entries" },
];

const when = (date: Date | null) => (date ? formatIndiaTime(date) : "Not yet");

// v1.11.0 (D-155): Profile → Calendar. The person connects their own Google
// account; nobody else's calendar is ever visible here.
export default async function CalendarIntegrationPage({ searchParams }: { searchParams: Promise<{ connected?: string; error?: string }> }) {
  const { user } = await requireArea("users");
  const params = await searchParams;
  const [{ active, allowConnections, config }, connection] = await Promise.all([availability(), connectionByUser(user.id)]);
  const live = connection && (connection.status === "ACTIVE" || connection.status === "NEEDS_REAUTH") ? connection : null;
  const [pending, conflicts, calendars] = await Promise.all([
    live ? pendingJobCount(live.id) : 0,
    live ? listConflicts({ userId: user.id, status: "OPEN", limit: 50 }) : [],
    live?.status === "ACTIVE" && active && config.allowCalendarChoice ? myCalendars(user.id) : null,
  ]);
  const mode = config.direction === "TWO_WAY" ? "Two-way" : config.direction === "ARS_TO_GOOGLE" ? "ARS → Google" : "Google → ARS";

  return (
    <>
      <PageHeader title="Profile" description="Your details, notifications, out of office and sign-in settings." />
      <ProfileTabs />
      <section className="card max-w-3xl p-5" aria-labelledby="gcal-title">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 id="gcal-title" className="text-body font-semibold">
            Google Calendar
          </h2>
          {live ? <Badge tone={live.status === "ACTIVE" ? "success" : "warning"}>{live.status === "ACTIVE" ? "Connected" : "Needs reauthorising"}</Badge> : <Badge tone="neutral">Not connected</Badge>}
        </div>
        {params.connected === "1" && (
          <p role="status" className="mt-3 rounded-md bg-success-50 px-3 py-2 text-label text-success-600">
            Connected. The first sync runs within a few minutes.
          </p>
        )}
        {params.error && (
          <p role="alert" className="mt-3 rounded-md border border-danger-200 bg-danger-50 px-3 py-2 text-label text-danger-600">
            {ERRORS[params.error] ?? ERRORS.GOOGLE}
          </p>
        )}

        {!active ? (
          <p className="mt-3 text-label text-ink-muted" data-testid="gcal-unavailable">
            Google Calendar sync isn&apos;t switched on for ARS yet. Your ARS calendar still works without it.
          </p>
        ) : !live ? (
          <div className="mt-3 space-y-3 text-label">
            <p>
              Connect your own Google account to see your approvals, tasks and information dates in Google Calendar, and your Google events here. ARS asks only for access to your calendar
              events and your account email. It never decides, completes or acknowledges anything because of a calendar change.
            </p>
            {allowConnections ? (
              <a href="/api/integrations/google-calendar/connect" className="btn-primary btn-compact inline-flex">
                Connect Google Account
              </a>
            ) : (
              <p className="text-ink-muted">Connecting calendars is switched off by the Super Admin.</p>
            )}
          </div>
        ) : (
          <div className="mt-4 space-y-5">
            <dl className="grid gap-x-6 gap-y-2 text-label sm:grid-cols-2">
              <div>
                <dt className="text-ink-muted">Google account</dt>
                <dd className="break-all">{live.googleEmail ?? "Unknown"}</dd>
              </div>
              <div>
                <dt className="text-ink-muted">Calendar</dt>
                <dd>{live.calendarName ?? "Not chosen"}</dd>
              </div>
              <div>
                <dt className="text-ink-muted">Sync</dt>
                <dd>{mode}</dd>
              </div>
              <div>
                <dt className="text-ink-muted">Last successful sync</dt>
                <dd>{when(live.lastSyncAt)}</dd>
              </div>
              <div>
                <dt className="text-ink-muted">Waiting to sync</dt>
                <dd>{pending}</dd>
              </div>
              <div>
                <dt className="text-ink-muted">Included</dt>
                <dd>{MODULES.filter((module) => config.modules[module.key]).map((module) => module.label).join(", ") || "Nothing"}</dd>
              </div>
            </dl>
            {live.lastError && (
              <p role="alert" className="rounded-md border border-danger-200 bg-danger-50 px-3 py-2 text-label text-danger-600">
                Last problem ({when(live.lastErrorAt)}): {live.lastError}
              </p>
            )}
            {live.status === "NEEDS_REAUTH" ? (
              <a href="/api/integrations/google-calendar/connect" className="btn-primary btn-compact inline-flex">
                Reauthorise
              </a>
            ) : (
              <div className="flex flex-wrap items-start gap-3">
                <CommandButton action={connectionCommandAction} fields={{ command: "sync" }} label="Sync now" variant="primary" />
                <Link href="/users/calendar" className="btn-secondary btn-compact">
                  Open my calendar
                </Link>
              </div>
            )}
            {calendars && (calendars.ok ? <CalendarChoiceForm calendars={calendars.value} current={live.calendarId} /> : <p className="text-label text-ink-muted">{calendars.message}</p>)}

            <div id="conflicts">
              <h3 className="mb-2 text-label font-semibold">Review conflicts ({conflicts.length})</h3>
              {conflicts.length === 0 ? (
                <p className="text-label text-ink-muted">Nothing to review.</p>
              ) : (
                <ul className="divide-y divide-line text-label" data-testid="gcal-conflicts">
                  {conflicts.map((conflict) => (
                    <li key={conflict.id} className="py-3">
                      <p>
                        <strong>{conflict.ars.title}</strong> changed in ARS {conflict.conflictType === "BOTH_CHANGED" ? "and in Google" : "but was deleted in Google"} before they synced.
                      </p>
                      <p className="mt-1 text-caption text-ink-muted">
                        ARS: {conflict.ars.start ?? "?"}
                        {conflict.ars.end ? ` → ${conflict.ars.end}` : ""}
                        {"deleted" in conflict.google ? " · Google: deleted" : ` · Google: “${conflict.google.title}” ${conflict.google.start ?? "?"}${conflict.google.end ? ` → ${conflict.google.end}` : ""}`}
                      </p>
                      <div className="mt-2 flex flex-wrap gap-2">
                        <CommandButton action={connectionCommandAction} fields={{ command: "resolve", conflictId: conflict.id, resolution: "KEEP_ARS" }} label="Keep ARS version" />
                        <CommandButton action={connectionCommandAction} fields={{ command: "resolve", conflictId: conflict.id, resolution: "KEEP_GOOGLE" }} label="Keep Google version" />
                        <CommandButton action={connectionCommandAction} fields={{ command: "resolve", conflictId: conflict.id, resolution: "DISMISSED" }} label="Leave both as they are" />
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </div>
            <DisconnectForm />
          </div>
        )}
      </section>
    </>
  );
}
