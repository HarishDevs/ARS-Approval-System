# Deployment guide: ARS Approval Platform on GoDaddy (step by step)

| | |
|---|---|
| App | ARS Approval Platform **v1.0.1** (`docs/RELEASE-NOTES.md`) |
| Address | **https://approvals.arssteels.net** (one app: `/users`, `/admin`, `/superadmin`) |
| Hosting | GoDaddy **Node.js Hosting** ("Deploy your Node.js app"), from GitHub `HarishDevs/ARS-Approval-System`, branch `main` |
| Database | MySQL 8 in GoDaddy cPanel |
| Done by | itadmin@arssteels.co.in, with IT |
| Time | About 2 hours the first time; Part H (WhatsApp templates) finishes over the next day while Meta reviews |

Work through the parts **in order**. Tick each box as you go. Anything marked **confirm** hasn't been seen on the real GoDaddy screens yet, so check it rather than assume. Never paste a key or password into chat, email or a file in the repository.

## Contents
- **Part A:** Get ready (on your PC)
- **Part B:** The database (Hosted Database: import the SQL file)
- **Part C:** Attachments storage (Private Storage)
- **Part D:** Deploy the app (the "Deploy your Node.js app" wizard)
- **Part E:** Connect the domain and HTTPS
- **Part F:** Allow the domain in Firebase
- **Part G:** First sign-in and Super Admin settings
- **Part H:** WhatsApp templates
- **Part I:** Scheduled jobs (cron)
- **Part J:** Break-glass emergency account
- **Part K:** People and approval types
- **Part L:** Go-live checks
- **Part M:** Updating later, and rollback
- **Part N:** Troubleshooting
- **Part O:** Known limits

---

## Part A: Get ready (on your PC)

### A1. Check the release is green
- [ ] Open https://github.com/HarishDevs/ARS-Approval-System/actions. The latest run on `main` must show **3 green jobs**: checks, integration and end-to-end. If any is red, stop; don't deploy.
- [ ] GoDaddy deploys the **`main` branch**. The release tags (`v1.0.0`, `v1.0.1`) mark what was released.

### A2. The secrets file (already created)
The file `D:\Omniroute\deploy-secrets\ars-approvals.production.env` was generated for you. It's outside the repository. It already holds fresh values for `SESSION_SECRET`, `ENCRYPTION_KEY` and `JOB_RUNNER_SECRET`.
- [ ] Open it in Notepad. You'll fill in the `CHANGE_ME` values in B3, C1 and A3.
- [ ] Copy **`ENCRYPTION_KEY`** into your password manager now. If it's lost, every provider key saved in the app must be entered again.

### A3. Firebase service account (for Google sign-in)
1. Open https://console.firebase.google.com → project **power-bi-dashboard-3b29f**.
2. Gear icon → **Project settings** → **Service accounts** → **Generate new private key** → **Generate key**. A `.json` file downloads.
3. Open the JSON in Notepad, and in the secrets file set:
   - `FIREBASE_CLIENT_EMAIL` = the JSON's `client_email`;
   - `FIREBASE_PRIVATE_KEY` = the JSON's `private_key`, copied **exactly**, on one line, with its `\n` sequences, inside double quotes:
     `FIREBASE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\nMIIE...\n-----END PRIVATE KEY-----\n"`
4. Delete the downloaded JSON once the values are copied.

### A4. A CEOITBox API key for this app
1. https://official.ceoitbox.com → **Integrations & Utilities → Developer → API Keys** → **Create API Key**.
2. Name it **`ARS Approvals - prod`**, leave Status on, then **OK**.
3. Keep the value ready for G3. Don't put it in the secrets file; it's entered in the app.
4. Switch **off** the test key that was pasted in chat on 8 Oct.
5. Your Phone ID is `558214737370188` (Connected Accounts).

### A5. Resend (email) and the sending domain
The app sends email as **itadmin@arssteels.co.in** through Resend. Resend only sends for a domain you've verified.
1. Sign up or sign in at https://resend.com → **Domains** → **Add domain** → `arssteels.co.in`.
2. Resend shows DNS records (an MX and TXT for the `send` subdomain, plus a DKIM TXT). Add each one in the DNS of `arssteels.co.in`:
   - wherever that domain's DNS is managed (GoDaddy → My Products → DNS, or your email provider's DNS);
   - **don't change** the existing MX records for your mailboxes.
3. Wait for Resend to show **Verified** (minutes to a few hours).
4. **API Keys** → **Create API key** (Sending access, domain arssteels.co.in). Keep it ready for G2.

---

