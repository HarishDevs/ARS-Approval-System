import type { Metadata } from "next";
import Link from "next/link";
import { PublicPage, Prose, COMPANY, CONTACT_EMAIL } from "@/features/public/PublicPage";
import { MailLink } from "@/features/ui/MailLink";

export const metadata: Metadata = {
  title: "Terms of use",
  description: "Terms for using ARS Approvals, the internal approval, task and information platform of ARS.",
  robots: { index: true, follow: true },
};

// v1.12.2 (D-161): terms of use, linked from the home page and the Google
// OAuth consent screen. An internal tool's terms: who may use it and how.
export default function TermsPage() {
  return (
    <PublicPage>
      <Prose>
        <h1>Terms of use</h1>
        <p className="text-label text-ink-muted">Effective 17 October 2026</p>
        <p>
          ARS Approvals (approval.arssteels.net) is provided by {COMPANY} (&ldquo;ARS&rdquo;) for its employees to carry out company work. By signing in you agree to these terms and to ARS&apos;s
          policies that apply to company systems.
        </p>
        <h2>Who may use it</h2>
        <p>Only people with an account created by ARS&apos;s IT team. Accounts are personal: don&apos;t share your sign-in or let others act under your name.</p>
        <h2>Using it properly</h2>
        <ul>
          <li>Use it for genuine company work, and enter accurate information.</li>
          <li>Approve, decide or acknowledge only what you have actually reviewed. Your decisions are recorded under your name.</li>
          <li>Don&apos;t try to access records you aren&apos;t given, get around security, or disrupt the service.</li>
        </ul>
        <h2>Google Calendar</h2>
        <p>
          Connecting your Google Calendar is optional. You can disconnect it at any time from Profile → Calendar. A calendar event never approves, completes or acknowledges anything in ARS Approvals:
          those actions are taken only in the app. How Google data is handled is described in the <Link href="/privacy" className="link">privacy policy</Link>.
        </p>
        <h2>Records and monitoring</h2>
        <p>Work records and an audit log of actions are kept as company records and may be reviewed by authorised ARS staff, as described in the privacy policy.</p>
        <h2>Availability and changes</h2>
        <p>ARS may change, suspend or end the service, or these terms, at any time. The current terms are always on this page.</p>
        <h2>Contact</h2>
        <p>
          Questions: the IT team at <MailLink address={CONTACT_EMAIL} />.
        </p>
      </Prose>
    </PublicPage>
  );
}
