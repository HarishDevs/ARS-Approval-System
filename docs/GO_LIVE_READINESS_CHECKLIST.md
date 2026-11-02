# Go-live readiness checklist

Current: **v1.46.0 (2 Nov 2026)**, below. The v1.6.0 checklist is kept further down as history.

# v1.46.0 (2 Nov 2026)

For the owner and IT, **in order**. Nothing here was done on production by Claude. Each line says who acts and how to check. Details are in `docs/DEPLOYMENT.md` (part named in each line).

## Readiness verdict

| Area | State |
|---|---|
| **Code** | Built and tested locally; the test results are reported with the release (work log), not here. CI must be green on the release commit. |
| **Database** | **One migration runs on start:** `202611021000_unify_condition_rules.sql`. It converts saved form rules to the one rule shape, after copying each changed row to `condition_rules_backup`. It is a data change, not only an addition: going back to v1.45.0 needs the rollback in the file's header (DEPLOYMENT Part W). |
| **Open security items** | Origin lock optional (V181-A10, Q-021); database clock not yet checked on live (V181-A4, Q-020). See SECURITY_AND_AUTHORIZATION_REVIEW Part A §A2. |
| **Recovery targets** | Approved by the owner on 2 Nov 2026: RPO 24 h, RTO 4 h. They hold only once the encrypted off-site copy (step 8) runs. |
| **Not covered** | No load test at production volume on GoDaddy, no external penetration test, no real-device test (step 12). |

## Steps

| # | Step | Who | Check |
|---|---|---|---|
| 1 | **Back up now** (Super Admin home) and download the file off GoDaddy | Super Admin | Today's backup listed; file saved off the server |
| 2 | On the build: **`npm ci`** (no new package in v1.46.0; the Google Drive copy uses plain HTTPS) | IT / GoDaddy build | Build log ends without errors |
| 3 | GoDaddy → **Publish** from `main` (tag `v1.46.0`) | IT | `/api/health` shows version 1.46.0, `database: ok` |
| 4 | **The migration runs on start** (`202611021000_unify_condition_rules.sql`) | automatic | Runtime log: `Applied 1 migration(s)`. Admin → a workflow with "show only when" rules: the rules show and a test request behaves as before |
| 5 | Set **`DB_POOL_SIZE`** to fit the hosted plan's connection limit (DEPLOYMENT B2) | IT | No "too many connections" in the runtime log |
| 6 | Open **`/api/health/deep`** on live | IT | `dbClockOffsetMinutes` is **0**. If not, tell the developer (V181-A4 / Q-020) before go-live |
| 7 | Set **`ORIGIN_SECRET`** and the Cloudflare Transform Rule, in that order (DEPLOYMENT E2), then publish | IT | Super Admin home: **Origin lock: on**; the site and the cron call (Part I, I2) still work |
| 8 | Set **`BACKUP_ENCRYPTION_KEY`** (owner keeps a copy off the server), then set up the **Google Drive backup**: shared drive folder, service account as Content manager, Super Admin → Settings → Google Drive backup, **Save**, **Test** (DEPLOYMENT Part W) | Owner / Super Admin | Test says "Connected as …"; next day Automation shows **Google Drive backup copy** OK and the folder holds `ars-db-….sql.gz.enc` and its `.sha256` |
| 9 | **WhatsApp templates switched on**: create, submit to Meta and make live each template the Super Admin home lists (DEPLOYMENT Part H) | Super Admin | The **WhatsApp templates** tile says all templates are live |
| 10 | **Google Calendar OAuth consent screen: External and published** (Q-024; DEPLOYMENT Part Q) | Owner (Google Cloud) | A second person connects a calendar; it still works after 7 days |
| 11 | **Key rotation and access clean-up** (GL-05 / P1-38): rotate every key or secret ever shared in a chat; remove developer access no longer needed | Owner / IT | Each provider's Test passes with the new key |
| 12 | **UAT on phones** (install, tabs, decide from the bar, notifications, the journey) and a computer, with test people only; include a break-glass dry run in a test window | Owner, IT, a few users | Signed off in PLAN-CHECKLIST (GL-01) |
| 13 | **Restore drill** on a real production backup, including one copy taken from Google Drive (RECOVERY_OBJECTIVES §5) | Super Admin, IT | Recorded in PLAN-CHECKLIST GL-04 with the time taken (must fit the 4-hour RTO) |
| 14 | **Pilot** with one department, then everyone (GL-07) | Owner | No SEV-1 or SEV-2 during the pilot week |

## After publishing, also check

- Super Admin → **Automation**: every job has a recent run; **Security records clean-up** and **Google Drive backup copy** appear (21 automations).
- Super Admin → **Retention & legal holds** says security records go after 90 days.
- Admin → Records → Requests shows the **Amount** column.
- A request whose approval has passed its valid-until date shows **Expired**.

