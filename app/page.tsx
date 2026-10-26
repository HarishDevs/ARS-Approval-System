import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { BellRing, CalendarDays, GitBranch, ListChecks } from "lucide-react";
import { getCurrentSession } from "@/server/auth/session";
import { COMPANY, CONTACT_EMAIL, PublicPage } from "@/features/public/PublicPage";
import { MailLink } from "@/features/ui/MailLink";

export const metadata: Metadata = {
  title: { absolute: "ARS-CMS | ARS Steels" },
  description: "ARS-CMS is the Central Management System of ARS Steels & Alloy International Pvt. Ltd.: multi-level approvals, information notices, tasks and an optional Google Calendar link.",
  applicationName: "ARS-CMS",
  robots: { index: true, follow: true },
};

// D-198 (Google OAuth review, second attempt): the home page is a public page
// about the app, not the sign-in screen. Google read the split sign-in layout
// (D-190) as "behind a login page", couldn't find the purpose, and took the
// logo's "ARS Green Steel" for the app name. So: the name ARS-CMS in the header
// and as the heading, what the app does, how it uses Google data, and the
// policy links. Sign-in stays one click away. Signed-in people go straight to
// their space (v1.12.2, D-161).
const FEATURES = [
  { icon: GitBranch, title: "Multi-level approvals", text: "Raise a request and route it through as many approval levels as it needs: in sequence, in parallel or any one of a group. Everyone sees who has approved and who is next." },
  { icon: BellRing, title: "Information notices", text: "Share circulars and updates with the right people and see who has read and acknowledged them." },
  { icon: ListChecks, title: "Tasks", text: "Assign work with due dates, follow progress and keep the full history of every change." },
  { icon: CalendarDays, title: "Google Calendar (optional)", text: "Each employee can choose to connect their own Google Calendar, so their approval, task and information due dates appear there." },
] as const;

export default async function HomePage() {
  if (await getCurrentSession().catch(() => null)) redirect("/users");
  return (
    <PublicPage>
      <section className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-primary-solid to-[#003B6E] px-6 py-12 text-white sm:px-10 sm:py-14">
        <div aria-hidden="true" className="pointer-events-none absolute -right-32 -top-32 h-80 w-80 rounded-full border-[40px] border-white/10" />
        <div className="relative max-w-2xl">
          <p className="text-label font-semibold uppercase tracking-[0.16em] text-white/80">Central Management System</p>
          <h1 className="mt-2 text-[clamp(2rem,5vw,3rem)] font-bold leading-tight tracking-tight">ARS-CMS</h1>
          <p data-testid="landing-purpose" className="mt-4 text-[clamp(1rem,1.6vw,1.125rem)] leading-relaxed text-white/90">
            ARS-CMS is the internal workplace app of {COMPANY} Employees use it to raise and approve requests, share information and track tasks in one place.
          </p>
          <Link href="/login" className="mt-8 inline-flex h-11 items-center gap-2 rounded-lg bg-white px-6 font-semibold text-[#003B6E] hover:bg-white/90 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white">
            Sign in <span aria-hidden="true">→</span>
          </Link>
        </div>
      </section>

      <section aria-labelledby="what" className="mt-12">
        <h2 id="what" className="text-card-title font-semibold text-ink">What you can do in ARS-CMS</h2>
        <ul className="mt-5 grid gap-4 sm:grid-cols-2">
          {FEATURES.map(({ icon: Icon, title, text }) => (
            <li key={title} className="rounded-xl border border-line bg-surface p-5">
              <Icon aria-hidden="true" className="h-6 w-6 text-primary-600" />
              <h3 className="mt-3 font-semibold text-ink">{title}</h3>
              <p className="mt-1 text-body leading-relaxed text-ink-muted">{text}</p>
            </li>
          ))}
        </ul>
      </section>

      <section aria-labelledby="who" className="mt-12 grid gap-8 sm:grid-cols-2">
        <div>
          <h2 id="who" className="text-card-title font-semibold text-ink">Who can use it</h2>
          <p className="mt-3 text-body leading-relaxed text-ink-muted">
            ARS-CMS is for ARS employees only. The ARS IT team creates every account; there is no public sign-up. Employees sign in with their Google account or with their user ID and a code sent on
            WhatsApp. For access, contact IT Support at <MailLink address={CONTACT_EMAIL} />.
          </p>
        </div>
        <div>
          <h2 className="text-card-title font-semibold text-ink">How ARS-CMS uses Google data</h2>
          <p className="mt-3 text-body leading-relaxed text-ink-muted">
            Google sign-in is used only to confirm who is signing in. If an employee connects Google Calendar, ARS-CMS adds and updates their own due dates in the calendar they choose and shows their
            events back to them, and to no one else. Google data is never sold, used for advertising or used to train AI models. Details are in our{" "}
            <Link href="/privacy" className="link">
              privacy policy
            </Link>{" "}
            and{" "}
            <Link href="/terms" className="link">
              terms of use
            </Link>
            .
          </p>
        </div>
      </section>
    </PublicPage>
  );
}
