import Link from "next/link";
import { PageHeader } from "@/features/shell/PageHeader";
import { requireArea } from "@/server/authorization/guards";
import { SETTING_DEFINITIONS } from "@/server/settings/definitions";
import { resolveSettingForDisplay } from "@/server/settings/resolve";
import { listRawSettings } from "@/lib/db/repositories/settings.repository";

// Shows whether each provider is configured, never the secret itself (D-016).
export default async function SuperAdminHome() {
  await requireArea("superadmin");
  const raw = await listRawSettings();
  const byKey = new Map(raw.map((row) => [row.key, row]));
  const secrets = SETTING_DEFINITIONS.filter((definition) => definition.encrypted).map((definition) =>
    resolveSettingForDisplay(definition, byKey.get(definition.key) ?? null),
  );

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
    </>
  );
}
