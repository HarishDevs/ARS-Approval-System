# Deployment guide: ARS Approval Platform on GoDaddy (step by step)

| | |
|---|---|
| App | ARS Approval Platform **v1.4.0** (`docs/RELEASE-NOTES.md`) |
| Address | **https://approval.arssteels.net** (one app: `/users`, `/admin`, `/superadmin`) |
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
- **Part P:** Backups and restore (v1.4.0)

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
The app sends email as **no_reply@approval.arssteels.net** through Resend (replies go to itadmin@arssteels.co.in). Resend only sends for a domain you've verified in the Resend team that owns the API key: **approval.arssteels.net** (verified in the team "arssteels", 9 Oct 2026).
1. Sign up or sign in at https://resend.com → **Domains** → **Add domain** → `arssteels.co.in`.
2. Resend shows DNS records (an MX and TXT for the `send` subdomain, plus a DKIM TXT). Add each one in the DNS of `arssteels.co.in`:
   - wherever that domain's DNS is managed (GoDaddy → My Products → DNS, or your email provider's DNS);
   - **don't change** the existing MX records for your mailboxes.
3. Wait for Resend to show **Verified** (minutes to a few hours).
4. **API Keys** → **Create API key** (Sending access, domain arssteels.co.in). Keep it ready for G2.

---

## Part B: The database (the app's Hosted Database)
GoDaddy's Node.js hosting provisions a MySQL database **with the app**: **App → Settings → Hosted Database**. The preview and live environments share it. Use it; the cPanel database isn't needed.

### B1. Create the tables: automatic on the first start (recommended)
Nothing to do. **`npm start` applies all database migrations and seeds before the app starts** (v1.0.2):
- it creates the 35 tables, the 6 append-only triggers, the roles, the sign-in code template and the Super Admin itadmin@arssteels.co.in;
- on later starts it applies only what's new, and skips what's already there.

After the first deploy (D5), open **Runtime Logs**. You should see `Done. Applied 15 migration(s).` and `Done. Ran 3 seed file(s).` before `Ready`. **Browse tables** then shows 35 tables.

### B1-alt. Import the SQL file instead (optional)
`D:\Omniroute\deploy-secrets\ars-approvals-v1.0.1-database.sql` creates the same database. It's tested and contains no keys.
- **Use it only on an empty database before the first start.** GoDaddy's importer **drops all existing tables first**, so importing on a live database would **erase every request**.
- If **Start import** shows **"Unauthorized"**, GoDaddy's import service refused the session:
  - reload the page and sign in again;
  - make sure the preview app is running (**Restart Preview App**);
  - allow cookies for godaddy.com in the browser, or try another browser;
  - otherwise use B1 (automatic), which doesn't need the importer.
- If the import succeeds and the app then starts, it reports "No pending migrations"; that's correct.

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
| Start command | **`npm start`** (the platform default): applies new database migrations and the seeds, then starts the app |
| Port | Leave the default; the app listens on the `PORT` the platform gives |

`npm start` already includes the migrations, so the default start command is right. Nothing needs changing.

### D4. Add secrets (the screen in your screenshot)
1. Click **Import from .env file** → choose `D:\Omniroute\deploy-secrets\ars-approvals.production.env`.
2. Check the list:
   - **9 keys from the file:** NODE_ENV, APP_BASE_URL, SESSION_SECRET, ENCRYPTION_KEY, JOB_RUNNER_SECRET, UPLOAD_DIR, FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL, FIREBASE_PRIVATE_KEY.
   - **v1.4.0, optional:** `BACKUP_DIR` (Part P; e.g. `/home/<cpanel-user>/ars-approvals-backups`), `BACKUP_KEEP_DAYS` (default 14), `ORIGIN_SECRET` (Part E2; add it only **after** the Cloudflare rule).
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
1. In the app → **Settings → Domains** (or the **Connect custom domain** card) → add `approval.arssteels.net`.
2. GoDaddy shows the DNS record to add, usually a **CNAME** `approvals` → the app's address, or an A record.
   - If `arssteels.net` is managed in the same GoDaddy account, GoDaddy may add it for you.
   - Otherwise: **My Products → arssteels.net → DNS → Add** that record exactly.
