# Recovery objectives and incident response

> **Approved by the owner on 2 Nov 2026** (audit OPS-10, register BE-03, decision DR-08; DEVELOPMENT-MEMORY D-277): **RPO 24 hours, RTO 4 hours**, with an encrypted daily off-site copy to an ARS Google Drive folder and the backup encryption key held by the owner, off the server. The approved targets are in §2.0. The draft proposals of 31 Oct 2026 are kept below them as history.
>
> *(Superseded box, 31 Oct 2026: "DRAFT for the owner's approval. Nothing on this page is agreed yet. The recovery targets in §2 are proposals …")*

| | |
|---|---|
| Applies to | ARS-CMS v1.46.0 (2 Nov 2026); first written for v1.39.0 (31 Oct 2026) |
| Fixes | Audit OPS-10 (no RPO/RTO, no incident procedure); supports OPS-07 (restore drill) |
| Builds on | `docs/BACKUP_RESTORE_AND_ROLLBACK.md`, `docs/DEPLOYMENT.md` (Parts M, N, P), `docs/AUTOMATION_INVENTORY_AND_RECOVERY.md` (Recovery runbook) |

Words used: **RPO** (recovery point objective) is how much recent data we accept losing. **RTO** (recovery time objective) is how long the app may be unavailable before it is working again.

## 1. What the recovery targets are based on

Checked against the code at v1.39.0, with the v1.40.0 and v1.46.0 changes added:

| Fact | Where |
|---|---|
| The cron job calls the job runner every 5 minutes (`POST /api/jobs/run`) | DEPLOYMENT Part I; `app/api/jobs/run/route.ts` |
| The `backup` step makes a full database backup when the last one is **23 hours or more** old, so about once a day, as long as the cron job runs | `runDailyBackup`, `server/ops/backup.ts` |
| The backup is one consistent snapshot (one read-only transaction) of every table, data and trigger, gzipped SQL | `server/ops/backup.ts` |
| New attachment files are copied to `BACKUP_DIR/attachments` on the same run | same |
| Backups stay on the server for `BACKUP_KEEP_DAYS` (default **14**) days, in `/private/backups` on the same GoDaddy account | `config/environment.ts`; DEPLOYMENT P1 |
| ~~The **off-site copy is a manual download, weekly** (audit OPS-08: not automated)~~ Superseded: v1.40.0 added an automatic encrypted copy to S3-compatible storage, and **v1.46.0 an automatic encrypted copy to Google Drive** (job step `driveBackup`, right after `backup`; keeps the newest 14 by default). Both need `BACKUP_ENCRYPTION_KEY` and the owner's set-up | DEPLOYMENT P1 step 4, Part U, Part W (W3); `server/ops/gdrive-backup.ts` |
| Every backup has a `.sha256`; with `BACKUP_ENCRYPTION_KEY` it is AES-256-GCM encrypted (`.sql.gz.enc`). Without the key, an encrypted backup can't be restored, so the owner keeps a copy off the server | `server/ops/backup.ts`; `scripts/database/restore.js` |
| A failed backup alerts the Super Admin once a day; a stopped runner shows `jobRunner: LATE` on `/api/health` and alerts the Super Admin | `server/ops/alerts.ts`; `app/api/health/route.ts` |
| **Super Admin → Back up now** makes an extra backup at any time | `features/superadmin/BackupNowButton.tsx` |
| Migrations only add, so a code rollback never needs a database rollback | DEPLOYMENT Part M |
| Restore always goes into a new, empty database first (`restore.js --confirm-database`, `verify-backup.js`) | BACKUP_RESTORE §2 |
| A restore of a **real production** backup has never been recorded (GL-04 open) | audit OPS-07 |

## 2. Recovery targets

### 2.0 Approved targets (owner, 2 Nov 2026)

| Target | Value | Applies to |
|---|---|---|
| **RPO** | **24 hours** | Every scenario, A to D. The daily backup, and for scenario D its encrypted copy in Google Drive |
| **RTO** | **4 hours** | Every scenario, from the incident being declared to the app working again |

Conditions the owner accepted with these targets:
1. **Off-site copy:** each encrypted daily backup is copied to an ARS Google Drive folder (shared drive, service account as Content manager; DEPLOYMENT Part W). Until that is set up and Automation shows **Google Drive backup copy** OK, scenario D's real RPO is the age of the last manual download.
2. **The key:** `BACKUP_ENCRYPTION_KEY` is held by the owner **off the server** (password manager). Losing it makes every encrypted backup unreadable. A Drive copy alone, without the key, is useless to anyone else.
3. **The RTO must be proved** by the restore drill (§5), including one restore from a Drive copy. If the drill takes longer than 4 hours, the owner is told and the target or the procedure changes.
4. Review once a year and after any real incident (unchanged).

