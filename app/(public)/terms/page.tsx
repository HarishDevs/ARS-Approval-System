import type { Metadata } from "next";
import Link from "next/link";
import { PublicPage, Prose, COMPANY, CONTACT_EMAIL } from "@/features/public/PublicPage";
import { MailLink } from "@/features/ui/MailLink";

export const metadata: Metadata = {
  title: "Terms of use",
  description: "Terms for using ARS-CMS, the internal approval, task and information platform of ARS.",
  robots: { index: true, follow: true },
  alternates: { canonical: "/terms" },
  openGraph: { type: "website", siteName: "ARS-CMS", url: "/terms", title: "Terms of use · ARS-CMS", description: "Terms for using ARS-CMS, the internal platform of ARS.", images: [{ url: "/icons/icon-512.png", width: 512, height: 512, alt: "ARS" }] },
};

// v1.12.2 (D-161): terms of use, linked from the home page and the Google
// OAuth consent screen. An internal tool's terms: who may use it and how.
export default function TermsPage() {
  return (
    <PublicPage>
      <Prose>
        <h1>Terms of use</h1>
        <p className="text-label text-ink-muted">Effective 2 November 2026 · approved by the head of IT, 2 November 2026</p>
        <p>
          ARS-CMS (approval.arssteels.net) is provided by {COMPANY} (&ldquo;ARS&rdquo;) for its employees to carry out company work. By signing in you agree to these terms and to ARS&apos;s
          policies that apply to company systems.
        </p>
        <h2>Who may use it</h2>
        <p>Only people with an account created by ARS&apos;s IT team. Accounts are personal: don&apos;t share your sign-in or let others act under your name.</p>
        <h2>Using it properly</h2>
        <ul>
          <li>Use it for genuine company work, and enter accurate information.</li>
          <li>Approve, decide or acknowledge only what you have actually reviewed. Your decisions are recorded under your name.</li>
          <li>Don&apos;t try to access records you aren&apos;t given, get around security, or disrupt the service.</li>
          <li>Tasks, projects, comments, mentions and notices are work records: keep them to work, and mention or add people only where they need to know.</li>
          <li>Your profile photo and About me are seen by colleagues: keep them suitable for work.</li>
          <li>
            On a phone, a tablet or the installed app you stay signed in until midnight: keep the device locked, sign out on a shared device, and remove a device you no longer use from Profile &rarr;
            App &amp; devices.
          </li>
          <li>IT&apos;s notifications to staff (Admin &rarr; Notifications) are for work notices only, sent to the people who need them; important alerts only for what is urgent.</li>
        </ul>
        <h2>AI Assistant</h2>
        <p>
          If IT gives you the AI Assistant (Pico Bot), use it for work questions. It reads the data you may see and sends your question to an external AI provider, as described in the{" "}
          <Link href="/privacy" className="link">privacy policy</Link>. Its answers can be wrong: check figures before you rely on them or pass them on. Don&apos;t paste passwords, keys or
          other people&apos;s personal details into it. It never approves, sends or changes anything; you remain responsible for your decisions.
        </p>
        <h2>Google Calendar</h2>
        <p>
          Connecting your Google Calendar is optional. You can disconnect it at any time from Profile → Calendar. A calendar event never approves, completes or acknowledges anything in ARS-CMS:
          those actions are taken only in the app. How Google data is handled is described in the <Link href="/privacy" className="link">privacy policy</Link>.
        </p>
        <h2>Records and monitoring</h2>
        <p>Work records and an audit log of actions are kept as company records and may be reviewed by authorised ARS staff, as described in the privacy policy.</p>
        <p>
          The emergency (break-glass) account may sign in with its password alone, without the WhatsApp code, only while IT has opened its emergency window from the server. Every such sign-in is
          recorded and the Super Admins are told at once.
        </p>
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
