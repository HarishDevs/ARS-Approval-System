# Backup, restore and rollback

Written for v1.6.0; brought up to date for **v1.46.0 (2 Nov 2026)**: §1 (off-site copies), §2 (approved targets), §6 (the v1.46.0 migration and its rollback), §5 (security records). The v1.6.0 text is kept where it still holds.

Unified prompt §2 and Addendum B (BE, BI). This document adds the v1.6.0 specifics to the existing procedures in `docs/DEPLOYMENT.md` (Part M: updating and rollback; Part P: backups and restore). Nothing here has been run against production.

## 1. What is backed up

| What | How | Where |
|---|---|---|
| Whole database | Daily by the job runner (`backup` automation): a gzipped SQL dump `ars-db-YYYYMMDD-HHMMSS.sql.gz` | `BACKUP_DIR` on the GoDaddy account |
| Attachment files | New files copied on the same run | `BACKUP_DIR/attachments` |
| Manual backup | Super Admin → Overview → **Back up now** | Same place |
| Checksum and encryption (v1.40.0) | Every backup gets a `.sha256`; with `BACKUP_ENCRYPTION_KEY` set it is AES-256-GCM encrypted (`.sql.gz.enc`) | Beside the backup |
| Off-site copy, S3-compatible (v1.40.0, optional) | After the backup, the encrypted file goes to a bucket (Super Admin → Settings → Off-site backup) | AWS S3, Cloudflare R2, Backblaze B2, Wasabi |
| **Off-site copy, Google Drive (v1.46.0, DR-08)** | Job step `driveBackup`, right after `backup`: the newest **encrypted** backup and its `.sha256`, uploaded by a service account; the newest `backup.gdrive_keep` (default 14) kept; only files the app uploaded are ever deleted. Never an unencrypted file | An ARS shared-drive folder (Super Admin → Settings → Google Drive backup) |

Safety rules:
- **A backup never overwrites another backup.** Each file has a new timestamped name.
- **Old backups expire.** Files older than `BACKUP_KEEP_DAYS` (default 14) are removed by the backup run.
- **Download copies off the server.** Do this weekly: the GoDaddy account is a single location. ~~Weekly is the only off-site copy~~ Superseded in v1.46.0: once the Google Drive copy is set up (below), the weekly download is a spare.
- **The encryption key stays with the owner, off the server** (owner decision, 2 Nov 2026). Without it no encrypted backup, local or in Drive, can be restored.
- **Failed backups raise an alert.** The Super Admin is told once a day (`BACKUP_FAILED`), and Automation shows the backup job as "Last run failed".

## 2. Restore (always into a new database first)

Follow DEPLOYMENT Part P: restore the dump into a **new** database (`…_restoretest`), compare table counts, then decide. `scripts/database/restore.js` refuses to run without `--confirm-database=<name>`. CI repeats this drill on every build (`tests/integration/backup.int.test.ts`, which checks every table).

**Scripted check (v1.7.0):**

1. Create an **empty** database (cPanel → MySQL Databases), and give the app's MySQL user all privileges on it.
2. Run:

   ```
   npm run db:verify-backup -- <ars-db-YYYYMMDD-HHMMSS.sql.gz> --into=<empty_database> --report=backup-check.json
   ```

3. Read the result:
   - It restores the file there and compares, for every table, the restored rows with the rows in the file.
   - It also checks that every trigger came back and that the audit log and timeline still refuse changes.
   - It prints counts only, never data or settings.
   - Exit code 0 means OK. It also writes a JSON report.
4. Drop the check database afterwards.

The script refuses the app's own database (`DB_NAME`) and any database that already has tables. CI runs it on every build (`tests/integration/v170-bc.int.test.ts`).

Never restore over the live database without the owner's explicit decision. Before any restore, take a fresh backup.

**After a restore, check:**
- the counts of `approval_requests`, `approval_tasks`, `approval_events`, `audit_logs` and `users`;
- that Needs attention shows no "Workflow state doesn't add up" findings (the reconciliation check, BA-08);
- that a sample of requests opens with its timeline and attachments.

