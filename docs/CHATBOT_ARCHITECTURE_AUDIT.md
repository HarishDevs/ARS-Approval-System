# Pic bot - ai: architecture audit

**Date:** 24 Oct 2026.
**Codebase:** ARS Approvals (`HarishDevs/ARS-Approval-System`). The audit started on branch `feature/pic-bot`, from v1.15.0 (`a212a11`).
**Authorization:** the owner explicitly authorized building Pic bot - ai into ARS Approvals (`approval.arssteels.net`) on 24 Oct 2026. The master prompt otherwise excludes that app.

## 1. Verified architecture

| Area | Finding | Evidence |
|---|---|---|
| Frontend | Next.js 15.5.28 App Router, React 19.1, TypeScript 5.7, Tailwind 3.4 with ARS tokens (light/dark via CSS variables). Server Components plus small client islands. No client state library. | `package.json`, `tailwind.config.ts`, `styles/` |
| Backend | The same Next.js process: Server Actions for changes; route handlers under `app/api/*`. Node 22 on the host (`.nvmrc`), Node 24 locally. | `app/**/actions.ts`, `app/api` |
| Database | MySQL 8 via `mysql2` (pool), raw parameterised SQL, additive SQL migrations run on every start (`npm start`). | `lib/db/client.ts`, `database/migrations`, `scripts/database/migrate.js` |
| Auth | Google (Firebase) or User ID + password + WhatsApp code. HMAC-signed cookie (`ars_session`) plus a database session row read on every request. Sign-out after 30 minutes idle; deactivation revokes sessions. | `server/auth/session.ts`, `lib/session/*` |
| Roles | `USER`, `IT_ADMIN`, `SUPER_ADMIN`, `EXPORTER` | `types/auth.ts` |
| Module permissions | **Exists (v1.15.0):** `users.module_access` SET(APPROVAL, TASK, INFORMATION, AI), enforced in page access for every page, action and mapped API. The Super Admin is exempt. | `server/modules/modules.ts`, `server/authorization/page-access.ts`, `pages.ts` |
| AI provider | **Exists (v1.15.0):** Claude, ChatGPT, Grok and DeepSeek behind `chat()`. Keys are encrypted settings (AES-256-GCM). Active and fallback provider; non-streaming. | `server/ai/providers.ts`, `server/ai/config.ts`, `server/settings/definitions.ts` (`ai.*`) |
| AI orchestration | **Exists:** a tool loop (4 rounds), module-scoped tools, a figure check, evidence, a daily limit, conversations owned in SQL, proposals with human approval (execution off). | `server/ai/assistant.ts`, `tools.ts`, `validate.ts`, `proposals.ts` |
| AI UI | **Exists:** full pages under `/users/ai/*` (Dashboard, Assistant, Insights, Data Sources, Reports, History) and `/superadmin/ai`. **No floating launcher or panel.** | `app/users/ai`, `app/superadmin/ai` |
| Salesforce | **Partly exists:** a read-only **client-credentials** copy job (hourly) into `ai_source_records`, with checkpoints. **No OAuth web-server flow, no PKCE, no stored refresh token, no live per-question queries, no field allowlist enforcement in queries, no connection test.** Never tested against a real org. | `server/ai/connectors/salesforce.ts`, `server/ai/jobs.ts` |
| Rate limits | A database-backed per-minute counter (`rate_limit_hits`), shared by app processes. The AI has a daily limit per person. **No per-minute limit, per-user concurrency limit or global concurrency limit for the AI.** | `server/security/limits.ts`, `lib/db/repositories/jobs.repository.ts` |
| Logging | JSON lines (`logError`/`logInfo`) with a request id (CF-Ray). Audit log in `audit_logs`. Prompt text is never logged. | `lib/logging/logger.ts` |
| Health | `GET /api/health`: version, database, job runner, storage; no secrets. | `app/api/health/route.ts` |
| Security headers | CSP with a nonce, HSTS, XFO DENY, nosniff, COOP, Referrer-Policy; `Sec-Fetch-Site` CSRF check for unsafe `/api/*`; origin lock. | `middleware.ts`, `next.config.ts`, `lib/security/csp.ts` |
| Tests | Vitest (unit 595, integration 252 against MySQL), Playwright (e2e 133, QA 27, origin 1). All green on v1.15.0 locally and in CI. | `tests/`, `.github/workflows/ci.yml` |
| Hosting | GoDaddy Node.js Hosting (cPanel). One Node process; build `npm run build`; start `npm start`; env vars in the app's settings; persistent disk only under `/private`; cron calls `/api/jobs/run` every 5 minutes. **No Redis and no workers.** WebSockets aren't used and aren't assumed. Long-held HTTP requests aren't documented by GoDaddy, so answers are returned in one response (no streaming). | `docs/DEPLOYMENT.md` |

