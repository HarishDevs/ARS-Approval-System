# ARS-CMS (ARS Approval Platform)

## What it is
ARS-CMS, the Central Management System, is one web app for ARS Steels & Alloy International Pvt Ltd. **Its main purpose is multi-level approvals in any custom manner**: one configurable approval engine that replaces the 104 Asana approval projects. Around it sit Tasks & projects, Information, a shared Calendar (with Google Calendar sync), Analytics and the Pico Bot AI assistant (with Salesforce data).

- **Address:** https://approval.arssteels.net
  - `/users`: everyone. Home, Inbox, My Approvals (raise, approve, follow), Tasks & projects, Information, AI Assistant, Calendar, Analytics, Profile.
  - `/admin`: IT team. Approval types (Form Designer, Workflow Designer, DoA), custom approval, task and information set-up, reminders and escalations, AI rules, users and organisation, import, records, reports and dashboards.
  - `/superadmin`: itadmin@ only. Settings console (providers, security), integrations (Google Calendar, Salesforce), AI settings, page access, WhatsApp templates, automation, retention, message deliveries, audit log and export, sign-in history, backups.
- **Status:** v1.39.0 (31 Oct 2026), live on GoDaddy behind Cloudflare. The current version is always the top entry of [docs/RELEASE-NOTES.md](docs/RELEASE-NOTES.md); see also `PLAN-CHECKLIST.md` → Now / Next and [docs/KNOWN_ISSUES.md](docs/KNOWN_ISSUES.md).

## How to run it
- **Locally:** see "Run it locally" below (Node 20+, Docker for MySQL 8).
- **Production:** `npm run build`, then `npm start`. `npm start` applies any new database migrations and the seed before `next start`; `npm run start:app` starts without them. Full procedure: [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md).
- **Before every push:** `npm run lint` (eslint over the whole repo) and `npm run typecheck`.

## Where the docs are
| Need | Document |
|---|---|
| Using the app | [docs/USER-GUIDE.md](docs/USER-GUIDE.md) |
| How it is built | [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md), [docs/DATA_MODEL.md](docs/DATA_MODEL.md), [docs/API_REFERENCE.md](docs/API_REFERENCE.md) |
| Deploying and running it | [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md), [docs/AUTOMATION_INVENTORY_AND_RECOVERY.md](docs/AUTOMATION_INVENTORY_AND_RECOVERY.md) |
| Backups, recovery, incidents | [docs/BACKUP_RESTORE_AND_ROLLBACK.md](docs/BACKUP_RESTORE_AND_ROLLBACK.md), [docs/RECOVERY_OBJECTIVES_AND_INCIDENT_RESPONSE.md](docs/RECOVERY_OBJECTIVES_AND_INCIDENT_RESPONSE.md) (draft) |
| What changed, what is open | [docs/RELEASE-NOTES.md](docs/RELEASE-NOTES.md), [docs/KNOWN_ISSUES.md](docs/KNOWN_ISSUES.md) |
| Module write-ups | `docs/ai-module/`, `docs/CHATBOT_*`, `docs/ANALYTICS_*`, `docs/ADMIN_CONFIGURATION_STUDIO_*` |
| Historical snapshots | `application-audit/`, `docs/development/`, `docs/APPLICATION_CURRENT_STATE_AUDIT.md` (not maintained) |

## Project files
| File | What it holds |
|---|---|
| [DEVELOPMENT-MEMORY.md](DEVELOPMENT-MEMORY.md) | Decisions, open questions, work log, features, reference notes |
| [PLAN-CHECKLIST.md](PLAN-CHECKLIST.md) | Every task as a checklist, guardrails, notification events, coverage map |
| [FLOWS.md](FLOWS.md) | All flows: Asana reference flows and new platform flows |
| [CLAUDE.md](CLAUDE.md) | Working rules for every session |
| `reference/` | Asana approval audit, rule notes, plan pages (v1–v3), earlier write-up |

## Stack
Next.js 15 (15.5.28) · React 19 · TypeScript · Tailwind (ARS tokens) · MySQL 8 · Firebase Auth (Google) · WhatsApp (CEOITBox) for codes and notifications · Resend email · GoDaddy Node.js Hosting behind Cloudflare.

## Run it locally
```bash
npm ci
npm run db:up          # MySQL 8 in Docker on port 3307
npm run db:migrate && npm run db:seed
npm run dev
```

## Tests
| Command | What |
|---|---|
| `npm test` | Unit tests (Vitest) |
| `npm run test:integration` | MySQL integration tests, including the backup/restore drill |
| `npm run test:e2e` | End-to-end tests on a production build (Playwright) |
| `npx playwright test -c playwright.qa.config.ts` | The QA suite from the owner's master prompt |
| `npx playwright test -c playwright.origin.config.ts` | Origin lock (after a build) |
| `npx playwright test -c playwright.perf.config.ts` | Load test: 50 people at once (not in CI) |

CI runs everything except the load test on every push to `main`.

Secrets are never committed. See `.gitignore`.
