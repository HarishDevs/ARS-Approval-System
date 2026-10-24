# Pic bot - ai: current-state audit (before this work)

This is the detailed, code-level view behind `CHATBOT_ARCHITECTURE_AUDIT.md`. The app-wide audit stays in `APPLICATION_CURRENT_STATE_AUDIT.md`.

## Request path of an AI question (v1.15.0)

1. The page `/users/ai/assistant` (Server Component) shows the conversation if `ownsConversation(me, c)` is true.
2. The form posts `askAction` (Server Action). That calls `requireApiArea("users", { page: "users.ai_assistant", change: true })`, which checks the session, area, AI module and page rule; then `featureOn("ai")`.
3. `askAssistant()`:
   - checks length, ownership and the daily count;
   - routes (`routeFor`: active → fallback; business data only to approved providers);
   - creates or reuses the conversation and stores the question;
   - runs the tool loop (`chat()` + `runTool()`);
   - runs the figure check and stores the answer with evidence;
   - writes the audit entry.
4. The provider call is `fetch` with `AbortSignal.timeout`. A non-retryable error stops; a retryable one tries the fallback.

## Findings

| # | Finding | Evidence | Severity |
|---|---|---|---|
| F1 | No way to restrict a person to module-only answers; general questions are always answered | `systemPrompt()` allows general help | Medium (policy) |
| F2 | Tools available = person's modules ∩ provider data approval; no per-person "Salesforce" permission beyond IT-only visibility of copied counts | `toolsFor()`, setting `ai.salesforce.visible_to` | Medium |
| F3 | Salesforce uses client credentials; there's no live query; record-level visibility is the integration user's | `server/ai/connectors/salesforce.ts` | High before any person-facing Salesforce answers |
| F4 | No per-minute or concurrency limits; a burst from one person or many people isn't bounded except by the daily count | `askAssistant()` | Medium |
| F5 | A provider 429 moves straight to the fallback, ignoring `Retry-After` | `providers.ts errorFor()` | Low |
| F6 | No idempotency: the same submit twice stores and pays twice | `askAction` | Low/Medium |
| F7 | No cancellation: a closed tab still waits for the provider | Server Action | Low |
| F8 | Conversations have no mode; a conversation could mix contexts if modules change | `ai_conversations` | Medium |
| F9 | The UI is a full page only; there's no launcher or panel | `app/users/ai/assistant` | Feature gap |
| F10 | Usage shows tokens per provider only; no per-person usage, error list or cost estimate | `/superadmin/ai` | Low |

## Verified working (kept)

- Module grants enforced by page access (by address and API).
- Owner checks in every conversation query.
- Keys encrypted, sent only in headers, redacted from errors.
- The figure check and evidence.
- Proposals with human approval and execution off.
- Daily limit.
- Retention job.
- Audit entries.

Tests: `tests/modules/module-access.test.ts`, `tests/ai/ai-engine.test.ts`, `tests/integration/ai-modules.int.test.ts`, `tests/integration/ai-assistant.int.test.ts`, `tests/e2e/ai-modules.spec.ts`.
