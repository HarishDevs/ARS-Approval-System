# Go-live readiness checklist (v1.6.0)

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
