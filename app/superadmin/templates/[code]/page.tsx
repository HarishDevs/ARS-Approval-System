import type { Metadata } from "next";
import Link from "next/link";
import { Breadcrumbs } from "@/features/ui/Display";
import { notFound } from "next/navigation";
import { PageHeader } from "@/features/shell/PageHeader";
import { requireArea } from "@/server/authorization/guards";
import { loadTemplateBoard } from "@/server/notifications/template-registry";
import { defaultDraft, toNamedBody } from "@/server/notifications/template-authoring";
import { templateLabel } from "@/server/notifications/templates";
import { SubmitTemplateButton, SyncTemplatesButton, TemplateEditor, TestTemplateButton } from "@/features/superadmin/TemplateForm";
import { StatusBadge } from "@/features/superadmin/template-status";
import { formatIndiaTime } from "@/server/notifications/security-messages";

// WEB-05 (v1.10.0): a plain, non-confidential browser title.
export const metadata: Metadata = { title: "Message template" };

// One WhatsApp message's template: write, submit, sync, test, history.
export default async function TemplatePage({ params }: { params: Promise<{ code: string }> }) {
  const { user } = await requireArea("superadmin");
  const { code } = await params;
  const item = (await loadTemplateBoard()).find((candidate) => candidate.entry.code === code);
  if (!item) notFound();
  const { entry, versions, live, latest } = item;
  const keysOf = (keys: string[]) => entry.variables.filter((variable) => keys.includes(variable.key)).sort((a, b) => keys.indexOf(a.key) - keys.indexOf(b.key));
  // Start from the newest version's wording, or the suggested wording.
  const start = latest?.body
    ? { name: latest.providerName ?? entry.name, category: latest.category, body: toNamedBody(latest.body, keysOf(latest.variableKeys)), footer: latest.footer ?? "" }
    : defaultDraft(entry);
  const canSubmit = latest !== null && !latest.submittedAt && Boolean(latest.body);

  return (
    <>
      <Breadcrumbs items={[{ href: "/superadmin", label: "Super Admin" }, { href: "/superadmin/templates", label: "WhatsApp templates" }, { label: templateLabel(entry.eventType) }]} />
      <PageHeader title={templateLabel(entry.eventType)} description={`${entry.purpose} Sent to: ${entry.sentTo}. App event ${entry.eventType}. Matching email subject: “${entry.emailSubject}”.`}>
        <Link href="/superadmin/templates" className="link text-label">
          ← All templates
        </Link>
      </PageHeader>

      <div className="mb-6 grid gap-4 lg:grid-cols-3">
        <section className="card space-y-2 px-5 py-4">
          <h2 className="font-semibold">Live now</h2>
          {live ? (
            <>
              <p className="font-mono text-label">{live.providerName}</p>
              <p className="text-caption text-ink-muted">Version {live.version}{live.syncedAt ? ` · approved, synced ${formatIndiaTime(live.syncedAt)}` : ""}</p>
              <TestTemplateButton code={entry.code} />
              {!user.whatsappNumber && <p className="text-caption text-warning-600">Add your WhatsApp number to your user to receive tests.</p>}
            </>
          ) : (
            <p className="text-label text-ink-muted">Nothing live yet: this WhatsApp message is skipped. Email and in-app still go out.</p>
          )}
        </section>
        <section className="card space-y-2 px-5 py-4">
          <h2 className="font-semibold">Newest version</h2>
          {latest ? (
            <>
              <div className="flex items-center gap-2">
                <StatusBadge version={latest} />
                <span className="font-mono text-label">{latest.providerName}</span>
              </div>
              {latest.rejectionReason && <p className="text-label text-danger-600">Meta&apos;s reason: {latest.rejectionReason}</p>}
              {canSubmit && <SubmitTemplateButton code={entry.code} name={latest.providerName ?? ""} />}
            </>
          ) : (
            <p className="text-label text-ink-muted">Not created yet. The suggested wording is filled in below.</p>
          )}
        </section>
        <section className="card space-y-2 px-5 py-4">
          <h2 className="font-semibold">Meta&apos;s decision</h2>
          <p className="text-label text-ink-muted">
            After submitting, Meta usually decides within minutes to a day. Sync to pull the result: approved versions go live by themselves. A template made directly in the CEOITBox dashboard also works: save a draft here with its exact name, then sync.
          </p>
          <SyncTemplatesButton />
        </section>
      </div>

      <TemplateEditor code={entry.code} variables={entry.variables} initial={start} locked={Boolean(latest?.submittedAt)} />

      {versions.length > 0 && (
        <section className="card mt-6 overflow-x-auto">
          <h2 className="border-b border-line px-5 py-4 font-semibold">Versions</h2>
          <table className="data-table">
            <thead>
              <tr>
                <th>Version</th>
                <th>Name</th>
                <th>Status</th>
                <th>Submitted</th>
                <th>Message</th>
              </tr>
            </thead>
            <tbody>
              {[...versions].reverse().map((version) => (
                <tr key={version.id}>
                  <td>{version.version}</td>
                  <td className="font-mono">{version.providerName ?? "—"}</td>
                  <td>
                    <StatusBadge version={version} />
                  </td>
                  <td className="whitespace-nowrap">{version.submittedAt ? formatIndiaTime(version.submittedAt) : "—"}</td>
                  <td className="max-w-md whitespace-pre-wrap font-mono text-caption">{version.body ?? "(named here; created in the CEOITBox dashboard)"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}
    </>
  );
}