## Rollback

1. Switch the feature off where a switch exists.
2. Redeploy `v1.45.0` **and** run the rollback statements in the header of `202611021000_unify_condition_rules.sql` (v1.45.0 can't read the new rule shape). Rules saved after the migration are lost by the rollback.
3. Restore the database only for data damage (last resort; owner approves).

---

# v1.6.0 checklist (history, unchanged)

For the owner and IT, in order. Nothing here was done on production by Claude: the live site still runs the version the owner last published. Each line says who acts and how to check. Evidence for the code side is in `docs/IMPLEMENTATION_REPORT.md`.

## 0. Readiness verdict

| Area | State |
|---|---|
| **Code and automated tests** | Green locally: lint, type-check, unit, integration and E2E (counts in the implementation report). CI must be green on the release commit (1.1). |
| **Database** | Six additive migrations. A backup immediately before publishing is required (1.2). |
| **Blocking owner items** | The cron secret (3.1, open since v1.4.0). Without it nothing scheduled runs: messages, reminders, backups, scheduled reports and alerts. |
| **Not production-ready claims** | No load test was run at production volume, and there is no external penetration test. See SECURITY_AND_AUTHORIZATION_REVIEW findings S-01 to S-07. |

## 1. Before publishing
| # | Step | Who | Check |
|---|---|---|---|
| 1.1 | GitHub Actions green on the v1.6.0 commit / tag `v1.6.0` | IT | All jobs green |
| 1.2 | Super Admin → Overview → **Back up now**; download the file off GoDaddy | Super Admin / IT | Today's backup listed; file saved |
| 1.3 | Read BACKUP_RESTORE_AND_ROLLBACK §4 (rollback levers) | IT | Done |
| 1.4 | Decide the first feature-switch settings. Suggestion: IT_ONLY for scheduled reports and alerts, and for amendments, during the first week. | Owner | Super Admin → Providers & security → Feature switches |

## 2. Publish
| # | Step | Who | Check |
|---|---|---|---|
| 2.1 | GoDaddy → **Publish** from `main` (tag `v1.6.0`) | IT | Build log ends without errors |
| 2.2 | The start command applies the six new migrations | automatic | `/api/health`: version 1.6.0, database ok |
| 2.3 | Super Admin → **Automation** opens; **Retention & holds** opens | Super Admin | Pages load |

## 3. Scheduled jobs (must be fixed)
| # | Step | Who | Check |
|---|---|---|---|
| 3.1 | The cPanel cron job sends the **same** secret as `JOB_RUNNER_SECRET` (DEPLOYMENT Part I) | IT | The manual I2 command returns `{"success":true,…}`, not 404 |
| 3.2 | After 10 minutes, Super Admin → Automation | Super Admin | Banner says the runner finished minutes ago; jobs show "Running" |
| 3.3 | Next day | Super Admin | Backup job OK; backups list shows the night's file |

## 4. Smoke test on live (about 20 minutes, test people only)
| # | Step | Check |
|---|---|---|
| 4.1 | Raise a test request with **Check before submitting** | Readiness panel shows; submit works |
| 4.2 | Approve it; open the request | "Checked at submission" card; timeline |
| 4.3 | Analytics (as IT, then as a requester) | Organisation scope only for IT; numbers match the test request |
| 4.4 | Reports → Request register → Excel, CSV, PDF | Three files download and open |
| 4.5 | Schedule the register to yourself, daily, at the next hour | An email arrives with the file (needs 3.1 and the email provider) |
| 4.6 | Admin → Needs attention | Opens; nothing unexpected listed |
| 4.7 | If amendments are on for a type: amend the test request | The amendment goes for approval; the original shows "Amended" after approval |
| 4.8 | Super Admin: place a legal hold on the test request, then try to delete it | Deletion refused; release the hold |
| 4.9 | Withdraw or delete the test requests | Done |

## 5. Owner decisions still open
| # | Decision | Where it shows |
|---|---|---|
| 5.1 | Retention durations (default: keep for ever) | Retention & holds dry run |
| 5.2 | Over-budget policy WARN or BLOCK (default WARN) | Super Admin → General |
| 5.3 | Department budgets for the financial year | Admin → Budgets |
| 5.4 | Which approval types allow amendments, duplicate checks, minimum files | Each type → Submission checks |
| 5.5 | Recovery time and recovery point targets | BACKUP_RESTORE_AND_ROLLBACK §2 |
| 5.6 | Whether exporting and scheduling need a separate permission (S-03) | Security review |

## 6. Rollback
See BACKUP_RESTORE_AND_ROLLBACK §4:
1. Switch the feature off.
2. Restore a workflow version.
3. Redeploy `v1.5.0`.
4. Restore the database (last resort).