## Part B: The database (the app's Hosted Database)
GoDaddy's Node.js hosting provisions a MySQL database **with the app**: **App → Settings → Hosted Database**. The preview and live environments share it. Use it; the cPanel database isn't needed.

### B1. Import the database file (first time only)
1. The file is `D:\Omniroute\deploy-secrets\ars-approvals-v1.0.1-database.sql`. It's built from the 15 migrations and the seeds, and was tested by importing it into an empty MySQL 8 as an ordinary user. It holds:
   - 35 tables;
   - 6 append-only triggers;
   - the roles;
   - the sign-in code template;
   - the Super Admin itadmin@arssteels.co.in;
   - the record of the applied migrations.
   It has no passwords or keys.
2. **Settings → Hosted Database → Import SQL** → choose that file → import.
3. **Browse tables**: you should see 35 tables, including `users` with one row (`itadmin`) and `schema_migrations` with 15 rows.
4. If the import reports an error about `TRIGGER` (privileges), send it to GoDaddy support: the triggers protect the audit log, timeline and comments, and are required.
5. The file never drops anything: importing it again fails with "Table already exists" instead of wiping data. Import it **only once**. Later releases add their migrations by themselves (D3 start command).

### B2. Connection details: automatic
With the Hosted Database attached, GoDaddy sets **`DB_HOST`, `DB_PORT`, `DB_NAME`, `DB_USER` and `DB_PASSWORD` by itself**. They're listed in the Secrets card. These are exactly the names the app reads.
- **Don't enter or override them.** If you imported a `.env` that contained `DB_…` lines (for example `CHANGE_ME` values), **delete those entries** in Settings → Secrets, so the hosted values apply.
- The app keeps a small pool of at most 10 connections and returns each one after every query. **Confirm** that the hosted plan allows 10 connections; if it reports "too many connections", ask IT to lower the pool in `lib/db/client.ts`.

### B3. If you use the cPanel MySQL instead (fallback)
Create the database and an ALL PRIVILEGES user in cPanel → MySQL Databases. Import the same `.sql` file in phpMyAdmin → Import. Then put its details in the secrets as in B2. `npm run db:check` (from your PC, after allowing your IP in cPanel → Remote MySQL) confirms the user may create triggers.

---

## Part C: Attachments storage (Private Storage)
The app's **File Manager** has two areas:
- **App (`/app`):** rebuilt on every deploy, so it's **not** for uploads.
- **Private Storage (`/private`):** never public, and kept across deploys.

1. **Settings → Secrets**: set `UPLOAD_DIR` = **`/private/uploads`**. The app creates the folder itself on the first upload.
2. G5 checks that a file survives a redeploy. **Confirm** the path: if Private Storage shows a different absolute path in File Manager → Private Storage → (i), use that path plus `/uploads`.
3. Private Storage is outside cPanel backups. Use **Export SQL** (database) regularly, and ask GoDaddy how Private Storage is backed up (**confirm**).

---

## Part D: Deploy the app (the "Deploy your Node.js app" wizard)

### D1. Start
GoDaddy → **My Products** → **Node.js Hosting** (host.godaddy.com/hosting) → **Create a New App** / **Deploy your Node.js app**.

### D2. Source: GitHub
1. Choose **Connect GitHub** → sign in to GitHub → **Install & authorise** the GoDaddy app.
2. Pick **Only select repositories** → `HarishDevs/ARS-Approval-System`. Don't give it access to every repository.
3. Repository `ARS-Approval-System`, branch **`main`**.

### D3. Runtime and commands (**confirm** the names on the screen)
| Field | Value |
|---|---|
| Node.js version | **22** |
| Install command | `npm ci` (or the platform default `npm install`) |
| Build command | `npm run build` |
| Start command | **`npm run start:production`**: applies any new migrations and the seeds, then starts the app. With the B1 import already done, it simply reports "No pending migrations" |
| Port | Leave the default; the app listens on the `PORT` the platform gives |

If the wizard doesn't let you change the start command, it runs `npm start`. Then run the migrations once from your PC before the first start (B4 setup, then `npm run db:migrate` and `npm run db:seed` with the same `$env:` values), and again after any release that adds migrations.

### D4. Add secrets (the screen in your screenshot)
1. Click **Import from .env file** → choose `D:\Omniroute\deploy-secrets\ars-approvals.production.env`.
2. Check the list:
   - **9 keys from the file:** NODE_ENV, APP_BASE_URL, SESSION_SECRET, ENCRYPTION_KEY, JOB_RUNNER_SECRET, UPLOAD_DIR, FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL, FIREBASE_PRIVATE_KEY.
   - Plus the five `DB_…` entries that GoDaddy adds itself (B2).
   - **No value says `CHANGE_ME`.**
   - `FIREBASE_PRIVATE_KEY` starts with `-----BEGIN PRIVATE KEY-----`. If the quotes were imported as part of the value, edit it and remove them.