3. Wait until the domain shows **Connected**, and the certificate shows **SSL active / Secure**. Usually minutes; DNS can take up to an hour.
- [ ] https://approval.arssteels.net shows the sign-in page with the padlock.
- [ ] `APP_BASE_URL` is `https://approval.arssteels.net`. It's used in every email and WhatsApp link.

### E2. Optional: lock the origin to Cloudflare (v1.4.0, D-102)
Stops anyone reaching the GoDaddy server directly, around Cloudflare (and faking their address). **Do the steps in this order**, or the site will refuse everyone.
1. Make a secret of 40+ characters (PowerShell: `-join ((1..40) | % { [char](Get-Random -Min 97 -Max 123) })`). Keep it in your password manager.
2. Cloudflare → `arssteels.net` → **Rules → Transform Rules → Modify Request Header → Create rule**:
   - name `ARS origin header`;
   - when **Hostname** equals `approval.arssteels.net`;
   - **Set static** header `x-ars-origin` = the secret;
   - **Deploy**.
3. GoDaddy → the app → secrets → add `ORIGIN_SECRET` = the same secret → **Publish** / restart.
4. Check: https://approval.arssteels.net works as before. The cron test (Part I, I2) still works, because it goes through Cloudflare.
5. To undo: remove `ORIGIN_SECRET` and publish (then delete the Cloudflare rule).

---

## Part F: Allow the domain in Firebase
1. Firebase console → **power-bi-dashboard-3b29f** → **Authentication** → **Settings** → **Authorised domains** → **Add domain**:
   - `approval.arssteels.net`;
   - the preview address `30yc8vknqm.preview.c40.airoapp.ai`, so you can sign in on the preview before going live.
2. Without this, Google sign-in fails with `auth/unauthorized-domain`.

---

## Part G: First sign-in and Super Admin settings

### G1. Sign in
1. https://approval.arssteels.net → **Continue with Google** → **itsupport@arsenergy.co.in** (D-082). The seed created this Super Admin, User ID `itadmin`. `itadmin@arssteels.co.in` can't be used: it's only an alias, and Google reports the main address.
2. You land on **My approvals**. Your name at the top right opens a menu whose **Switch space** section shows Admin and Super Admin.

### G2. Email (Resend)
1. **Super Admin → Providers & security → Email**:
   - paste the Resend key (A5);
   - From address **`no_reply@approval.arssteels.net`** (already the default; it needs `approval.arssteels.net` verified in Resend);
   - Reply-to `itadmin@arssteels.co.in` (the default), so replies reach IT;
   - From name `ARS Approvals`;
   - **Save**.
2. **Send test email**: it arrives in the itadmin inbox. If not, see Part N.
3. **If it says "Resend rejected the email (HTTP 403)"** (seen live on 9 Oct 2026): the From domain isn't verified in the **Resend account that owns this API key**.
   - In that account: **Domains → Add domain** → `arssteels.net` (or a subdomain such as `mail.arssteels.net`, and then set the From address to match, e.g. `approvals@mail.arssteels.net`).
   - Add the DNS records Resend shows, where arssteels.net's DNS is managed → **Verify**.
   - If you verified it in a different Resend team, create an API key there (Sending access) and paste it here.
   - Then **Send test email** again.

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

### G6. Optional: WhatsApp delivery receipts (v1.4.0, S8-03)
Message deliveries can then show **DELIVERED** and **READ** for WhatsApp, not only SENT.
1. Make a secret of 24+ characters. **Super Admin → Providers & security → WhatsApp → Webhook secret** → paste → **Save**.
2. In CEOITBox, set the delivery/read webhook to `https://approval.arssteels.net/api/webhooks/ceoitbox`, with header `x-webhook-secret` = the same secret.
3. Send a test WhatsApp (G3). Within a minute its row on **Message deliveries** should change to DELIVERED, then READ. If it stays SENT, send CEOITBox's sample payload to IT: the app reads Meta's format and a flat `{ id, status }` one.

