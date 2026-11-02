import type { Metadata } from "next";
import Link from "next/link";
import { PageHeader } from "@/features/shell/PageHeader";
import { Hint } from "@/features/ui/Hint";
import { requireArea } from "@/server/authorization/guards";
import { SETTING_DEFINITIONS } from "@/server/settings/definitions";
import { resolveSettingForDisplay } from "@/server/settings/resolve";
import { listRawSettings } from "@/lib/db/repositories/settings.repository";
import { backupStatus } from "@/server/ops/backup";
import { formatIndiaTime } from "@/server/notifications/security-messages";
import { BackupNowButton } from "@/features/superadmin/BackupNowButton";
import { checkStorage, STORAGE_PROBLEM_TEXT } from "@/server/attachments/storage";
import { loadTemplateBoard } from "@/server/notifications/template-registry";
import { templatesNeedingAttention } from "@/server/notifications/template-reminder";
import { originLockOn } from "@/server/ops/origin-lock";

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
  const storage = await checkStorage();
  // Q-021: only whether ORIGIN_SECRET is set, never its value. Optional.
  const originLock = originLockOn();
  // Q-013: the WhatsApp templates not yet switched on.
  const templates = await loadTemplateBoard().catch(() => null);
  const templatesPending = templates ? templatesNeedingAttention(templates) : [];
  const backupAgeHours = backups.latest ? (Date.now() - backups.latest.at.getTime()) / 3_600_000 : null;

  return (
    <>
      <PageHeader title="Super Admin" description="Provider connections, security settings and platform health. Only visible to the Super Admin." />
      <section className="rounded-lg border border-line bg-surface">
        <div className="flex items-center justify-between gap-2 border-b border-line px-5 py-3">
          <h2 className="font-semibold">Provider keys</h2>
          <Link className="link text-label" href="/superadmin/settings">
            Edit keys
          </Link>
        </div>
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
      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        {/* Q-021 (owner, 2 Nov 2026): whether the Cloudflare origin lock is on. */}
        <section className="rounded-lg border border-line bg-surface" data-testid="origin-lock-status">
          <h2 className="flex items-center gap-1.5 border-b border-line px-5 py-3 font-semibold">
            Origin lock
            <Hint text="With ORIGIN_SECRET set on the server, only requests that come through Cloudflare are served, so nobody can reach the GoDaddy origin directly or fake their IP address. The value is never shown here." align="start" />
          </h2>
          <div className="px-5 py-4 text-label">
            <p role="status" className={`rounded-md px-3 py-2 ${originLock ? "bg-success-50 text-success-600" : "bg-warning-50 text-warning-600"}`}>
              {originLock ? "Origin lock: on" : "Origin lock: off"}
            </p>
            {!originLock && <p className="mt-2 text-ink-muted">Set ORIGIN_SECRET (GoDaddy → the app → Secrets) and the matching Cloudflare Transform Rule, then Publish. See the deployment guide.</p>}
          </div>
        </section>
        {/* Q-013 (owner, 2 Nov 2026): templates still to switch on. */}
        <section className="rounded-lg border border-line bg-surface" data-testid="template-reminder">
          <div className="flex items-center justify-between gap-2 border-b border-line px-5 py-3">
            <h2 className="font-semibold">WhatsApp templates</h2>
            <Link className="link text-label" href="/superadmin/templates">
              Open templates
            </Link>
          </div>
          <div className="px-5 py-4 text-label">
            {templates === null ? (
              <p className="text-ink-muted">Couldn&apos;t load the templates just now.</p>
            ) : (
              <p role="status" className={`rounded-md px-3 py-2 ${templatesPending.length === 0 ? "bg-success-50 text-success-600" : "bg-warning-50 text-warning-600"}`}>
                {templatesPending.length === 0
                  ? `All ${templates.length} templates are live on WhatsApp.`
                  : `${templatesPending.length} of ${templates.length} templates aren't live yet: those messages go by email and in-app only.`}
              </p>
            )}
            {templatesPending.length > 0 && (
              <ul className="mt-3 space-y-1">
                {templatesPending.slice(0, 5).map((item) => (
                  <li key={item.code} className="flex items-center justify-between gap-2">
                    <Link className="link inline-flex min-h-6 items-center" href={item.href}>
                      {item.label}
                    </Link>
                    <span className="text-ink-muted">{item.state}</span>
                  </li>
                ))}
                {templatesPending.length > 5 && (
                  <li>
                    <Link className="link" href="/superadmin/templates#templates-to-switch-on">
                      and {templatesPending.length - 5} more
                    </Link>
                  </li>
                )}
              </ul>
            )}
          </div>
        </section>
      </div>
      {/* v1.12.4 (D-163): uploads need a folder the app can write to. */}
      <section className="mt-6 rounded-lg border border-line bg-surface" data-testid="storage-status">
        <h2 className="border-b border-line px-5 py-3 font-semibold">File storage</h2>
        <div className="space-y-2 px-5 py-4 text-label">
          <p role="status" className={`rounded-md px-3 py-2 ${storage.ok ? "bg-success-50 text-success-600" : "bg-danger-50 text-danger-600"}`}>
            {storage.ok ? "Uploads work: the app can write to the upload folder." : `Uploads are failing. ${STORAGE_PROBLEM_TEXT[storage.problem ?? "OTHER"]}`}
          </p>
          <p className="text-ink-muted">
            Folder in use: <code className="break-all">{storage.root}</code> ({storage.configured ? "from UPLOAD_DIR" : "UPLOAD_DIR not set: the app's own folder"})
            {storage.code ? ` · error ${storage.code}` : ""}
          </p>
        </div>
      </section>
      <section className="mt-6 rounded-lg border border-line bg-surface">
        <h2 className="flex items-center gap-1.5 border-b border-line px-5 py-3 font-semibold">
          Backups
          <Hint text="Database and attachments are copied to the backup folder on the server (BACKUP_DIR). Download a copy now and then; how to restore is in the deployment guide, Part P." align="start" />
        </h2>
        <div className="space-y-3 px-5 py-4">
          <p role="status" className={`rounded-md px-3 py-2 text-label ${backupAgeHours !== null && backupAgeHours <= 26 ? "bg-success-50 text-success-600" : "bg-warning-50 text-warning-600"}`}>
            {backups.latest
              ? `Last backup ${formatIndiaTime(backups.latest.at)} (${(backups.latest.bytes / 1024).toLocaleString("en-IN", { maximumFractionDigits: 0 })} KB); ${backups.count} kept.`
              : "No backup yet. The job runner makes one a day once the cron job is set up, or press Back up now."}
          </p>
          <BackupNowButton />
        </div>
      </section>
    </>
  );
}
