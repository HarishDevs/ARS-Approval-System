import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { requireArea } from "@/server/authorization/guards";
import { Avatar } from "@/features/ui/Avatar";
import { Email, SafeText } from "@/features/ui/SafeText";
import { personProfile } from "@/lib/db/repositories/profile.repository";
import { photoUrl } from "@/server/profile/photo";
import { RichText } from "@/features/work/RichText";

export const metadata: Metadata = { title: "Profile" };

// D-230 (Asana's profile card): anyone signed in can see a colleague's
// photo, job, team, manager, people who report to them and About me, as in a
// staff directory. Not their sign-in details, number or access.
export default async function PersonPage({ params }: { params: Promise<{ id: string }> }) {
  const { user } = await requireArea("users");
  const { id } = await params;
  if (!/^\d{1,10}$/.test(id)) notFound();
  const profile = await personProfile(Number(id));
  if (!profile || !profile.active) notFound();
  const mine = profile.id === user.id;
  return (
    <section className="card max-w-4xl px-6 py-6" data-testid="person-card">
      <div className="flex flex-col gap-6 sm:flex-row sm:items-start">
        <Avatar name={profile.name} src={photoUrl(profile.id, profile.photoUpdatedAt)} size="xl" approver={profile.isApprover} />
        <div className="min-w-0 flex-1 space-y-3">
          <div>
            <h1 className="text-title font-semibold">
              <SafeText text={profile.name} />
            </h1>
            <p className="text-label text-ink-muted">{[profile.designationName, profile.departmentName].filter(Boolean).join(" · ")}</p>
            {profile.away && <p className="mt-1 inline-flex rounded-full bg-warning-50 px-2.5 py-0.5 text-caption font-semibold text-warning-600">Out of office until {profile.away.until}</p>}
          </div>
          {profile.aboutMe && <RichText text={profile.aboutMe} className="text-body" />}
          <dl className="grid gap-2 text-label sm:grid-cols-[10rem_1fr]">
            <dt className="text-ink-muted">Email</dt>
            <dd>
              <Email address={profile.email} />
            </dd>
            <dt className="text-ink-muted">Reports to</dt>
            <dd>
              {profile.managerId && profile.managerName ? (
                <Link href={`/users/people/${profile.managerId}`} className="link">
                  <SafeText text={profile.managerName} />
                </Link>
              ) : (
                "—"
              )}
            </dd>
            {profile.departmentHeadName && (
              <>
                <dt className="text-ink-muted">Head of department</dt>
                <dd>
                  <SafeText text={profile.departmentHeadName} />
                </dd>
              </>
            )}
            <dt className="text-ink-muted">Their team</dt>
            <dd>
              {profile.directReports.length ? (
                <ul className="flex flex-wrap gap-2">
                  {profile.directReports.map((report) => (
                    <li key={report.id}>
                      <Link href={`/users/people/${report.id}`} className="inline-flex items-center gap-1.5 rounded-full border border-line py-0.5 pl-0.5 pr-2.5 hover:bg-surface-muted">
                        <Avatar name={report.name} src={photoUrl(report.id, report.photoUpdatedAt)} size="xs" approver={report.isApprover} />
                        <SafeText text={report.name} />
                      </Link>
                    </li>
                  ))}
                </ul>
              ) : (
                "Nobody reports to them"
              )}
            </dd>
          </dl>
          {mine && (
            <Link href="/users/profile" className="btn-primary btn-compact w-auto">
              Edit profile
            </Link>
          )}
        </div>
      </div>
    </section>
  );
}