### G7. Uptime monitor (v1.4.0, D-103)
`https://approval.arssteels.net/api/health` answers `200 {"status":"ok"…}` when the app and the database are up, and `503` when the database isn't. It also says whether the job runner ran in the last 15 minutes. Point any uptime monitor at it (e.g. UptimeRobot, free: HTTP(s) monitor, every 5 minutes, alert to itadmin@ by email or WhatsApp). With the origin lock on (E2), monitor the public address only.

## Part H: WhatsApp templates
"Approval needed" (`ars_approval_needed_v1`) is already approved at CEOITBox: it was created during testing on the same account.
1. **Super Admin → WhatsApp templates → "A request is waiting for this person's approval" → Save draft**. Keep the name `ars_approval_needed_v1`.
2. Press **Sync status from Meta**: it shows **Live**. Then **Send a test to my WhatsApp**.
3. For each of the other **19** messages: **Create** → check the wording (change it if you like) → **Save draft** → **Submit to Meta for approval** → **Yes, continue**.
4. Over the next hours, press **Sync status from Meta**. Approved ones go **Live** by themselves; rejected ones show Meta's reason, so edit and resubmit (it becomes `_v2`). The job runner also syncs once a day.
- Until a template is live, that message goes by email and in-app only.

---

## Part I: Scheduled jobs (cron)
Every 5 minutes, GoDaddy calls the app's job runner (`/api/jobs/run`). Without it there are **no reminders, escalations, retries of failed email/WhatsApp, outbox catch-up, daily template sync or daily backup** (Part P).

**Before you start:** publish **v1.3.4 or later**. It adds the "Job runner" line on Super Admin → Message deliveries, which is how you check the cron job works (step I6).

### I1. Find the job secret
The app accepts the call only with the secret `JOB_RUNNER_SECRET` (at least 24 characters). Get its value from either place:
- **GoDaddy:** your Node.js app → **Settings / Environment variables (secrets)** → `JOB_RUNNER_SECRET` → reveal and copy; or
- **your PC:** `D:\Omniroute\deploy-secrets\ars-approvals.production.env` → the line `JOB_RUNNER_SECRET=...` (copy only the part after `=`).

Keep it private: don't paste it in chat, email or WhatsApp.
If it's missing or still `CHANGE_ME`: make a new one (PowerShell: `[Convert]::ToBase64String((1..32 | % { Get-Random -Max 256 }))`), add it as `JOB_RUNNER_SECRET` in GoDaddy's secrets, and **Publish** again so the app picks it up.

### I2. Test it once by hand (from your PC)
In PowerShell, replace `PASTE_SECRET_HERE` with the secret (keep the quotes):
```powershell
curl.exe -s -X POST -H "x-job-secret: PASTE_SECRET_HERE" https://approval.arssteels.net/api/jobs/run
```
| You see | Meaning |
|---|---|
| `{"success":true,"data":{"outbox":…,"retries":…,"sla":…,"templates":…,"housekeeping":…}}` | Works. Go to I3. |
| `{"success":false,…"Not found."}` (404) | The secret is wrong, or `JOB_RUNNER_SECRET` isn't set on GoDaddy (I1). |
| An HTML page from Cloudflare ("Just a moment…", 403) | Cloudflare blocked a non-browser call. See I7. |
| `"Job run failed."` (500) | The app hit an error. GoDaddy → app → **Logs**, search "job runner failed". |

### I3. Open Cron Jobs in cPanel
1. https://account.godaddy.com → **My Products** → your hosting → **Manage** (or **cPanel Admin**).
2. In cPanel, scroll to **Advanced** → **Cron Jobs** (or type "cron" in the cPanel search box).
3. **Cron Email** (top of the page): leave it empty, or put your address only while testing. Each run would otherwise send you a mail every 5 minutes.

