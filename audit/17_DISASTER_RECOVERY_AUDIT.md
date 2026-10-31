# 17. Disaster recovery audit (OPS)

| | |
|---|---|
| Target | ARS-CMS v1.39.0, commit `0473f2560398844f875a3bec49206e13078d06d7` |
| Date | 31 Oct 2026 |
| Evidence | `audit/TEST_EVIDENCE/OPS/` |
| Principle applied | A backup is **not verified** until a restore has been tested. |

## 1. Method

- **Document review:**
  - `docs/BACKUP_RESTORE_AND_ROLLBACK.md` (v1.6/v1.7);
  - `docs/AUTOMATION_INVENTORY_AND_RECOVERY.md`;
  - `docs/DEPLOYMENT.md` Parts G7, I, L, M and P;
  - `PLAN-CHECKLIST.md` (GL-04).
- **Code review:**
  - `server/ops/backup.ts`, `server/ops/automation.ts`, `server/ops/alerts.ts`;
  - `app/api/health/route.ts`, `app/api/jobs/run/route.ts`;
  - `app/superadmin/actions.ts` (`backupNowAction`), `features/superadmin/BackupNowButton.tsx`;
  - `scripts/database/restore.js`, `verify-backup.js`, `env.js`;
  - `lib/logging/logger.ts`, `lib/db/repositories/job-runs.repository.ts`.
- **`npm run db:verify-backup` was read but not run.**
  - The script does `require("./env")`, which loads `.env.local` (`scripts/database/env.js:20`). The audit rules forbid reading that file.
  - It also restores a whole dump into a target database (writes). It is not read-only, so it was left NOT TESTED.
- **HTTP against localhost only:**
  - `GET /api/health`;
  - `POST /api/jobs/run` without the secret (`curl-health-jobs.txt`).
  - The Super Admin "Back up now" button was **not** pressed: the audit session helper could not find the seeded test users at the time (`no test user E2E_REQ` / `E2E_SUPER`), and a backup writes files on the host.
- **CI evidence of the restore drill:** the integration-job log of the last completed green run, v1.38.0 (run 41199998724), in `ci-integration-v1.38.0.log`. The v1.39.0 run's log was not yet downloadable (the run was in progress).

## 2. How backup and recovery work (as built)

