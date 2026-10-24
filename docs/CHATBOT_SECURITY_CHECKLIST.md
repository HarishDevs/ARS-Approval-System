# Pic bot - ai: security checklist

Status: ✅ = implemented with test evidence · ⚠️ = implemented, with a limitation · ⏳ = needs the owner or an environment.

| Control | Status | Evidence |
|---|---|---|
| Unauthenticated users can't use chat endpoints | ✅ | Middleware returns 404 without a session cookie; `aiApiUser()` → `requireApiArea`; e2e "no AI module… 404" |
| Deactivated or revoked sessions rejected | ✅ | The session row and user are re-read on every request (`server/auth/session.ts`); existing session tests |
| AI module required; modules never imply each other | ✅ | `users.ai_assistant` page has `module: "AI"`, API `/api/ai/*` mapped to it; `module-access.test.ts`; e2e |
| Chat modes enforced on the server; the person's choice never adds access | ✅ | `effectiveModes()` (`server/ai/chat-access.ts`), re-read per request; `picbot.test.ts`; integration "modes the person may not use are refused" |
| Approval-only person can't reach Salesforce or other modules' data | ✅ | `toolsFor()` / `runTool()` re-check; integration "an Approval chat gets Approval tools only…" (the model's Salesforce and task calls refused) |
| General chat only when enabled; no data in general chat | ✅ | `ai.general_chat` default OFF; GENERAL gets no tools; integration test |
| Revocation applies to open chats | ✅ | Conversation mode re-checked each question; integration "revoking a mode applies… at once" |
| Emergency stop | ✅ | `ai.emergency_stop`; integration test; the Super Admin page banner |
| Conversation ownership (IDOR) | ✅ | Owner in every query (`ai.repository.ts`); integration and e2e (another person's id → 404 on GET/DELETE) |
| Idempotency, no duplicate charges | ✅ | `request_key` unique per conversation; integration "the same request key twice…" (one provider call) |
| AI keys server-side only | ✅ | Encrypted settings; sent as headers only; integration (key not in the request body); `redactSecrets` unit test |
| Salesforce OAuth: state and PKCE validation | ✅ | Hashed single-use state tied to the Super Admin, 10-minute expiry, S256; integration (wrong state, other admin refused; `code_verifier` sent) |
| Salesforce tokens encrypted at rest, never sent to the browser or model | ✅ | Integration (database values aren't the plain tokens; token not in provider calls) |
| Salesforce refresh, expiry, reconnect, revoke | ✅ | Integration (refresh once on 401; `invalid_grant` → NEEDS_REAUTH); Disconnect calls `/services/oauth2/revoke` (unit-level only, not against a real org) |
| Salesforce query injection prevented | ✅ | Allowlisted objects and fields, typed values escaped, fixed operators, owner id pattern; `picbot.test.ts` injection cases |
| Salesforce object, field and record security | ⚠️ | `WITH USER_MODE` (Salesforce enforces sharing and FLS for the **connected** user); OWN scope adds `OwnerId` = the person's Salesforce user (matched by email). ALL scope shows whatever the connected user may see. **Each ARS person's own Salesforce sharing isn't applied** (one central connection). |
| Oversized results | ✅ | 50 rows, one page; COUNT() for totals |
| Prompt injection via questions or records | ✅ | Instructions treat tool data as data; tools re-authorize; no free-form SOQL/SQL/URL tools; figures checked |
| XSS from model output | ✅ | Plain text rendering (`whitespace-pre-wrap`); links only to the app's own paths (`messageView`) |
| CSRF | ✅ | `Sec-Fetch-Site` check for unsafe `/api/*` (middleware); Server Actions' origin check |
| Security headers and CORS | ✅ | Existing CSP nonce, HSTS, XFO, no ACAO (`middleware.ts`, `next.config.ts`) |
| Request size and abuse | ✅ | Question length limit, body schema (`zod`), per-minute (MySQL) and daily limits, per-person and global concurrency |
| Provider 429 and outages | ✅ | One retry honouring Retry-After ≤ 10 s with jitter; fallback provider only for retryable errors; unit tests |
| Logs | ✅ | No prompt text, tokens or keys logged; audit entries hold metadata only |
| Admin endpoints | ✅ | `/superadmin/ai`, Salesforce connect/callback, actions: `requireArea`/`requireApiArea("superadmin")`; e2e (IT Admin gets 404) |
| Dependency vulnerabilities | ✅ | `npm audit --omit=dev`: 0 (zod 4.6.7, next 15.5.28) |
| Data to external providers | ⏳ | Off by default per provider ("may see business data"). **The owner must approve each provider and check its data retention and training settings** (Anthropic, OpenAI, xAI, DeepSeek dashboards). |
| Real Salesforce connection | ⏳ | Not tested against a real org; needs a sandbox Connected App |

## Outstanding risks

1. **Central Salesforce connection.** Record visibility is the connected user's, narrowed by OWN scope. For per-person Salesforce sharing, each person would need their own OAuth connection. That's a separate, larger change.
2. **In-process concurrency counters.** They're correct for GoDaddy's single process. With more processes, the global limit applies per process.
3. **No streaming.** Long answers hold one request (up to the timeout). Stop cancels it.
