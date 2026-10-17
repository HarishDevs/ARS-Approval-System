import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentSession } from "@/server/auth/session";
import { PublicPage, COMPANY } from "@/features/public/PublicPage";

export const metadata: Metadata = {
  title: "ARS Approvals",
  description: "ARS Approvals is the internal approval, task and information platform of ARS Steels & Alloy International Pvt. Ltd., used by its employees.",
  robots: { index: true, follow: true },
};

// v1.12.2 (D-161): signed-in people go to their space. Everyone else (and
// Google's OAuth reviewers) sees what the app is, who runs it, what it does
// with Google data, and the privacy policy and terms.
export default async function HomePage() {
  if (await getCurrentSession().catch(() => null)) redirect("/users");
  return (
    <PublicPage>
      <section className="space-y-4">
        <h1 className="text-title font-semibold">ARS Approvals</h1>
        <p className="text-body text-ink-muted">
          ARS Approvals is the internal workplace application of {COMPANY} (&ldquo;ARS&rdquo;). Employees use it to raise and approve requests through multi-level approval workflows, to
          assign and track tasks, and to publish information that colleagues read and acknowledge. Accounts are created by ARS&apos;s IT team for ARS employees only; there is no public
          sign-up.
        </p>
        <Link href="/login" className="btn-primary inline-flex">
          Sign in
        </Link>
      </section>

      <section className="mt-10 grid grid-cols-1 gap-4 sm:grid-cols-3">
        <div className="card p-4">
          <h2 className="text-body font-semibold">Approvals</h2>
          <p className="mt-1 text-label text-ink-muted">Requests move through the approval steps set by the company, with a full history of every decision.</p>
        </div>
        <div className="card p-4">
          <h2 className="text-body font-semibold">Tasks</h2>
          <p className="mt-1 text-label text-ink-muted">Work assigned to employees, with due dates, progress and reminders.</p>
        </div>
        <div className="card p-4">
          <h2 className="text-body font-semibold">Information</h2>
          <p className="mt-1 text-label text-ink-muted">Circulars and notices sent to the right people, with acknowledgements where needed.</p>
        </div>
      </section>

      <section className="mt-10 space-y-3" aria-labelledby="google-calendar">
        <h2 id="google-calendar" className="text-card-title font-semibold">
          Google Calendar (optional)
        </h2>
        <p className="text-body text-ink-muted">
          An employee can choose to connect their own Google Calendar from their profile. ARS Approvals then asks Google for permission to:
        </p>
        <ul className="ml-5 list-disc space-y-1 text-body text-ink-muted">
          <li>
            <strong>See and edit events on calendars they own</strong> (calendar.events.owned), in the one calendar they choose, so their approval due times, task due dates, information dates and personal entries appear in Google
            Calendar, and their own Google events appear in their ARS calendar, kept in step both ways.
          </li>
          <li>
            <strong>See the list of their calendars</strong> (calendar.calendarlist.readonly), only so they can pick which calendar to use.
          </li>
          <li>
            <strong>Know their email address</strong>, to show which Google account is connected.
          </li>
        </ul>
        <p className="text-body text-ink-muted">
          The connection is used only for this calendar feature, only for the person who connected it, and can be removed at any time from Profile → Calendar. Data received from Google is never sold,
          shared with others, used for advertising, or used to train AI models. See the{" "}
          <Link href="/privacy" className="link">
            privacy policy
          </Link>{" "}
          for details.
        </p>
      </section>
    </PublicPage>
  );
}