### 2.1 Proposed targets, 31 Oct 2026 (history; superseded by §2.0)

| Scenario | Proposed RPO | Proposed RTO | Why |
|---|---|---|---|
| **A. Bad release** (a deploy breaks pages or flows; data is fine) | 0 (no data lost) | **1 hour** | Redeploy the previous tag (Part M). The database stays as it is because migrations only add. The time is a GoDaddy build and publish plus checks. |
| **B. App or database down, data intact** (hosting fault, cron stopped, provider outage) | 0 | **4 working hours** | Mostly waiting on GoDaddy or the provider. Email and WhatsApp catch up by themselves: the outbox keeps unsent messages. |
| **C. Data damaged or deleted, GoDaddy account fine** | **24 hours** | **1 working day** | Daily backup on the server. Restore into a new database, check it, switch the `DB_…` secrets and publish (Part P3). Work done since the backup must be redone. |
| **D. GoDaddy account or its storage lost** | **Up to 7 days** today | **2 working days** | Only the weekly manual off-site copy survives. Rebuild from DEPLOYMENT Parts A–I (about 2 hours of steps the first time), restore the off-site copy, re-enter the provider keys if `ENCRYPTION_KEY` was lost too. |

**Recommendations for the owner:**
1. **Accept 24 hours as the RPO for scenarios A–C.** A shorter RPO would need more than one backup a day (a code change: the 23-hour rule in `runDailyBackup`).
2. **Don't accept 7 days for scenario D.** Either download the newest backup **daily** instead of weekly (RPO 24 hours, a manual step), or automate an off-site copy (audit OPS-08, a code change). Until then, the real RPO for scenario D is 7 days.
3. **The RTOs are not proven.** Scenario C's RTO depends on how long a real restore takes, which nobody has measured. The first production restore drill (§5) must record its time; adjust the RTO to match.
4. Review these targets **once a year**, and after any real incident.

## 3. Severity levels

| Level | Meaning | Examples | Response |
|---|---|---|---|
| **SEV-1 Critical** | Nobody can work, data is lost or damaged, or data may have leaked | App down for everyone; `/api/health` 503; a database restore needed; a key, password or personal data exposed; a sign-in nobody recognises on a Super Admin or break-glass account | Start at once, any time. The owner is told within 1 hour. Updates every hour until it's resolved. |
| **SEV-2 Major** | A core flow is broken for many people, or a safety net is off | Approvals can't be raised or decided; Google or password sign-in fails for many; the job runner stopped (`jobRunner` LATE or NEVER); backups failing for 2 days; WhatsApp **and** email both failing | Start the same working day. Updates twice a day. |
| **SEV-3 Minor** | Something is degraded and there's a workaround | One provider down (email works, WhatsApp doesn't); Google Calendar sync or Pico Bot failing; one approval type stuck; a report not sent | Next working day. Track it in PLAN-CHECKLIST. |
| **SEV-4 Low** | Cosmetic or a single person affected | A label wrong; one user's settings | Normal backlog. |

When in doubt, choose the higher level. The incident lead may lower it later.

## 4. Roles: who does what

Roles only. Fill in the names and numbers on the owner's own contact sheet, kept **outside the repository**.

| Role | Who (by role) | Does |
|---|---|---|
| **Incident lead** | The Super Admin (IT) | Declares the incident and its level, decides each step, keeps the incident log, calls the others |
| **Owner / management** | The company owner or their delegate | Approves a database restore, any announcement outside IT, and any legal notification; accepts the residual risk |
| **IT team** | IT Admins | Checks the app and data, contacts staff, helps with the restore checks, hands over stuck work |
| **Developer** | Whoever maintains the code (currently with Claude Code) | Diagnoses, fixes or rolls back the code; runs the restore scripts with IT |
| **Providers' support** | GoDaddy (hosting, database), Cloudflare (DNS, proxy), Resend (email), CEOITBox (WhatsApp), Google (Firebase, Calendar), the Salesforce admin, AI providers | Called by the incident lead for faults on their side |
| **Legal / compliance** | The company's legal adviser | Advises on reporting duties for a data breach (§6.1) |

