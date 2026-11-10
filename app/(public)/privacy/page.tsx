import type { Metadata } from "next";
import { APP_BRANDING } from "@/lib/branding";
import Link from "next/link";
import { PublicPage, Prose, COMPANY, CONTACT_EMAIL } from "@/features/public/PublicPage";
import { MailLink } from "@/features/ui/MailLink";

export const metadata: Metadata = {
  title: "Privacy policy",
  description: "How ARS CMS collects, uses, stores and protects information, including data received from Google APIs.",
  robots: { index: true, follow: true },
  alternates: { canonical: "/privacy" },
  openGraph: { type: "website", siteName: "ARS CMS", url: "/privacy", title: "Privacy policy · ARS CMS", description: "How ARS CMS collects, uses, stores and protects information.", images: [{ url: APP_BRANDING.ogImage, width: 1200, height: 630, alt: APP_BRANDING.logoAlt }] },
};

// v1.12.2 (D-161): the privacy policy Google's OAuth verification checks.
// It must describe, accurately, what the app does with Google user data and
// carry the Limited Use statement. Keep it true to the code: if the
// calendar sync changes what it reads or stores, update this page.
// D-249 (owner, v1.40.0): also covers the AI Assistant, Salesforce, profile
// photos, tasks and projects, notification choices, the weekly HOD email and
// encrypted off-site backups. D-250 to D-252 (v1.41.0): the installed app,
// phone and desktop notifications (push) and the daily session. v1.43.0: the
// layout cookie of the phone layout (v1.45.0: and the Compact mode cookie). v1.44.0 (D-273): people given a task by a
// request's background work step may read that request.
// v1.46.0 (D-277, D-278): the encrypted backup copy may go to an ARS Google
// Drive folder; security records are deleted after 90 days.
const PRIVACY_EFFECTIVE = "11 November 2026";

