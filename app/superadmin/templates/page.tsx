import { PageHeader } from "@/features/shell/PageHeader";
import { requireArea } from "@/server/authorization/guards";
import { listRegisteredTemplates } from "@/lib/db/repositories/whatsapp.repository";
import { EMAIL_ONLY_EVENTS, EXISTING_OTP_TEMPLATE, WHATSAPP_TEMPLATES, type TemplateEntry } from "@/server/notifications/templates";
import { TemplateForm } from "@/features/superadmin/TemplateForm";

// F-42 / S6-04: every WhatsApp message the app sends, the wording to create
// in CEOITBox, and the switch to start using it once Meta approves it.
function Status({ on, named }: { on: boolean; named: boolean }) {
  if (on) return <span className="badge bg-success-50 text-success-600">On</span>;
  if (named) return <span className="badge bg-warning-50 text-warning-600">Named, waiting for approval</span>;
  return <span className="badge bg-surface-muted text-ink-muted">Not set up</span>;
}

function Entry({ entry, providerName, on }: { entry: TemplateEntry; providerName: string | null; on: boolean }) {
  return (
    <section id={entry.code} className="card">
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-line px-5 py-4">
        <div>
          <h3 className="font-semibold">{entry.purpose}</h3>
          <p className="text-caption text-ink-muted">
            Sent to: {entry.sentTo} · Event {entry.eventType} · Suggested name <span className="font-mono">{entry.name}</span> · Category Utility · English
          </p>
        </div>
        <Status on={on} named={Boolean(providerName)} />
      </div>
      <div className="grid gap-5 px-5 py-4 lg:grid-cols-[minmax(0,1fr)_320px]">
        <div className="space-y-3">
          <pre className="whitespace-pre-wrap rounded-md bg-surface-muted px-3 py-2 font-mono text-caption">{entry.body}</pre>
          <table className="data-table">
            <thead>
              <tr>
                <th>Variable</th>
                <th>Holds</th>
                <th>Sample for Meta</th>
              </tr>
            </thead>
            <tbody>
              {entry.variables.map((variable, index) => (
                <tr key={variable.key}>
                  <td className="font-mono">{`{{${index + 1}}}`}</td>
                  <td>{variable.label}</td>
                  <td className="break-all">{variable.sample}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <TemplateForm code={entry.code} suggestedName={entry.name} providerName={providerName} on={on} />
      </div>
    </section>
  );
}

export default async function TemplatesPage() {
  await requireArea("superadmin");
  const registered = await listRegisteredTemplates();
  const live = WHATSAPP_TEMPLATES.filter((entry) => registered.get(entry.code)?.status === "ACTIVE").length;
  return (
    <>
      <PageHeader
        title="WhatsApp templates"
        description={`${live} of ${WHATSAPP_TEMPLATES.length} switched on. Create each template in CEOITBox exactly as shown (category Utility, language English, the samples below for Meta). Once Meta approves it, enter its name here and switch it on. Until then that WhatsApp message is skipped; email and in-app messages still go out.`}
      />
      <div className="mb-6 rounded-md border border-line bg-surface px-4 py-3 text-label">
        <p>
          The sign-in code reuses the Power BI website&apos;s approved template <span className="font-mono">{EXISTING_OTP_TEMPLATE.name}</span> (Authentication), so nothing is needed for it.
        </p>
        {EMAIL_ONLY_EVENTS.map((item) => (
          <p key={item.eventType} className="mt-1 text-ink-muted">
            {item.eventType} is email only: {item.why}
          </p>
        ))}
        <p className="mt-1 text-ink-muted">The same list, ready to share, is in docs/NOTIFICATION-TEMPLATES.md in the code.</p>
      </div>
      {(["Approvals", "Security"] as const).map((group) => (
        <div key={group} className="mb-8 space-y-4">
          <h2 className="text-lg font-semibold">{group} messages</h2>
          {WHATSAPP_TEMPLATES.filter((entry) => entry.group === group).map((entry) => {
            const row = registered.get(entry.code);
            return <Entry key={entry.code} entry={entry} providerName={row?.providerName ?? null} on={row?.status === "ACTIVE" && row.approvalStatus === "APPROVED"} />;
          })}
        </div>
      ))}
    </>
  );
}