3. If the build later fails because `tailwindcss` or `typescript` is missing, add one more secret: `NPM_CONFIG_PRODUCTION` = `false` (see Part N).
4. **Continue**.

### D5. Deploy and watch the build
1. **Deploy** / **Publish**. Open the build log.
2. A good log ends the build with `✓ Compiled successfully` and the route list, then shows:
   ```
   Applying 202609281200_create_organisation.sql ... (15 files on the first start)
   Done. Applied 15 migration(s).
   Seeding 001_roles.sql ... Done. Ran 3 seed file(s).
   ▲ Next.js 15.5.25 - Local: http://localhost:<port>  ✓ Ready
   ```
3. The app shows **Running / Build status Healthy**. Its preview address looks like `30yc8vknqm.preview.c40.airoapp.ai`.
4. If it says **"Your app is redirecting"**: the site root `/` sends visitors to `/login`, so health checks need that path. Press **Open General settings** → set the root/health-check path to **`/login`** → save.
5. **Update Preview** deploys the latest `main`. When the preview is checked (Parts F–L), press **Publish to Live**.
- [ ] Open the temporary address: the **ARS Approvals sign-in page** loads.

### D6. Delete the secrets file
- [ ] With the app running, delete `D:\Omniroute\deploy-secrets\ars-approvals.production.env`. The values now live only in GoDaddy and your password manager.

---

## Part E: Connect the domain and HTTPS
1. In the app → **Settings → Domains** (or the **Connect custom domain** card) → add `approvals.arssteels.net`.
2. GoDaddy shows the DNS record to add, usually a **CNAME** `approvals` → the app's address, or an A record.
   - If `arssteels.net` is managed in the same GoDaddy account, GoDaddy may add it for you.
   - Otherwise: **My Products → arssteels.net → DNS → Add** that record exactly.
3. Wait until the domain shows **Connected**, and the certificate shows **SSL active / Secure**. Usually minutes; DNS can take up to an hour.
- [ ] https://approvals.arssteels.net shows the sign-in page with the padlock.
- [ ] `APP_BASE_URL` is `https://approvals.arssteels.net`. It's used in every email and WhatsApp link.

---

## Part F: Allow the domain in Firebase
1. Firebase console → **power-bi-dashboard-3b29f** → **Authentication** → **Settings** → **Authorised domains** → **Add domain**:
   - `approvals.arssteels.net`;
   - the preview address `30yc8vknqm.preview.c40.airoapp.ai`, so you can sign in on the preview before going live.
2. Without this, Google sign-in fails with `auth/unauthorized-domain`.

---

## Part G: First sign-in and Super Admin settings

### G1. Sign in
1. https://approvals.arssteels.net → **Continue with Google** → **itadmin@arssteels.co.in**. The seed created this Super Admin.
2. You land on **My approvals**. The left menu's **Switch area** shows Admin and Super Admin.

### G2. Email (Resend)
1. **Super Admin → Providers & security → Email**:
   - paste the Resend key (A5);
   - From address `itadmin@arssteels.co.in`;
   - From name `ARS Approvals`;
   - **Save**.
2. **Send test email**: it arrives in the itadmin inbox. If not, see Part N.

### G3. WhatsApp (CEOITBox)
1. **Admin → Users & roles → IT Admin (Super Admin)** → WhatsApp number **9150091870** → **Save changes**. The app stores it as 919150091870.
2. **Super Admin → Providers & security → WhatsApp**:
   - base URL `https://official.ceoitbox.com`;
   - Phone ID `558214737370188`;
   - API key: the **new** key from A4;
   - **Save**.
3. **Send test WhatsApp**: you receive the sign-in code template.

### G4. Security settings
Review the **Authentication** group. The defaults are fine: lockout after 5 wrong passwords for 15 minutes, 6-digit codes. **Save** only if you change something.

### G5. Attachments work and survive a redeploy
1. **My approvals → New request** → any type → attach a small PDF → **Submit request**. The file is listed and downloads.
2. In the Node.js app, **Redeploy** / **Restart**. Open the same request: the file **still downloads**. If it's gone, `UPLOAD_DIR` isn't persistent; fix it before go-live (Part C).

---

