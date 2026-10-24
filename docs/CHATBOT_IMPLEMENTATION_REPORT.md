# Pic bot - ai: implementation report (v1.16.0)

**Date:** 24 Oct 2026. Branch `feature/pic-bot` (from v1.15.0), merged into `main` as v1.16.0.

**Scope authorisation:** the master prompt excludes `approval.arssteels.net` unless authorised. When asked, the owner chose "ARS Approvals (I authorize it)".

## Changes

| Area | Files | Behaviour |
|---|---|---|
| Data | `database/migrations/202610250900_pic_bot.sql` | Additive only: `users.chat_modes` (default the 3 module modes), `users.salesforce_scope` (default NONE), `ai_conversations.mode`, `ai_messages.request_key` (unique per conversation + index), table `ai_salesforce_connection` |
| Access rules | `server/ai/chat-access.ts`, `server/ai/policy.ts` | Effective modes = global switches ∩ person ∩ modules (∩ Salesforce scope + connection); emergency stop; re-read on every request |
| Settings | `server/settings/definitions.ts` | `ai.emergency_stop`, `ai.launcher`, `ai.general_chat` (OFF), `ai.combined_chat` (OFF), `ai.module_modes`, per-minute and concurrency limits, history turns, output tokens, prices (for estimates); Salesforce OAuth settings. Client-credentials settings removed |
| User admin | `features/admin/UserForm.tsx`, `server/admin/user-input.ts`, `server/admin/users.ts`, `app/admin/users/*`, `admin-users.repository.ts` | "Pic bot - ai" section (modes and Salesforce scope), same rules as modules (not your own; another IT Admin's: Super Admin only), audited before/after |
| Orchestration | `server/ai/assistant.ts` | Mode per conversation; idempotency (answered / failed / pending); limits; instructions per mode; tools per mode; no fallback to an unapproved provider for data |
| Tools | `server/ai/tools.ts` | Mode-scoped; Salesforce `salesforce_objects`, `salesforce_query`, `salesforce_count` (read-only, allowlisted) |
| Salesforce | `server/ai/connectors/salesforce-auth.ts`, `salesforce-query.ts`, `salesforce.ts`, `lib/db/repositories/salesforce.repository.ts`, `app/api/integrations/salesforce/{connect,callback}` | OAuth web server + PKCE; encrypted tokens; refresh; NEEDS_REAUTH; revoke; test; live SOQL `WITH USER_MODE`, OWN scope by email; the hourly copy uses the same connection |
| Limits | `server/ai/limits.ts`, `server/ai/providers.ts` | Per-person (2) and global (10) concurrency with a bounded queue; per minute via MySQL; one Retry-After-aware retry with jitter; Stop aborts; optional `AI_CLAUDE_BASE_URL` (https or loopback only) |
| API | `app/api/ai/chat`, `app/api/ai/conversations`, `app/api/ai/conversations/[id]`, `server/ai/api.ts`, `server/authorization/pages.ts` | Session + AI module + page rule (`requireApiArea` in each route) + modes; owner-only; plain-text messages |
| UI | `features/ai/PicBot.tsx`, `features/shell/AppShell.tsx`, `public/brand/pic-bot.jpg`, `features/ai/AssistantForm.tsx`, `app/users/ai/assistant/page.tsx` | Floating launcher (supplied logo) and panel on every page for people with an effective mode; the full-page assistant gets the mode picker |
| Super Admin | `app/superadmin/ai/*`, `features/ai/AiAdminForms.tsx`, `lib/db/repositories/ai.repository.ts` | Salesforce card (status, callback URL, Connect/Test/Disconnect), live counts, usage by person, failures, events, emergency banner, cost estimate from entered prices |
| Data sources | `app/users/ai/data-sources/page.tsx`, `features/ai/sources.ts` | Salesforce status from the live connection |

## Tests run (24 Oct 2026, locally)

| Suite | Result |
|---|---|
| Lint (`eslint .`), typecheck | Clean |
| `npm audit --omit=dev` | 0 vulnerabilities |
| Unit (Vitest) | **617 passed** (new: `tests/ai/picbot.test.ts`, 20) |
| Integration (MySQL 8) | **262 passed** (rewritten `ai-assistant.int.test.ts`, 14; new `ai-concurrency.int.test.ts`, 4) |
| End to end (Playwright, production build) | **140 passed** (new `picbot.spec.ts`, 7; rerun after the route-guard change: 7 passed) |
| QA suite | **27 passed** |
| Origin lock | **1 passed** |

The first full run failed 3 unit checks: the route inventory requires `requireApiArea(` in each API route file. The guard call was moved into each route, then the unit suite (617) and Pic bot e2e (7) passed. CI results are checked after the push.

## Deployment requirements

- Nothing new on GoDaddy. Publish; the migrations are additive.
- Then: a provider key and Test; the business-data decision; tick AI and chat modes for a trial group. See `CHATBOT_DEPLOYMENT_GUIDE.md`.

## Remaining work and approvals

1. **Salesforce:** the UAT sandbox connected and passed Test connection on 24 Oct 2026 (V-11). Still to do: fill the allowed objects and fields, try a Salesforce chat (V-12), use a read-only integration user instead of a person's account, and connect production with the production callback URL.
2. **Provider approval:** for business data per provider, plus checks of their retention and training settings.
3. **Real-provider load:** concurrency was measured with a mocked provider only.
4. **Per-person Salesforce sharing** would need per-user OAuth. A future change, if wanted.
5. **Oracle ERP and Power BI:** not connected (environment and approvals).