Only the owner may approve restoring over production data. Nobody restores the live database without that approval (BACKUP_RESTORE §2).

## 5. Restore drill checklist (OPS-07)

Do this **once now**, then **every quarter**, and after any change to how backups work. It follows DEPLOYMENT P2 and BACKUP_RESTORE §2. It never touches the live database.

**Before**
- [ ] Book 1 hour with the Super Admin and one IT Admin. Note the start time (it measures the RTO for scenario C; the approved target is 4 hours).
- [ ] Pick the **newest production backup** (`ars-db-YYYYMMDD-HHMMSS.sql.gz`) from Private Storage → `backups`, and note its name, size and time.
- [ ] Also take one file from the **off-site copy** (the Google Drive folder, v1.46.0) at least once a year, to prove the off-site copies are readable. Download the `.enc` and its `.sha256` together; the PC running the check needs `BACKUP_ENCRYPTION_KEY`.

**Restore**
- [ ] cPanel → MySQL Databases: create an **empty** database `…_restoretest` and give the app's user all rights on it.
- [ ] On a PC with the repository and access to that database, run:
  `npm run db:verify-backup -- <file> --into=<…_restoretest> --report=backup-check-<date>.json`
  (or import the file in phpMyAdmin, then check by hand as below).
- [ ] The script exits with code 0. It refuses the app's own database and any database that already has tables.

**Check**
- [ ] The JSON report shows every table with matching row counts, every trigger back, and the audit log and timeline still refusing changes.
- [ ] Counts of `approval_requests`, `approval_tasks`, `approval_events`, `audit_logs` and `users` are close to live (live may be a little ahead).
- [ ] A sample of 3 requests: their attachments exist under `BACKUP_DIR/attachments` with the same folder structure.
- [ ] Note the end time. Time taken = restore and check time (the RTO for scenario C, without the switch-over).