## Part H: WhatsApp templates
"Approval needed" (`ars_approval_needed_v1`) is already approved at CEOITBox: it was created during testing on the same account.
1. **Super Admin → WhatsApp templates → "A request is waiting for this person's approval" → Save draft**. Keep the name `ars_approval_needed_v1`.
2. Press **Sync status from Meta**: it shows **Live**. Then **Send a test to my WhatsApp**.
3. For each of the other **19** messages: **Create** → check the wording (change it if you like) → **Save draft** → **Submit to Meta for approval** → **Yes, continue**.
4. Over the next hours, press **Sync status from Meta**. Approved ones go **Live** by themselves; rejected ones show Meta's reason, so edit and resubmit (it becomes `_v2`). The job runner also syncs once a day.
- Until a template is live, that message goes by email and in-app only.

---

## Part I: Scheduled jobs (cron)
Without this, there are **no reminders, escalations, retries, outbox catch-up or daily template sync**.
1. cPanel → **Cron Jobs** → **Add New Cron Job** → Common settings: **Once Per Five Minutes** (`*/5 * * * *`).
2. Command: copy `JOB_RUNNER_SECRET` from your password manager, or from GoDaddy's secrets screen:
   ```
   curl -s -X POST -H "x-job-secret: <JOB_RUNNER_SECRET>" https://approvals.arssteels.net/api/jobs/run > /dev/null
   ```
3. **Add New Cron Job**.
4. Test it once by hand. In PowerShell on your PC:
   ```powershell
   curl.exe -s -X POST -H "x-job-secret: <JOB_RUNNER_SECRET>" https://approvals.arssteels.net/api/jobs/run
   ```
   - Expected: `{"success":true,"data":{"outbox":…,"retries":…,"sla":…,"templates":…}}`.
   - A wrong secret gives a 404.

---

## Part J: Break-glass emergency account
A sealed admin account for when Google sign-in or itadmin@ isn't available. Run from your PC, with Remote MySQL access as in B4, inside `D:\Omniroute\ARS Approval System`, with the same `$env:DB_*` values set:
```powershell
node scripts/admin/break-glass.js create --email <a separate mailbox, not itadmin@> --whatsapp <the holder's number>
node scripts/admin/break-glass.js set-password
node scripts/admin/break-glass.js status
```
- Write the password down and seal it offline. Leave the account **disabled**. `enable --minutes 60` opens it only in an emergency, and alerts every Super Admin.
- Signing in still needs the WhatsApp code (Q-015, open).

---

## Part K: People and approval types
Choose one:
- **Try first with demo staff (recommended now):** **Super Admin → Demo data → Load demo data**.
  - This adds 20 demo people, 7 departments, 8 approver groups and 12 published approval types, including Purchase & SCM with its DoA matrix.
  - Use **Try as** to act as any demo person.
  - Demo emails go to itadmin+demo…@arssteels.co.in.
- **Real staff** (when the list arrives):
  1. **Admin → Departments**: add departments and designations; set each department's HOD after its people exist.
  2. **Admin → Users & roles → New user**: name, email, User ID, WhatsApp number, department, designation, reporting manager, and sign-in method (Google, or password: they get a set-password link). Roles: USER; IT team: IT_ADMIN.
  3. **Admin → Approver groups**: MD office, ED office, Finance desks and so on, with the real members.
  4. **Admin → Workflows → New workflow**: form fields; the **DoA matrix** (limits across, levels down, tick the bands); **test mode**; **Publish**.
  5. If demo data was loaded: swap the real people into the groups and HOD slots, then **Super Admin → Demo data → Retire demo staff**.

---

## Part L: Go-live checks
Run these at https://approvals.arssteels.net. They come from the Smoke suite, `docs/qa/QA-TEST-SUITE.md` §33.
- [ ] HTTPS padlock. Security headers present: in browser DevTools → Network → a page → Response headers, look for `content-security-policy`, `strict-transport-security`, `x-frame-options: DENY`.
- [ ] Google sign-in works for itadmin@.
- [ ] A **password** user: the set-password email arrives → WhatsApp code → signed in.
- [ ] Signing in on a new browser sends the **new sign-in** alert (email, plus WhatsApp once that template is live).
- [ ] A plain user gets **404** for `/admin` and `/superadmin`; an IT Admin gets 404 for `/superadmin`.
- [ ] One request end to end: raise → each level approves → the requester is told → the timeline is complete.
- [ ] A DoA type: ₹1,00,000 and ₹1,00,001 go to the levels the **DoA view** shows; **−5,000 is refused** ("Enter 0 or more.").
- [ ] Submit **without** a file and **with** a PDF; both work, and the PDF downloads.
- [ ] Double-click **Submit request**: only one request appears in **My requests**.
- [ ] **Super Admin → Message deliveries** shows SENT rows; **Audit log** shows the sign-ins and changes.
- [ ] The cron job ran: in the Message deliveries / audit log after 10 minutes, or check the cron email in cPanel.
- [ ] Remove the test requests' traces: requests stay as history by design; make any test users **inactive**.

