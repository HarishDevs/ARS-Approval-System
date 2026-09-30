import { PageHeader } from "@/features/shell/PageHeader";
import { SettingsGroupForm } from "@/features/superadmin/SettingsGroupForm";
import { TestSendPanel } from "@/features/superadmin/TestSendPanel";
import { requireArea } from "@/server/authorization/guards";
import { SETTING_DEFINITIONS, type SettingDefinition } from "@/server/settings/definitions";
import { resolveSettingForDisplay } from "@/server/settings/resolve";
import { listRawSettings, listSettingHistory } from "@/lib/db/repositories/settings.repository";

const GROUPS: { group: SettingDefinition["group"]; title: string; description: string }[] = [
  { group: "EMAIL", title: "Email", description: "Resend, sending from the ARS address. GoDaddy blocks SMTP, so email goes over HTTPS." },
  { group: "WHATSAPP", title: "WhatsApp", description: "CEOITBox, the same number and account as the Power BI site." },
  { group: "AUTHENTICATION", title: "Sign-in security", description: "Code, lockout and device limits. Each value has safe minimum and maximum bounds." },
  { group: "GENERAL", title: "General", description: "Application name and timezone." },
];

// F-52: Super Admin only. Page, layout and every action check this separately.
export default async function SettingsPage() {
  const { user } = await requireArea("superadmin");
  const [raw, history] = await Promise.all([listRawSettings(), listSettingHistory(25)]);
  const byKey = new Map(raw.map((row) => [row.key, row]));
  const labels = new Map(SETTING_DEFINITIONS.map((definition) => [definition.key, definition.label]));

  return (
    <>
      <PageHeader title="Providers & security" description="Keys are stored encrypted and are never shown again after saving. Every change is recorded." />
      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_360px]">
        <div className="space-y-6">
          {GROUPS.map(({ group, title, description }) => (
            <SettingsGroupForm
              key={group}
              group={group}
              title={title}
              description={description}
              settings={SETTING_DEFINITIONS.filter((definition) => definition.group === group).map((definition) =>
                resolveSettingForDisplay(definition, byKey.get(definition.key) ?? null),
              )}
            />
          ))}
        </div>
        <div className="space-y-6">
          <TestSendPanel email={user.email} whatsapp={user.whatsappNumber} />
          <section className="card">
            <h2 className="border-b border-line px-5 py-4 font-semibold">Recent changes</h2>
            {history.length === 0 ? (
              <p className="px-5 py-4 text-label text-ink-muted">No changes yet.</p>
            ) : (
              <ul className="divide-y divide-line">
                {history.map((entry, index) => (
                  <li key={index} className="px-5 py-3 text-label">
                    <p className="font-medium">{labels.get(entry.key) ?? entry.key}</p>
                    <p className="text-ink-muted">
                      {entry.newRef === "cleared" ? "Removed" : entry.newRef?.startsWith("fp:") ? "Key replaced" : `Set to ${entry.newRef?.slice(2) ?? ""}`}
                      {" · "}
                      {entry.changedByName ?? "System"} · {entry.changedAt.toLocaleString("en-IN", { timeZone: "Asia/Kolkata" })}
                    </p>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      </div>
    </>
  );
}
