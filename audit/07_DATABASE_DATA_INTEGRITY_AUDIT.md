# 07 — Database and data integrity audit (prefix DB)

| | |
|---|---|
| Target | ARS-CMS v1.39.0, commit `0473f2560398844f875a3bec49206e13078d06d7` |
| Database | `ars_approvals_test`, MySQL 8.0.46 at 127.0.0.1:3307 (test only) |
| Auditor | DB (database, workflow, integration, reliability) |
| Date | 31 Oct 2026 |
| Evidence folder | `audit/TEST_EVIDENCE/DB/` |

## 1. Method

1. **Real schema.** I read the schema read-only from `information_schema` with a small runner. It opens a session marked `SET SESSION TRANSACTION READ ONLY` and skips anything that is not SELECT, SHOW or EXPLAIN. The runner lives in the session scratchpad and is not part of the repo. The schema covers tables, columns, types, defaults, nullability, primary keys, foreign keys with their rules, unique keys, indexes and triggers.
   - Raw output: `01_schema_tables_columns.txt`, `02_keys_fks_indexes_triggers.txt` and `03_unconstrained_reference_columns.txt`.
2. **Migrations against the schema.** I compared every `CREATE TABLE` in `database/migrations/*.sql` (48 files) with the live table list, and read `scripts/database/migrate.js` and `seed.js` (`09_migrations_vs_schema.txt`).
3. **Orphans and consistency.** I ran read-only queries for orphans on every reference column that has no foreign key, plus checks for consistency between the workflow state and the task rows.
   - **Snapshot 1** was taken at about 16:57 UTC with 17 requests (`04_orphans_and_consistency.txt`, `05_self_approval_and_group_orphans.txt`).
   - **Snapshot 2** was taken at 17:30 UTC with 17,561 requests (`10_integrity_snapshot2_and_explain.txt`, `11_integrity_anomaly_breakdown.txt`).
   - **Snapshot 3** was taken at 17:37 UTC, while the lead's e2e suite was running on a freshly recreated database (6 requests, all written by the app) (`13_integrity_snapshot3_during_e2e_run.txt`).
   - The database is shared, and another suite reset and reseeded it between the snapshots. Every count is therefore a point-in-time figure, and snapshot 3 was taken mid-run.
4. **Index use.** I ran EXPLAIN on five hot queries copied from the repositories (`10_…`). I read a sample of the repository queries, not all 50 files.
5. **Code review.** I read `lib/db/transaction.ts`, `lib/db/client.ts`, the repositories that use `row_version`, `state_version` and `draft_revision`, `server/ops/backup.ts`, `server/ops/governance.ts`, `scripts/database/{migrate,restore,verify-backup}.js` and `docs/BACKUP_RESTORE_AND_ROLLBACK.md`.
6. **Nothing destructive.** I did not run `db:verify-backup`, because it needs a fresh empty database (CREATE DATABASE) and a restore. Nothing was written by hand.

## 2. Checks

| ID | Check | Method | Status | Evidence |
|---|---|---|---|---|
| DB-C01 | Inventory: 112 base tables, all InnoDB, utf8mb4_unicode_ci | information_schema | PASS | `01_…` (112 rows) |
| DB-C02 | Every table has a primary key | information_schema | PASS | `02_…`: "tables without PRIMARY KEY" query returns 0 rows |
| DB-C03 | Live schema matches the migrations | `CREATE TABLE` list compared with live tables | PASS | `09_…`: 110 tables in the migrations, 112 live; the extra 2 (`schema_migrations`, `schema_migration_progress`) are created by `migrate.js` itself. No table exists only in the migrations |
| DB-C04 | Foreign keys on obvious relationships | information_schema | PARTIAL | See note A below |
| DB-C05 | Indexes on WHERE/JOIN columns | EXPLAIN on 5 hot queries plus index list | PARTIAL (sampled) | See note B below |
| DB-C06 | Orphan rows on reference columns without a foreign key | 17 read-only orphan queries, run twice | PASS | See note C below |
| DB-C07 | Workflow state (`state_json`) against the columns and task rows | read-only queries | PASS for app-written rows | See note D below |
| DB-C08 | Users are never deleted, only made inactive | grep plus code review | PASS | See note E below |
| DB-C09 | Soft delete of requests | code review | PASS | See note F below |
| DB-C10 | Optimistic concurrency | code review | PARTIAL | See note G below |
| DB-C11 | Transactions (`withTransaction`) | code review | PARTIAL | See note H below |
| DB-C12 | Audit tables are append-only | triggers plus grep | PASS (with a deployment caveat) | See note I below |
| DB-C13 | Retention and legal holds | code review | PARTIAL | See note J below |
| DB-C14 | Migration runner: ordering, ledger, resume | code review; integration test cited | PASS (code review) | See note K below |
| DB-C15 | Migration runner: idempotency and concurrent runs | code review plus grep | PARTIAL | See note L below |
| DB-C16 | Backup creation design | code review | PASS (code review) | See note M below |
| DB-C17 | `db:verify-backup` design | code review | PASS (code review) | See note N below |
| DB-C18 | `db:verify-backup` / restore drill executed | — | NOT TESTED | Needs CREATE DATABASE and a restore, which this audit's rules do not allow. The lead can run `tests/integration/backup.int.test.ts` and `v170-bc.int.test.ts` |
| DB-C19 | `restore.js` safety | code review | PASS (code review) | See note O below |
| DB-C20 | Production database privileges | — | NOT APPLICABLE | Test account only (`02_…` SHOW GRANTS: ALL on 7 test databases). `scripts/database/check-privileges.js` exists for production |

