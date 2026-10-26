import type { Metadata } from "next";
import Link from "next/link";
import { PublicPage, Prose, COMPANY, CONTACT_EMAIL } from "@/features/public/PublicPage";
import { MailLink } from "@/features/ui/MailLink";

export const metadata: Metadata = {
  title: "Privacy policy",
  description: "How ARS-CMS collects, uses, stores and protects information, including data received from Google APIs.",
  robots: { index: true, follow: true },
};

// v1.12.2 (D-161): the privacy policy Google's OAuth verification checks.
// It must describe, accurately, what the app does with Google user data and
// carry the Limited Use statement. Keep it true to the code: if the
// calendar sync changes what it reads or stores, update this page.
const PRIVACY_EFFECTIVE = "17 October 2026";

export default function PrivacyPage() {
  return (
    <PublicPage>
      <Prose>
        <h1>Privacy policy</h1>
        <p className="text-label text-ink-muted">Effective {PRIVACY_EFFECTIVE}</p>
        <p>
          This policy explains how ARS-CMS (the &ldquo;app&rdquo;, at approval.arssteels.net), operated by {COMPANY} (&ldquo;ARS&rdquo;, &ldquo;we&rdquo;), handles information. The app is an
          internal workplace tool for ARS employees. Accounts are created by ARS&apos;s IT team; there is no public sign-up.
        </p>

        <h2>Information we collect</h2>
        <ul>
          <li>
            <strong>Account details</strong> entered by IT: name, user ID, work email address, WhatsApp number (for sign-in codes and notices), department, designation and reporting manager.
          </li>
          <li>
            <strong>Sign-in and security records</strong>: sign-in times, the method used, IP address and browser details, to protect accounts and to show people their own sign-in history.
          </li>
          <li>
            <strong>Work records</strong> people create in the app: approval requests and decisions, comments, tasks, information notices, acknowledgements and attached files.
          </li>
          <li>
            <strong>Google sign-in</strong>: if a person signs in with Google, we receive their Google account email and account identifier to match them to the account IT created.
          </li>
          <li>
            <strong>Google Calendar data</strong>, only if a person chooses to connect their Google Calendar (see below).
          </li>
        </ul>

        <h2>Google Calendar: what we access and why</h2>
        <p>Connecting Google Calendar is optional and done by each person for themselves. With their permission, the app requests these Google scopes:</p>
        <ul>
          <li>
            <code>https://www.googleapis.com/auth/calendar.events.owned</code>: limited to calendars the person owns. Used to add, update and remove events in the one calendar they choose, for their own approval due times, task due dates,
            information dates and personal entries, and to read the events in that calendar so their own Google events appear in their ARS calendar and changes made on either side are kept in step.
          </li>
          <li>
            <code>https://www.googleapis.com/auth/calendar.calendarlist.readonly</code>: to list the person&apos;s calendars so they can pick which one to use.
          </li>
          <li>
            <code>openid</code> and <code>email</code>: to show which Google account is connected.
          </li>
        </ul>
        <p>
          <strong>What we store:</strong> for each connected person, their Google account email, the calendar they chose, the access and refresh tokens Google issues (encrypted with AES-256-GCM on
          our server and never sent to the browser), a sync marker, and copies of the events in their chosen calendar (title, notes, start and end times) from 30 days back onwards. Event copies are
          shown only to that person in their own ARS calendar. Events the app writes to Google show a reference number and a link, not the content of the underlying record.
        </p>
        <p>
          <strong>How we use it:</strong> only to provide the calendar feature to the person who connected it. Google Calendar data is not used for any other purpose, is not shown to other people
          (including administrators), and is not used for analytics about individuals.
        </p>

        <h2>Limited Use disclosure</h2>
        <p>
          ARS-CMS&apos; use and transfer to any other app of information received from Google APIs will adhere to the{" "}
          <a href="https://developers.google.com/terms/api-services-user-data-policy" className="link" rel="noopener noreferrer">
            Google API Services User Data Policy
          </a>
          , including the Limited Use requirements. In particular, we do not sell Google user data, do not use or transfer it for advertising, do not use it to determine credit-worthiness or for
          lending, do not use it to develop, improve or train generalised or non-personalised AI or machine-learning models, and do not allow humans to read it except with the person&apos;s
          consent, where needed for security (for example investigating abuse), to comply with the law, or where the data has been aggregated and anonymised for internal operations.
        </p>

        <h2>How information is shared</h2>
        <p>We do not sell personal information. Information is shared only:</p>
        <ul>
          <li>inside ARS, with the colleagues a record involves (for example the approvers of a request), as the app&apos;s access rules allow;</li>
          <li>
            with service providers that run parts of the app for us, under their terms: GoDaddy (hosting), Cloudflare (network and security), Google Firebase (Google sign-in), Resend (email) and
            CEOITBox (WhatsApp messages). Google Calendar data is not shared with any of them beyond the hosting and network that carry it;
          </li>
          <li>where the law requires it.</li>
        </ul>

        <h2>Security</h2>
        <p>
          The app is served only over HTTPS. Access is checked on the server for every page and action. Secrets and Google tokens are stored encrypted. Changes and sensitive actions are recorded in an
          audit log that cannot be edited.
        </p>

        <h2>Keeping and deleting information</h2>
        <ul>
          <li>
            <strong>Google Calendar:</strong> disconnecting (Profile → Calendar → Disconnect Google Account) revokes the app&apos;s access at Google, deletes the stored tokens, and removes the copies of
            Google events from the person&apos;s ARS calendar. A person can also remove access at any time from their Google Account (Security → Third-party apps with account access). Events the app
            added to Google stay unless the person ticks &ldquo;Also remove the events ARS added&rdquo; when disconnecting.
          </li>
          <li>
            <strong>Work records</strong> are kept as ARS&apos;s business records, following ARS&apos;s retention rules. Accounts are switched off rather than deleted, to keep the history of decisions
            intact.
          </li>
        </ul>

        <h2>Your choices and rights</h2>
        <p>
          People can see their own details and sign-in history in the app, choose which notifications they receive, and connect or disconnect Google Calendar. To ask about, correct or remove your
          information, contact the IT team at <MailLink address={CONTACT_EMAIL} />.
        </p>

        <h2>Changes</h2>
        <p>If this policy changes, the new version is published on this page with a new effective date.</p>

        <h2>Contact</h2>
        <p>
          {COMPANY}, IT team: <MailLink address={CONTACT_EMAIL} />. See also the <Link href="/terms" className="link">terms of use</Link>.
        </p>
      </Prose>
    </PublicPage>
  );
}
