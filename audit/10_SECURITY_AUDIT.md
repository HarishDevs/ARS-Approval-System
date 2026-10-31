# 10 Security audit: OWASP Top 10 (SEC)

Auditor: SEC · Target: ARS-CMS v1.39.0 (commit `0473f25`) · Date: 31 Oct 2026 · Server http://localhost:3100 (production build, `NODE_ENV=production`) against `ars_approvals_test`.

## 1. Method

- **Code and configuration review:**
  - `middleware.ts`, `next.config.ts`, `lib/security/*`, `server/security/limits.ts`, `server/auth/*`;
  - `server/attachments/*`, `server/modules/files.ts`, `app/users/profile-actions.ts`, `server/ai/*`, `server/integrations/*`;
  - `config/environment.ts` and the audit-log migration.
- **Static searches:**
  - string-built SQL: template literals inside `.query(` in `lib/` and `server/` (80 sites), each interpolation checked;
  - `dangerouslySetInnerHTML`, `innerHTML` and `eval`;
  - outbound `fetch`;
  - `recordAudit` actions.
- **Live checks:** headers with `curl -D`, cookie flags, CORS, cross-site POSTs, the Server Action origin check, and a few requests to show that limits trigger. No destructive or brute-force testing.
- **Dependencies:** `npm audit --omit=dev` and `npm audit`, run at 23:0x on 31 Oct 2026.
- **Evidence** (`audit/TEST_EVIDENCE/SEC/`):
  - `headers_cors.txt`
  - `npm_audit_omit_dev.txt`
  - `npm_audit_all.txt`, `npm_audit_all.json`
  - `server_action_origin_probe.txt`
  - `rate_limit_pdf.txt`
  - `auth_signin_probes.txt`
  - `rsc_layout_bypass_*.txt`
  - plus the files cited in 04, 05 and 06.

## 2. Checks