### I4. Add the cron job
1. **Add New Cron Job** → **Common Settings** → **Once Per Five Minutes (`*/5 * * * *`)**. The five boxes fill as `*/5`, `*`, `*`, `*`, `*`.
2. **Command**: paste this as one line, with your secret in place of `PASTE_SECRET_HERE`:
   ```
   curl -s -X POST --max-time 120 -H "x-job-secret: PASTE_SECRET_HERE" https://approval.arssteels.net/api/jobs/run > /dev/null 2>&1
   ```
3. Click **Add New Cron Job**. It appears under **Current Cron Jobs**.

### I5. Optional: keep a log for the first day
To see what each run returned, use this command instead (Current Cron Jobs → **Edit**):
```
curl -s -X POST --max-time 120 -H "x-job-secret: PASTE_SECRET_HERE" https://approval.arssteels.net/api/jobs/run >> $HOME/ars-job-runner.log 2>&1
```
cPanel → **File Manager** → your home folder → `ars-job-runner.log` shows one JSON line every 5 minutes. When it all looks right, switch back to the I4 command (the log keeps growing) and delete the file.

### I6. Check it is running
After 5–10 minutes, open **Super Admin → Message deliveries**. The line at the top shows:
- green **"Job runner: last ran N min ago."** → it works;
- amber **"has never run"** or **"last ran 20 min ago…"** → the cron job isn't reaching the app. Run the I2 test again, and check the I4 command for a typo or a missing secret.

Failed email/WhatsApp rows then retry by themselves: the **Tries** count goes up, and the row becomes SENT once the provider accepts it.

### I7. If Cloudflare blocks the call
Calls from GoDaddy's server go through Cloudflare like any visitor's. If I2 or the log shows a Cloudflare page:
1. Cloudflare → `arssteels.net` → **Security → WAF → Custom rules → Create rule**:
   - name `ARS job runner`;
   - field **URI Path**, operator **equals**, value `/api/jobs/run`;
   - action **Skip** → tick all remaining custom rules, rate limiting rules, managed rules and Super Bot Fight Mode → **Deploy**.
2. If **Security → Bots → Bot Fight Mode** is **On** (free plan), a skip rule can't bypass it. Turn it Off, or use I8 instead.
   The runner is still safe without these protections: without the exact secret it answers "Not found".

### I8. Alternative: a Cloudflare cron trigger (if cPanel has no Cron Jobs)
1. Cloudflare → **Workers & Pages** → **Create** → **Create Worker** → name `ars-job-runner` → **Deploy** → **Edit code**. Replace the code with:
   ```js
   export default {
     async scheduled(event, env, ctx) {
       ctx.waitUntil(fetch("https://approval.arssteels.net/api/jobs/run", { method: "POST", headers: { "x-job-secret": env.JOB_RUNNER_SECRET } }));
     },
   };
   ```
   Then **Deploy**.
2. The Worker → **Settings → Variables and Secrets → Add** → type **Secret**, name `JOB_RUNNER_SECRET`, value = the secret → **Deploy**.
3. **Settings → Trigger events (Cron Triggers) → Add** → `*/5 * * * *` → **Add**.
4. Check as in I6.

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
- **Approver designations (v1.2.0):** in **Admin → Departments → Designations**, tick **Approver** on Manager and above, and untick the rest. Only people with a ticked designation can be picked as approvers, HODs, reporting managers, group members or delegates. Give the Super Admin a ticked designation if they approve.
- **Real staff in bulk (v1.1.0):** **Admin → Import data**, or **Super Admin → Import data** (the same screen). Import in this order, because each step uses codes from the one before:
  1. **Designations**;
  2. **Departments**, with the HOD column empty;
  3. **Users**: a manager can be another row of the same file;
  4. **Departments again**, now with `hod_login_id`;
  5. **Approver groups**: members are User IDs separated by `;`;
  6. **Holidays**.

  For each step:
  - **Download template**, fill it in Excel, and save it as **CSV UTF-8**.
  - Upload it and press **Check file**. Nothing is saved; every problem is listed by row, and **Download problem list** gives you the list for fixing.
  - When the check is clean, press **Import** → **Yes, import**. All rows are saved, or none.
  - **Download current …** gives the existing records in the same columns: edit them and upload again to update many at once.
  - Granting SUPER_ADMIN by import works only for the Super Admin. Import never deletes or deactivates anything.

