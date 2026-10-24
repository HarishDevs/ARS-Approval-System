# Pic bot - ai: deployment guide (GoDaddy Node.js Hosting)

Verified against this project's own deployment (`docs/DEPLOYMENT.md`):
- GoDaddy Node.js Hosting, Node 22, build `npm run build`, start `npm start`;
- environment variables in the app's settings;
- persistent disk under `/private`;
- Cloudflare in front;
- the owner publishes manually from GitHub `main`.

Pic bot needs **no new service**: no Redis, no workers, no WebSockets.

## 1. Environment

No new **required** variable.

| Variable | Needed? | Purpose |
|---|---|---|
| `APP_BASE_URL` | Already set (`https://approval.arssteels.net`) | Builds the Salesforce callback URL |
| `ENCRYPTION_KEY` | Already set | Encrypts provider keys and Salesforce tokens. **Don't change it**, or saved keys and tokens can't be read |
| `AI_CLAUDE_BASE_URL` | Optional, normally **unset** | An approved gateway for Claude (https only). Tests point it at a local mock |

Provider keys and Salesforce app credentials are **not** environment variables. They're entered in Super Admin → AI settings, stored encrypted, and never shown again.

## 2. Release and migrations

1. Publish the release. `npm start` runs the migrations first. Migration `202610250900_pic_bot.sql` only **adds**:
   - `users.chat_modes` (default Approvals, Tasks, Information);
   - `users.salesforce_scope` (default NONE);
   - `ai_conversations.mode`;
   - `ai_messages.request_key`;
   - the table `ai_salesforce_connection`.
2. **Backup first:** the in-app daily backup, or `mysqldump`, before publishing (`docs/BACKUP_RESTORE_AND_ROLLBACK.md`).

## 3. After publishing: smoke test

1. `GET https://approval.arssteels.net/api/health` should return `"status":"ok"` and the new version.
2. Sign in as the Super Admin and open **Super Admin → AI settings**:
   - enter one provider's key and model, set **Active provider**, then **Save** and **Test**;
   - set that provider's **"may see business data"** (ALLOWED is needed for data chats);
   - check the switches: Emergency stop OFF, launcher ON, General chat as you decide, module chats.
3. In **Admin → Users & roles**, open a test person:
   - tick **AI** under Module access;
   - under **Pic bot - ai**, tick the chats they may use (e.g. Approvals);
   - **Save**.
4. Sign in as that person. The Pic bot logo appears at the bottom right. Open it, ask "What is waiting for me?", and check the answer shows **Based on 1 data source**.
5. Check someone **without** AI: no logo; `/users/ai` gives a 404.

## 4. Salesforce (when approved)

1. **Salesforce sandbox:** create a **Connected App** (or External Client App):
   - enable OAuth;
   - **callback URL** = the one shown on AI settings (`https://approval.arssteels.net/api/integrations/salesforce/callback`);
   - scopes `api` and `refresh_token`;
   - **Require PKCE**;
   - the refresh token policy as your org requires.
2. Use a **dedicated integration user** with a read-only profile or permission set limited to the objects Pic bot may read.
3. In AI settings, enter:
   - the environment (SANDBOX first) and, optionally, the My Domain URL;
   - the consumer key and secret;
   - the allowed objects and fields (e.g. `Account:Name,Industry;Opportunity:Name,Amount,StageName,CloseDate`).
4. Press **Connect Salesforce**, sign in as the integration user and approve, then press **Test connection** (it shows the API calls left today).
5. Give people a **Salesforce scope**:
   - **Own records** (matched by their email to an active Salesforce user);
   - or **All allowed**.
   - Tick **Salesforce data** in their chats.
6. Repeat in production after the sandbox trial. Switch **Also copy those objects hourly** ON only if you want the dashboard copy; live questions don't need it.

**Connect errors seen in the UAT sandbox trial (24 Oct 2026):**

| Salesforce shows | Cause | Fix |
|---|---|---|
| `redirect_uri_mismatch` | The app's Callback URL differs from the one on AI settings (http/https, port, trailing `/`), or the change has not propagated | Copy the callback URL from AI settings exactly; wait up to 10 minutes |
| `OAUTH_APPROVAL_ERROR_GENERIC`, with `error=invalid_scope` in the address | The app lacks **Manage user data via APIs (api)**. An app made for Salesforce Hosted MCP has only `mcp_api`, which Pic bot does not use | Edit the app → OAuth Scopes → add `api` (keep `refresh_token, offline_access`) → Save → wait |
| The browser can't open `…/api/integrations/salesforce/callback` | The ARS server at the callback address was not running (local testing) | Start it and reload the page within a few minutes (the code is single-use and short-lived), or press Connect again |
| The My Domain field rejects an `api.salesforce.com/platform/mcp/…` address | That is an MCP server address, not a login domain | Enter the org's My Domain, e.g. `https://yourorg--uat.sandbox.my.salesforce.com` |

The production app needs the production callback `https://approval.arssteels.net/api/integrations/salesforce/callback`; a sandbox app with only `http://localhost:3000/…` will not work from the live site.

## 5. Logs and monitoring

- **GoDaddy runtime log:** JSON lines. Search for `"Pic bot chat failed"`, `"AI answer failed"`, `"salesforce"`. Lines carry `requestId` (Cloudflare CF-Ray), never prompt text or tokens.
- **AI settings:** "Right now" (running and queued questions), "Usage by person", "Recent failed answers", "Security and setting events".
- **Audit log:** `AI_QUESTION_ANSWERED/FAILED`, `AI_PROVIDER_TESTED`, `AI_SALESFORCE_*`, `AI_CONVERSATION_DELETED`, `SETTING_CHANGED` (keys as fingerprints only).

## 6. Rotating secrets

| Secret | How to rotate |
|---|---|
| Provider key | Create a new key at the provider; AI settings → paste it in the key field → Save → Test; then revoke the old key at the provider |
| Salesforce app secret | Regenerate in Salesforce; AI settings → paste the new secret → Save; then **Reconnect** |
| Salesforce tokens | **Disconnect** (revokes and deletes them), then **Connect Salesforce** |
| `ENCRYPTION_KEY` | Not rotated in place: saved keys and tokens would become unreadable. Re-enter all keys after a deliberate change |

## 7. Rollback

| Situation | Action |
|---|---|
| Immediately, without a redeploy | AI settings → **Emergency stop: ON** (refuses every Pic bot request), or **Launcher: OFF**, or Feature switches → **AI module: OFF** |
| Salesforce | **Disconnect** |
| A release problem | Redeploy the previous tag (v1.15.0). The new columns and table are ignored by it; no down-migration is needed |
| Data | Restore the pre-release backup only if data itself is wrong (`docs/BACKUP_RESTORE_AND_ROLLBACK.md`) |

## 8. Post-deployment checklist

- [ ] `/api/health` OK with the new version
- [ ] AI settings: a provider **Test** passes; the business-data decision is recorded
- [ ] Emergency stop OFF; launcher ON; General chat set as decided
- [ ] A trial person sees the logo and gets an answer with evidence
- [ ] A person without AI sees no logo, and `/api/ai/conversations` returns 404 for them
- [ ] Salesforce (if approved): Connect, then Test, passes in the sandbox
