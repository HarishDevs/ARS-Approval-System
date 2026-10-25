import Link from "next/link";
import { MailLink } from "@/features/ui/MailLink";

// v1.12.2 (D-161): the public pages (home, privacy policy, terms) that
// Google's OAuth verification needs: reachable without signing in, on the
// app's own domain, each linking to the others.
export const CONTACT_EMAIL = "itadmin@arssteels.co.in";
export const COMPANY = "ARS Steels & Alloy International Pvt. Ltd.";

export const indiaYear = () => Number(new Intl.DateTimeFormat("en-IN", { timeZone: "Asia/Kolkata", year: "numeric" }).format(new Date()));

export function PublicPage({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-full flex-col bg-page">
      <header className="border-b border-line bg-surface">
        <div className="mx-auto flex max-w-4xl items-center justify-between gap-4 px-4 py-3 sm:px-6">
          <Link href="/" aria-label="ARS Internal Workspace home" className="rounded-md">
            {/* eslint-disable-next-line @next/next/no-img-element -- static SVG logo */}
            <img src="/brand/ars-green-steel.svg" alt="" width={77} height={36} className="h-9 w-auto" />
          </Link>
          <Link href="/login" className="btn-primary btn-compact">
            Sign in
          </Link>
        </div>
      </header>
      <main id="main" className="mx-auto w-full max-w-4xl flex-1 px-4 py-10 sm:px-6">
        {children}
      </main>
      <footer className="border-t border-line bg-surface">
        <div className="mx-auto flex max-w-4xl flex-wrap items-center justify-between gap-3 px-4 py-4 text-caption text-ink-muted sm:px-6">
          <p>
            © {indiaYear()} {COMPANY}
          </p>
          <nav aria-label="Legal" className="flex flex-wrap gap-4">
            <Link href="/" className="link">
              Home
            </Link>
            <Link href="/privacy" className="link">
              Privacy policy
            </Link>
            <Link href="/terms" className="link">
              Terms of use
            </Link>
            <MailLink address={CONTACT_EMAIL} />
          </nav>
        </div>
      </footer>
    </div>
  );
}

// Headings and paragraphs for the policy pages.
export function Prose({ children }: { children: React.ReactNode }) {
  return <article className="space-y-4 text-body leading-relaxed [&_h1]:text-title [&_h1]:font-semibold [&_h2]:pt-4 [&_h2]:text-card-title [&_h2]:font-semibold [&_li]:ml-5 [&_li]:list-disc [&_ul]:space-y-1 [&_code]:break-all [&_a]:break-words">{children}</article>;
}
