# ARS Approval Platform

One configurable approval engine for ARS Steels & Alloy International Pvt Ltd. **Its main purpose is multi-level approvals in any custom manner.** It replaces the 104 Asana approval projects.

- **Address:** https://approval.arssteels.net
  - `/users`: everyone. Raise requests (predefined or custom), act on what waits for you, out of office, profile.
  - `/admin`: IT team. Approval types (form, levels, DoA, work and FYI steps), users and organisation, groups, calendar, import, dashboards.
  - `/superadmin`: itadmin@ only. Providers, security, WhatsApp templates, message deliveries, audit log and export, sign-in history, backups.
- **Status:** v1.4.0, live on GoDaddy behind Cloudflare. See `PLAN-CHECKLIST.md` → Now / Next, and `docs/APPLICATION_CURRENT_STATE_AUDIT.md`.

## Project files
| File | What it holds |
|---|---|
| [DEVELOPMENT-MEMORY.md](DEVELOPMENT-MEMORY.md) | Decisions, open questions, work log, features, reference notes |
| [PLAN-CHECKLIST.md](PLAN-CHECKLIST.md) | Every task as a checklist, guardrails, notification events, coverage map |
| [FLOWS.md](FLOWS.md) | All flows: Asana reference flows and new platform flows |
| [CLAUDE.md](CLAUDE.md) | Working rules for every session |
| [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md) | GoDaddy go-live, cron, backups, updates, troubleshooting |
| [docs/USER-GUIDE.md](docs/USER-GUIDE.md) | How staff, approvers and IT use the app |
| [docs/RELEASE-NOTES.md](docs/RELEASE-NOTES.md) | What changed in each version |
| `reference/` | Asana approval audit, rule notes, plan pages (v1–v3), earlier write-up |

## Stack
Next.js 15 · React 19 · TypeScript · Tailwind (ARS tokens) · MySQL 8 · Firebase Auth (Google) · WhatsApp (CEOITBox) for codes and notifications · Resend email · GoDaddy Node.js Hosting behind Cloudflare.

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
