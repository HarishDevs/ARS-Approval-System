import { requireArea } from "@/server/authorization/guards";
import { PageHeader } from "@/features/shell/PageHeader";
import { ProfileTabs } from "@/features/shell/ProfileTabs";
import { Email, SafeText } from "@/features/ui/SafeText";
import { getOwnProfile } from "@/lib/db/repositories/users.repository";
import { formatIndiaTime } from "@/server/notifications/security-messages";
import { accessLabel, maskWhatsApp } from "@/features/ui/labels";

// The signed-in person's details, read-only: IT keeps them in Admin → Users.
export default async function ProfilePage() {
  const { user } = await requireArea("users");
  const profile = await getOwnProfile(user.id);
  const rows: { label: string; value: React.ReactNode }[] = [
    { label: "Name", value: <SafeText text={user.name} /> },
    { label: "User ID", value: user.loginId },
    { label: "Email", value: <Email address={user.email} /> },
    { label: "WhatsApp", value: maskWhatsApp(user.whatsappNumber) ?? "Not set" },
    { label: "Department", value: profile?.departmentName ? <SafeText text={profile.departmentName} /> : "Not set" },
    { label: "Designation", value: profile?.designationName ? <SafeText text={profile.designationName} /> : "Not set" },
    { label: "Reporting manager", value: profile?.reportingManagerName ? <SafeText text={profile.reportingManagerName} /> : "Not set" },
    { label: "Access", value: accessLabel(user.roles) },
    { label: "Last sign-in", value: profile?.lastLoginAt ? formatIndiaTime(profile.lastLoginAt) : "—" },
  ];
  return (
    <>
      <PageHeader title="Profile" description="Your details, notifications, out of office and sign-in settings." />
      <ProfileTabs />
      <section className="card max-w-2xl">
        <h2 className="border-b border-line px-5 py-4 font-semibold">Your details</h2>
        <dl className="divide-y divide-line">
          {rows.map((row) => (
            <div key={row.label} className="grid gap-1 px-5 py-3 sm:grid-cols-3 sm:gap-4">
              <dt className="text-label text-ink-muted">{row.label}</dt>
              <dd className="break-words sm:col-span-2">{row.value}</dd>
            </div>
          ))}
        </dl>
        <p className="border-t border-line px-5 py-3 text-label text-ink-muted">Something wrong? Only IT can change these details, so ask IT to update them.</p>
      </section>
    </>
  );
}
