import type { Metadata } from "next";
import Link from "next/link";
import { PageHeader } from "@/features/shell/PageHeader";
import { requireArea } from "@/server/authorization/guards";
import { SETTING_DEFINITIONS } from "@/server/settings/definitions";
import { resolveSettingForDisplay } from "@/server/settings/resolve";
import { listRawSettings } from "@/lib/db/repositories/settings.repository";
import { backupStatus } from "@/server/ops/backup";
import { formatIndiaTime } from "@/server/notifications/security-messages";
import { BackupNowButton } from "@/features/superadmin/BackupNowButton";

// WEB-05 (v1.10.0): a plain, non-confidential browser title.
export const metadata: Metadata = { title: "Super Admin" };

// Shows whether each provider is configured, never the secret itself (D-016).
export default async function SuperAdminHome() {
  await requireArea("superadmin");
  const raw = await listRawSettings();
  const byKey = new Map(raw.map((row) => [row.key, row]));
  const secrets = SETTING_DEFINITIONS.filter((definition) => definition.encrypted).map((definition) =>
    resolveSettingForDisplay(definition, byKey.get(definition.key) ?? null),
  );
  const backups = backupStatus();
  const backupAgeHours = backups.latest ? (Date.now() - backups.latest.at.getTime()) / 3_600_000 : null;

  return (
    <>
      <PageHeader title="Super Admin" description="Provider connections, security settings and platform health. Only visible to the Super Admin." />
      <section className="rounded-lg border border-line bg-surface">
        <h2 className="border-b border-line px-5 py-3 font-semibold">Provider keys</h2>
        <ul className="divide-y divide-line">
          {secrets.map((setting) => (
            <li key={setting.key} className="flex items-center justify-between px-5 py-3">
              <span>{setting.label}</span>
              <span
                className={`rounded-full px-2.5 py-0.5 text-caption font-semibold ${
                  setting.status === "CONFIGURED" ? "bg-success-50 text-success-600" : "bg-warning-50 text-warning-600"
                }`}
              >
                {setting.status === "CONFIGURED" ? "Configured" : "Not configured"}
              </span>
            </li>
          ))}
        </ul>
      </section>
      <p className="mt-4 text-label text-ink-muted">
        Enter or replace keys in <Link className="link" href="/superadmin/settings">
          Providers &amp; security
        </Link>.
      </p>
      <section className="mt-6 rounded-lg border border-line bg-surface">
        <h2 className="border-b border-line px-5 py-3 font-semibold">Backups</h2>
        <div className="space-y-3 px-5 py-4">
          <p role="status" className={`rounded-md px-3 py-2 text-label ${backupAgeHours !== null && backupAgeHours <= 26 ? "bg-success-50 text-success-600" : "bg-warning-50 text-warning-600"}`}>
            {backups.latest
              ? `Last backup ${formatIndiaTime(backups.latest.at)} (${(backups.latest.bytes / 1024).toLocaleString("en-IN", { maximumFractionDigits: 0 })} KB); ${backups.count} kept.`
              : "No backup yet. The job runner makes one a day once the cron job is set up, or press Back up now."}
          </p>
          <p className="text-label text-ink-muted">Database and attachments are copied to the backup folder on the server (BACKUP_DIR). Download a copy now and then; how to restore is in the deployment guide, Part P.</p>
          <BackupNowButton />
        </div>
      </section>
    </>
  );
}