**After**
- [ ] Drop `…_restoretest`. Delete any downloaded copy from the PC unless it is the off-site copy.
- [ ] Record in PLAN-CHECKLIST, GL-04: the date, the file, its size, the time taken, the result, and where the JSON report is kept (outside the repository; it holds counts only).
- [ ] If anything failed: open a SEV-2 incident (backups can't be trusted) and fix it before the next working day.

## 6. Incident procedure

**For every incident:**
1. **Declare it.** The incident lead names it (date and a few words), sets the level (§3) and starts a log: times, what was seen, what was done, by whom. Use the request id (`x-request-id`, "Reference" in **Copy details for IT**) to find log lines.
2. **Protect the evidence.** Before changing anything: download the audit log CSV for the period (Super Admin → Audit log), note Sign-in history, copy the GoDaddy runtime log, and take a fresh backup (**Back up now**) if the app is up.
3. **Contain, then recover**, using the playbook below.
4. **Tell people** (§7).
5. **Close it**, then review it (§8).

### 6.1 Data breach (or a suspected one)

A key, password, session or personal data may have been exposed, or someone got in who shouldn't have.
1. **Level SEV-1.** Tell the owner at once.
2. **Contain the accounts:**
   - Deactivate any account used by someone else (Admin → Users; deactivation signs them out everywhere). For your own account, use **Sign out everywhere**.
   - If a session or the session key may have leaked: set a new `SESSION_SECRET` in GoDaddy and publish. Every cookie stops working and everyone signs in again.
3. **Contain the keys:**
   - **Provider keys** (Resend, CEOITBox, Google, Salesforce, AI providers): switch the key off at the provider, create a new one, and paste it in Super Admin → Providers & security (DEPLOYMENT Part M, "If a provider key leaks").
   - **AI:** AI settings → **Emergency stop: ON**.
   - **Google Calendar:** maintenance mode pauses syncing.
   - **Salesforce:** revoke the connection in Salesforce if the copy may be involved.
   - **Server secrets** (`JOB_RUNNER_SECRET`, `ORIGIN_SECRET`, database password, `FIREBASE_PRIVATE_KEY`): replace the value in GoDaddy (and in the cron entry for the job secret), then publish.
   - **`ENCRYPTION_KEY`:** if it leaked, every encrypted setting must be treated as exposed. Rotate each provider key at the provider first, then set a new `ENCRYPTION_KEY` and enter every provider key again; the old encrypted values can't be read with the new key.
4. **Find out what was reached:** the audit log, Sign-in history and AI Activity History for the period. List the people and records affected.
5. **Reporting duties (legal to confirm):** Indian law may require reporting. For example, CERT-In directions require certain cyber incidents to be reported within hours, and the Digital Personal Data Protection Act, 2023 requires notifying the Data Protection Board and the people affected by a personal data breach. Legal / compliance advises; the owner decides and sends.
6. Fix the cause before reopening anything that was closed.

### 6.2 Outage (the app or a part of it is down)

1. Open `https://approval.arssteels.net/api/health`:
   - **no answer or a Cloudflare error page:** check Cloudflare and GoDaddy status pages; GoDaddy → the app → is it Running?
   - **503, `database: "down"`:** the database. GoDaddy → Hosted Database; check connections (DEPLOYMENT B2); call GoDaddy support;
   - **`jobRunner: "LATE"` or `"NEVER"`:** the cron job. Check the cPanel cron entry and its secret (DEPLOYMENT Part I; AUTOMATION recovery runbook);
   - **`storage: "failed"`:** uploads can't be written. Check `UPLOAD_DIR` (DEPLOYMENT Part N).
2. Read the GoDaddy runtime log, and match the symptom in DEPLOYMENT **Part N** (Troubleshooting).
3. If it started right after a publish, treat it as a bad release (§6.3).
4. **Restart Published App** if the log shows a crash with no clear cause, then check `/api/health` again.
5. If the app is up but degraded, show a notice to everyone: Super Admin → Settings → General → maintenance notice.
6. After recovery: Super Admin → **Automation**: every job runs again. Message deliveries and Needs attention show anything not sent; **Resend** after checking it didn't reach people already.

### 6.3 Bad release (rollback)

The steps already in DEPLOYMENT **Part M** and BACKUP_RESTORE **§4**. Use the lightest lever that works:
1. **Switch the feature off:** Super Admin → Providers & security → **Feature switches** (OFF or IT_ONLY). Nothing is deleted.
2. **Undo a configuration change:** restore an earlier workflow version as a draft and publish it; move requests back with the migration assistant.
3. **Roll the code back:** in GoDaddy, redeploy the previous good tag (`git tag --sort=-v:refname` lists them), or revert the bad commit on `main` and let it redeploy. **The database doesn't need rolling back:** migrations only add, and each release's DEPLOYMENT part says what its rollback leaves behind.
4. **Restore the database** only for data damage, never to undo a release. It is the last resort and needs the owner's approval (scenario C).
5. Check: `/api/health` shows the expected version; run the short go-live checks (DEPLOYMENT Part L).
6. Before the next release: CI must be green on all jobs (DEPLOYMENT A1).

### 6.4 Data damaged or deleted (database restore)

DEPLOYMENT **Part P3** with BACKUP_RESTORE **§2**: the owner approves; tell staff to pause; take a fresh backup of the current state; restore the chosen backup into a **new** database and check it as in §5; switch the `DB_…` secrets to it and publish; copy the attachments back; list what must be redone from the old database's audit log.

## 7. Communication

| Who | How | When |
|---|---|---|
| Owner / management | Phone or WhatsApp from the incident lead | SEV-1 within 1 hour; SEV-2 the same day |
| All staff | Email or WhatsApp from IT (the app's own messages may be down); the in-app maintenance notice when the app is up | SEV-1 and SEV-2: when declared, at each change, and when resolved |
| Approvers with urgent work | IT calls them; IT can hand over pending approvals (Admin → Users → *Hand over*) | When approvals are blocked for more than half a day |
| Providers | Their support channel | As needed |
| Outside the company | Only the owner (or whom they name), after legal advice | Data breach only |

**What every message says:** what is affected, what still works, what people should do meanwhile (for example "keep a note of decisions and enter them when the app is back"), and when the next update comes. Never include keys, passwords, personal data or internal error details.

**Closing message:** it's fixed; what (if anything) people must redo; who to ask.

## 8. After the incident

Within **5 working days** of a SEV-1 or SEV-2:
- [ ] Write a short review: timeline, cause, impact (people, records, time), what worked, what didn't. No blame.
- [ ] Add the actions to PLAN-CHECKLIST, and record the incident and any new decision in DEVELOPMENT-MEMORY (work log and a D-number).
- [ ] Check whether the RPO and RTO were met; if not, propose a change to §2.
- [ ] Update this page, the AUTOMATION recovery runbook or DEPLOYMENT Part N if a step was missing or wrong.
