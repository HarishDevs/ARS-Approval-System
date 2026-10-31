import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { requireArea } from "@/server/authorization/guards";
import { PageHeader } from "@/features/shell/PageHeader";
import { ProfileTabs } from "@/features/shell/ProfileTabs";
import { Hint } from "@/features/ui/Hint";
import { Email, SafeText } from "@/features/ui/SafeText";
import { Avatar } from "@/features/ui/Avatar";
import { personProfile } from "@/lib/db/repositories/profile.repository";
import { formatIndiaTime } from "@/server/notifications/security-messages";
import { accessLabel, maskWhatsApp } from "@/features/ui/labels";
import { ThemeChoice } from "@/features/shell/ThemeControls";
import { AboutForm, PhotoForm } from "@/features/shell/ProfileForms";
import { getUserSetting } from "@/lib/db/repositories/user-settings.repository";
import { THEME_SETTING, parseTheme } from "@/server/ui/theme";
import { parseTextSize, parseWorkspaceView, TEXT_SIZE_SETTING, WORKSPACE_VIEW_SETTING } from "@/server/ui/workspace-view";
import { ViewSwitch } from "@/features/shell/ViewSwitch";
import { photoUrl } from "@/server/profile/photo";
import type { RoleCode } from "@/types/auth";

// WEB-05 (v1.10.0): a plain, non-confidential browser title.
export const metadata: Metadata = { title: "Profile" };

const MODULE_LABEL: Record<string, string> = { APPROVAL: "Approvals", TASK: "Tasks & projects", INFORMATION: "Information", AI: "AI" };
const SIGN_IN_LABEL: Record<string, string> = { GOOGLE: "Google", PASSWORD: "User ID, password and WhatsApp code", BOTH: "Google, or User ID with password and WhatsApp code" };
const day = (value: Date) => new Date(value).toLocaleDateString("en-IN", { day: "numeric", month: "long", year: "numeric", timeZone: "Asia/Kolkata" });

// D-230 (owner, Asana's profile): your photo, name, job and team at the top
// (photo and About me are yours to change), then everything the user master
// holds about you (IT keeps those in Admin → Users), then Appearance.
export default async function ProfilePage() {
  const { user } = await requireArea("users");
  const [profile, theme, view, textSize] = await Promise.all([
    personProfile(user.id),
    getUserSetting(user.id, THEME_SETTING).catch(() => null),
    getUserSetting(user.id, WORKSPACE_VIEW_SETTING).catch(() => null),
    getUserSetting(user.id, TEXT_SIZE_SETTING).catch(() => null),
  ]);
  if (!profile) notFound();
  const person = (id: number | null, name: string | null, extra?: string | null) =>
    name ? (
      id ? (
        <Link href={`/users/people/${id}`} className="link">
          <SafeText text={name} />
          {extra ? <span className="font-normal text-ink-muted"> · {extra}</span> : null}
        </Link>
      ) : (
        <SafeText text={name} />
      )
    ) : (
      "Not set"
    );
  const rows: { label: string; value: React.ReactNode }[] = [
    { label: "Name", value: <SafeText text={profile.name} /> },
    { label: "User ID", value: profile.loginId },
    { label: "Email", value: <Email address={profile.email} /> },
    { label: "WhatsApp", value: maskWhatsApp(profile.whatsappNumber) ?? "Not set" },
    { label: "Designation", value: profile.designationName ? <SafeText text={profile.designationName} /> : "Not set" },
    { label: "Department", value: profile.departmentName ? <SafeText text={profile.departmentName} /> : "Not set" },
    { label: "Head of department", value: profile.departmentHeadName ? <SafeText text={profile.departmentHeadName} /> : "Not set" },
    { label: "Reporting manager", value: person(profile.managerId, profile.managerName, profile.managerDesignation) },
    {
      label: `Reports to you (${profile.directReports.length})`,
      value: profile.directReports.length ? (
        <ul className="flex flex-wrap gap-2" data-testid="direct-reports">
          {profile.directReports.map((report) => (
            <li key={report.id}>
              <Link href={`/users/people/${report.id}`} className="inline-flex items-center gap-1.5 rounded-full border border-line py-0.5 pl-0.5 pr-2.5 text-label hover:bg-surface-muted">
                <Avatar name={report.name} src={photoUrl(report.id, report.photoUpdatedAt)} size="xs" />
                <SafeText text={report.name} />
              </Link>
            </li>
          ))}
        </ul>
      ) : (
        "Nobody"
      ),
    },
    { label: "Access", value: accessLabel(profile.roles as RoleCode[]) },
    {
      label: "Modules",
      value: profile.moduleAccess
        ? profile.moduleAccess
            .split(",")
            .map((code) => MODULE_LABEL[code] ?? code)
            .join(", ")
        : "None",
    },
    { label: "How you sign in", value: SIGN_IN_LABEL[profile.signInMethod] ?? profile.signInMethod },
    { label: "Out of office", value: profile.away ? `Away until ${profile.away.until}; ${profile.away.delegateName} decides for you` : "No" },
    { label: "Member since", value: day(profile.createdAt) },
    { label: "Last sign-in", value: profile.lastLoginAt ? formatIndiaTime(profile.lastLoginAt) : "—" },
  ];
  return (
    <>
      <PageHeader title="Profile" description="Your photo and About me are yours to change; IT keeps the rest in Admin → Users." />
      <ProfileTabs />
      <section className="card mb-6 max-w-4xl px-6 py-6" aria-label="You" data-testid="profile-card">
        <div className="flex flex-col gap-6 sm:flex-row sm:items-start">
          <PhotoForm name={profile.name} src={photoUrl(profile.id, profile.photoUpdatedAt)} />
          <div className="min-w-0 flex-1 space-y-3">
            <div>
              <h2 className="text-title font-semibold">
                <SafeText text={profile.name} />
              </h2>
              <p className="text-label text-ink-muted">{[profile.designationName, profile.departmentName].filter(Boolean).join(" · ") || "No designation or department yet"}</p>
              {profile.away && <p className="mt-1 inline-flex rounded-full bg-warning-50 px-2.5 py-0.5 text-caption font-semibold text-warning-600">Out of office until {profile.away.until}</p>}
            </div>
            <AboutForm initial={profile.aboutMe} />
          </div>
        </div>
      </section>
      <section className="card max-w-4xl">
        <h2 className="flex items-center gap-1.5 border-b border-line px-5 py-4 font-semibold">
          Your details
          <Hint text="Only IT can change these details. If something is wrong, ask IT to update it." align="start" />
        </h2>
        <dl className="divide-y divide-line" data-testid="profile-details">
          {rows.map((row) => (
            <div key={row.label} className="grid gap-1 px-5 py-3 sm:grid-cols-3 sm:gap-4">
              <dt className="text-label text-ink-muted">{row.label}</dt>
              <dd className="break-words sm:col-span-2">{row.value}</dd>
            </div>
          ))}
        </dl>
      </section>
      <section className="card mt-6 max-w-4xl px-5 py-4" aria-label="Appearance">
        <ThemeChoice initial={parseTheme(theme)} />
        {/* D-210: Compact (sidebar) or Classic (Tally-style Gateway and menus). */}
        <div className="mt-4 border-t border-line pt-4">
          <ViewSwitch initial={parseWorkspaceView(view)} initialText={parseTextSize(textSize)} />
        </div>
      </section>
    </>
  );
}
