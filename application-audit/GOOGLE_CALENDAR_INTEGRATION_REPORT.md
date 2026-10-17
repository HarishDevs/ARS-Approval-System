# Google Calendar Integration: Final Implementation Report (v1.11.0)

**Date:** 16 Oct 2026

**State:** the code is implemented and the automated tests pass with Google mocked. It is not deployed, and it has not been tested against a real Google Cloud project. That needs the owner's OAuth client; see §4.

## 1. Files created and modified

**Created:**
- **Migration:** `database/migrations/202610170900_v1110_google_calendar.sql`
- **Server, calendar:**
  - `server/calendar/config.ts`: settings rules, status, scopes, consent URL.
  - `server/calendar/events.ts`: event mapping, privacy templates, ids, parsing, backoff, conflict decisions.
  - `server/calendar/sources.ts`: the person's business dates.
  - `server/calendar/sync.ts`: pull and push, tokens, channels.
  - `server/calendar/jobs.ts`: the runner step, retries, dead-letter.
  - `server/calendar/service.ts`: Super Admin and person services, OAuth, personal entries, webhook handling.
  - `server/calendar/views.ts`, `server/calendar/entries.ts`: the calendar page.
- **Google client:** `server/integrations/google-calendar/client.ts`
- **Repository:** `lib/db/repositories/gcal.repository.ts`
- **Routes:**
  - `app/api/integrations/google-calendar/connect/route.ts`
  - `app/api/integrations/google-calendar/callback/route.ts`
  - `app/api/webhooks/google-calendar/route.ts`
- **Super Admin pages:**
  - `app/superadmin/integrations/page.tsx`
  - `app/superadmin/integrations/google-calendar/{page,actions}.tsx|ts`
- **Person's pages:**
  - `app/users/profile/calendar/page.tsx`
  - `app/users/calendar-actions.ts`
  - `app/users/calendar/items/[id]/page.tsx`
- **UI:**
  - `features/integrations/CalendarForms.tsx`, `features/integrations/ConnectionForms.tsx`
  - `features/calendar/EntryForm.tsx`
- **Tests:**
  - `tests/helpers/fake-google.ts`
  - `tests/calendar/v1110-calendar.test.ts`
  - `tests/integration/v1110-calendar.int.test.ts`
  - `tests/e2e/v1110-calendar.spec.ts`

**Modified:**
- **Calendar page:** `app/users/calendar/page.tsx` now has month, week and day views, all sources, filters and sync status.
- **Super Admin nav:** `app/superadmin/layout.tsx` and `features/shell/nav-icons.tsx` (Integrations).
- **Profile tabs:** `features/shell/ProfileTabs.tsx` (Calendar tab).
- **Information types:**
  - `server/modules/settings.ts`: the information-type "Show on calendars" setting (off by default; old settings still read);
  - `features/admin/ModuleTypeEditor.tsx`: its toggle.
- **Jobs and alerts:**
  - `server/ops/automation.ts`: the `calendar` step;
  - `server/ops/alerts.ts`: the calendar failure alert.
- **Tests:**
  - `tests/security/route-inventory.test.ts`: the webhook on the public list;
  - `tests/e2e/v1100-web.spec.ts`: calendar pages in the viewport check;
  - `tests/e2e/v170-abc.spec.ts`: page heading.

## 2. Database migrations

- **Migration:** `202610170900_v1110_google_calendar.sql`. It creates 7 tables and inserts the settings row.
- **Changes to existing tables:** none.
- **When it runs:** automatically on the next start (`npm start`).
- **Triggers:** none, so there is no SUPER-privilege issue on GoDaddy.

## 3. Super Admin configuration steps

1. Super Admin → **Integrations** → **Google Calendar**.
2. Paste the **Client ID** and **Client secret** (from §4). **Save configuration.** The secret is stored encrypted and never shown again.
3. Review the policies. The defaults are:

   | Policy | Default |
   |---|---|
   | Direction | Two-way |
   | Event privacy | Private |
   | Event title | "{kind}: {ref}" (no titles or amounts) |
   | Conflicts | Ask the person |
   | Record left the calendar | Remove its Google event |
   | ARS event deleted in Google | Stop syncing that record |
   | Reconcile every | 15 minutes |
   | Retries | 5 |

4. **Test configuration.** Every check must pass:
   - database;
   - encryption;
   - client ID and secret, including Google's own check of the pair;
   - redirect URI;
   - the job runner has run within the last 15 minutes;
   - no Calendar-API-disabled errors.
