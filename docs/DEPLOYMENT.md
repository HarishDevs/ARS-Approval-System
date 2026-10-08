# Deployment and go-live: ARS Approval Platform

Address: **https://approvals.arssteels.net** (one app; areas `/users`, `/admin`, `/superadmin`, D-034).

Route: **GoDaddy Node.JS Hosting**, connected to GitHub `HarishDevs/ARS-Approval-System`, branch `main`. This is the same product and path the Power BI site uses (see `D:\PBI New\Completed Documentation\Deployment\GODADDY_DEPLOYMENT_GUIDE.md`).

Flow: FLOWS.md F-90. Owner: itadmin@arssteels.co.in.

Anything below marked **confirm** has not been seen on the real GoDaddy screens yet. Check it as you go; don't assume.

**Release v1.0.0 (8 Oct 2026):** the first production release. What's in it is listed in `docs/RELEASE-NOTES.md`. Deploy the commit tagged `v1.0.0`, and only once CI on that commit shows all three jobs green (checks, integration, e2e).

---

## 1. Before you start
- [ ] GitHub CI is green on the commit you will deploy (Actions tab).
- [ ] You can sign in to GoDaddy (`host.godaddy.com/hosting` → Node.JS Hosting) and cPanel.
- [ ] Generate **fresh** production secrets on your own computer. Never reuse the development values, and never put them in any file:
  ```bash
  node -e "console.log(require('crypto').randomBytes(48).toString('base64'))"     # SESSION_SECRET
  node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"     # ENCRYPTION_KEY
  node -e "console.log(require('crypto').randomBytes(32).toString('base64url'))"  # JOB_RUNNER_SECRET
  ```
  Store `ENCRYPTION_KEY` in a password manager as well. If it is lost, every saved provider key must be entered again.
- [ ] You have the Firebase Admin service-account values for project `power-bi-dashboard-3b29f` (D-038).

## 2. Database (MySQL 8)
1. In cPanel → MySQL Databases, create the database (e.g. `ars_approvals`) and a user with all privileges on it.
   - **Confirm** which host the Node app reaches (§1 item 3 of the Power BI guide: bundled database vs the existing cPanel MySQL).
2. **Privilege check first.** The audit log, timeline and comments are made append-only by triggers:
   ```bash
   DB_HOST=… DB_PORT=3306 DB_NAME=ars_approvals DB_USER=… DB_PASSWORD=… node scripts/database/check-privileges.js
   ```
   Every line must say OK. If `CREATE TRIGGER` fails, ask GoDaddy support to allow triggers for the user (or to enable `log_bin_trust_function_creators`) **before** migrating. Don't go live without it.
3. Migrate, then seed:
   ```bash
   DB_HOST=… node scripts/database/migrate.js
   DB_HOST=… node scripts/database/seed.js
   ```
   The seeds add the roles, the `wa_login_otp_v1` sign-in code template, and the first Super Admin (`itadmin@arssteels.co.in`, Google sign-in).
   Both scripts are safe to run again. v1.0.0 applies these 15 migrations, in order:

   | Migration | Adds |
   |---|---|
   | 202609281200 … 202609281205 | organisation, users and roles, sign-in tables, audit log (append-only), settings, notifications |
   | 202609291200, 202609291201 | password links; workflows, requests, tasks, events (append-only) |
   | 202609301200 | form and builder per version, rate limits |
   | 202610011200, 202610011300 | comments (append-only), delegation, SLA; holidays, escalation times |
   | 202610071200, 202610071201 | attachments; demo people and the DEMO session type |
   | 202610081200 | WhatsApp template creator (versions, Meta status) |
   | 202610081300 | submission key (no duplicate requests), notification outbox |

   Check: `SELECT COUNT(*) FROM schema_migrations` gives 15.

## 3. Create the Node app
1. Node.JS Hosting → **Create a New App** → **Connect GitHub** → `HarishDevs/ARS-Approval-System`, `main`.
2. Node **22** (the project needs ≥ 20; CI tests on 22, the same as GoDaddy).
3. Build `npm ci && npm run build`, start `npm start`. **Confirm** the platform runs these. `next start` reads the `PORT` the platform gives it.
4. Environment variables (exactly these; nothing else is read from the environment):

| Variable | Value |
|---|---|
| `NODE_ENV` | `production` |
| `APP_BASE_URL` | `https://approvals.arssteels.net` |
| `DB_HOST`, `DB_PORT`, `DB_NAME`, `DB_USER`, `DB_PASSWORD` | from §2 |
| `SESSION_SECRET` | fresh, from §1 |
| `ENCRYPTION_KEY` | fresh, from §1 |
| `JOB_RUNNER_SECRET` | fresh, from §1 |
| `UPLOAD_DIR` | a folder **outside** the app folder and public_html, e.g. `/home/<cpanel-user>/ars-approvals-uploads` (create it first). Attachments live here, so it must survive redeploys and be in the backup |
| `FIREBASE_PROJECT_ID` | `power-bi-dashboard-3b29f` |
| `FIREBASE_CLIENT_EMAIL`, `FIREBASE_PRIVATE_KEY` | from the service account. Keep the `\n` sequences as they are in the JSON |

   The four `NEXT_PUBLIC_FIREBASE_*` values are built into `next.config.ts` and need not be set.
   Provider keys (Resend, CEOITBox) are **not** environment variables: they are entered in `/superadmin` after go-live (D-016).