**Recovery point (approved 2 Nov 2026: RPO 24 hours, RTO 4 hours; `docs/RECOVERY_OBJECTIVES_AND_INCIDENT_RESPONSE.md` §2.0).** History of this paragraph: at most one day of data can be lost: backups are daily, plus any manual backup. Recovery time is the time of a phpMyAdmin import. RTO and RPO targets are for the owner to confirm (register BE-03). Proposed targets, with an incident procedure and a restore drill checklist: `docs/RECOVERY_OBJECTIVES_AND_INCIDENT_RESPONSE.md` (draft for the owner's approval, 31 Oct 2026).

**Set up the Google Drive copy (v1.46.0).** Full steps in DEPLOYMENT Part W, W3. In short:
1. Set `BACKUP_ENCRYPTION_KEY` on the server; the owner keeps a copy off the server.
2. Google Cloud: enable the Google Drive API; create a service account and a JSON key.
3. Google Drive: a folder in a **shared drive**; add the service account's email as **Content manager**. Old copies beyond the number kept go to the shared drive's trash (Google empties it after 30 days).
4. Super Admin → Settings → Google Drive backup: ON, paste the key, the folder id, copies to keep → **Save** → **Test** ("Connected as …"; audited `GDRIVE_BACKUP_TESTED`).
5. Next day: Automation → Google Drive backup copy OK; the folder holds the `.enc` and `.sha256` (audited `BACKUP_COPIED_TO_DRIVE`).

**Restore from a Drive copy:** download the `.sql.gz.enc` and its `.sha256` into one folder on a PC, set `BACKUP_ENCRYPTION_KEY` there, then run `npm run db:verify-backup -- <file> --into=<empty_database>` as above (it checks the `.sha256` and decrypts), or `restore.js` (DEPLOYMENT P2).

## 3. v1.6.0 database changes

All v1.6.0 migrations are additive: new tables, plus one column changed to signed on a v1.6.0 table. Nothing existing is dropped, renamed or rewritten, and there are no backfills.

| Migration | Adds |
|---|---|
| `202610110900_v160.sql` | user settings, recent views, consultations, revisions, request links, `workflow_definitions.settings_json`, budgets, submission checks, templates |
| `202610121000_v160_reliability.sql` | `job_runs`, `stuck_snoozes` |
| `202610121100_v160_amendments.sql` | `request_amendments`; `request_submission_checks.request_paise` made signed |
| `202610121200_v160_version_migration.sql` | `workflow_migrations`, `workflow_migration_items` |
| `202610121300_v160_reports.sql` | `analytics_views`, `report_schedules`, `report_runs`, `alert_rules`, `alert_events` |
| `202610121400_v160_governance.sql` | `legal_holds` |

Migrations run once each, by file name, when the app starts (`npm start` → `scripts/database/migrate.js`). **Take a backup immediately before publishing v1.6.0.**

## 4. Rolling back

Use the lightest lever that solves the problem:

1. **Switch the feature off.** Super Admin → Providers & security → **Feature switches**: analytics, reports, scheduled reports and alerts, amendments, templates. Choose OFF, or IT_ONLY to keep testing with the IT team. Nothing is deleted, and switching back on restores everything.
2. **Undo a configuration change.**
   - Approval types: restore an earlier version as a draft and publish it.
   - Requests moved to the new version: move them back (the migration assistant re-checks each one).
   - Imports always arrive as drafts, so an unwanted import is simply not published.
3. **Roll the code back** (DEPLOYMENT Part M): redeploy the previous release (git tag `v1.5.0`) and publish.
   - The v1.6.0 tables stay but are unused by v1.5.0, so no data is lost and v1.6.0 can be re-published later.
   - Data entered in v1.6.0-only features stays in its tables and reappears when v1.6.0 returns. This covers amendments, templates, budgets, schedules, alerts and holds.
4. **Restore the database.** This is the last resort, for data damage only (§2). Everything entered since the backup is lost.

There are no "down" migrations, by design: dropping tables would destroy history. ~~A rollback never requires changing the database.~~ True until v1.45.0; **v1.46.0 is the exception** (§6).

## 5. Records that can't be recovered

**v1.46.0 (DR-06):** the job step `securityRetention` permanently deletes security records older than 90 days: sign-in attempts (`login_logs`), WhatsApp code records (`otp_challenges`), ended sessions, used security links and used or expired set-password links. A person under an active legal hold keeps theirs; each run's counts are audited (`SECURITY_RECORDS_PURGED`). Requests, their history and the audit log are never deleted. Deleted security records can be recovered only from a backup taken before the deletion.

As written for v1.6.0:

v1.6.0 has no permanent deletion. Requests are soft-deleted (Super Admin, with a reason, audited, blocked by legal holds), and retention is a dry run only. The operational data that housekeeping removes is:
- expired drafts;
- rate-limit records;
- sent queue rows after 30 days;
- message payloads after sending;
- job history after 90 days.

None of these is a business record, and rows tied to a held request or person are kept. Anything removed this way can only be recovered from a backup taken before the removal.

## 6. v1.46.0 database change and its rollback

One migration, `202611021000_unify_condition_rules.sql`, applied on start. Unlike every earlier migration it **changes saved data**: it converts the form rules ("show only when", "required when") in `form_json` of `workflow_versions`, `module_type_versions` and `custom_approval_settings` to the one rule shape (`server/conditions/rule.ts`).

- **Before publishing:** **Back up now** and download the file off the server.
- **Built-in backup:** the migration first copies each row it changes into the new table `condition_rules_backup` (once per row).
- **Idempotent:** a second run changes nothing.
- **Rolling back to v1.45.0:** v1.45.0 can't read the new shape. Redeploy `v1.45.0`, then run the rollback statements in the header of the migration file (three `UPDATE … JOIN condition_rules_backup` and one `DELETE FROM schema_migrations`). Rules saved after the migration are lost by this rollback.
- **Rolling forward again:** publishing v1.46.0 runs the migration again; it backs up only rows not already in the backup table and converts the older rules.
- Drop `condition_rules_backup` once the release has settled.