export default function PrivacyPage() {
  return (
    <PublicPage>
      <Prose>
        <h1>Privacy policy</h1>
        <p className="text-label text-ink-muted">Effective {PRIVACY_EFFECTIVE} · approved by the head of IT, 2 November 2026</p>
        <p>
          This policy explains how ARS CMS (the &ldquo;app&rdquo;, at approval.arssteels.net), operated by {COMPANY} (&ldquo;ARS&rdquo;, &ldquo;we&rdquo;), handles information. The app is an
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
            <strong>Work records</strong> people create in the app: approval requests and decisions, comments and mentions, tasks and projects (with their descriptions, files, followers and
            history), information notices and acknowledgements, meetings (who owns, coordinates and attends them, their points, attendance, minutes, decisions, action items and follow-up notes),
            calendar entries people add, and attached files and pasted images.
          </li>
          <li>
            <strong>Profile</strong> details people add themselves: a profile photo and a short &ldquo;About me&rdquo;, shown to colleagues on their profile card.
          </li>
          <li>
            <strong>Preferences</strong>: which notifications reach a person in the app, by email and on WhatsApp, quiet hours (Do not disturb), the screen theme and view, saved searches and views.
          </li>
          <li>
            <strong>AI Assistant (Pico Bot) conversations</strong>, only for people IT has given access: the questions they ask and the answers, kept for the period IT sets.
          </li>
          <li>
            <strong>Devices that get notifications</strong>, only when a person turns notifications on for a device: the push address and keys the browser gives for it (stored encrypted), the kind of
            device, the browser and operating system, and when it was added and last reached. It is used only to send that person&apos;s ARS notifications.
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
          ARS CMS&apos; use and transfer to any other app of information received from Google APIs will adhere to the{" "}
          <a href="https://developers.google.com/terms/api-services-user-data-policy" className="link" rel="noopener noreferrer">
            Google API Services User Data Policy
          </a>
          , including the Limited Use requirements. In particular, we do not sell Google user data, do not use or transfer it for advertising, do not use it to determine credit-worthiness or for
          lending, do not use it to develop, improve or train generalised or non-personalised AI or machine-learning models, and do not allow humans to read it except with the person&apos;s
          consent, where needed for security (for example investigating abuse), to comply with the law, or where the data has been aggregated and anonymised for internal operations.
        </p>

        <h2>AI Assistant (Pico Bot)</h2>
        <p>
          The AI Assistant is switched on by IT for chosen people only. When someone asks a question, the question, the recent turns of that conversation and the business data needed to answer
          it are sent to the AI provider IT has chosen (Anthropic Claude, OpenAI ChatGPT, xAI Grok, DeepSeek, Groq, Google Gemini or NVIDIA), under that provider&apos;s API terms. Only
          data the person is allowed to see is used; a provider is only given business data if IT has allowed it. The assistant reads data; it can&apos;t approve, send or change anything.
          When the Salesforce connection is set up, selected Salesforce records are copied read-only into ARS for the assistant to use. Answers can be wrong, so important figures should
          be checked. <strong>Google Calendar data is never sent to an AI provider.</strong> In a Draft task, the optional &ldquo;write with Pico Bot&rdquo; button sends only the task&apos;s
          name and the text the person typed.
        </p>

        <h2>The installed app and phone and desktop notifications</h2>
        <p>
          ARS CMS can be installed on a phone or computer. The installed app keeps only its own program files and images on the device, never pages, records or files: everything comes from the
          server each time. When a person turns on notifications, ARS sends each notification through the push service of that device&apos;s browser maker (Google for Chrome and Android, Apple for
          Safari, Mozilla for Firefox, Microsoft for Edge). The message is encrypted so that only the device can read it. By default a notification shows its title and a plain line, without amounts
          or other details, because it can appear on a lock screen. A person can turn notifications off for a device, remove a device, or choose which kinds of message come, at any time
          (Profile &rarr; App &amp; devices and Profile &rarr; Notifications). Signing out does not stop notifications on a device; removing the device does.
        </p>
        <p>
          On a phone, a tablet or the installed app, a sign-in lasts until midnight (India time), so people aren&apos;t asked to sign in again during the day; on a computer it ends after a period
          without activity. Keep your devices locked.
        </p>
        <p>
          On a screen narrower than 768 pixels ARS CMS shows its phone layout. To pick the right layout, the browser keeps one small cookie, <code>ars_layout</code>, holding only the word
          &ldquo;mobile&rdquo; or &ldquo;desktop&rdquo; for a year. It holds nothing about the person, and the app works the same without it. If you turn on
          Compact mode in a phone list, a second small cookie, <code>ars_m_compact</code>, keeps that choice (&ldquo;1&rdquo; or &ldquo;0&rdquo;) on that device for a year.
        </p>

        <h2>How information is shared</h2>
        <p>We do not sell personal information. Information is shared only:</p>
        <ul>
          <li>inside ARS, with the colleagues a record involves (for example the approvers of a request, the people an FYI step tells, and the people given a task from it, who may read that request), as the app&apos;s access rules allow;</li>
          <li>
            with service providers that run parts of the app for us, under their terms: GoDaddy (hosting), Cloudflare (network and security), Google Firebase (Google sign-in), Resend (email),
            CEOITBox (WhatsApp messages), the browsers&apos; push services (to deliver phone and desktop notifications, encrypted), the AI providers above (for the AI Assistant only), Salesforce
            (only when ARS connects it) and, when IT switches it on, an S3-compatible storage
            provider, or a Google Drive folder belonging to ARS, that keeps an <strong>encrypted</strong> copy of the daily backup outside the hosting account (only ARS holds the key). Google Calendar data is not shared with any of them beyond the hosting,
            network and encrypted backups that carry it;
          </li>
          <li>where the law requires it.</li>
        </ul>

        <h2>Security</h2>
        <p>
          The app is served only over HTTPS. Access is checked on the server for every page and action. Secrets and Google tokens are stored encrypted. Changes and sensitive actions are recorded in an
          audit log that cannot be edited. Daily backups carry a checksum, can be encrypted (AES-256-GCM), and are encrypted before any copy leaves the server.
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
            intact. Records under a legal hold are kept until the hold is released.
          </li>
          <li>
            <strong>AI conversations</strong> are removed after the period IT sets (unless a legal hold applies). <strong>Backups</strong> are kept for a limited number of days, then deleted.
          </li>
          <li>
            <strong>Security records</strong> (sign-in attempts, WhatsApp code records, ended sessions and used security or set-password links) are deleted automatically after 90 days, unless a
            legal hold applies. The audit log is kept. Requests and their history are never deleted automatically.
          </li>
          <li>
            <strong>Profile photo and About me</strong> can be changed or removed by the person at any time from Profile.
          </li>
          <li>
            <strong>Devices that get notifications</strong> stop at once when removed or when notifications are turned off on them, or when the push service says the device is gone; their record
            is deleted 90 days later.
          </li>
        </ul>

        <h2>Your choices and rights</h2>
        <p>
          People can see their own details and sign-in history in the app, add or remove their photo, choose which notifications they receive (and pause them), see and remove the devices that get
          their notifications, and connect or disconnect Google Calendar. Heads of department may receive a weekly email summarising their department&apos;s requests, if IT switches it on. To ask about, correct or remove your information, contact the IT
          team at <MailLink address={CONTACT_EMAIL} />.
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
