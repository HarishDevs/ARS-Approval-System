import type { Metadata } from "next";
import Link from "next/link";
import { requireArea } from "@/server/authorization/guards";
import { PageHeader } from "@/features/shell/PageHeader";
import { ProfileTabs } from "@/features/shell/ProfileTabs";
import { PreferencesForm } from "@/features/shell/PreferencesForm";
import { EVENT_GROUPS } from "@/server/notifications/preferences";
import { loadOptOuts } from "@/lib/db/repositories/preferences.repository";

// WEB-05 (v1.10.0): a plain, non-confidential browser title.
export const metadata: Metadata = { title: "Notification settings" };

// #6 notification settings (D-110). The in-app inbox always gets everything.
export default async function NotificationSettingsPage() {
  const { user } = await requireArea("users");
  const off = await loadOptOuts(user.id);
  const rows = EVENT_GROUPS.map((group) => ({
    key: group.key,
    label: group.label,
    help: group.help,
    mandatory: group.mandatory,
    email: !off.has(`${group.key}:EMAIL`),
    whatsapp: !off.has(`${group.key}:WHATSAPP`),
  }));
  return (
    <>
      <PageHeader title="Notification settings" description="Choose what also comes by email or WhatsApp. Everything always appears under Notifications in the app.">
        <Link href="/users/notifications" className="link text-label">
          ← Notifications
        </Link>
      </PageHeader>
      <ProfileTabs />
      <div className="max-w-3xl">
        <PreferencesForm rows={rows} />
      </div>
    </>
  );
}