| Element | Implementation | Evidence |
|---|---|---|
| Database backup | The app itself writes `ars-db-YYYYMMDD-HHMMSS.sql.gz` (plain SQL, tables, data and triggers without DEFINER). It reads inside `START TRANSACTION WITH CONSISTENT SNAPSHOT, READ ONLY`, pages rows by primary key, excludes generated columns, writes `*.part`, then renames, so a half-written file never looks like a backup. | `server/ops/backup.ts:66-75`, `78-124`, `146-155` |
| Schedule | The `backup` automation inside the cron job runner (every 5 minutes); it backs up at most once per 23 h | `server/ops/automation.ts:112-123`; `backup.ts:188-193` |
| Manual | Super Admin → Overview → **Back up now**. The server action checks `requireApiArea("superadmin")` and audits `BACKUP_CREATED` with counts only. | `app/superadmin/actions.ts:12-28` |
| Attachments | New files are copied from `UPLOAD_DIR` to `BACKUP_DIR/attachments` (never pruned) | `backup.ts:127-142`, `164-165` |
| Location | `BACKUP_DIR`, else `<UPLOAD_DIR>/../backups` (GoDaddy Private Storage `/private/backups`) | `backup.ts:30-35`; DEPLOYMENT P1 |
| Retention | Database files older than `BACKUP_KEEP_DAYS` (default 14) are deleted after a **successful** backup | `backup.ts:157-163` |
| Off-site copy | **Manual**: "every week or so, download the newest file … to a safe place off GoDaddy" | DEPLOYMENT P1 step 4; BACKUP doc §1 |
| Encryption and integrity of the backup file | **None.** It is plain gzip, with no checksum or manifest stored. The dump contains password hashes, sessions and the encrypted provider settings (`ENCRYPTION_KEY` is not in the backup and must be kept in the password manager, DEPLOYMENT A2). | `backup.ts` (no cipher or hash) |
| Restore | `scripts/database/restore.js <file> --confirm-database=<DB_NAME>` drops and recreates every table in the file. Phpmyadmin import is the alternative. | `restore.js:1-7`; DEPLOYMENT P2–P3 |
| Restore verification | `verify-backup.js` restores into an **empty** database. It refuses the app's own `DB_NAME` and any non-empty database, then compares rows per table and the trigger count, and confirms the append-only triggers still refuse UPDATE. | `verify-backup.js:44-110` |
| Failure alerting | A failed backup (`BACKUP_FAILED`) or any failed step (`JOB_RUNNER_FAILED`) alerts the Super Admin by email and WhatsApp, at most once a day per kind | `app/api/jobs/run/route.ts:31-32,38`; `server/ops/alerts.ts` |
| Missed-run detection | Each automation is OK, LATE, FAILING or NEVER. The heartbeat is recorded after each cron run. `/api/health` reports `jobRunner` OK when the last run is 15 minutes old or less, and LATE when it is older. A LATE answer triggers `checkJobRunnerStopped()` after the response. | `automation.ts:296-306`; `health/route.ts:23-26` |
| Health endpoint | Public `GET /api/health`. It returns 200 with `{status, version, database, jobRunner, storage, ms}`, or 503 when the database is down. **It does not report backup age.** It returns 200 even when `jobRunner` is LATE or NEVER. | `health/route.ts:15-35`; `curl-health-jobs.txt` |
| Logs | Structured JSON to stdout or stderr with `requestId` (`lib/logging/logger.ts`). Retention depends on the GoDaddy runtime log (unknown). `job_runs` are kept 90 days (`job-runs.repository.ts:96`). `audit_logs` are append-only through triggers (`202609281203_create_audit_logs.sql:28,36`). | |
| RPO / RTO | "At most one day of data can be lost … Recovery time is the time of a phpMyAdmin import. **RTO and RPO targets are for the owner to confirm** (register BE-03)." | `BACKUP_RESTORE_AND_ROLLBACK.md:48` |
| Incident response | Symptom-to-action tables only: the AUTOMATION_INVENTORY "Recovery runbook" and DEPLOYMENT Part N. There are no roles, severity levels, communication or escalation steps, and no post-incident review. | doc review |

## 3. Restore-test evidence

| Kind | Exists? | Detail |
|---|---|---|
| Automated drill in CI (synthetic test data) | **Yes** | The v1.38.0 integration job log shows `✓ tests/integration/backup.int.test.ts (2 tests)` (including "restores every table exactly, with the append-only triggers working") and `✓ tests/integration/v170-bc.int.test.ts (10 tests)` (including `C03 backup check script`, which runs `verify-backup.js`). Total `55 passed (55)` files. For v1.39.0 (run 41223507740) the integration job is also green, but its log could not be downloaded while the run was in progress. |
| Local drill | Claimed | `PLAN-CHECKLIST.md:740`: "restore drill run locally (done 9 Oct 2026: v1.4.0)". No artefact was found. |
| **Production restore drill (GoDaddy, real backup file)** | **No** | `PLAN-CHECKLIST.md:1190`: `- [ ] GL-04 Backup/restore drill` is still open. DEPLOYMENT P2 asks for it "once now, then every quarter" and for the date to be noted in GL-04, and no date is recorded. |
| Production backups exist and the cron runs | Unknown | BLOCKED (no production access). |

**Conclusion:**
- The backup and restore **mechanism** is verified on CI test data on every build.
- **Production backups are not verified:** no restore of a real production backup has been recorded.

## 4. Checks