5. **Enable integration.** People now see **Connect Google Account** under Profile → Calendar.
6. Optional: in Admin → Information types, tick **Show on calendars** for types such as training sessions or briefings.

## 4. Google Cloud Console set-up (owner)

1. **Project:** console.cloud.google.com, the ARS project. The Firebase project can be reused, or a new one created.
2. **API:** APIs & Services → Library → **Google Calendar API** → Enable.
3. **OAuth consent screen:**
   - **User type: External.** ARS people use several domains (for example arssteels.com and arsenergy.co.in). With **Internal**, Google refuses everyone outside the project's own Workspace with **"Error 403: org_internal"**. To change it: Google Auth Platform → **Audience** → **Make external**.
   - **Publishing status:** while it is "Testing", only the listed test users (up to 100) can connect, and their access lapses after 7 days. For everyone, press **Publish app**. Calendar scopes are "sensitive", so until Google verifies the app people see a "Google hasn't verified this app" screen (Advanced → continue), up to 100 users. Verification needs the home page, a privacy policy link and the verified domain.
   - App name "ARS Approvals", support email itadmin@arssteels.co.in.
   - Scopes:
     - `openid`
     - `email`
     - `https://www.googleapis.com/auth/calendar.events`
     - `https://www.googleapis.com/auth/calendar.calendarlist.readonly`
   - **External apps in "Testing" mode** allow only the listed test users, and their access expires after 7 days. People then see "Reauthorise". For everyone to use it, publish the app; Google may require verification for calendar scopes.
4. **Credentials:** → Create credentials → OAuth client ID → **Web application**.
   - **Authorised redirect URI:** `https://approval.arssteels.net/api/integrations/google-calendar/callback`
   - **Authorised JavaScript origins:** none needed.
5. Copy the Client ID and secret into Super Admin (§3). Never put them in a file or a chat.

**Cost:** the Calendar API has no charge at this volume (it is quota-based). No paid Google product is required.

## 5. Required environment variables

The values are never shown here.

| Variable | Needed for |
|---|---|
| `APP_BASE_URL` | Must be `https://approval.arssteels.net`: the redirect URI, event links and the webhook address |
| `ENCRYPTION_KEY` | Already set. It encrypts the client secret and tokens. If it changes, the secret must be entered again and everyone must reconnect. |
| `JOB_RUNNER_SECRET` | Already set. The 5-minute cron runs the sync. |

**No new variables.** The OAuth credentials live in the database, encrypted, entered by the Super Admin.

## 6. Background jobs and webhook

- **Cron:** the existing 5-minute cron (`/api/jobs/run`) runs the new **calendar** step. Super Admin → Automation lists it. It:
  - queues a reconciliation for each connection not synced within the interval;
  - renews watch channels a day before they expire;
  - processes waiting syncs within 25 seconds per run;
  - retries with exponential backoff (1, 2, 4 … minutes, plus jitter), then marks the sync DEAD and alerts the Super Admin.
- **Recovery:** a run left RUNNING for 15 minutes or more (process restart) is closed, and a new sync is queued.
- **Webhook:** `https://approval.arssteels.net/api/webhooks/google-calendar`.
  - It must be reachable over HTTPS through Cloudflare.
  - Google needs no domain verification for it.
  - It is public, but each notification must carry a known channel id, resource id and secret channel token.
  - Push notifications only speed things up; the reconciliation catches anything missed.
- **Cloudflare:** no change needed. If WAF or bot rules challenge POSTs to `/api/webhooks/*`, add a skip rule for that path.

## 7. Behaviour in brief

- **Google → ARS:**
  - Incremental sync with sync tokens, all pages.
  - An expired token (410) triggers a full relisting, with no duplicates.
  - New events become the person's personal entries.
  - Changes and deletions follow.
  - Events ARS wrote are recognised and never imported back.
- **ARS → Google:**
  - Each eligible record has a fixed event id, so retries never duplicate.
  - Content is compared by hash, so unchanged records write nothing.
  - Records that leave the calendar follow the deletion policy.
- **Business dates:**
  - ARS is the source. A Google edit is put back; a Google deletion follows the policy.
  - **No sync ever approves, rejects, completes or acknowledges anything.**
- **Personal entries:** two-way. A change in both places follows the conflict policy (default: the person reviews it).
- **Time:** stored as UTC instants. All-day entries use dates, with Google's exclusive end handled.
- **Repeating events:** a repeating Google event is shown as its first occurrence and marked "Repeats".

## 8. Tests executed and results

Google is mocked by `tests/helpers/fake-google.ts`; no real account is used.

