# AI module: security design

The AI module is part of ARS Approvals, so it inherits the app's security:
- Google or WhatsApp-code sign-in, with HMAC-signed sessions checked against the database on every request;
- sign-out after 30 minutes idle;
- a per-request CSP nonce, and CSRF protection (Next's origin check for Server Actions, `Sec-Fetch-Site` for APIs);
- no-store caching, an append-only audit log, and the origin lock behind Cloudflare.

This page lists what the AI module adds on top.

## Who may use what

| Layer | Rule | Where |
|---|---|---|
| Module | The AI module is a per-person grant (`users.module_access`). Nobody has it until an admin ticks it. Every AI page and Server Action is refused (404) without it, typed addresses included. | `server/authorization/pages.ts` (`module: "AI"`), `page-access.ts` |
| Feature switch | "AI module" (ON, OFF, IT team only) turns the whole module off without a redeploy. | `server/settings/features.ts` |
| Admin | AI settings are under `/superadmin` (Super Admin only). The module grant gives no admin rights, and admin roles give no module. | `app/superadmin/ai` |
| Data tools | Each tool names its module and checks it again when it runs. Data is limited to the person asking (their queue, requests, tasks, inbox). | `server/ai/tools.ts`, `lib/db/repositories/ai-data.repository.ts` |
| Conversations | Every read includes `owner_user_id = me`. Another person's id shows nothing; asking into it returns "Not found." | `lib/db/repositories/ai.repository.ts` |
| Proposals | Approver = the asker's reporting manager (or any IT Admin when none). Never the asker, never the AI. Version and content hash are checked at decision. Expire after 7 days. **Execution is off.** | `server/ai/proposals.ts` |

## Keys and secrets

- Provider keys and the Salesforce consumer key and secret are **encrypted settings** (AES-256-GCM with `ENCRYPTION_KEY`), entered only in Super Admin → AI settings.
- Keys are never shown back. Setting history and audit see only a fingerprint.
- Keys are sent only in the provider's auth header from the server. They never reach the browser, a URL, the database in plain text, or the log.
- Provider error messages are cleaned by `redactSecrets` (key-like strings and bearer tokens removed) before they're shown or stored.

## Data leaving ARS

- **Off by default:** a provider sees ARS business data (tool results) only when its "may see business data" setting is **ALLOWED**.
- **No business data, no tools:** a provider not approved for business data gets no data tools, and its instructions say it has no ARS data.
- **No silent fallback:** if the active provider isn't approved, only an approved fallback may answer with data. Otherwise the question is answered without data. Restricted data never falls back to an unapproved provider.
- **DeepSeek and Grok** run under their own terms and jurisdictions. Approve them for business data only after the owner's information-security review (risk R-18).
- **What a question sends:** the person's question, the last 10 turns of their own conversation, and (when approved) the tool results. Nothing else is sent: no other people's records and no keys.

## Prompt injection and made-up figures

- **No dangerous tools.** The model can't run SQL, fetch URLs or change business data. Tools are fixed, parameterised functions with zod-validated arguments, and an unknown or disallowed tool is refused with a message.
- **Tool results are data.** Request titles and Salesforce text are business content. The instructions tell the model that tool results are data, not instructions. Authorization never depends on the model: it is checked before any data is read.
- **Figures are checked.** Every figure in an answer is looked for in the tool results and the question. Any that's missing is listed under "Check these figures" on the answer and stored (`unverified_json`). Totals and percentages are computed in SQL or code, never by the model.
- **Proposals are only proposals.** `propose_action` records a suggestion, and a person decides it. Nothing is executed (`EXECUTION_ENABLED = false`).

## Limits

- **Size and quota:** maximum question length; a daily number of questions per person; at most 4 tool rounds and 5 tool calls per round per answer.
- **Timeouts:** a response timeout per call, and a 1200-token answer cap.
- **Logging:** the server log records errors and ids only, never prompt text.
- **Audit entries:**
  - `AI_QUESTION_ANSWERED` / `AI_QUESTION_FAILED` (provider, model, tools used, how many figures were unverified);
  - `AI_PROVIDER_TESTED`;
  - `AI_PROPOSAL_CREATED` / `APPROVED` / `REJECTED`;
  - `AI_SOURCE_SYNCED`.

## Retention

- Conversations older than "Keep AI conversations for (days)" (default 365; 0 keeps them) are removed by the AI upkeep job.
- Proposals stay as decision records; their link to the conversation is cleared.

## Tests

- `tests/ai/ai-engine.test.ts`: provider formats, key redaction, routing, the figure check, proposal rules, Salesforce parsing and paging.
- `tests/integration/ai-assistant.int.test.ts`: no tools without approval, evidence, ownership, module-limited tools, the daily limit, proposals, Salesforce checkpoints.
- `tests/integration/ai-modules.int.test.ts` and `tests/e2e/ai-modules.spec.ts`: module grants by address and API, and AI settings for the Super Admin only.