| ID | Check | Method | Status | Evidence |
|---|---|---|---|---|
| DR-01 | Backup and restore procedure documented | doc review | PASS | `docs/BACKUP_RESTORE_AND_ROLLBACK.md` §1–2; `DEPLOYMENT.md:471-498` |
| DR-02 | Backup is consistent and atomic, with rotation | code review | PASS (code review) | `server/ops/backup.ts:66-75` (snapshot), `:153` (rename of `.part`), `:157-163` (rotation) |
| DR-03 | Backup runs daily without a person | code review | PASS (code review) | `automation.ts:112-123`; `backup.ts:188-193`. In production this depends on the cron (DR-21). |
| DR-04 | "Back up now" restricted to the Super Admin and audited | code review | PASS (code review) | `app/superadmin/actions.ts:12-28`. Not exercised over HTTP (no test session available). |
| DR-05 | Restore tooling protects the live database | code review | PASS (code review) | `restore.js` requires `--confirm-database`; `verify-backup.js:49,64` refuses `DB_NAME` and any non-empty target |
| DR-06 | `npm run db:verify-backup` runs green | read script | NOT TESTED | Not read-only (writes a target database) and loads `.env.local` (`scripts/database/env.js:20`), which the rules forbid |
| DR-07 | Automated restore drill passes | CI log | PASS | `ci-integration-v1.38.0.log`: `backup.int.test.ts (2 tests)` ✓ and `v170-bc.int.test.ts (10 tests)` ✓ |
| DR-08 | Production restore tested | PLAN-CHECKLIST, docs | FAIL | `PLAN-CHECKLIST.md:1190` GL-04 unticked; no dated drill → OPS-07 |
| DR-09 | Off-site backup copy | doc and code review | FAIL | Manual weekly download only; no automation, no record (DEPLOYMENT P1.4) → OPS-08 |
| DR-10 | Backup files protected (encryption, integrity) | code review | PARTIAL | Stored in Private Storage, but not encrypted and without a checksum (`backup.ts`) → OPS-09 |
| DR-11 | RPO and RTO defined and approved | doc review | FAIL | "for the owner to confirm (register BE-03)" (`BACKUP_RESTORE_AND_ROLLBACK.md:48`) → OPS-10 |
| DR-12 | Health endpoint responds | `curl /api/health` | PASS | 200 `{"status":"ok","version":"1.38.0","database":"ok","jobRunner":"NEVER","storage":"ok"}` (see O-1 in 16 on the version) |
| DR-13 | Health signal suitable for alerting | code review and curl | PARTIAL | 200 even when `jobRunner` is NEVER or LATE; no backup age → OPS-11 |
| DR-14 | Job runner refuses callers without the secret | `curl -X POST /api/jobs/run` | PASS | 404 `NOT_FOUND` (`curl-health-jobs.txt`); constant-time compare (`route.ts:15-21`) |
| DR-15 | Heartbeat, missed-run detection and failure alerts | code review | PASS (code review) | `route.ts:31-33`; `automation.ts:296-306`; `health/route.ts:25` |
| DR-16 | An uptime monitor watches production | — | BLOCKED | DEPLOYMENT G7 recommends one; no production access |
| DR-17 | Log retention defined | code and doc review | PARTIAL | `job_runs` 90 days and the append-only audit log are defined; application log retention depends on GoDaddy and is not documented |
| DR-18 | Incident response procedure | doc review | FAIL | Symptom tables only (AUTOMATION_INVENTORY runbook, DEPLOYMENT Part N); no incident roles, severities or communication → OPS-10 |
| DR-19 | Automation inventory matches the code | `server/ops/automation.ts` vs doc | FAIL | 16 automations in code, 10 in the doc → OPS-15 (in 18) |
| DR-20 | `ENCRYPTION_KEY` held outside the server (needed to use restored settings) | — | BLOCKED | Documented (DEPLOYMENT A2) but not verifiable |
| DR-21 | Production backups present, cron running | — | BLOCKED | No production access |

**Totals:** 21 checks: 9 PASS, 3 PARTIAL, 5 FAIL, 1 NOT TESTED, 3 BLOCKED, 0 NOT APPLICABLE.

## 5. Risks and recommendations (not defects)

- **R-DR-1, one-folder risk.** The database dump and the attachments copy live on the same GoDaddy account and storage as the live data. Losing the account, or ransomware on it, loses both until the next manual download.
- **R-DR-2, attachments cannot be restored to a point in time.** The `attachments/` copy is cumulative and never pruned, so it cannot be restored to a point in time. It keeps files of soft-deleted requests indefinitely (which interacts with retention policy).
- **R-DR-3, backup and request in the same process.** The backup runs inside the web process. On a large database a long dump could compete with user requests. Watch its duration in `job_runs`.
- **R-DR-4, quarterly drill with a recorded result.** Run `verify-backup.js --report=…json` on the newest production file each quarter, and store the JSON next to GL-04.

