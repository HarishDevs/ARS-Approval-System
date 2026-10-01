# Deployment and go-live: ARS Approval Platform

Address: **https://approvals.arssteels.net** (one app; areas `/users`, `/admin`, `/superadmin`, D-034).

Route: **GoDaddy Node.JS Hosting**, connected to GitHub `HarishDevs/ARS-Approval-System`, branch `main`. This is the same product and path the Power BI site uses (see `D:\PBI New\Completed Documentation\Deployment\GODADDY_DEPLOYMENT_GUIDE.md`).

Flow: FLOWS.md F-90. Owner: itadmin@arssteels.co.in.

Anything below marked **confirm** has not been seen on the real GoDaddy screens yet. Check it as you go; don't assume.

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
   Both scripts are safe to run again.

## 3. Create the Node app
1. Node.JS Hosting → **Create a New App** → **Connect GitHub** → `HarishDevs/ARS-Approval-System`, `main`.
2. Node **22** (the project needs ≥ 20).
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
   - **WhatsApp:** paste the CEOITBox API key, save, **Send test WhatsApp**. Your account needs a WhatsApp number first; add it in `/admin/users`.
   - Review the sign-in security values.
3. **Cron** (cPanel → Cron Jobs), every 5 minutes. It runs retries, SLA reminders and escalation, and housekeeping:
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
5. Set up the organisation in `/admin`: departments with HODs, designations, users (password users get a set-password link), approver groups, and workflows (test mode, then publish).

## 5. Go-live checks
- [ ] Sign-in page over HTTPS; security headers present (CSP, HSTS, frame-deny).
- [ ] Google sign-in works (authorised domain).
- [ ] Password user: set-password link email arrives → WhatsApp code → signed in.
- [ ] A new-device sign-in sends the alert email + WhatsApp.
- [ ] `/admin` gives a 404 for a plain user; `/superadmin` gives a 404 for an IT Admin.
- [ ] One real request end to end: raise → approve at each level → requester told → timeline complete.
- [ ] `/superadmin/deliveries` shows SENT rows. A deliberately failed send is retried by the cron.
- [ ] `/superadmin/audit` shows the sign-ins and changes.
- [ ] Remove any test requests and users made during these checks (make users inactive; requests stay as history).

## 6. Updating later
Push to `main` → CI must be green → GoDaddy redeploys from GitHub (**confirm** whether it does this automatically or needs a "redeploy" click). If the release has new files in `database/migrations/`, run `migrate.js` against production right after the deploy. Migrations only ever add.

## 7. Known limits carried into production
- Approver SLA uses calendar hours (no holiday calendar yet).
- Attachments are not built yet: GoDaddy disk persistence is still unconfirmed (Q-001).
- WhatsApp notifications other than the sign-in code wait for the owner's templates (Q-013). Email and in-app work.
- Break-glass sign-in still needs the WhatsApp code (Q-015).