### Notes on the checks

**A. Foreign keys (DB-C04).**
- 188 foreign keys exist; 2 of them are `ON DELETE CASCADE` (`my_task_placements.section`, `notification_rule_sends.rule`). All the others are NO ACTION, which suits "never delete".
- 41 `*_id`/`*_by` columns have no foreign key (`03_…`). Most are polymorphic by design (`audit_logs.entity_id`, `record_files.entity_id`, `info_targets.target_id`, `legal_holds.scope_id`, `project_members.member_id`, `work_*`).
- The ones that could have a foreign key but don't:
  - `notification_outbox.request_id`, which has no index either;
  - `ai_proposals.conversation_id`;
  - `tasks.root_task_id`, `tasks.series_id`, `tasks.assign_group_id` (self-references);
  - `task_comments.deleted_by`, `task_followers.added_by`;
  - `ai_salesforce_connection.connected_by`, `ai_sync_runs.started_by`;
  - `gcal_jobs.created_by`, `gcal_conflicts.resolved_by`, `gcal_links.user_id`;
  - `login_logs.session_id`.
- No orphans were found in them (DB-C06), so this is a risk, not a defect.

**B. Indexes (DB-C05).**
- The approver queue uses `idx_approval_tasks_queue`, the SLA scan uses `idx_approval_tasks_due`, the outbox scan uses `idx_notification_outbox_unsent`, and the task list uses `idx_tasks_assignee` (all in `10_…`).
- The duplicate check filters `JSON_EXTRACT(form_data_json)` with no JSON index. It is bounded by the `workflow_version_id` index (223 rows examined at 17.5k requests).
- `notification_outbox.request_id` and `ai_proposals.conversation_id` have no index. Both are only touched on small or batch paths.

**C. Orphans (DB-C06).**
- Both snapshots found 0 orphans on every check (`04_…`, `10_…`).
- My first `tasks.assign_group_id` check reported 2. That was my wrong assumption: the column references `tasks.id` (`migrations/202610301600…sql:3`), not `approver_groups`. Rechecked against `tasks`: 0.

**D. Workflow state against the columns (DB-C07).**
- Snapshot 3 (app-written rows only, taken during the e2e run): every invariant check returns 0. There are no open requests without a pending task, no APPROVED requests without an approval, no closed requests with a null `closed_at`, no state mismatches and no orphans (`13_…`).
- 0 of 17,561 rows have a `state_json.status` or `state_json.round` different from the columns. 0 pending tasks sit on closed requests, and there are 0 duplicate pending tasks.
- The other anomalies in snapshot 2 come from tests that insert rows directly, not from the app (`11_…`):
  - 12,927 IN_PROGRESS rows with no tasks, 3,660 APPROVED rows with no approval, and 4,295 closed rows with a null `closed_at`: all are `BULK-*` copies made by `tests/integration/search.int.test.ts:115`.
  - 1 deleted-but-open request: `records.int.test.ts:77`.
  - 1 pending task held by an inactive approver: `reliability.int.test.ts:69`.

**E. Users never deleted (DB-C08).**
- There is no `DELETE FROM users` anywhere in `server`, `lib`, `app`, `scripts` or `tests`.
- Deactivation is refused while the person has pending approvals, and it revokes their sessions (`server/admin/users.ts:211-218`).
- The id gap in snapshot 2 (max id 344, 342 rows) fits auto-increment gaps left by failed inserts, since no delete exists.