| Suite | Result |
|---|---|
| Unit: `tests/calendar/v1110-calendar.test.ts` | 16 passed |
| Integration: `tests/integration/v1110-calendar.int.test.ts` | 18 passed |
| E2E: `tests/e2e/v1110-calendar.spec.ts` | 4 passed |
| Full suites (16 Oct 2026) | lint and typecheck clean; unit 545 passed; integration 224 passed; E2E 110 passed (0 failed); QA 27 passed; origin 1 passed |

**What the integration test covers:**
- **Super Admin:** only the Super Admin can configure; invalid values are refused; the secret is stored encrypted and never audited; it can't be enabled until the checks pass; disabling takes effect at once.
- **OAuth:**
  - wrong nonce, another person's state, a reused state and a denial are all refused (and audited);
  - a successful connection stores tokens encrypted.
- **ARS → Google:**
  - a task date becomes a private, reference-only event, and the task is unchanged;
  - nothing is written twice;
  - a due-date change updates the same event;
  - completing a task removes its event;
  - nothing of another person's is synced;
  - only calendar-eligible information is synced, and an event is never an acknowledgement.
- **Google → ARS:**
  - import across pages, all-day and timed;
  - no duplicates on the next run;
  - Google edits and deletions follow;
  - an ARS entry's echo doesn't loop;
  - a Google edit to a business event is put back.
- **Conflicts and recovery:**
  - a conflict is detected; only its owner resolves it; "Keep ARS" writes ARS's version to Google;
  - a 410 does a full resync without duplicates.
- **Notifications, retries and credentials:**
  - a webhook with a wrong token or resource is refused, and duplicates make one job;
  - a 503 is retried later with backoff;
  - an expired access token is refreshed;
  - withdrawn consent gives NEEDS_REAUTH, after which nothing calls Google;
  - disconnect removes the events if asked, revokes and deletes the tokens; another user can't disconnect someone else.

## 9. Features fully implemented

- Super Admin configuration: save, test, enable/disable, maintenance, health, logs, failed syncs with retry and retry-all, connected people with revoke and full resync, conflicts, audit history.
- Per-person OAuth: connect, reauthorise, choose a calendar, Sync now, review conflicts, disconnect (optionally removing ARS events).
- True two-way sync, incremental with sync tokens, 410 recovery, push notifications with channel renewal, reconciliation, idempotency, loop prevention, deletion policies, conflict handling.
- Module eligibility: approval due times, needed-by dates, task due times, information types marked for calendars, personal entries.
- Calendar month, week and day views, with kind filters, source ("From Google") and sync-status indicators, and personal entries (add, edit, delete).
- Security: encrypted secrets and tokens, least-privilege scopes, state + nonce CSRF protection, per-person isolation, webhook validation, rate limits, audit entries.

## 10. Partially implemented, or not implemented

- **Repeating Google events:** shown as one entry (the first occurrence) marked "Repeats". Individual occurrences aren't expanded or edited from ARS; change the series in Google.
- **"Scheduled approval meetings" and "task meetings":** ARS has no meeting fields today, so there is nothing to sync. A meeting can be added as a personal entry. A future meeting field would plug into `businessSources`.
- **Task start times:** `tasks.starts_on` is a date without a time, and the sync uses the due time. Adding start dates is a small change if wanted.
- **Live Google testing:** blocked until the owner creates the OAuth client (§4). Everything has been tested only against the mock.
- **Sync latency:** without push notifications (for example before the webhook is reachable), changes appear within the reconciliation interval plus up to 5 minutes (the cron).

## 11. Operational risks

- **Testing mode:** if the Google app stays in "Testing", connections lapse after 7 days and people must reauthorise.
- **ENCRYPTION_KEY:** rotating it makes the saved secret and tokens unreadable. Enter the secret again, and everyone reconnects.
- **Revoked access:** a person who revokes ARS in their Google account settings shows as "Needs reauthorising" at the next sync.

## 12. Production deployment and verification steps

1. Publish the release. The migration applies on start; check `/api/health`.
2. Google Cloud set-up (§4).
3. Super Admin configuration (§3), then Test configuration (all checks green), then Enable.
4. Connect your own account under Profile → Calendar. Check that:
   - your approvals and tasks with due dates appear in Google as "Approval due: …" / "Task due: …" (private);
   - a Google event you create appears in ARS → Calendar within a few minutes;
   - an edit on either side follows.
5. Super Admin → Integrations → Google Calendar: health shows 1 connected, syncs done, and a channel set.
6. Disconnect, ticking "remove ARS events": they disappear from Google.
