import Link from "next/link";
import { PageHeader } from "@/features/shell/PageHeader";
import { requireArea } from "@/server/authorization/guards";
import { loadTemplateBoard } from "@/server/notifications/template-registry";
import { EMAIL_ONLY_EVENTS, EXISTING_OTP_TEMPLATE } from "@/server/notifications/templates";
import { SyncTemplatesButton } from "@/features/superadmin/TemplateForm";
import { StatusBadge } from "@/features/superadmin/template-status";
import { formatIndiaTime } from "@/server/notifications/security-messages";

// WhatsApp template creator (S7, D-076, F-42b): every WhatsApp message the
// app sends, its live version, and the newest version in the works.
export default async function TemplatesPage() {
  await requireArea("superadmin");
  const board = await loadTemplateBoard();
  const live = board.filter((item) => item.live).length;
  const lastSync = board
    .flatMap((item) => item.versions.map((version) => version.syncedAt))
    .filter((value): value is Date => value !== null)
    .sort((a, b) => b.getTime() - a.getTime())[0];
  return (
    <>
      <PageHeader
        title="WhatsApp templates"
        description={`${live} of ${board.length} messages are live on WhatsApp. Open a message to write its template, submit it to Meta through CEOITBox, and it goes live by itself once Meta approves it (press Sync status). Until then, email and in-app messages still go out.`}
      >
        <SyncTemplatesButton />
      </PageHeader>
      <p className="mb-4 text-label text-ink-muted">
        {lastSync ? `Last synced ${formatIndiaTime(lastSync)}.` : "Not synced yet."} The sign-in code uses the Power BI website&apos;s approved{" "}
        <span className="font-mono">{EXISTING_OTP_TEMPLATE.name}</span>; nothing to do for it. {EMAIL_ONLY_EVENTS.map((item) => `${item.eventType} is email only.`).join(" ")}
      </p>
      <section className="card overflow-x-auto">
        <table className="data-table">
          <thead>
            <tr>
              <th>Message</th>
              <th>Sent to</th>
              <th>Live version</th>
              <th>Newest version</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {board.map(({ entry, live: current, latest }) => (
              <tr key={entry.code}>
                <td>
                  <p className="font-medium">{entry.purpose}</p>
                  <p className="text-caption text-ink-faint">
                    {entry.group} · {entry.eventType}
                  </p>
                </td>
                <td className="text-label">{entry.sentTo}</td>
                <td>{current ? <span className="font-mono text-label">{current.providerName}</span> : <span className="text-ink-faint">—</span>}</td>
                <td>
                  <StatusBadge version={latest} />
                  {latest && latest !== current && <p className="font-mono text-caption text-ink-faint">{latest.providerName}</p>}
                </td>
                <td>
                  <Link href={`/superadmin/templates/${entry.code}`} className="btn-secondary btn-compact whitespace-nowrap">
                    {latest ? "Open" : "Create"}
                  </Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </>
  );
}
