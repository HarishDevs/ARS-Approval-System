# AI module: architecture

**Status:** decided 24 Oct 2026 (owner answers, see §1). Built on branch `feature/ai-module` in a separate worktree; `main` and the live site are untouched until the owner merges and publishes.

## 1. Owner decisions (24 Oct 2026)

| Question | Answer | Consequence |
|---|---|---|
| Where does the AI engine run? | **API-based only** | No local model (Ollama) and no Python server. The AI layer is TypeScript inside the app and calls hosted model APIs. It runs on the existing GoDaddy Node.js hosting. |
| Separate app or one? | **A single application** | AI is the fourth module **inside** ARS Approvals: same sign-in, sessions, users, database and deployment. No second app, no cross-app SSO. |
| Repository | **The same existing repository** | Work happens on branch `feature/ai-module` in its own worktree (`D:\Omniroute\ars-ai-module`). `main` stays as is until the owner approves a merge. |
| Model providers | **Claude, ChatGPT, Grok, DeepSeek**; switchable | One adapter per provider behind one interface. The Super Admin picks the active provider and a fallback, and switches at any time. Keys are stored encrypted in settings. |

This supersedes the "independent codebase, FastAPI, Ollama, separate subdomain" parts of the original brief. The brief's other requirements still apply in full:
- server-side module permissions;
- evidence and freshness on answers;
- read-only connectors;
- human approval of proposals, with execution disabled;
- audit, quotas, tests and rollback.

## 2. How the module fits the existing app

```
app/users/ai/*            AI pages (Dashboard, Assistant, Business Intelligence, Insights,
                          Data sources, Reports, Activity history); AI Settings under /superadmin/ai
features/ai/*             AI UI (chat, evidence panel, freshness badges, provider switch)
server/ai/
  providers/              anthropic.ts · openai.ts · xai.ts (Grok) · deepseek.ts · fake.ts (tests)
  provider.ts             one interface: chat(messages, tools, limits) → text + tool calls + usage
  routing.ts              which provider may take this request (data class, approvals, quota, health)
  orchestrator.ts         tool loop: the model asks for tools, the server runs them, the model answers
  tools/                  approved, parameterised analytics functions (no free-form SQL)
  validate.ts             every number in the answer must come from a tool result; evidence present
  usage.ts                tokens, cost, per-user and global limits
server/modules/access.ts  module grants (APPROVAL, TASK, INFORMATION, AI): read, check, change
server/connectors/*       Salesforce, Oracle, reporting views (read-only), sync runs, freshness
server/proposals/*        AI proposal → human decision; execution disabled
lib/db/repositories/ai-*  SQL for all of the above
database/migrations/      additive migrations (new tables only, plus a safe backfill of module grants)
```

## 3. Module access (Phase 3)

- **Modules:** `APPROVAL`, `TASK`, `INFORMATION`, `AI`. Stored per person in `user_modules`.
- **Where they're set:** a "Module access" group of check boxes in Add user and Edit user. The users list shows a person's modules and can be filtered by them.
- **What a module grants:** its pages, Server Actions, API routes and data. Each users-area page in `server/authorization/pages.ts` names its module. The existing page-access check (`checkPageAccess` / `checkPageKey`, called by `requireArea` and `requireApiArea` in every page, action and route) refuses a page whose module the person lacks. So typing the address or calling the API directly is refused too, with the same plain 404.
- **Shared pages** (Overview, Calendar, Notifications, Profile, Help, Analytics) stay open to everyone. What they show follows the person's modules (e.g. no task tiles without Task).
- **Admin roles are separate.** IT Admin and Super Admin manage the app; they don't imply modules. The **Super Admin** is exempt from module checks, as from page access (D-039). Everyone else needs the module.
- **Changing modules:**
  - needs IT Admin (another IT Admin's modules: Super Admin only, as for their contact details);
  - nobody changes their own modules;
  - saving name or email never touches modules (they're saved only if the form sent them);
  - every change is audited with before and after.
- **Existing users (backfill):** everyone gets **Approval, Task and Information**, which is exactly what they can use today, and **not AI**. Nobody gains access. New users default to the same three; AI is ticked deliberately.
- **AI tools follow modules too.** A question about approvals runs approval tools only if the person has Approval, and so on.

## 4. AI request flow (Phase 5)

1. The Assistant page posts a message (Server Action → `requireApiArea("users", { page: "users.ai_assistant", change: true })`), so the AI module, page access and session are all checked.
2. **Limits:** request size, the per-user and global daily quota, and the conversation must belong to the person (checked in SQL).
3. **Routing:**
   - the tools this person may use set the **data classes** in play;
   - the active provider is used if it is approved for those classes and is healthy; otherwise the fallback, under the same test;
   - otherwise a clear "AI isn't available for this kind of data" message.

   No silent fallback to an unapproved provider.
4. **Tool loop:** the model may call only registered tools. Each tool:
   - validates its arguments (zod);
   - re-checks the person's modules and data scope;
   - runs a fixed, parameterised query.

   Numbers come from SQL or code, never from the model.
5. **Validation:**
   - figures in the answer must appear in tool results;
   - evidence references are attached;
   - freshness labels are shown;
   - "Verified" and "Possible explanations" are kept apart;
   - missing data is said plainly.
6. **Audit and usage:** who, which tools, which provider and model, tokens, cost and time. Prompt text is kept only as long as the retention setting allows and is never written to the server log.

## 5. Providers

| Provider | API | Notes |
|---|---|---|
| Claude (Anthropic) | Messages API with tool use | |
| ChatGPT (OpenAI) | Chat Completions / Responses with function calling | |
| Grok (xAI) | OpenAI-compatible API | |
| DeepSeek | OpenAI-compatible API | Data is processed by a provider outside India, under its own terms; by default no business-data class is approved for it (see `security-design.md`) |

For each provider the Super Admin sets:
- enabled or not;
- model name;
- API key (encrypted; shown only as "saved");
- the data classes it may process;
- a timeout;
- a price per million tokens (for cost tracking).

There is one **active** provider and one **fallback**. A **Test** button sends a harmless request and records the result.

## 6. Data and connectors (Phase 6, owner approvals needed)

- **ARS's own data (Approval, Task, Information):** read directly through new read-only repository functions in this app. It's the same database, so no new connection is needed, but always scoped by the person's modules and visibility rules.
- **Salesforce:** OAuth 2.0 for a dedicated read-only integration user; objects and fields discovered before mapping; sandbox first.
- **Oracle ERP:** read-only reporting views through an approved account. The host must be able to reach it outbound; since GoDaddy can't reach an internal Oracle server, a small relay or export may be needed. *(open)*
- **Freshness:** sync runs record status and freshness per dataset. A failed run keeps the last good snapshot and shows the data as stale.

## 7. Release and rollback

- Everything is additive: new tables, new pages, new settings. The only change to existing behaviour is module access, which the backfill makes neutral for current users.
- **Off switch:** Super Admin → AI Settings → "AI module available" (off by default after deploy) hides the AI module for everyone without a redeploy.
- **Rollback:** switch it off; if needed, redeploy the previous tag. The new tables can stay; nothing in the old code reads them.
