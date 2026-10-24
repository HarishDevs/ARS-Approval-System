# Pic bot - ai: implementation plan

**Baseline:** v1.15.0. Everything below **extends** the existing AI module. There's no second chat backend, admin system, provider integration or Salesforce connection.

## Precedence model (effective access)

`effective modes = global enabled modes ∩ the person's chat modes ∩ modes their modules allow`, and only if:
- the AI module is granted (`users.module_access` contains AI, or the person is Super Admin);
- the feature switch `features.ai` is on for them;
- the emergency stop `ai.emergency_stop` is off.

| Mode | Also needs |
|---|---|
| GENERAL | `ai.general_chat` = ON |
| APPROVAL / TASK / INFORMATION | That module granted |
| SALESFORCE | Salesforce connected; the person's Salesforce scope ≠ NONE |
| COMBINED | GENERAL plus at least one data mode |

- Administrator restrictions always win. A person's choice of mode selects among their effective modes and never adds to them.
- Re-evaluated on **every** request (questions, history reads, tool calls), so a revocation applies at once.

## Changes

| # | Change | Files | Data |
|---|---|---|---|
| P1 | Per-person chat modes and Salesforce record scope, edited on the user page (rules and audit as for modules) | `server/modules/chat-access.ts`, `server/admin/*`, `features/admin/UserForm.tsx`, `app/admin/users/*` | `users.chat_modes` SET default `APPROVAL,TASK,INFORMATION`; `users.salesforce_scope` ENUM(NONE, OWN, ALL) default NONE |
| P2 | Conversation mode and idempotency | `ai.repository.ts`, `assistant.ts` | `ai_conversations.mode`; `ai_messages.request_key` unique per conversation |
| P3 | Mode enforcement: tools and instructions per mode; general refused when not allowed | `assistant.ts`, `tools.ts` | — |
| P4 | Limits: per-minute per person (DB counter), concurrent per person and global (in-process semaphore, single-process host), bounded retry honouring Retry-After with jitter, cancellation via `request.signal` | `server/ai/limits.ts`, `providers.ts` | — |
| P5 | JSON chat API for the panel: POST message, GET conversations, GET one, DELETE one (owner only) | `app/api/ai/*` | — |
| P6 | Floating launcher + panel (reference image, accessible, theme tokens, mobile), on every user-space page where the person has an effective mode | `public/brand/pic-bot.jpg`, `features/ai/PicBot*.tsx`, `features/shell/AppShell.tsx` | — |
| P7 | Salesforce OAuth (web server flow, state + PKCE, encrypted tokens, refresh, revoke/disconnect, test) and a live allowlisted query tool (`WITH USER_MODE`, field allowlist, OWN = `OwnerId` of the person's Salesforce user by email) | `server/ai/connectors/salesforce-oauth.ts`, `salesforce-query.ts`, `app/api/integrations/salesforce/*`, `/superadmin/ai` | `ai_salesforce_connection` (one row, encrypted tokens) |
| P8 | Super Admin settings: general chat, modes enabled, launcher, emergency stop, limits, Salesforce allowlist and module mapping; usage by person, errors, security events | `definitions.ts`, `/superadmin/ai` | settings |
| P9 | Tests: unit, integration (modes, revocation, isolation, idempotency, limits, Salesforce OAuth and query), e2e (launcher and panel, unauthorized users), 10-client concurrency test | `tests/**` | — |
| P10 | Documents: deployment, security, concurrency report, implementation report, feature verification; `.env.example` | `docs/CHATBOT_*` | — |

## Risks and rollback

- **Migrations:** additive only (new columns with safe defaults, a new table). Rollback = redeploy v1.15.0; it ignores the new columns and table.
- **Emergency:** `ai.emergency_stop` = ON, or the `features.ai` switch OFF. Both take effect at once without a redeploy.
- **Salesforce:** **Disconnect** revokes the token and deletes it from the database.
- **Approvals needed:** before any real Salesforce connection (a connected app in a sandbox first), and before any provider is allowed business data.
