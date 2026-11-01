# Functional test results (v1.44.0 QA pass)

Totals for each suite are in `REGRESSION_TEST_RESULTS.md`. This table says which
tests cover each module. "Pass" means the named tests ran and passed on the final
build; nothing here is marked passed without a run.

| Module | Main flows | Covered by | Result |
|---|---|---|---|
| Sign-in and sessions | Google / password + WhatsApp code, lockout, sign-out, daily session, privileged accounts | e2e session specs, QA-AUTH-01 to 04, QA-SEC-06, `tests/auth/*` (incl. daily-privileged) | Pass |
| Approvals: predefined types | Raise, DoA routing, hold/resume, withdraw, reject, reopen, amend, bulk approve | approval-flow, v150, v160-smart-*, QA-BL-01 to 05, integration `approvals`, `amendments`, `bulk` | Pass |
| Approvals: New request (custom) | Levels, parallel, choice, work steps, FYI, background work, draft, raise again | v141, v142 (work + FYI + approval), v144 (background work + FYI + approval), v150 drafts, integration `journey` | Pass |
| Approval journey | Seal after submit, van beside the level, stamp/reload/drive, reject, return, flag, activities, live updates, no replay | `tests/journey/journey.test.ts` (13), v144 e2e (3), v141/v142 road tests, integration `journey` | Pass |
| Engine | Sequential, parallel, any-one / any-N, conditions, skips, blocks, delegation, background work | `tests/engine/*`, `tests/approvals/*` (incl. parallel-any), `tests/journey` | Pass |
| Tasks & projects | Create (Compact, Classic), My Tasks, boards, tables, periodic (anchor day), work-step and background tasks, highlight | v130–v139, v142, v144, `tests/work/*` (incl. recurrence-anchor), integration `work-*` | Pass |
| Inbox and notifications | Bell, Inbox views, Mentions, bookmarks, archive, preferences, deliveries | v190, v150 #6, v143 (Mentions), integration `inbox`, `delivery-idempotency` | Pass |
| Information (notices) | Send, acknowledge, read receipts (none under Try as) | v190, ai-modules, v1100-web e2e, integration `v190` | Pass |
| Phone layout | Tabs, Home, Approvals hub, Tasks +, Inbox, More, decision bar, switch to desktop | v143 (4), session9 and WEB-03 (rewritten), `tests/mobile/layout.test.ts`, mobile audit | Pass |
| Calendar, Analytics, Reports, AI | Views, chips, boards, exports, assistant (switched on) | v1110, v1120, v160-zanalytics, v160-zreports, ai-modules, picbot, integration `analytics`, `ai-*` | Pass |
| Admin and Super Admin | Users, workflows, designer, settings console, automations, health, audit | v1391, v1392, v160-reliability, job-runner, guard, integration `governance`, `ops-alerts` | Pass |
| Site-wide | Every reachable page, link and download for each role, desktop and phone | zz-site-audit | Pass |

## Gaps (stated)

- A confidential field's file is refused by code (QA-SEC-01) but no automated test
  downloads one yet.
- Real devices, push delivery to phones and WhatsApp/email delivery by the providers
  are not exercised (test database, no real messages sent, per the brief).
