# Backup, restore and rollback (v1.6.0)

Unified prompt §2 and Addendum B (BE, BI). This document adds the v1.6.0 specifics to the existing procedures in `docs/DEPLOYMENT.md` (Part M: updating and rollback; Part P: backups and restore). Nothing here has been run against production.

## 1. What is backed up

| What | How | Where |
|---|---|---|
| Whole database | Daily by the job runner (`backup` automation): a gzipped SQL dump `ars-db-YYYYMMDD-HHMMSS.sql.gz` | `BACKUP_DIR` on the GoDaddy account |
| Attachment files | New files copied on the same run | `BACKUP_DIR/attachments` |
| Manual backup | Super Admin → Overview → **Back up now** | Same place |

Safety rules:
- **A backup never overwrites another backup.** Each file has a new timestamped name.
- **Old backups expire.** Files older than `BACKUP_KEEP_DAYS` (default 14) are removed by the backup run.
- **Download copies off the server.** Do this weekly: the GoDaddy account is a single location.
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

**Recovery point.** At most one day of data can be lost: backups are daily, plus any manual backup. Recovery time is the time of a phpMyAdmin import. RTO and RPO targets are for the owner to confirm (register BE-03).

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

There are no "down" migrations, by design: dropping tables would destroy history. A rollback never requires changing the database.

## 5. Records that can't be recovered

v1.6.0 has no permanent deletion. Requests are soft-deleted (Super Admin, with a reason, audited, blocked by legal holds), and retention is a dry run only. The operational data that housekeeping removes is:
- expired drafts;
- rate-limit records;
- sent queue rows after 30 days;
- message payloads after sending;
- job history after 90 days.

None of these is a business record, and rows tied to a held request or person are kept. Anything removed this way can only be recovered from a backup taken before the removal.