### K2. Optional: Power BI reporting views (v1.4.0, P7-04)
Two read-only views give Power BI one row per request (`reporting_requests`) and one per task (`reporting_tasks`), with names instead of ids. Deleted requests are left out, and times are in UTC.
1. cPanel → **phpMyAdmin** → the app's database → **SQL** → paste `database/optional/reporting_views.sql` from the repository → **Go**. (It's not a migration: creating views needs a privilege some plans don't give the app.)
2. cPanel → **MySQL Databases** → add a user `…_powerbi` with a strong password. phpMyAdmin → SQL: `GRANT SELECT ON <db>.reporting_requests TO '<user>'@'%'; GRANT SELECT ON <db>.reporting_tasks TO '<user>'@'%';`
3. In Power BI Desktop: **Get data → MySQL database** → the GoDaddy database host (cPanel → Remote MySQL: allow the Power BI gateway's IP) → that user → the two views.
4. After an upgrade that changes the tables, run step 1 again (the views are replaced).

---

## Part L: Go-live checks
Run these at https://approval.arssteels.net. They come from the Smoke suite, `docs/qa/QA-TEST-SUITE.md` §33.
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
- [ ] **Super Admin → Overview → Backups** shows a backup from today (press **Back up now** once), and Part P's restore drill was done.
- [ ] `https://approval.arssteels.net/api/health` returns `"status":"ok"` and `"jobRunner":"OK"`; an uptime monitor watches it (G7).
- [ ] A stuck request (e.g. a level whose HOD isn't set) shows **Stuck: needs IT** to an IT Admin, who can give it to a person or skip it.
- [ ] Remove the test requests' traces: Super Admin → Requests → **Delete** (with a reason); make any test users **inactive**.

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
| "Google sign-in failed" (403); `login_logs.failure_reason` = `UNKNOWN_ACCOUNT` | The Google account's **primary** email matches no user. An alias such as itadmin@arssteels.co.in never matches | Sign in with the primary address; for staff, create the user in Admin → Users with their **primary** Google email |
| Test email fails; deliveries show `EMAIL_REQUEST_FAILED` | Resend domain not verified, or wrong key | Part A5: wait for **Verified**; check the key |
| WhatsApp test: "CEOITBox refused the API key (401)" | Wrong or switched-off key | Paste the new key again; check it's on in CEOITBox |
| WhatsApp: `CEOITBOX_BLOCKED` | Wallet balance low, or the number opted out | Top up in CEOITBox → Money → Credit Center |
| WhatsApp messages skipped: `TEMPLATE_NOT_CONFIGURED` | That message's template isn't live yet | Part H |
| Attachments vanish after a redeploy | `UPLOAD_DIR` points inside `/app` | Part C: `/private/uploads` |
| "Your app is redirecting" warning | Root `/` redirects to `/login` | Settings → General → root path `/login` |
| Import SQL shows "Unauthorized" | GoDaddy's import service refused the session | Skip the import: the first start creates the database (B1) |
| Runtime log: `Migration failed: … TRIGGER command denied` | Hosted DB user can't create triggers | GoDaddy support ticket: the triggers protect the audit log and are required |
| No reminders or escalations | Cron missing, or wrong secret (the job answers 404) | Part I |
| Build fails: `ENOENT … rename '/app/.next/export/500.html'` | GoDaddy reused the old `.next` folder | Fixed in v1.0.3 (the build cleans `.next` first): **Retry build** / **Update Preview** |
| `Cannot find module 'mysql2/promise'` for a minute during Publish | The platform restarted the app before its packages were in place | Recovers by itself; if it repeats for more than 2 minutes, **Restart Published App** |
| `The Server Reference ID did not match … Received "y"` | A page opened before a deploy (or a bot) sent an old form | Harmless; reload the page |
| 502 / "Application error" right after deploy | App still starting (migrations on the first start), or crashed | Wait 1 minute; read the app's runtime log |

---

## Part O: Known limits (v1.4.0)
- **Break-glass** sign-in needs the WhatsApp code (Q-015).
- **WhatsApp** messages go out only once their template is live (Part H): 26 templates, 6 of them new in v1.4.0 (work task, FYI, resumed, changes made, removed, moving again). Email and in-app always go out.
- **Owner decisions kept (D-078):**
  - one person may approve more than one level;
  - requests don't expire;
  - rejection is final;
  - no drafts, admin cancel or auditor role.
- **Choices** can be nested up to 3 deep; a rule has up to 10 conditions, all or any (D-099).
- **Approving from WhatsApp** (reply buttons) isn't available; the message links to the request.
- **Delivery receipts** depend on CEOITBox's webhook (G6); until it's set, WhatsApp rows stay SENT.
- **Dev-only advisories:** `npm audit` (with dev tools) lists 7 high for `braces` under Tailwind 3 and ESLint. They run only at build time on our own files; no fixed version exists; the production audit is clean (D-105).

---

## Part P: Backups and restore (v1.4.0, D-104)
**What happens by itself:** once a day the job runner (Part I) writes a gzipped SQL copy of the whole database, `ars-db-YYYYMMDD-HHMMSS.sql.gz`, into `BACKUP_DIR`. It also copies new attachment files to `BACKUP_DIR/attachments`. Files older than `BACKUP_KEEP_DAYS` (default 14) are deleted.

### P1. Set it up
1. cPanel → **File Manager** → in your home folder (not `public_html`) create `ars-approvals-backups`.
2. GoDaddy → the app → secrets → `BACKUP_DIR` = `/home/<cpanel-user>/ars-approvals-backups` → **Publish**.
3. **Super Admin → Overview → Backups → Back up now**. The line turns green, showing the time and size.
4. Every week or so, download the newest file from File Manager to a safe place off GoDaddy (e.g. the IT Google Drive). The server copy alone doesn't protect against losing the hosting account.

### P2. Restore drill (do it once now, then every quarter)
Restore into a **new, empty** database, never straight over the live one.
1. cPanel → **MySQL Databases** → create `…_restoretest` and give the app's database user all rights on it.
2. Either:
   - **phpMyAdmin:** select `…_restoretest` → **Import** → the `.sql.gz` file → **Go**. The file is standard SQL with `DELIMITER` blocks, which phpMyAdmin accepts.
   - **or** on a PC with Node and the repository: set `DB_HOST`, `DB_PORT`, `DB_USER`, `DB_PASSWORD`, `DB_NAME=<…_restoretest>`, then run `node scripts/database/restore.js ars-db-….sql.gz --confirm-database=<…_restoretest>`.
3. Check it: in phpMyAdmin, `…_restoretest` has the same tables, and `SELECT COUNT(*)` on `approval_requests`, `users` and `audit_logs` matches the live database.
4. Drop `…_restoretest`. Note the date in PLAN-CHECKLIST (GL-04).

The automated version of this drill runs in every CI build (`tests/integration/backup.int.test.ts`). It restores the test database and compares every table's checksum.

### P3. A real restore (after data loss)
1. Tell staff to pause for a while. Everything up to the backup's time is in the file.
2. Restore the chosen file into a new database (P2), and check it.
3. GoDaddy → the app → change the `DB_…` secrets to the restored database → **Publish**.
4. Copy `BACKUP_DIR/attachments/*` back into `UPLOAD_DIR` (File Manager), keeping the folder structure.
5. Anything done after the backup's time must be redone; the audit log of the old database (if it still exists) shows what.