| ID | OWASP | Check | Method | Status | Evidence |
|---|---|---|---|---|---|
| SEC-C01 | A01 Broken access control | Roles, pages and records enforced on the server | HTTP + code review | FAIL | Mostly sound (05: 65 pages × 5 identities, IDOR on 7 record types, 168 guarded actions). But 4 Super Admin pages leak data to any caller over RSC. **SEC-02** |
| SEC-C02 | A01 | Path traversal on file reads | Code review + HTTP | PASS | Stored names are server-made (`YYYY/MM/<32 hex>`, modules/files.ts:35). Reads use `path.resolve` and a root-prefix check (modules/files.ts:112-117, photo route:22-23). `..%2F` in the photo id gives 404 (api_probes_rerun P9). |
| SEC-C03 | A02 Cryptographic failures | Encryption of secret settings | Code review | PASS | AES-256-GCM, random 12-byte IV, 16-byte tag, key must decode to 32 bytes, tag verified on decrypt (lib/security/encryption.ts:8-38). Encrypted settings are shown as `value:null` even in the leaked SEC-02 payload. |
| SEC-C04 | A02 | Password, OTP and token hashing; session signing | Code review | PASS | scrypt N=16384 with a 16-byte salt (password.ts:24-38). OTP, challenge, device and link tokens use HMAC-SHA256 (hashing.ts). Session cookie HMAC with timingSafeEqual and a domain prefix per purpose (`session:`, `purpose:`, `device:`, `ars-path:`). `SESSION_SECRET` must be at least 32 characters (environment.ts:24). |
| SEC-C05 | A02 | HTTPS enforcement | Code review + HTTP | PASS | HSTS `max-age=31536000; includeSubDomains`. CSP `upgrade-insecure-requests`. Plain HTTP via Cloudflare is redirected with 308 (middleware.ts:86-91). `Secure` cookies in production. |
| SEC-C06 | A03 Injection: SQL | String-built SQL with user input | Code review (static) | PASS | No `.query(` interpolates request data. Interpolations are constants or allow-listed:<br>• `NOT_SNOOZED(reason)` uses a `StuckReason` enum (ops/stuck.ts:35);<br>• update `keys` are filtered by `allowed.includes` (tasks.repository.ts:174, info.repository.ts:115);<br>• `orderBy(kind, filter)` returns constants;<br>• LIKE terms escape `%`, `_` and `\`;<br>• everything else is placeholders.<br>HTTP: `' OR 1=1 --` as a login ID and as a quick-search term are handled as data (S7, P14). |
| SEC-C07 | A03 Injection: SOQL | Salesforce query building | Code review | PASS | Field and object names must match `^[A-Za-z][A-Za-z0-9_]{0,79}$` and an allow-list. Literals are quoted and escaped, ids are pattern-checked (salesforce-query.ts:20, 201-219, 257-281). |
| SEC-C08 | A03 Injection: XSS | Raw HTML rendering | Code review | PASS | No `dangerouslySetInnerHTML` anywhere. The one `innerHTML` (features/admin/RulesEditor.tsx:143, admin-only AI rules editor) is built by `markdownToHtml`, which escapes first and allows only http(s) and mailto links (RulesEditor.tsx:26-37). Email is plain text only (no `html` is built). User text is rendered through React escaping. The nonce CSP with `strict-dynamic` blocks inline script. |
| SEC-C09 | A03 | Uploaded file content | Code review | PASS | Extension allow-list plus magic-byte sniffing, 10 MB limit, 5 per upload, 20 per record, sanitised names (attachments/files.ts:52-110). No SVG or HTML. Inline display only for png, jpeg, webp and pdf, under `CSP: default-src 'none'; sandbox`. Everything else downloads with `nosniff`. Profile photos go through `checkPhoto` (magic bytes) and are served with `default-src 'none'`. |
| SEC-C10 | A04 Insecure design | Anti-enumeration on sign-in | HTTP | FAIL | The same message, but a measurable timing difference. **SEC-01** (04) |
| SEC-C11 | A04 | Business-logic guards (self-approval, last Super Admin, IT Admin limits, try-as view-only) | Code review | PASS | user-rules.ts:37-80, try-as.ts:27-35, session.ts:72-80. Approval-engine self-approval is covered by the engine auditor. |
| SEC-C12 | A05 Security misconfiguration | Security headers (live) | HTTP | PASS | On `/`, `/login`, `/users` and `/api/*`:<br>• `X-Frame-Options: DENY`<br>• `X-Content-Type-Options: nosniff`<br>• `Referrer-Policy: strict-origin-when-cross-origin`<br>• `Permissions-Policy: camera=(), microphone=(), geolocation=()`<br>• HSTS<br>• `COOP: same-origin-allow-popups` (needed for the Firebase popup)<br>• `Cache-Control: private, no-store`<br>• per-request nonce CSP<br>• no `X-Powered-By` (headers_cors.txt) |
| SEC-C13 | A05 | Content-Security-Policy strength | HTTP + code review | PARTIAL | `script-src 'self' 'nonce-…' 'strict-dynamic' https://apis.google.com`, `frame-ancestors 'none'`, `object-src 'none'`, `base-uri 'self'`, `form-action 'self'`. Remaining weakness: `style-src 'unsafe-inline'` (csp.ts:68; needed by Next.js and next/font). This is low risk because styles can't run code. Recommendation only. |
| SEC-C14 | A05 | CORS | HTTP | PASS | No `Access-Control-Allow-*` header is ever sent. Preflight gives 204 with no grant (06 API-12). |
| SEC-C15 | A05 | Error handling (no stacks or internals) | HTTP + code review | PASS | API envelope with a generic message and reference (api-response.ts). `app/error.tsx` shows only `digest`, and `global-error.tsx` shows nothing from the error. A cross-origin Server Action gives a digest only. `productionBrowserSourceMaps: false`, `poweredByHeader: false` (next.config.ts:21-22). |
| SEC-C16 | A05 | Origin lock (`ORIGIN_SECRET`) | Code review | PASS | Constant-time comparison of `x-ars-origin`, 403 otherwise, at least 24 characters (middleware.ts:57-64, environment.ts:28). It is not set on the local test server, so live enforcement is NOT APPLICABLE here. Production setting not verifiable. |
| SEC-C17 | A06 Vulnerable components (production) | `npm audit --omit=dev` | Command | PASS | `found 0 vulnerabilities` (npm_audit_omit_dev.txt). Next 15.5.28. |
| SEC-C18 | A06 (development) | `npm audit` (all) | Command | PARTIAL | 14 moderate, 0 high, 0 critical. All come from `minimatch <11.0.1` (GHSA-g3hv-75wg-m249, ReDoS via globparts) through eslint and typescript-eslint tooling. Development-only and not shipped. The fix needs `--force` (breaking). Recommendation: update eslint and typescript-eslint when compatible versions exist. |
| SEC-C19 | A07 Identification and authentication failures | Session handling, revocation, lockout, OTP, cookie flags | HTTP + code review | PASS | 04: 32 PASS, including logout, sign-out everywhere, inactive user, tampered or expired tokens, and cookie flags `HttpOnly; Secure; SameSite=lax`. WhatsApp OTP runtime is BLOCKED. |
| SEC-C20 | A07 | Brute-force limits | HTTP | PARTIAL | Sign-in, code and forgot limits work (21st attempt gives 429). Per-IP buckets depend on a trusted client IP: without Cloudflare plus `ORIGIN_SECRET`, `CF-Connecting-IP` and the right-most `X-Forwarded-For` can be chosen by the caller (04 AUTH-33, risk R-AUTH-1). The per-login (10 per 15 min), per-challenge (5) and per-user OTP (5 per hour) limits still hold. |
| SEC-C21 | A08 Software and data integrity | CSRF and origin for state changes | HTTP + code review | PASS | API: `Sec-Fetch-Site` cross-site and same-site POSTs give 403. Server Actions: the Next.js origin check (`Origin: evil` gives 500 digest, no action run). Session cookie `SameSite=Lax`. No `serverActions.allowedOrigins` widening (next.config.ts:27-30). The signed page header (`x-ars-path` HMAC) stops a forged page context (path-signature.ts). |
| SEC-C22 | A08 | Webhook and cron authenticity | HTTP + code review | PASS | `x-job-secret` and `x-webhook-secret` are compared with SHA-256 and timingSafeEqual, and a missing or unconfigured secret looks like 404 (jobs/run:12-19, webhooks/ceoitbox:9-14). Probed: 404 (06 API-10). |
| SEC-C23 | A09 Logging and monitoring | Audit log coverage and integrity | Code review + SQL | PASS | 161 `recordAudit` calls covering 151 distinct actions:<br>• sign-in, logout, OTP sent or failed, lockout, not-me, sessions revoked;<br>• every access denial (`AREA_`, `API_`, `PAGE_`, `REQUEST_`, `ATTACHMENT_`, `RECORD_FILE_ACCESS_DENIED`);<br>• exports, settings, users, workflows, AI.<br>Append-only by DB triggers `trg_audit_logs_no_update` and `trg_audit_logs_no_delete` (migration 202609281203:28-36). Seen live: `LOGOUT` 735 and `SESSIONS_REVOKED` 736 after the probes. The logger keeps secrets out of context and redacts provider bodies (logger.ts:19-39). |
| SEC-C24 | A09 | Earlier finding S-06 ("no alert if cron stops") | Code review | PASS | Superseded: `/api/health` triggers `checkJobRunnerStopped()` when the runner is LATE (health route:20). |
| SEC-C25 | A10 SSRF | AI provider, Salesforce, CEOITBox, Google fetches | Code review | PASS | AI URLs are fixed constants per provider (providers.ts:15-23). Claude's base URL can be overridden by env only. The Salesforce `instance_url` from the token response must match `https://*.salesforce.com` or `*.force.com` (salesforce-auth.ts:96). The CEOITBox base URL is a Super-Admin setting restricted to `https://` (settings/definitions.ts:74). That is an admin-controlled destination, an accepted risk. Resend and Google endpoints are fixed. No user-supplied URL is fetched. |
| SEC-C26 | – | Rate limiting on costly signed-in routes | HTTP + code review | PASS | limits.ts: pdf 20, quick 90, notifications 120, download 120, webhook 600 per minute; reports and exports 20 per minute; AI 6 per minute plus a daily limit. Counted in the DB, so all processes share them. Live: PDF 429 at the limit (rate_limit_pdf.txt). |
| SEC-C27 | – | Open redirect after sign-in | Code review | PASS | `safeNextPath` refuses `//`, backslashes, whitespace and control characters, and the result must resolve to the same origin (lib/http/safe-next.ts). `redirectToPage` takes only site paths (redirect.ts:27-28). |
| SEC-C28 | – | Secrets in configuration and repository | Code review | PASS | Provider keys live only in encrypted settings. `next.config.ts` holds only the public Firebase web config, which is not secret by design. `.env*` was not opened (brief rule 2). |

