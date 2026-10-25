import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentSession } from "@/server/auth/session";
import { COMPANY, CONTACT_EMAIL, indiaYear } from "@/features/public/PublicPage";
import { MailLink } from "@/features/ui/MailLink";

export const metadata: Metadata = {
  title: { absolute: "ARS Internal Workspace | ARS Steels" },
  description: "ARS Internal Workspace — the internal digital workspace for ARS Steels & Alloy International Pvt. Ltd.",
  robots: { index: true, follow: true },
};

// D-188 (owner): the public landing page of ARS Internal Workspace. A compact
// header, one centred hero and a small footer; both Sign in buttons use the
// existing /login route. Signed-in people go straight to their space
// (v1.12.2, D-161). The Google data-use explanation lives in the privacy
// policy, linked from the footer.
const SIGN_IN = "/login";

export default async function HomePage() {
  if (await getCurrentSession().catch(() => null)) redirect("/users");
  return (
    <div className="flex min-h-dvh flex-col bg-page">
      <header className="border-b border-line bg-surface">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-3 px-4 sm:px-6">
          <Link href="/" aria-label="ARS Internal Workspace home" className="flex min-w-0 items-center gap-3 rounded-md focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary-600">
            {/* eslint-disable-next-line @next/next/no-img-element -- static SVG logo */}
            <img src="/brand/ars-green-steel.svg" alt="" width={77} height={36} className="h-8 w-auto shrink-0 sm:h-9" />
            <span className="truncate text-body font-semibold text-ink">ARS Internal Workspace</span>
          </Link>
          <Link href={SIGN_IN} className="btn-primary btn-compact w-auto shrink-0 motion-reduce:transition-none">
            Sign in
          </Link>
        </div>
      </header>

      <main id="main" className="flex flex-1 items-center justify-center px-4 py-16 sm:px-6">
        <div className="mx-auto max-w-2xl text-center">
          <h1 className="text-[clamp(1.75rem,4.5vw,2.75rem)] font-semibold leading-tight tracking-tight text-ink">Welcome to ARS Internal Workspace</h1>
          <p className="mt-4 text-[clamp(0.9375rem,1.6vw,1.125rem)] text-ink-muted">One workspace. Everything you need to work.</p>
          <Link href={SIGN_IN} className="btn-primary mt-8 inline-flex h-12 w-auto items-center gap-2 px-7 text-[1rem] motion-reduce:transition-none">
            Sign in to continue <span aria-hidden="true">→</span>
          </Link>
        </div>
      </main>

      <footer className="border-t border-line bg-surface">
        <div className="mx-auto flex max-w-6xl flex-col-reverse items-center gap-2 px-4 py-4 text-[0.8125rem] text-ink-muted sm:flex-row sm:justify-between sm:px-6">
          <p>
            © {indiaYear()} {COMPANY}
          </p>
          <nav aria-label="Legal" className="flex flex-wrap justify-center gap-x-5 gap-y-1">
            <Link href="/privacy" className="link">
              Privacy Policy
            </Link>
            <Link href="/terms" className="link">
              Terms of Use
            </Link>
            <MailLink address={CONTACT_EMAIL} label="IT Support" />
          </nav>
        </div>
      </footer>
    </div>
  );
}
