import type { Metadata } from "next";
import { PagedRows } from "@/features/ui/PagedRows";
import Link from "next/link";
import { PageHeader } from "@/features/shell/PageHeader";
import { requireArea } from "@/server/authorization/guards";
import { loadTemplateBoard } from "@/server/notifications/template-registry";
import { EMAIL_ONLY_EVENTS, EXISTING_OTP_TEMPLATE, templateLabel } from "@/server/notifications/templates";
import { SyncTemplatesButton } from "@/features/superadmin/TemplateForm";
import { StatusBadge } from "@/features/superadmin/template-status";
import { formatIndiaTime } from "@/server/notifications/security-messages";
import { templatesNeedingAttention } from "@/server/notifications/template-reminder";

// WEB-05 (v1.10.0): a plain, non-confidential browser title.
export const metadata: Metadata = { title: "Message templates" };

// WhatsApp template creator (S7, D-076, F-42b): every WhatsApp message the
// app sends, its live version, and the newest version in the works.
// S9-14/15: one status panel (live count, last sync, Sync), short row
// titles with the purpose behind a "?" hint, uniform right-aligned actions.
export default async function TemplatesPage() {
  await requireArea("superadmin");
  const board = await loadTemplateBoard();
  const live = board.filter((item) => item.live).length;
  // Q-013 (owner, 2 Nov 2026): the checklist of templates still to switch on.
  const pending = templatesNeedingAttention(board);
  const percent = board.length ? Math.round((live / board.length) * 100) : 0;
  const lastSync = board
    .flatMap((item) => item.versions.map((version) => version.syncedAt))
    .filter((value): value is Date => value !== null)
    .sort((a, b) => b.getTime() - a.getTime())[0];
  return (
    <>
      <PageHeader
        title="WhatsApp templates"
        description={[
          "Open a message to write its template and submit it to Meta through CEOITBox. It goes live by itself once Meta approves it. Until then, email and in-app messages still go out.",
          `The sign-in code uses the Power BI website's approved ${EXISTING_OTP_TEMPLATE.name}, so it needs nothing here.`,
          ...EMAIL_ONLY_EVENTS.map((item) => `${templateLabel(item.eventType)} is email only.`),
        ].join(" ")}
      />
      <section className="card mb-6 flex flex-col gap-4 p-5 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0 flex-1">
          <p className="text-label text-ink-muted">Live on WhatsApp</p>
          <p className="mt-1 text-2xl font-bold tabular-nums">
            {live} <span className="text-label font-normal text-ink-muted">of {board.length} messages</span>
          </p>
          <div className="mt-2 h-2 max-w-sm overflow-hidden rounded-full bg-surface-muted" role="progressbar" aria-valuenow={live} aria-valuemin={0} aria-valuemax={board.length} aria-label="Templates live">
            <div className="h-full rounded-full bg-primary-600" style={{ width: `${percent}%` }} />
          </div>
          <p className="mt-2 text-caption text-ink-muted">{lastSync ? `Last synced ${formatIndiaTime(lastSync)}` : "Not synced yet"}</p>
        </div>
        <SyncTemplatesButton />
      </section>
      {pending.length > 0 && (
        <section className="card mb-6" id="templates-to-switch-on" data-testid="templates-to-switch-on">
          <h2 className="border-b border-line px-5 py-3 font-semibold">Still to switch on ({pending.length})</h2>
          <p className="px-5 pt-3 text-label text-ink-muted">Until each goes live, its message goes by email and in-app only. Open one to create, submit or check it.</p>
          <ul className="grid gap-2 px-5 py-4 sm:grid-cols-2">
            {pending.map((item) => (
              <li key={item.code} className="flex items-center justify-between gap-2 rounded-md border border-line px-3 py-2 text-label">
                <span className="flex items-center gap-2">
                  <input type="checkbox" disabled aria-label={`${item.label}: not live`} className="h-4 w-4" />
                  <Link href={item.href} className="link">
                    {item.label}
                  </Link>
                </span>
                <span className="text-ink-muted">{item.state}</span>
              </li>
            ))}
          </ul>
        </section>
      )}
      <section className="card overflow-x-auto">
        <table className="data-table">
          <thead>
            <tr>
              <th>Message</th>
              <th>Sent to</th>
              <th>Live version</th>
              <th>Status</th>
              <th className="text-right">
                <span className="sr-only">Action</span>
              </th>
            </tr>
          </thead>
          <PagedRows colSpan={5}>
            {board.map(({ entry, live: current, latest }) => (
              <tr key={entry.code}>
                <td>
                  <p className="flex items-center gap-1.5 font-medium">
                    {templateLabel(entry.eventType)}
                    <span
                      title={entry.purpose}
                      className="inline-flex h-4 w-4 cursor-help items-center justify-center rounded-full border border-line text-[length:calc(10px*var(--text-scale,1))] font-semibold text-ink-faint"
                    >
                      <span aria-hidden="true">?</span>
                      <span className="sr-only">{entry.purpose}</span>
                    </span>
                  </p>
                  <p className="font-mono text-caption text-ink-faint">
                    {entry.eventType} · {entry.group}
                  </p>
                </td>
                <td className="text-label">{entry.sentTo}</td>
                <td>{current ? <span className="font-mono text-label">{current.providerName}</span> : <span className="text-ink-faint">—</span>}</td>
                <td>
                  <StatusBadge version={latest} />
                  {latest && latest !== current && <p className="mt-1 font-mono text-caption text-ink-faint">{latest.providerName}</p>}
                </td>
                <td className="text-right">
                  <Link href={`/superadmin/templates/${entry.code}`} className={`${latest ? "btn-secondary" : "btn-primary"} btn-compact inline-flex w-20 justify-center`}>
                    {latest ? "Open" : "Create"}
                  </Link>
                </td>
              </tr>
            ))}
          </PagedRows>
        </table>
      </section>
    </>
  );
}
