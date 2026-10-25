import type { Metadata } from "next";
import Link from "next/link";
import { requireArea } from "@/server/authorization/guards";
import { PageHeader } from "@/features/shell/PageHeader";
import { Badge } from "@/features/ui/Display";
import { Hint } from "@/features/ui/Hint";
import { loadSettingsRow } from "@/lib/db/repositories/gcal.repository";
import { integrationStatus, STATUS_LABEL } from "@/server/calendar/config";

export const metadata: Metadata = { title: "Integrations" };
export const dynamic = "force-dynamic";

// v1.11.0: Super Admin → Integrations. Email (Resend) and WhatsApp
// (CEOITBox) keep their place under Providers & security.
export default async function IntegrationsPage() {
  await requireArea("superadmin");
  const settings = await loadSettingsRow();
  const status = integrationStatus({ enabled: settings.enabled, maintenance: settings.maintenance, clientId: settings.clientId, hasSecret: Boolean(settings.secretEnc), lastTestOk: settings.lastTestOk });
  return (
    <>
      <PageHeader title="Integrations" description="Connections between ARS and other services." />
      <ul className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <li className="card p-4">
          <div className="flex items-center justify-between gap-3">
            <h2 className="flex items-center gap-1.5 text-body font-semibold">
              <Link href="/superadmin/integrations/google-calendar" className="link">
                Google Calendar
              </Link>
              <Hint text="Two-way sync of approvals, tasks, information dates and personal entries with each person's own Google Calendar." align="start" />
            </h2>
            <Badge tone={status === "ENABLED" ? "success" : status === "DISABLED" ? "neutral" : "warning"}>{STATUS_LABEL[status]}</Badge>
          </div>
        </li>
        <li className="card p-4">
          <h2 className="flex items-center gap-1.5 text-body font-semibold">
            <Link href="/superadmin/settings" className="link">
              Email and WhatsApp
            </Link>
            <Hint text="Resend (email) and CEOITBox (WhatsApp) keys and tests are under Providers & security." align="start" />
          </h2>
        </li>
      </ul>
    </>
  );
}