5. Deploy. Open the temporary GoDaddy address: the sign-in page must load.
6. Bind `approvals.arssteels.net` to the app (DNS in GoDaddy) and make sure HTTPS is on.

## 4. After the first deploy
1. **Firebase** console → Authentication → Settings → Authorised domains → add `approvals.arssteels.net` (and the temporary address while testing).
2. Sign in with Google as `itadmin@arssteels.co.in` → `/superadmin/settings`:
   - **Email:** paste the Resend API key, save, **Send test email**.
   - **WhatsApp:** paste a **new CEOITBox key made for this app** (for example "ARS Approvals – prod"; never the test key pasted in chat, and never the Power BI key). Set the Phone ID `558214737370188`, save, then **Send test WhatsApp**. Your account needs a WhatsApp number first; add it in `/admin/users`.
   - Review the sign-in security values.
   - **WhatsApp templates** (`/superadmin/templates`):
     - the local test approved `ars_approval_needed_v1` on the same CEOITBox account, so press **Sync status from Meta** first: it shows as Live once a production draft with that exact name is saved;
     - for each of the other 19 messages: open it → **Save draft** → **Submit to Meta for approval** → **Yes, continue**;
     - later, **Sync status**: approved templates go live by themselves.
3. **Cron** (cPanel → Cron Jobs), every 5 minutes. **Without it, no reminders, escalations, retries, outbox catch-up or daily template sync happen.** It runs:
   - the notification outbox catch-up;
   - delivery retries;
   - SLA reminders and escalation;
   - the daily WhatsApp template sync;
   - housekeeping.
   ```
   */5 * * * * curl -s -X POST -H "x-job-secret: <JOB_RUNNER_SECRET>" https://approvals.arssteels.net/api/jobs/run > /dev/null
   ```
   Check it once by hand: the answer must be `{"success":true,…}`. A wrong secret answers 404.
4. **Break-glass** (D-054), in the hosting console:
   ```bash
   node scripts/admin/break-glass.js create --email <separate address> --whatsapp <number>
   node scripts/admin/break-glass.js set-password
   node scripts/admin/break-glass.js status
   ```
   Seal the password offline. Leave it disabled. See Q-015 about the WhatsApp code.
5. **Attachments folder:** create `UPLOAD_DIR` (see §3) and add it to the cPanel backup. Attach one file to a test request, redeploy, and check it still downloads.
6. Set up the organisation, either way:
   - **Real staff now:** in `/admin`, add the departments with HODs, designations, users (password users get a set-password link), approver groups, and approval types. Each type's DoA matrix is set on its creation screen; use test mode, then publish.
   - **Demo first (owner's choice, D-071):** `/superadmin/demo` → **Load demo data** gives 20 demo people and the 12 approval types, so the flows can be tried with **Try as**. When the real staff arrive, put them into the groups and HOD slots, then press **Retire demo staff**. Demo emails go to `itadmin+demo…@arssteels.co.in`.

## 5. Go-live checks
- [ ] Sign-in page over HTTPS; security headers present (CSP, HSTS, frame-deny).
- [ ] Google sign-in works (authorised domain).
- [ ] Password user: set-password link email arrives → WhatsApp code → signed in.
- [ ] A new-device sign-in sends the alert email + WhatsApp.
- [ ] `/admin` gives a 404 for a plain user; `/superadmin` gives a 404 for an IT Admin.
- [ ] One real request end to end: raise → approve at each level → requester told → timeline complete.
- [ ] A Purchase & SCM (or other DoA) request at ₹1,00,000 and at ₹1,00,001 goes to the levels the DoA view shows; a negative amount is refused.
- [ ] Submit a request without a file and one with a PDF. Both succeed, and the PDF downloads (this guards the Node 22 empty-file fix).
- [ ] Submit the same form twice (double click, or Back and Submit again): only one request exists.
- [ ] `/superadmin/templates`: at least "Approval needed" is Live, and a test send arrives on your WhatsApp.
- [ ] `/superadmin/deliveries` shows SENT rows. A deliberately failed send is retried by the cron.
- [ ] `/superadmin/audit` shows the sign-ins and changes.
- [ ] Remove any test requests and users made during these checks (make users inactive; requests stay as history).

## 6. Updating later
Push to `main` → CI must be green **on all three jobs** → tag the release (`v1.0.1` …) → GoDaddy redeploys from GitHub (**confirm** whether it does this automatically or needs a "redeploy" click).
- If the release has new files in `database/migrations/`, run `migrate.js` against production right after the deploy. Migrations only ever add.
- Before each release, run the Smoke suite in `docs/qa/QA-TEST-SUITE.md` §33.

## 7. Known limits carried into production (v1.0.0)
- **Break-glass sign-in needs the WhatsApp code (Q-015).** If WhatsApp is down, it can't sign in.
- **WhatsApp:** only the messages whose templates Meta has approved go out on WhatsApp. Email and in-app always go out. 19 templates are still to be submitted from `/superadmin/templates`.
- **Owner decisions kept as they are (8 Oct 2026, D-078):**
  - one person may approve more than one level, directly or as a delegate;
  - requests don't expire;
  - rejection is final (the route back is "ask for changes");
  - no drafts, admin cancel or auditor role.
- **Search:** only My requests has search, a status filter and paging. There's no IT-wide request search yet.
- **Not in this release:** report and audit export (CSV), work hand-off after approval (F-32), approve from WhatsApp.