**F. Soft delete of requests (DB-C09).**
- Requests carry `deleted_at`, `deleted_by` and `delete_reason`.
- Deletion is refused under a legal hold (`server/approvals/delete.ts:28`) and closes open tasks the way a withdrawal does (`engine.ts:603-613`).
- `lockRequest` excludes deleted rows (`approvals.repository.ts:389-391`).

**G. Optimistic concurrency (DB-C10).**
- These are guarded correctly:
  - `approval_requests.state_version`, under `FOR UPDATE` plus `WHERE state_version = ?` (`approvals.repository.ts:389-421`, `server/approvals/service.ts:598-610`);
  - `tasks.row_version` (`tasks.repository.ts:177`, `server/modules/tasks.ts:239,312`);
  - `info_items.row_version` (`info.repository.ts:117`);
  - `workflow_versions.draft_revision` (`approvals.repository.ts:145`).
- **`projects.row_version` is incremented but never compared (DB-001).**

**H. Transactions (DB-C11).**
- `withTransaction` (`lib/db/transaction.ts`) commits, rolls back on any error and releases the connection. It is used in 27 files, and messages are queued in the transaction and sent after commit.
- Multi-statement writes outside one transaction:
  - `quickAddForMany` (`server/work/service.ts:871-890`, DB-007);
  - AI retention (`server/ai/jobs.ts:24-26`, DB-003);
  - the next recurring task, created in its own transaction after completion (`server/work/on-complete.ts:58-87`).

**I. Append-only audit tables (DB-C12).**
- 10 triggers block UPDATE and DELETE on `audit_logs`, `approval_events`, `request_comments`, `task_events` and `info_events` (`02_…`).
- grep finds no UPDATE or DELETE of these tables in the code.
- **Caveat:** the triggers in `202610160900_v190.sql` are `@optional` and are skipped when hosted MySQL refuses CREATE TRIGGER. That leaves an app-level guarantee only. Confirm with SHOW TRIGGERS in production.

**J. Retention and legal holds (DB-C13).**
- Holds block request deletion and outbox pruning (`governance.ts:30-36`, `outbox.repository.ts:61-68`). Retention of business records is a dry run (`governance.ts:116`).
- **AI conversation retention hard-deletes regardless of holds (DB-003).**

**K. Migration runner ordering (DB-C14).**
- `migrate.js` sorts the file names, records each applied file in `schema_migrations`, and saves progress per statement so a failed file resumes where it stopped.
- 48 files are applied (`04_…`), and `schema_migration_progress` is empty.
- `tests/integration/migrate.int.test.ts` ("stops at the failing statement, then carries on from it") was not re-executed by me.

**L. Migration idempotency and concurrent runs (DB-C15).**
- 0 of 48 files use IF NOT EXISTS, INSERT IGNORE or ON DUPLICATE (`09_…`), and there is no GET_LOCK. `npm start` runs migrate and seed on every start (`package.json` "start").
- See DB-002.

**M. Backup creation (DB-C16).** `server/ops/backup.ts`:
- uses a REPEATABLE READ consistent snapshot, read-only (`:68-75`);
- writes to a `.part` file and then renames it (`:153-154`);
- deletes old files only after the new one exists (`:156-165`);
- writes triggers without DEFINER (`:125-131`).

**N. `db:verify-backup` design (DB-C17).** `scripts/database/verify-backup.js`:
- refuses the app's own database and any non-empty one (`:47, :64-65`);
- compares row counts per table and the number of triggers.
- The behavioural append-only probe covers only `audit_logs` and `approval_events` (`:20`). The total trigger count would still catch a missing trigger.

**O. `restore.js` safety (DB-C19).** It requires `--confirm-database=<DB_NAME>` (`scripts/database/restore.js:38-41`). The documentation says to restore into a new database first.

### Status counts (07)

| Status | Count |
|---|---|
| PASS | 12 |
| PARTIAL | 6 |
| FAIL | 0 |
| NOT TESTED | 1 |
| BLOCKED | 0 |
| NOT APPLICABLE | 1 |
| **Total checks** | **20** |

- The PASS count includes DB-C12 (with its deployment caveat) and the checks marked "code review".
- The three defects below sit inside the PARTIAL checks: DB-001 in DB-C10, DB-002 in DB-C15, DB-003 in DB-C13.

## 3. Risks and recommendations (not defects)