## 6. Defects

| Defect ID | Module | Feature | Category | Description | Expected | Actual | Severity | Priority | Reproduction | Evidence | Root cause | Recommendation | Status |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| OPS-07 | Operations | Backup and restore | Disaster recovery | Production backups have never been proven restorable. | A restore of a real production backup into a scratch database, done and dated (DEPLOYMENT P2 "once now, then every quarter"; GL-04). | `PLAN-CHECKLIST.md:1190` `- [ ] GL-04 Backup/restore drill` is open, and no drill date or report exists. Only CI drills on synthetic data are evidenced. | Medium | P1 | Read PLAN-CHECKLIST GL-04; search the docs for a drill report | `PLAN-CHECKLIST.md:1190`; `docs/DEPLOYMENT.md:480-489` | Owner-side step not done | Run DEPLOYMENT P2 using `npm run db:verify-backup -- <file> --into=<empty> --report=…` on the newest production backup. Record the date and the JSON report, and repeat quarterly. | Open |
| OPS-08 | Operations | Backup storage | Disaster recovery | No automated off-site backup. | At least one copy outside the hosting account, made automatically, with its success monitored. | Backups and the attachment copy sit in GoDaddy Private Storage. The off-site copy is a manual "every week or so" download with no tracking. | Medium | P2 | Read DEPLOYMENT P1 step 4 and `server/ops/backup.ts` (writes only to `backupDir()`) | `docs/DEPLOYMENT.md:478`; `BACKUP_RESTORE_AND_ROLLBACK.md` §1 | Hosting limits; off-site copy left manual | Automate an off-site push after each backup (e.g. Google Drive or S3-compatible storage with a write-only key), alert when it fails, and keep a log of copies. | Open |
| OPS-09 | Operations | Backup file | Data protection | Backup files are unencrypted and carry no integrity checksum. | Backups encrypted at rest (especially once copied off-site), with a stored hash to detect corruption. | Plain `.sql.gz`, including password hashes, session rows and personal data; no hash or manifest. | Low | P3 | Read `server/ops/backup.ts:146-166` | `server/ops/backup.ts` | Not designed in | Encrypt the stream (AES-GCM with a key separate from `ENCRYPTION_KEY`) and write a `.sha256` next to each file. `verify-backup.js` should check the hash. | Open |
| OPS-10 | Operations | DR governance | Disaster recovery | There are no approved recovery objectives and no incident response procedure. | Documented RPO and RTO approved by the owner, plus an incident procedure (who declares, who acts, how staff are told, the restore decision, a post-incident review). | `BACKUP_RESTORE_AND_ROLLBACK.md:48`: "RTO and RPO targets are for the owner to confirm (register BE-03)". Only symptom-to-action tables exist. | Medium | P2 | Doc review | `docs/BACKUP_RESTORE_AND_ROLLBACK.md:48`; `docs/AUTOMATION_INVENTORY_AND_RECOVERY.md` (Recovery runbook) | Owner decision pending | The owner sets the RPO and RTO (the current design gives an RPO of 24 h for the database while the server survives, and up to a week if it does not). Write a one-page incident runbook. | Open |
| OPS-11 | Operations | `/api/health` | Monitoring | The health check hides job-runner and backup problems from a standard uptime monitor. | A monitor can alert when cron has stopped or the latest backup is too old. | `/api/health` returns HTTP 200 with `"jobRunner":"NEVER"` or `"LATE"` and has no backup field. A plain HTTP monitor stays green. The "runner stopped" alert itself only fires when something polls `/api/health` (`health/route.ts:25`). | Low | P3 | `curl -i http://localhost:3100/api/health` → 200 with `"jobRunner":"NEVER"` | `audit/TEST_EVIDENCE/OPS/curl-health-jobs.txt`; `app/api/health/route.ts:15-35` | Health designed for database liveness only | Add `backup: {ageHours}` and an overall `degraded` flag, or a second endpoint `/api/health/deep` returning 503 when `jobRunner` is not OK or the backup is older than 26 h. Configure the monitor with keyword or status matching. | Open |