When all are ticked: **live**. Tell the staff the address, and who to contact (IT).

---

## Part M: Updating later, and rollback

### Release a new version
Never re-import the database file: it's for the very first setup only. New migrations are applied by the start command.
To rebuild a full import file for a brand-new environment: apply the migrations and seeds to an empty local database, `mysqldump --triggers --no-tablespaces --set-gtid-purged=OFF`, then `python scripts/database/release-sql-clean.py <dump> <out>`. That removes DEFINER, DELIMITER, DROP and LOCK statements, and adds one-line triggers.

1. Changes are pushed to `main` → GitHub Actions must be **green on all 3 jobs**.
2. Tag it: `v1.0.2` and so on.
3. GoDaddy redeploys from `main`: automatically, or press **Redeploy** (**confirm** which).
4. The start command applies any new migrations by itself. Migrations only ever **add**, so older code keeps working on a newer database.
5. Run the Smoke suite (Part L, short version).

### Roll back
- In GoDaddy, redeploy the previous good commit or tag. Or, on GitHub, revert the bad commit on `main` and let it redeploy.
- The database doesn't need rolling back: migrations are additive.
- If a provider key leaks: switch it off at the provider, create a new one, and paste it in **Super Admin → Providers & security**.

---

## Part N: Troubleshooting
| Symptom | Likely cause | Fix |
|---|---|---|
| Build fails: `Cannot find module 'tailwindcss'` / `typescript` / `eslint` | The platform installed production packages only | Add the secret `NPM_CONFIG_PRODUCTION=false` and redeploy |
| App won't start: `Invalid environment configuration: DB_HOST: Required` (or another key) | A secret is missing, or still `CHANGE_ME` | Fix that secret in the app's settings; restart |
| `Invalid ENCRYPTION_KEY: must be a base64-encoded 32-byte key` | Value cut or changed while copying | Paste it again from the password manager |
| `Migration failed: … ECONNREFUSED` / `ENOTFOUND` / `Access denied` | Wrong DB host, user or password, or the DB isn't reachable from the app | Check Part B2/B3; try the server hostname instead of `localhost` |
| `Migration failed: … TRIGGER command denied` | The user can't create triggers | GoDaddy support: allow triggers (B4) |
| Google sign-in: `auth/unauthorized-domain` | Domain not allowed in Firebase | Part F |
| Google sign-in fails on the server; log mentions the private key | `FIREBASE_PRIVATE_KEY` mangled | Re-enter it on one line with the `\n` sequences and **no** surrounding quotes |
| "Your account isn't set up" for a Google user | Only admin-created users can sign in | Create the user in Admin → Users with the same email |
| Test email fails; deliveries show `EMAIL_REQUEST_FAILED` | Resend domain not verified, or wrong key | Part A5: wait for **Verified**; check the key |
| WhatsApp test: "CEOITBox refused the API key (401)" | Wrong or switched-off key | Paste the new key again; check it's on in CEOITBox |
| WhatsApp: `CEOITBOX_BLOCKED` | Wallet balance low, or the number opted out | Top up in CEOITBox → Money → Credit Center |
| WhatsApp messages skipped: `TEMPLATE_NOT_CONFIGURED` | That message's template isn't live yet | Part H |
| Attachments vanish after a redeploy | `UPLOAD_DIR` points inside `/app` | Part C: `/private/uploads` |
| "Your app is redirecting" warning | Root `/` redirects to `/login` | Settings → General → root path `/login` |
| Import SQL fails on `CREATE TRIGGER` | Hosted DB user not allowed to create triggers | GoDaddy support ticket (Part B1 step 4) |
| No reminders or escalations | Cron missing, or wrong secret (the job answers 404) | Part I |
| 502 / "Application error" right after deploy | App still starting (migrations on the first start), or crashed | Wait 1 minute; read the app's runtime log |

---

## Part O: Known limits (v1.0.1)
- **Break-glass** sign-in needs the WhatsApp code (Q-015).
- **WhatsApp** messages go out only once their template is live (Part H). Email and in-app always go out.
- **Owner decisions kept (D-078):**
  - one person may approve more than one level;
  - requests don't expire;
  - rejection is final;
  - no drafts, admin cancel or auditor role.
- **Search:** only My requests has search, a status filter and paging.
- **Not in this release:** CSV export of reports or the audit log, work hand-off after approval, approving from WhatsApp.