**Status counts (28 checks):** PASS 23 · FAIL 2 · PARTIAL 3 · NOT TESTED 0 · BLOCKED 0 · NOT APPLICABLE 0. Eleven of the PASS checks are code review only: C03, C04, C07, C08, C09, C11, C16, C24, C25, C27, C28. SEC-C16 is counted as PASS by code review; its live enforcement is not applicable on the local server.

## 3. npm audit summary

```
npm audit --omit=dev  →  found 0 vulnerabilities   (exit 0)
npm audit             →  14 moderate (0 low, 0 high, 0 critical)   (exit 1)
  root advisory: minimatch <11.0.1, GHSA-g3hv-75wg-m249 (ReDoS, globparts amplification)
  pulled in by: eslint, @eslint/eslintrc, @eslint/config-array, @typescript-eslint/*,
                eslint-plugin-import, eslint-plugin-jsx-a11y, eslint-plugin-react (dev tooling)
```

## 4. Risks and recommendations (not defects)

1. **IP trust (R-AUTH-1).** Keep `ORIGIN_SECRET` set in production. Trust `CF-Connecting-IP` only after the origin check passes, and don't let requests with no IP share one bucket.
2. **CSP.** Plan to drop `style-src 'unsafe-inline'` (nonce'd styles) when Next.js allows it.
3. **Defence in depth.** Re-check the role inside data functions used only by the Super Admin (for example `listAllConversations`). Add a test that every `page.tsx` under `/admin` and `/superadmin` calls a guard (see SEC-02).
4. **JSON APIs.** Require `Content-Type: application/json`.
5. **Dev dependencies.** Update eslint and typescript-eslint to clear the minimatch advisory.
6. **Cookie prefix.** Consider the `__Host-` prefix for `ars_session`: it requires Secure, Path=/ and no Domain, which the app already uses.

## 5. Defects

The two defects are detailed in their home reports and summarised here.

| Defect ID | Module | Feature | Category | Description | Expected | Actual | Severity | Priority | Reproduction | Evidence | Root cause | Recommendation | Status |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| SEC-02 | Super Admin / AI / Salesforce | AI Activity History, AI Reports, Data Sources, Salesforce Settings pages | A01 Broken access control | These four pages have no page-level `requireArea("superadmin")`. An RSC request (`RSC: 1`) streams their data to any signed-in user, or to anyone sending any `ars_session` cookie value, although the layout answers 404. | 404 with no data for anyone but a Super Admin. | 200 with names, conversation titles, AI usage per person, data-source state, the Salesforce connected account and settings. Encrypted secrets show `null`. | High | P0 | `curl -H "Cookie: ars_session=garbage" -H "RSC: 1" http://localhost:3100/superadmin/ai/history` | `TEST_EVIDENCE/SEC/rsc_layout_bypass_excerpts.txt`, `rsc_layout_bypass_matrix.txt` | The layout-only guard; Next.js renders page segments in parallel with the layout. | Add `await requireArea("superadmin")` to the 4 pages and a test that every admin and superadmin page has a guard. (Full row in 05.) | Open |
| SEC-01 | Authentication | User ID + password sign-in | A04/A07 User enumeration | `/api/auth/password/start` is about 2-3× faster for an existing account with no password hash than for an unknown ID. | The same time either way. | About 21-41 ms against about 54-81 ms, with the same body. | Low | P2 | 5 pairs of wrong-password requests (unknown ID, then a Google-only ID). | `TEST_EVIDENCE/SEC/auth_timing_enumeration.txt` | `verifyPassword` returns early on a null hash (password.ts:31). | Run `burnPasswordCheck` when the hash is null. (Full row in 04.) | Open |
