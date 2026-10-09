# Go-live checklist (v1.5.0)

For the owner and IT, in order. Each line says who does it and how to check it. Nothing here was done by Claude on production; live checks are left for the owner.

## 1. Before publishing v1.5.0
| # | Step | Who | Check |
|---|---|---|---|
| 1.1 | GitHub Actions green on the v1.5.0 commit (checks, integration, E2E + QA + origin) | IT | All 3 jobs green |
| 1.2 | Super Admin → Overview → **Back up now** (a copy before the update) | Super Admin | Backups line shows today |
| 1.3 | Download that backup file to a safe place off GoDaddy | IT | File saved |

## 2. Publish
| # | Step | Who | Check |
|---|---|---|---|
| 2.1 | GoDaddy → **Publish** (or Redeploy) from `main`, tag `v1.5.0` | IT | Build log ends without errors |
| 2.2 | The start command applies the one new migration (additive) | automatic | `/api/health` says `version 1.5.0`, database ok |
| 2.3 | Response headers include `x-request-id` | IT | Browser dev tools → Network → any page |

## 3. Scheduled jobs (still open from v1.4.0)
| # | Step | Who | Check |
|---|---|---|---|
| 3.1 | The cPanel cron job sends the **same** secret as `JOB_RUNNER_SECRET` in GoDaddy (DEPLOYMENT Part I). Today `/api/health` shows `jobRunner: NEVER`, so the call isn't reaching the app with the right secret | IT | Run the I2 command by hand: it must answer `{"success":true,…}`, not 404 |
| 3.2 | After 10 minutes | IT | `/api/health` → `jobRunner` is a time, not NEVER; Message deliveries shows a green "Job runner" |
| 3.3 | Next day | Super Admin | Backups shows a backup from the night; no "Daily backup failed" alert |

## 4. Smoke test on live (about 15 minutes, with test people)
| # | Step | Check |
|---|---|---|
| 4.1 | Start a request, type a title, wait 2 s, reload | "Restored your draft"; discard it |
| 4.2 | Raise a small test request; approve it as the first approver from a phone | Cards on Waiting for me; the decision works |
| 4.3 | Search by its number | Found; another person (not on it) doesn't find it |
| 4.4 | Comment `@<approver User ID>` | The approver gets "You were mentioned" (inbox + email) |
| 4.5 | **Download PDF** on the request | A PDF with details, levels, history |
| 4.6 | Profile → Notifications → Settings: switch off one optional email; raise an FYI | Message deliveries shows SKIPPED / USER_PREFERENCE for that email; the inbox still has it |
| 4.7 | Admin → Workload | Numbers match Waiting for me |
| 4.8 | Help → Copy details for IT | Clipboard has a Reference, page, version |
| 4.9 | Withdraw the test request | Status Withdrawn |

## 5. Policy and people
| # | Step | Who |
|---|---|---|
| 5.1 | Tell staff: drafts, search, bulk approval, mentions, PDF and notification settings (USER-GUIDE §1–2, release notes) | Owner |
| 5.2 | Optional WhatsApp templates for "mentioned you" and "due soon" (today these go by inbox and email only) | Owner, in CEOITBox, then Super Admin → Templates |
| 5.3 | Answer Q-015 (break-glass and WhatsApp) | Owner |
| 5.4 | UAT with a few real approvers (GL-01), then the pilot (GL-07) | Owner |

## 6. Rollback
- Redeploy v1.4.0 in GoDaddy. The v1.5.0 migration only adds, so v1.4.0 runs on the newer database (it ignores the new tables).
- Drafts, saved views and notification choices are kept for when v1.5.0 comes back.