- **R-DB-1. Missing foreign keys.**
  - Add foreign keys and indexes where the relationship is real: `notification_outbox.request_id`, `ai_proposals.conversation_id`, `tasks.root_task_id`, `tasks.series_id`, `tasks.assign_group_id`, `task_comments.deleted_by`, `task_followers.added_by`, the gcal `*_by` columns and `gcal_links.user_id`.
  - Orphans today: 0.
- **R-DB-2. No CHECK constraints for state.** Nothing in the database enforces the workflow-state invariants (for example, "closed status means `closed_at` is set"). Tests that write SQL directly have already produced thousands of inconsistent rows in the shared test database. Consider CHECK constraints such as `status IN (…) = (closed_at IS NOT NULL)`, or at least run the reconciliation check (BA-08) after test runs.
- **R-DB-3. Optional append-only triggers.** On hosted MySQL the triggers may be skipped. After deployment, verify with `SHOW TRIGGERS` (10 expected).
- **R-DB-4. Pool configuration.** The pool (`lib/db/client.ts:14-23`) has `connectionLimit: 10`, no `queueLimit`, and no per-query timeout. One hung query holds a connection indefinitely, and ten hung queries stall every request. See 12_RELIABILITY.
- **R-DB-5. Backup contents and storage.** The backups are plain gzip, unencrypted. They include password hashes, session ids and the outbox payloads (messages and links). Keep `BACKUP_DIR` private and encrypt the off-server copies.
- **R-DB-6. Shared test database.** The other suites reset `ars_approvals_test` while this audit ran, so these numbers can't be reproduced exactly. Run read-only integrity checks on a frozen copy.

## 4. Defects

| Defect ID | Module | Feature | Category | Description | Expected | Actual | Severity | Priority | Reproduction | Evidence | Root cause | Recommendation | Status |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| DB-001 | Work management | Project details edit | Concurrency / data integrity | Project details are saved last-writer-wins. `projects.row_version` is incremented but never checked. | Two owners editing the same project at once: the second save is refused as stale (as for tasks). | `UPDATE projects SET …, row_version = row_version + 1 WHERE id = ?`: there is no version predicate, and the UI sends no version. The second save silently overwrites the first one's name, privacy and dates. | Low | P3 | Two sessions open the project settings, both change fields and save; both get "Saved." and the first change is lost. | `lib/db/repositories/work.repository.ts:211-216`; `server/work/service.ts:127-145` (code review) | Optimistic locking implemented for tasks and info items, not projects. | Pass the row_version from the form and add `AND row_version = ?`; return "changed while you were looking". | Open |
| DB-002 | Database ops | Migration runner | Reliability / deployment | Migrations take no lock and are not idempotent, but run on every `npm start`. | Only one runner applies a file. A re-run after a crash is safe. | There is no `GET_LOCK`. 0 of 48 files use IF NOT EXISTS. If two app processes start together (a redeploy, or Passenger spawning workers), both can apply the same pending file. The second one fails on a duplicate CREATE or ALTER and the app does not start. The per-statement progress can be advanced by the wrong process. | Low | P2 | Code review. Not reproduced (it would need two concurrent starts against a database with a pending migration). | `scripts/database/migrate.js:76-128`; `package.json` "start"; `09_migrations_vs_schema.txt` | The runner assumes a single process. | Wrap the run in `SELECT GET_LOCK('ars_migrate', 60)` / `RELEASE_LOCK`, and re-read the ledger after taking the lock. | Open |
| DB-003 | AI module | Conversation retention | Data governance | AI conversation retention hard-deletes conversations and messages without checking legal holds, in three separate statements with no transaction. | Rows tied to a held person are kept (the documentation states this for housekeeping), and the delete is atomic. | `runAiStep` deletes every conversation older than `ai.conversation_keep_days` (500 at a time) with no `HELD_SQL` check. A REQUESTER-scope hold does not protect that person's AI chats. A failure between statements leaves proposals unlinked or messages removed while the conversation row remains. | Low | P3 | Set `ai.conversation_keep_days` above 0, place a REQUESTER hold on a user with old chats, and run the `ai` automation: the chats are deleted. | `server/ai/jobs.ts:19-27`; `server/ops/governance.ts:30-36`; `docs/BACKUP_RESTORE_AND_ROLLBACK.md` §5 (code review) | Retention was added after the holds design and doesn't reuse `HELD_SQL`. | Exclude owners under an active REQUESTER hold, and run the three statements in `withTransaction`. | Open |