## 2. Feature inventory against the master prompt

Statuses use the master prompt's vocabulary. "Before" means v1.15.0.

| Feature | Current implementation | Status (before) | Evidence | Risk or limitation | Action |
|---|---|---|---|---|---|
| Module registration and on/off | The AI module is a per-person grant plus the `features.ai` switch | Already implemented and verified | `module-access.test.ts`, `ai-modules.spec.ts` | Named "AI", not "Pic bot - ai" | Rename what users see to Pic bot - ai; keep codes |
| Floating launcher with the reference image | None | Not implemented | — | — | Add asset and launcher |
| Floating chat panel | None (full page only) | Not implemented | — | — | Add panel using the same backend |
| Chat modes (General / module / Salesforce / Combined) | One mode: tools follow modules; general answers always allowed | Partially implemented | `assistant.ts` | General chat can't be disabled; no explicit mode | Add modes + enforcement |
| User-level chat permissions | Only the AI module grant | Not implemented | — | — | Add per-user chat modes and Salesforce record scope |
| Super Admin chatbot settings | Providers, limits, retention, Salesforce copy | Partially implemented | `app/superadmin/ai` | No general-chat switch, no modes per module, no concurrency limits, no launcher switch, no emergency stop separate from the feature switch | Extend the same page and settings |
| Salesforce OAuth (web server, state, PKCE, refresh, revoke) | Client credentials only | Not implemented | `salesforce.ts` | Integration user sees what its profile allows | Add OAuth + token storage (encrypted) + test/disconnect |
| Salesforce live authorized queries | None (copy only) | Not implemented | — | — | Add allowlisted query tool (`WITH USER_MODE`, field allowlist, owner scope) |
| Approval-only scope enforcement | Tools filtered by module; re-checked at run time | Already implemented and verified | `ai-assistant.int.test.ts` (module-limited tools) | — | Extend to modes |
| Grounded answers | Evidence, figure check | Already implemented and verified | `ai-engine.test.ts`, `ai-assistant.int.test.ts` | — | Keep |
| Conversation ownership | Owner in every query | Already implemented and verified | `ai.repository.ts`, integration test | No idempotency on retry | Add a request key (unique) |
| Server-side keys | Encrypted settings; header only | Already implemented and verified | `ai-engine.test.ts` (redaction), integration (key not in body) | — | Keep |
| Rate limits and 429 handling | Daily limit; a 429 is classed retryable (moves to the fallback) | Partially implemented | `providers.ts` | No per-minute or concurrency limits; `Retry-After` not honoured | Add limits, a bounded retry honouring `Retry-After` |
| Cancellation | None | Not implemented | — | — | API route with `request.signal` passed to the provider |
| Concurrency (10 users) | Not measured | Not implemented | — | — | Add the 10-client test and report |
| Usage and cost | Tokens per provider (30 days) | Partially implemented | `/superadmin/ai` | No cost estimate, no per-user view, no error view | Add per-person usage and errors; cost only from configured prices (labelled estimates) |
| GoDaddy compatibility | v1.15.0 deploys as before | Already implemented and verified | CI, `DEPLOYMENT.md` Part R | No streaming | Document |

## 3. Risks found during the audit

1. **General chat can't be turned off.** In v1.15.0 any person with AI can ask non-business questions. That isn't a data leak, but it is a policy gap.
2. **The Salesforce copy uses an integration user.** Its data reflects the integration user's visibility, not each person's. A per-person scope is needed before any person reads Salesforce data through the AI.
3. **No concurrency guard.** Many simultaneous questions could exhaust the provider rate limit or the one Node process. The daily limit doesn't bound bursts.
4. **No idempotency.** A double-submit or a client retry could store a question twice and pay twice.
