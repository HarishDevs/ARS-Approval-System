# 00 — Application discovery

| | |
|---|---|
| **Audit date** | 31 Oct 2026 |
| **Requested by** | The owner ("MASTER PROMPT: Independent end-to-end application audit") |
| **Target** | ARS-CMS (ARS Approval Platform) **v1.39.0**, tag `v1.39.0`, commit `0473f2560398844f875a3bec49206e13078d06d7`, branch `main` |
| **Audit environment** | The owner's Windows 11 machine. The production build (`next build`) was served on `http://localhost:3100`. MySQL 8 ran in Docker (`ars_approvals_test`, a throw-away database seeded by the e2e suite). The in-app browser (Chromium) was used for UI testing. |
| **Not available** | Production (approval.arssteels.net, GoDaddy cPanel), its database, DNS and SSL configuration, and live credentials for Resend, CEOITBox, Google and the AI providers. |

## Stack (verified from `package.json`, code)

| Layer | Finding | Evidence |
|---|---|---|
| Framework | Next.js 15.5.28 (App Router), React 19.1.0, TypeScript 5.7.3 | `package.json` |
| UI | Tailwind 3.4, ARS design tokens (light and dark), lucide-react icons, own components (`features/ui`) | `tailwind.config.ts`, `styles/` |
| Backend | Next.js server actions (42 files with `"use server"`) and 39 API routes (`app/api/**/route.ts`) | `find app -name route.ts` |
| Database | MySQL 8 via `mysql2` (no ORM): repositories in `lib/db/repositories`, 49 SQL migrations in `database/migrations` | `ls database/migrations` |
| Validation | zod 4 | `package.json` |
| Auth | Firebase (Google) sign-in, and User ID + password + WhatsApp OTP; HMAC-signed session cookie `ars_session` with a DB session row | `app/api/auth/*`, `tests/e2e/db.ts` |
| Roles | USER (`/users`), IT_ADMIN (`/admin`), SUPER_ADMIN (`/superadmin`); per-page access rules (Full / View only / Hidden) | `server/authorization/*` |
| Integrations | Resend (email), CEOITBox (WhatsApp), Google Calendar, AI providers (Claude, OpenAI, Grok, DeepSeek, Groq, Gemini, NVIDIA), Salesforce, PDF (pdf-lib) | `server/integrations`, `server/ai`, `docs/CEOITBOX-API.md` |
| Hosting | GoDaddy Node.js hosting (cPanel), cron job runner | `docs/DEPLOYMENT.md` |
| CI | GitHub Actions: lint, typecheck, unit, build, `npm audit --omit=dev`; integration (MySQL 8); e2e, QA and origin Playwright suites | `.github/workflows/*` |

## Size

| Item | Count |
|---|---|
| Pages (`page.tsx`) | 129 |
| API routes | 39 |
| Migrations | 49 (latest `202610311400_workflow_draft_revision.sql`) |
| Unit test files / tests | 88 / 767 |
| Integration test files / tests | 56 / 312 |
| E2E specs (main config) | 201 tests in 57 files, plus `playwright.qa.config.ts` and `playwright.origin.config.ts` |
| Docs | 52 files in `docs/`, plus the living files (`DEVELOPMENT-MEMORY.md`, `PLAN-CHECKLIST.md`, `FLOWS.md`) and an earlier audit in `application-audit/` |
| Commits | 139 |

## Environment variables (names only; values not read)

`config/environment.ts` validates `NODE_ENV`, `DB_HOST`, `DB_PORT`, `DB_NAME`, `DB_USER`, `DB_PASSWORD`, `SESSION_SECRET` and `ENCRYPTION_KEY`. Others are read where used: `APP_BASE_URL`, `JOB_RUNNER_SECRET`, `UPLOAD_DIR`, `ORIGIN_SECRET`, `LEGACY_HOSTS`, `AI_CLAUDE_BASE_URL`. Provider keys are not in the environment: they are AES-GCM encrypted settings, entered by the Super Admin. `.env*` is git-ignored (`.gitignore`).

## Runtime checks made at discovery

| Check | Result | Evidence |
|---|---|---|
| Server starts from the build | PASS | `/login` → 200 |
| Anonymous `/users` | PASS: 307 to `/login?next=%2Fusers` | curl output (session log) |
| Requester session `/users` → 200; `/admin` → 404 | PASS | curl output |
| Security headers on `/login` | PASS: CSP with nonce and `strict-dynamic`, HSTS, `X-Frame-Options: DENY`, `nosniff`, Referrer-Policy, Permissions-Policy, COOP | `curl -I` (in `10_SECURITY_AUDIT.md`) |
| Build | PASS: compiled in about 7.5 min on this machine | build output |

## Gaps in information

- There is no formal BRD or SRS document. Requirements live in `docs/requirements/`, `DEVELOPMENT-MEMORY.md` (D-numbered decisions), `PLAN-CHECKLIST.md` and `FLOWS.md`; see `18_DOCUMENTATION_AUDIT.md`.
- Production configuration, logs and backups were not accessible, so every production check is BLOCKED.
