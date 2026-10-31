import type { Metadata } from "next";
import { PushKeysPanel } from "@/features/superadmin/PushKeysPanel";
import { countAllActiveDevices } from "@/lib/db/repositories/push.repository";
import { PageHeader } from "@/features/shell/PageHeader";
import { SettingsGroupForm } from "@/features/superadmin/SettingsGroupForm";
import { SettingsConsole } from "@/features/superadmin/SettingsConsole";
import { TestSendPanel } from "@/features/superadmin/TestSendPanel";
import { requireArea } from "@/server/authorization/guards";
import { SETTING_DEFINITIONS, type SettingDefinition } from "@/server/settings/definitions";
import { resolveSettingForDisplay } from "@/server/settings/resolve";
import { listRawSettings, listSettingHistory } from "@/lib/db/repositories/settings.repository";
import { formatIndiaTime } from "@/server/notifications/security-messages";

// WEB-05 (v1.10.0): a plain, non-confidential browser title.
export const metadata: Metadata = { title: "Providers & security" };

const GROUPS: { group: SettingDefinition["group"]; title: string; description: string }[] = [
  { group: "EMAIL", title: "Email", description: "Resend, sending from the ARS address. GoDaddy blocks SMTP, so email goes over HTTPS." },
  { group: "WHATSAPP", title: "WhatsApp", description: "CEOITBox, the same number and account as the Power BI site." },
  { group: "AUTHENTICATION", title: "Sign-in security", description: "Code, lockout and device limits. Each value has safe minimum and maximum bounds." },
  { group: "GENERAL", title: "General", description: "Application name, timezone, the maintenance notice and the other app-wide basics." },
  { group: "BACKUP", title: "Off-site backup", description: "After each daily backup, an encrypted copy goes to S3-compatible storage outside the hosting account (AWS S3, Cloudflare R2, Backblaze B2, Wasabi). Use a key that may only write to the bucket. The server must have BACKUP_ENCRYPTION_KEY." },
  { group: "PUSH", title: "Phone & desktop notifications", description: "Web Push to the devices people register in Profile → App & devices. Make the keys with Generate keys (right). What a notification shows on a lock screen is chosen here." },
  { group: "RETENTION", title: "Retention", description: "How long records are kept. 0 keeps them for ever. These values only feed the dry run on Retention & holds; nothing is deleted automatically." },
  { group: "FEATURES", title: "Feature switches", description: "Turn new features on, off, or on for the IT team only (a trial before everyone). Switching off hides a feature; no data is removed." },
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
      <div className="grid gap-6 2xl:grid-cols-[minmax(0,1fr)_360px]">
        {/* D-240: one console: categories, a search across them, one Save per category. */}
        <SettingsConsole
          sections={GROUPS.map(({ group, title, description }) => ({
            id: `settings-${group}`,
            title,
            keywords: [title, description, ...SETTING_DEFINITIONS.filter((definition) => definition.group === group).flatMap((definition) => [definition.label, definition.key])].join(" "),
          }))}
        >
          {GROUPS.map(({ group, title, description }) => (
            <SettingsGroupForm
              key={group}
              group={group}
              title={title}
              description={description}
              settings={SETTING_DEFINITIONS.filter((definition) => definition.group === group).map((definition) => resolveSettingForDisplay(definition, byKey.get(definition.key) ?? null))}
            />
          ))}
        </SettingsConsole>
        <div className="space-y-6">
          <TestSendPanel email={user.email} whatsapp={user.whatsappNumber} />
          <PushKeysPanel hasKeys={Boolean(byKey.get("push.vapid_public_key")?.value)} devices={await countAllActiveDevices()} />
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
                      {entry.changedByName ?? "System"} · {formatIndiaTime(entry.changedAt)}
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
