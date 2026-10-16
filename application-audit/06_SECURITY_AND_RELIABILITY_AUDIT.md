# 06 — Security and reliability audit

ARS Approval Platform v1.8.0, audited 16 Oct 2026 (read-only).

## Method

1. **Code reading.** The domain auditors read the code with `file:line` evidence. A script checked that each of the 93 exported Server Actions calls a guard first.
2. **Lead-auditor checks.** Every P1 and most P2 claims were re-read at their cited lines.
3. **Runtime probes.** Four findings were reproduced at runtime with throwaway tests run from a scratch folder; nothing was added to the repo.
4. **Test suites.** Lint, typecheck, unit (433), integration (188), E2E (92), QA (27) and origin lock (1) were all run locally and all passed.
5. **Dependency scan.** `npm audit --omit=dev` found 0 vulnerabilities.
6. **Production.** No security test was run against production. The only production evidence is the public health endpoint.

**Verification levels used below:**

| Level | Meaning |
|---|---|
| **Runtime-verified** | Reproduced by a probe test. |
| **Code-verified** | The lead auditor read the cited lines and they do what is stated. |
| **Code (sub-audit)** | A domain auditor traced the code; it is consistent but was not re-read by the lead auditor. |
| **Potential** | Depends on configuration, scale or timing that could not be observed. |

## Headline

- **No P0 (confirmed critical exposure) was found.** The authentication and authorization design is strong and applied consistently (section C below lists the controls with evidence).
- **There are four P1 items:**
  - three confirmed: CSV import account takeover between IT Admins; resubmit bypassing a DoA level; the seed re-granting Super Admin;
  - one potential: the database time zone.
- **There are 25 P2 items.** Most are about workflow integrity, audit completeness and operational reliability, not access control.

## A. Consolidated finding register (P1 and P2)

The IDs (AUD-nn) are used throughout the roadmap (`09`) and the tracker (`11`). The source IDs point into the domain sections below and into `04` and `05`.

| AUD | Pri | Finding | Source IDs | Evidence | Verification | Impact |
|---|---|---|---|---|---|---|
| AUD-01 | **P1** | **CSV user import skips the contact-change rule.** An IT Admin can change another IT Admin's email, WhatsApp number or sign-in method by import, then sign in with Google as that email. | SEC-01 | `server/import/plan.ts:363-371` (no `checkContactChange`) vs `server/admin/users.ts:125`; link step `users.repository.ts:95-102` | **Runtime-verified** (planner probe) + code-verified | Account takeover between IT Admins (insider). Super Admin and break-glass accounts are protected. |
| AUD-02 | **P1** | **Resubmit keeps skipped DoA or conditional levels skipped.** With the default "restart at the step that asked", raising the amount on resubmit never brings back a higher-band level that was skipped. | D-01 | `server/engine/engine.ts:532-538`; `server/approvals/service.ts:646-667` | **Runtime-verified**: ₹5,000 → ₹50,00,000, the CFO level stayed SKIPPED and the request was APPROVED | Breaks delegation-of-authority limits, the core promise. Any requester who is sent back can trigger it. |
| AUD-03 | **P1** | **The bootstrap seed re-grants Super Admin, IT Admin and User to `itadmin` on every start.** Revoking those roles does not survive a restart or deploy. | M-1 | `database/seeds/003_bootstrap_super_admin.sql:11-13`; `package.json:12` (seed runs in `npm start`) | **Code-verified** | Governance: privileged access can't be revoked durably. |
| AUD-04 | **P1 (potential)** | **The MySQL session time zone is never set.** Code writes UTC times from JS but compares them with `CURRENT_TIMESTAMP` in the server's own zone. | T-1 | `lib/db/client.ts:12-22` (`timezone: "Z"`, no `SET time_zone`); `analytics.repository.ts:82,181`, `analytics-more.repository.ts:26` | **Potential**: harmless if the production MySQL runs in UTC. Run `SELECT @@global.time_zone, @@session.time_zone` on live. | If not UTC: overdue flags, SLA reminders and escalations, India-date filters and audit export ranges are shifted by the offset. |
| AUD-05 | P2 | **One person can cast two votes on one step:** a delegate who is also a co-approver satisfies ALL or ANY_N alone. | D-04 | `engine.ts:425-449` (no "already decided on this node" check) | **Runtime-verified** | Separation of duties on multi-approver steps. |
| AUD-06 | P2 | **A rejection in one branch ends the whole request even under an ANY_ONE / ANY_N join.** | D-03 | `engine.ts:363-376, 458` | **Runtime-verified**; the intended semantics need an owner decision (DR-01) | Wrong outcome for "any one of these departments" designs. |
| AUD-07 | P2 | **A custom approval can finish APPROVED at submit with no human decision.** Skip rules and "skip if nobody to approve" are available to requesters; no rule requires one approval that can't be skipped. | D-02 | `server/workflows/step-policy.ts:45-65`; `service.ts:751-790`; `engine/validate.ts:76-77` | **Code-verified** (the sub-audit rated it P1; the lead auditor rated it P2, because the requester already chooses their own approvers. It still produces an ARS-numbered "Approved" record.) | Governance and appearance of authority; policy decision DR-02. |
| AUD-08 | P2 | **The outbox marks a message sent even when nothing was recorded.** `notify()` returns `recorded:false` on a database error without raising one, and `deliverOutbox` marks the row sent anyway. | DEF-02 | `server/approvals/service.ts:362-376`; `server/notifications/notify.ts:88-102` | **Code-verified** | A committed decision whose notification is silently lost. |
| AUD-09 | P2 | **FYI recipients and escalated-to managers are sent links that return 404.** They are not in the visibility rule. | D-06 | `server/approvals/messages.ts:192-208`; `server/jobs/sla.ts:172-195`; `lib/db/repositories/visibility.ts:10-20` | Code (sub-audit) | "For your information" and escalation, both north-star features, are broken for the recipient. |
| AUD-10 | P2 | **Files are lost when a request closes at submit,** and the required-document rule counts the files picked rather than the files saved. | D-05 | `app/users/actions.ts:103-111`; `server/attachments/service.ts:23,89`; `readiness.ts:109` | Code (sub-audit) | An approved record without its supporting documents. |
| AUD-11 | P2 | **Resubmit skips readiness checks:** budget BLOCK, unique identifier and duplicates. The budget is re-synced outside the transaction. | D-07 | `service.ts:646-679` vs `readiness.ts:161-228` | **Code-verified** | Over-budget or duplicate requests enter through "send back". |
| AUD-12 | P2 | **The central audit log is incomplete.** Submit, withdraw, Super Admin reopen, hold, resume and resubmit are only on the request timeline. Approval-type export, dashboard CSV downloads and schedule or alert toggles are not audited at all. | D-08, ADM-22, DEF-05, S-07 | `service.ts:589-624`; `app/api/admin/workflows/[id]/export/route.ts`; `app/api/admin/dashboards/[slug]/route.ts`; `app/users/report-actions.ts:126-133` | Code (sub-audit) | The audit export misses privileged actions. |
| AUD-13 | P2 | **Approval expiry is informational only.** Expired approvals stay APPROVED and can still be amended or used as a follow-up source. | D-09 | `server/approvals/expiry.ts:19-62`; `amendments.ts:85` | Code (sub-audit) | Expired approvals look valid; decision DR-05. |
| AUD-14 | P2 | **Page access is keyed on the address an action is posted to.** An address that is no configured page (e.g. `/superadmin/import`, which loads the admin import actions), or another page sharing the same action, can be used to get around a Hidden or View-only rule. IT's "out of office for someone else" runs a users-area action. | G-3, SEC-02, G-2 | `server/authorization/page-access.ts:43` (unknown page → allowed); `app/superadmin/import/page.tsx`; `app/users/collab-actions.ts:117-125` | Code-verified (line 43); the bypass was **not** reproduced at runtime | Weakens the v1.8.0 page restrictions. Role, area and record checks still apply. |
| AUD-15 | P2 | **`ORIGIN_SECRET` is optional.** Without it, the origin can be reached directly with a forged `CF-Connecting-IP`, which defeats every per-IP rate limit. | SEC-06 | `config/environment.ts:28`; `middleware.ts:47-55`; `lib/http/client-ip.ts` | **Potential**: depends on the GoDaddy environment | Brute-force and abuse limits weaken; the audit log records false IPs. |
| AUD-16 | P2 | **An IT Admin can take over any non-admin account (by design).** Changing a user's email unlinks Google, then the IT Admin signs in as that user, including DoA approvers. | SEC-07 | `server/admin/user-rules.ts:49-53` | Code-verified; **by design** | Insider risk on approval authority; decision DR-03. |
| AUD-17 | P2 | **Job steps that swallow their own errors are recorded as OK.** Template sync is one example, so no failure alert is sent. | DEF-01 | `server/ops/automation.ts:223`; `server/notifications/template-registry.ts:166-168` | **Code-verified** | Silent operational failure. |
| AUD-18 | P2 | **No global job-runner lock, and every job runs inside one cron HTTP request.** Backup and template sync aren't claim-safe, and a long run can hit host or proxy timeouts. | RISK-01, RISK-02 | `server/ops/automation.ts:209-236`; `server/ops/backup.ts:188-193`; `app/api/jobs/run/route.ts` | Potential | Double backups and pool pressure; late heartbeats. |
| AUD-19 | P2 | **Silent row caps make results wrong at scale.** `turnaround_by_step` reads at most 50,000 rows with no ORDER BY and reports `truncated:false`; two analytics panels do the same at 20,000. | DEF-03, DEF-04, T-3 | `server/reports/catalogue.ts:163-192`; `lib/db/repositories/analytics-more.repository.ts:19,40,67,74` | Code (sub-audit); not reachable at today's volume | Wrong numbers with no warning once data grows. |
| AUD-20 | P2 | **Retention is not implemented.** Notifications, deliveries, login logs, OTPs, sessions, tokens, alert events, report runs and export rows grow without limit; the retention settings only count rows (dry run). | R-1, SA-08 | `server/ops/governance.ts:100-140` | Code (sub-audit) | Storage growth and privacy (old OTP and session rows kept indefinitely). |
| AUD-21 | P2 | **India-date filters wrap the column in a function**, so the period indexes added in v1.7 are never used. | I-1, PERF-01 | `analytics.repository.ts:31`; `server/requests/list-filters.ts:259`; `search.repository.ts:24`; correct pattern at `audit.repository.ts:132-133` | Code (sub-audit). The measured whole-dashboard p95 was 151.9 ms at 6,300 requests (`docs/PERFORMANCE_ANALYTICS.md`). | Performance degrades as data grows. |
| AUD-22 | P2 | **The migration runner has no checksum and no lock.** If a half-applied file is edited, resume picks up at the wrong statement; two concurrent starts can both apply the same file. | M-2, M-3 | `scripts/database/migrate.js:46-101` | Code (sub-audit) | A failed deploy can corrupt the schema state. |
| AUD-23 | P2 | **`notification_outbox.request_id` has no index or FK.** Three outbox operations scan the whole table. | F-1 | `database/migrations/202610081300_qa_fixes.sql:13-22`; `outbox.repository.ts:52-66,97-104` | Code (sub-audit) | Outbox maintenance slows as it grows. |
| AUD-24 | P2 | **The request status and the task projection are copies of `state_json`, and nothing checks them on a schedule.** The repair tool exists because drift has already happened. | T-2 | `approvals.repository.ts:386-437`; `server/ops/repair.ts:41` | Code (sub-audit) | Queues and lists can disagree with the request. |
| AUD-25 | P2 | **"Load demo data" has no confirmation and no production guard.** It creates 20 users, departments, groups and 12 published types in whatever database it runs on. | admin §3.3 | `features/superadmin/DemoForms.tsx:7-16`; `server/demo/service.ts:45` | Code (sub-audit) | Pollutes live master data with one click (Super Admin only). |
| AUD-26 | P2 | **Mobile navigation:** the user-space bottom bar shows in the Admin and Super Admin spaces and sends admins out of their space; the phone drawer and the account menu don't manage focus. | N1, N2, N6 | `features/shell/AppShell.tsx:139`; `MobileNav.tsx:27-41`; `ProfileMenu.tsx:38-51` | Code (sub-audit) | Usability and accessibility on phones. |
| AUD-27 | P2 | **The two busiest pages run their queries one after another:** about 16 queries on the request page, with the full user list loaded up to 3 times, and about 14 on the new-request page. | UI P2 | `app/users/requests/[id]/page.tsx:40-76`; `app/users/new/[workflowId]/page.tsx:20-49` | Code (sub-audit); measure before and after | Latency on the most-used pages. |
| AUD-28 | P2 | **Operational lists are capped or misleading:** Message deliveries shows a fixed latest 200 with no filter; the unsent-outbox count stops at 100 but looks like a total; home tiles cap at 200; bulk reassign silently caps at 300. | SA-05, SA-06, admin §3.5 | `app/superadmin/deliveries/page.tsx:21`; `app/superadmin/automation/page.tsx:33,113`; `workload.repository.ts:53` | Code (sub-audit) | Operators can't find failed messages; counts mislead. |
| AUD-29 | P2 | **Operational documents are stale and contradict live.** The cron blocker is still listed (live says `jobRunner OK`); the security review and known-issues are for v1.6.0, the deployment guide for v1.4.0; SEC-01 and D-01 to D-09 aren't recorded; the register contradicts itself (BP1-xx vs M1.1-xx). | SEC-03, UI M3, arch §6.4 | `docs/KNOWN_ISSUES.md`, `docs/SECURITY_AND_AUTHORIZATION_REVIEW.md`, `docs/GO_LIVE_READINESS_CHECKLIST.md`, `docs/DEPLOYMENT.md`, `PLAN-CHECKLIST.md:33,49` | **Verified** (live health checked 16 Oct 2026) | Wrong decisions taken from wrong documents. |

## B. P3 findings (minor, hardening, scale-dependent)

Counted from the domain sections below and from `04`, `05` and `07`. Items already folded into an AUD-nn above are not repeated.

| Area | Source IDs | Count |
|---|---|---:|
| Security hardening | SEC-04 (raw error message in export), SEC-05 (forgot/set-password OTP failures not logged), SEC-08 (Super Admin has no idle limit, DR-04), SEC-09 (no rate limit on PDF summary and quick search), SEC-10, SEC-11, SEC-12/RISK-13 (webhook static secret), SEC-13 (short OTP digits could reach provider-body logs), SEC-14, SEC-15 (one secret keys everything; rotation runbook), SEC-16 (logout doesn't revoke an expired row), SEC-17 (View-only can block sign-out-everywhere), SEC-18, SEC-19 (`__Host-` cookie), SEC-20 (52 MB bodies in memory), SEC-21 (Super Admin can point the CEOITBox URL anywhere) | 16 |
| Workflow | R-01 (directory snapshot per action), R-02 (side flows bypass the outbox), R-03 (no decision idempotency message), R-04 (consultation duplicates; never closed), R-05, R-06 (custom code collision), R-07, R-08 (runtime approver eligibility for role/group sources), R-09, R-10 | 10 |
| Notifications, reports, jobs | DEF-06 (scheduled-report email outside the delivery pipeline), DEF-07 (approver attribution differs between dashboard and report), DEF-08 (WhatsApp "failed" receipts ignored), RISK-03 (duplicate send after timeout), RISK-04 (SLA notices at-most-once), RISK-05 (poison export loop), RISK-06 (backups unencrypted, same host), RISK-07 (alert starvation), RISK-08, RISK-09 (outbox payload plaintext), RISK-10, RISK-11 (11 event types can't be switched off), RISK-12/T-4 (WhatsApp limiter race), RISK-14 | 14 |
| Database | M-4, M-5, M-6, T-5, T-6, F-2, F-3 (deleting a type with templates raises a raw FK error), F-4, F-5, I-2, I-3, I-4, I-5, I-6, I-7, N-1 to N-5, D-1, D-2, J-1, C-1 | 24 |
| UI, UX and maintainability | N3, N4, N5, F1 (window.confirm in the custom approval form, P2 in `07`), F2 to F6, L2 to L6, A2 to A6, D1 to D4, P3 to P6, M1 to M3; plus admin §3.3 missing confirmations, §3.6 guard inconsistencies (G-1 analytics pages) and §3.7 empty states | see `07` |

**Totals for this audit:**
- **P0: 0.**
- **P1: 4** (3 confirmed, 1 potential).
- **P2: 25** (AUD-05 to AUD-29), plus F1 and P2 in `07`, which are UI-level.
- **P3: 64** in the first four rows of the table above, plus the UI items detailed in `07`.

## C. Reliability posture (what is in place)

- **Engine actions:** every action on a request runs in one transaction with `SELECT … FOR UPDATE` plus a `state_version` check. Two people deciding at once is tested (`approvals.int.test.ts:173`).
- **Duplicate submissions:** blocked by a submission key at three layers, backed by a database unique key.
- **History and audit:** append-only, enforced by database triggers on `audit_logs`, `approval_events` and `request_comments`.
- **Outbox:** a transactional outbox with claim leases. Delivery retries use backoff, and their payloads are encrypted.
- **Job runs:** job steps are claim-based and every run is recorded. The Super Admin is alerted at most once a day per kind. A stopped runner is detected when `/api/health` is polled.
- **Backup:** a daily consistent-snapshot backup with retention. The restore and verify scripts are drilled in CI (`backup.int.test.ts`). Rollback levers are documented in `docs/BACKUP_RESTORE_AND_ROLLBACK.md`.
- **Gaps:** see AUD-08, AUD-17, AUD-18, AUD-20, AUD-22 and RISK-06. There is also no external error tracking or log shipping (OPS-05). RTO and RPO are not signed off (DR-08).

---

The detailed domain sections follow.

## D. Security controls verified in place

### 2. Controls verified as in place (with evidence)

| # | Control | Evidence |
|---|---|---|
| C1 | Middleware is layer 1 only: it checks that a session cookie is present. Non-public API calls without it get a 404 JSON response; pages redirect to `/login?next=`. | `middleware.ts:16` (PUBLIC_PREFIXES), `middleware.ts:71-78` |
| C2 | Signed session cookie. HMAC-SHA256 over `{sid,uid,iat,exp}`, compared with `timingSafeEqual`; 12 h expiry. | `lib/session/token.ts:16-43`, `lib/session/constants.ts:5` |
| C3 | The server-side session row is checked on every request: not revoked, `expires_at` not passed, the user is re-read (active, lock, break-glass window, roles), and the idle limit applies. Demo users are forced to the USER role. | `server/auth/session.ts:55-84`, `lib/db/repositories/sessions.repository.ts:68-75` |
| C4 | Session fixation is prevented: a new UUID session is minted at every sign-in. The cookie is `httpOnly`, `SameSite=Lax`, and `Secure` in production. | `server/auth/complete-sign-in.ts:100-110`, `server/auth/http.ts:11-29` |
| C5 | Area guards: `users` = USER/IT_ADMIN/SUPER_ADMIN, `admin` = IT_ADMIN/SUPER_ADMIN, `superadmin` = SUPER_ADMIN. Every denial is audited; the answer is a plain 404. | `server/authorization/policy.ts:6-21`, `server/authorization/guards.ts:19-68` |
| C6 | Layouts are guarded and pages guard themselves too, which protects against layout skipping during partial rendering. Only 10 pages lack a direct `requireArea` call, and all 10 delegate to screens or helpers that call it. | `app/users/layout.tsx:8`, `app/admin/layout.tsx:13`, `app/superadmin/layout.tsx:11`; `features/analytics/AnalyticsScreen.tsx:29`, `AnalyticsListScreen.tsx:23`, `MetricsScreen.tsx:12`, `features/admin/dashboards/page-data.ts:12` |
| C7 | Every Server Action is guarded. Admin actions go through `getAdminActor()` → `requireApiArea("admin")`; user and super-admin actions use local `actor()` / `me()` / `superAdmin()` wrappers. A scripted check found 93/93 actions with an early guard call. | `server/admin/actor.ts:8-16`, `app/users/actions.ts:33-40`, `app/superadmin/*/actions.ts` |
| C8 | Page-access layer (v1.8.0): the path is HMAC-signed in middleware, and any `x-ars-path` value from the client is stripped first. The check fails closed for restricted users when the path is unknown. | `middleware.ts:80-90`, `lib/security/path-signature.ts`, `server/authorization/page-access.ts:24-52` |
| C9 | Record-level checks: the requester, a participant (task holder or decider, active delegate, consultee, collaborator) or IT/SA. The SQL rule matches the code rule. | `lib/db/repositories/visibility.ts:10-21`, `lib/db/repositories/approvals.repository.ts:630-643`, `server/approvals/view.ts:81-88`, `server/attachments/service.ts:31-33,129-141` |
| C10 | Owner-scoped writes filter on `user_id` (views, schedules, templates, drafts, notifications). | `analytics-views.repository.ts:60-77`, `server/reports/schedules.ts:108-123`, `templates.repository.ts:51`, `drafts.repository.ts:52`, `collab.repository.ts:177-185` |
| C11 | Exports can only be opened by their owner; the file name is checked against a regex before the file is read (no path traversal). | `server/reports/background.ts:157-167` |
| C12 | Attachments: an extension allowlist, a magic-byte check, 10 MB per file / 5 per upload / 20 per request, a sanitised name, and a random stored name outside the web root. Reads are contained by a `path.resolve` + `startsWith(root)` check; writes use the `wx` flag. Only images and PDFs display inline; everything else downloads under a sandbox CSP. | `server/attachments/files.ts:46-139`, `server/attachments/service.ts:44-53,96-99,137-140` |
| C13 | Password storage: scrypt (N=16384, r=8, p=1, 16-byte salt), compared in constant time. A dummy hash is burned for unknown IDs so timing doesn't reveal which IDs exist. Policy: at least 10 characters, letters and digits. | `lib/security/password.ts` |
| C14 | WhatsApp OTP: generated with `crypto.randomInt`, stored as a keyed HMAC hash. Attempts are reserved atomically, the code is single-use, and there are TTL, cooldown and per-hour caps. | `lib/security/otp.ts`, `lib/db/repositories/otp.repository.ts:213-229`, `server/auth/otp-flow.ts:42-123` |
| C15 | No enumeration: generic messages; "locked" is only revealed to someone who knows the password; forgot-password answers the same either way and sends the OTP afterwards (deferred). | `server/auth/password-sign-in.ts:86-121`, `server/auth/set-password.ts:160-175,177-203` |
| C16 | Lockout after N wrong passwords, with an alert to the owner. | `server/auth/password-sign-in.ts:105-114` |
| C17 | Google sign-in: `verifyIdToken(token, checkRevoked=true)`, `email_verified` required, provider must be `google.com`, and only a pre-created, unlinked account with that exact email is linked. | `lib/firebase/admin.ts:51-54`, `server/auth/google-sign-in.ts:48-90`, `users.repository.ts:95-102` |
| C18 | Set-password link: 32 random bytes, stored hashed, 72 h, single use (conditional UPDATE inside a transaction). A newer link voids older ones. The OTP challenge must belong to the same user. Setting the password ends all sessions. | `server/auth/set-password.ts:99-108,136-152,205-222`, `password-tokens.repository.ts:242-271` |
| C19 | "This wasn't me": the link carries an HMAC purpose token (7 d), and only a POST from the confirm page acts on it. The link works once (`used_security_links`). It ends every session and security-locks the account. | `server/auth/session.ts:102-138`, `sessions.repository.ts:113-116` |
| C20 | Sign out everywhere revokes every session row, is audited, and clears the cookie. | `app/api/me/sign-out-everywhere/route.ts`, `server/auth/session.ts:91-95` |
| C21 | Idle timeout: per-user setting (fallback 30 min). Status checks don't count as activity; keep-alive does. The Super Admin is exempt by design. | `server/auth/session.ts:30-51` |
| C22 | Rate limits (DB-backed sliding window): SIGNIN 20/IP and 10/login per 15 min; CODE 30/IP; FORGOT 10/IP and 5/login per hour; SET_PASSWORD 10/IP; GOOGLE 30/IP. Report export 20/min per user; analytics and readiness checks are also limited. | `server/auth/rate-limit.ts:17-51`, `app/api/reports/[key]/route.ts:30`, `server/analytics/rate.ts:10-12`, `app/users/actions.ts:429` |
| C23 | Client IP: CF-Connecting-IP when it parses as an IP, otherwise the right-most X-Forwarded-For entry (the left-most is never trusted). | `lib/http/client-ip.ts` |
| C24 | Open-redirect protection on `?next=`. | `lib/http/safe-next.ts`, used at `app/(public)/login/page.tsx:12` and `features/auth/components/SignInPanel.tsx:19` |
| C25 | CSRF: Server Actions get Next's built-in Origin/Host check (no `allowedOrigins` override). State-changing `/api/*` calls with `Sec-Fetch-Site` of `cross-site` or `same-site` are refused. Cookies are `SameSite=Lax`. | `middleware.ts:60-66`, `next.config.ts` (no allowedOrigins) |
| C26 | CSP: a per-request nonce plus `strict-dynamic`; `frame-ancestors 'none'`, `object-src 'none'`, `base-uri 'self'`, `form-action 'self'`; `unsafe-eval` only in dev. Other headers: HSTS, XFO DENY, nosniff, Referrer-Policy, Permissions-Policy, `poweredByHeader:false`, no browser source maps. | `lib/security/csp.ts:14-43`, `next.config.ts:129-159` |
| C27 | Secrets: provider keys stored AES-256-GCM (random 12-byte IV, auth tag). Decrypted only on the server (`getSettingValue`, used only by the webhook in `app/`). The env schema enforces `SESSION_SECRET` ≥ 32 characters. | `lib/security/encryption.ts`, `server/settings/values.ts:9-13`, `config/environment.ts:24-28` |
| C28 | Failed-message payloads (which can hold set-password or not-me links) are stored encrypted. | `lib/security/delivery-payload.ts` |
| C29 | Job runner and webhook secrets are compared in constant time (SHA-256 then `timingSafeEqual`), and a missing secret leads to 404. | `app/api/jobs/run/route.ts:15-24`, `app/api/webhooks/ceoitbox/route.ts:11-22` |
| C30 | Origin lock (when `ORIGIN_SECRET` is set): requests that bypass Cloudflare are refused. | `middleware.ts:47-55` |
| C31 | User-management rules: only a Super Admin grants or removes SUPER_ADMIN or edits a Super Admin / break-glass account; nobody can demote or deactivate themselves; the last Super Admin is protected. | `server/admin/user-rules.ts:37-87` |
| C32 | Logging: no token, OTP or password is passed to a logger. Provider error bodies are redacted (emails and phone numbers) and truncated. | `lib/logging/logger.ts:78-112`; grep of all `logError`/`logInfo` calls |
| C33 | Spreadsheet formula neutralisation on CSV export. | `server/import/csv.ts:79` |
| C34 | XSS: there is no `dangerouslySetInnerHTML`, `innerHTML`, `eval` or `new Function` anywhere in `app/`, `features/`, `server/` or `lib/`. | grep (0 hits) |
| C35 | Dependencies: `npm audit --omit=dev`: **0** critical, 0 high, 0 moderate, 0 low (193 production dependencies). | run on 2026-10-16 |

---

## E. Authentication feature table

### 3. AUTH feature table

| ID | Feature | Expected | Actual | UI | API | DB | Validation | Authz | Test evidence | Status | Missing work | Evidence file:line |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| AUTH-01 | User ID + password sign-in (step 1) | Password check, lockout, no enumeration, then OTP | As expected | `features/auth/components/SignInPanel.tsx` | `POST /api/auth/password/start` | users, login_history, otp_challenges | zod `passwordStartSchema` | Public; rate-limited IP + login | `tests/auth/password-sign-in.test.ts`, `tests/integration/otp.int.test.ts` | Implemented — Code Verified | — | `server/auth/password-sign-in.ts:76-131`, `app/api/auth/password/start/route.ts:11-21` |
| AUTH-02 | WhatsApp OTP verify / resend | Hashed, single-use, attempt cap, cooldown, hourly cap | As expected; attempts reserved atomically | SignInPanel | `POST /api/auth/password/verify`, `/resend` | otp_challenges | `^\d{4,8}$`, token 20–200 chars | Public; CODE limit 30/IP | `tests/auth/password-sign-in.test.ts`, `tests/integration/otp.int.test.ts`, `tests/security/security.test.ts` | Implemented — Code Verified | CODE limit is IP-only (per-challenge cap compensates) | `server/auth/otp-flow.ts:105-123`, `otp.repository.ts:213-229` |
| AUTH-03 | Google sign-in (no OTP) | Verified token, google.com provider, pre-created account only | As expected; revocation checked | `features/auth/components/GoogleButton.tsx` | `POST /api/auth/google` | users.firebase_uid | zod idToken 20–5000 chars | Public; 30/IP | `tests/auth/google-provider.test.ts` | Implemented — Code Verified | — | `server/auth/google-sign-in.ts:38-91`, `lib/firebase/admin.ts:51-54` |
| AUTH-04 | Set password (first sign-in link) | 72 h single-use link, policy check, OTP, ends sessions, signs in | As expected | `app/(public)/set-password/page.tsx` | `POST /api/auth/set-password/start`, `/complete` | password_tokens, otp_challenges | zod plus policy | Link token; challenge bound to the same user | `tests/auth/set-password.test.ts` | Implemented — Code Verified | Token sits in the URL query (visible in proxy logs) | `server/auth/set-password.ts:111-152` |
| AUTH-05 | Forgot password | Same answer either way; OTP; ends sessions | As expected; OTP sent after the response | `app/(public)/forgot-password/page.tsx` | `POST /api/auth/forgot/start`, `/complete` | otp_challenges, users | zod | Public; FORGOT 10/IP + 5/login per hour; CODE | `tests/auth/set-password.test.ts` | Implemented — Code Verified | Wrong-code tries in this flow aren't written to login history (`onFailure` is a no-op) | `server/auth/set-password.ts:160-203` |
| AUTH-06 | Admin sends set-password link | IT/SA only; P-04 rule; link only by email | As expected | /admin/users | Server Action | password_tokens | — | `checkCanEdit` + `checkContactChange` | `tests/admin/user-rules.test.ts` | Implemented — Code Verified | — | `server/auth/set-password.ts:82-108` |
| AUTH-07 | New-device alert + "This wasn't me" | Alert on a new device; one-time POST locks the account | As expected | `app/(public)/security/not-me/page.tsx` | `POST /api/auth/not-me` | used_security_links, user_sessions | zod token 20–2000 chars | Signed purpose token | `tests/e2e/v140-api.spec.ts` ("works once (S-07)") | Implemented — Code Verified | No rate limit (the HMAC makes guessing impractical) | `server/auth/complete-sign-in.ts:134-143`, `server/auth/session.ts:102-138` |
| AUTH-08 | Session management (HMAC cookie + DB row) | Revocable, re-read every request, 12 h | As expected | — | — | user_sessions | HMAC + timingSafeEqual | — | `tests/security/security.test.ts`, `tests/integration/sessions.int.test.ts` | Implemented — Code Verified | No `__Host-` cookie prefix | `lib/session/token.ts`, `server/auth/session.ts:55-84` |
| AUTH-09 | Idle timeout + keep-alive | Users and IT time out; Super Admin exempt | As expected | `features/shell/SessionWatch.tsx` | `GET /api/auth/status`, `POST /api/auth/keep-alive` | user_sessions.last_seen_at | — | Own session only | `tests/integration/sessions.int.test.ts` ("idle sign-out"), `tests/e2e/v180.spec.ts` ("inactivity…") | Implemented — Code Verified | The Super Admin has no idle limit (design choice; risk noted) | `server/auth/session.ts:30-51` |
| AUTH-10 | Sign out / sign out everywhere | Revoke this session / all sessions | As expected | /users/security | `POST /api/auth/logout`, `POST /api/me/sign-out-everywhere` | user_sessions | — | Session; sign-out-everywhere needs Full page access | `tests/integration/sessions.int.test.ts` | Implemented — Code Verified | A View-only rule on `users.security` blocks sign-out-everywhere | `app/api/me/sign-out-everywhere/route.ts:10`, `server/authorization/pages.ts:42` |
| AUTH-11 | Break-glass account | Works only inside its window; Super Admins alerted | As expected | — | — | users | — | `checkSignInAllowed` | `tests/auth/rules-policy.test.ts` | Implemented — Code Verified | — | `server/auth/sign-in-rules.ts:9-17`, `server/auth/session.ts:63`, `complete-sign-in.ts:146-155` |
| AUTH-12 | Area authorization (users / admin / superadmin) | Server-side role check; 404 to others | As expected, in layouts, pages, routes and actions | — | all | roles | — | `requireArea` / `requireApiArea` | `tests/auth/rules-policy.test.ts`, `tests/e2e/guard.spec.ts`, `tests/ui/guard-action.test.ts` | Implemented — Code Verified | — | `server/authorization/guards.ts`, `policy.ts` |
| AUTH-13 | Page access (Hidden / View / Full) | Per page, department or person; checked on views, actions and APIs | Done by signed URL path; see SEC-02 | /superadmin/pages | pages API regexes | page_access rules | Path HMAC | `checkPageAccess` | `tests/approvals/v180-rules.test.ts`, `tests/integration/v180.int.test.ts`, `tests/e2e/v180.spec.ts` | Partially Implemented | Bind restrictions to the action, not only the posting URL | `server/authorization/page-access.ts:34-52`, `pages.ts:25-59` |
| AUTH-14 | Record-level visibility (IDOR) | Requester, participant or IT/SA | As expected; one SQL rule matches the code check | — | attachments, summary.pdf, quick | — | `^\d+$` ids | `canSeeRequest` / `isParticipant` / `visibleToSql` | `tests/integration/session*.int.test.ts`, `tests/e2e/v161-attachments-collaborators.spec.ts` | Implemented — Code Verified | — | `visibility.ts:10-21`, `approvals.repository.ts:630-643` |
| AUTH-15 | Role management (USER / EXPORTER / IT_ADMIN / SUPER_ADMIN) | Only SA touches SA; P-04 contact rule | UI path is correct; **CSV import path skips P-04** (SEC-01) | /admin/users, /admin/import | Server Actions | users, user_roles | `normaliseRoles` | `checkCanEdit`, `checkRoleChange`, `checkContactChange` (UI only) | `tests/admin/user-rules.test.ts`, `tests/import/import-plan.test.ts` | Partially Implemented | Add `checkContactChange` to `server/import/plan.ts` | `server/admin/users.ts:125`, `server/import/plan.ts:363-371` |
| AUTH-16 | EXPORTER ("Can export") permission | Downloads limited to EXPORTER when mode=ROLE | Enforced, but `canUseReports` already requires IT/SA, so EXPORTER does nothing for plain users | — | /api/reports, /api/exports | settings | — | `canExport`, `canUseReports` | `tests/analytics/export.test.ts` | Implemented — Code Verified | Clarify EXPORTER's purpose (now redundant) | `server/settings/features.ts:29-42` |
| AUTH-17 | Origin lock (Cloudflare only) | Refuse direct origin hits | Done only when `ORIGIN_SECRET` is set (optional) | — | middleware | — | ≥24 chars | header secret | `tests/origin/origin-lock.spec.ts` | Implemented — Code Verified (config-dependent) | Make it required in production | `middleware.ts:47-55`, `config/environment.ts:28` |
| AUTH-18 | Super Admin "Try as demo person" | SA only; demo, non-admin targets only | As expected; the SA session is revoked; audited | /superadmin/demo | Server Action | user_sessions | id regex | `requireApiArea("superadmin")` + `isSuperAdmin` | `tests/demo/*` | Implemented — Code Verified | — | `server/demo/service.ts:179-195`, `app/superadmin/demo/actions.ts:61-76` |

---

## F. Confirmed security findings (detail)

### 5. Confirmed findings

#### SEC-01 (P1, confirmed): CSV user import bypasses the P-04 contact-change rule, so an IT Admin can take over another IT Admin's account

- **Rule:** `server/admin/user-rules.ts:45-53` (`checkContactChange`). Only the Super Admin may change another IT Admin's email, WhatsApp number or sign-in method. Without this, one IT Admin could take over another.
- **UI path enforces it:** `server/admin/users.ts:125` and `server/auth/set-password.ts:92`.
- **Import path does not:** `server/import/plan.ts:363-371` calls only `checkCanEdit` (which allows IT_ADMIN → IT_ADMIN) and `checkRoleChange`. `checkContactChange` is not imported (import list at `server/import/plan.ts:4`), and it is never called anywhere under `server/import`. The resulting op unlinks Google whenever the email changes (`plan.ts:387`).
- **Exploit path:**
  1. IT Admin A uploads a users CSV, changing IT Admin B's `email` to an address A controls (or the `whatsapp_number` / `sign_in_method`).
  2. Google is unlinked, and B's sessions are ended (`endSessions`).
  3. A signs in with Google as that email. `findUnlinkedUserByEmail` links the account (`users.repository.ts:95-102`), and A is now B, with B's approval authority.
  4. The import is audited, which helps detection but doesn't prevent it.
- **Scope:** the attacker must already be an IT Admin. Super Admin and break-glass targets are protected by `checkCanEdit`. Hence P1, not P0.
- **Test gap:** `tests/admin/user-rules.test.ts:96-102` tests only the pure rule. Nothing in `tests/import/import-plan.test.ts` covers this.
- **Fix:** in `planUsers`, for existing users, call `checkContactChange(snapshot.actor, target, { email: !!changes.email, whatsappNumber: !!changes.whatsappNumber, signInMethod: !!changes.signInMethod })`. Add an import-plan unit test.

#### SEC-03 (P3, confirmed): security docs are stale compared with the code

`docs/SECURITY_AND_AUTHORIZATION_REVIEW.md` is titled v1.6.0; the code is v1.8.0. `docs/KNOWN_ISSUES.md` covers "v1.6.0 work".

| Doc claim | What the code shows |
|---|---|
| S-01: "readiness check, analytics … no per-user rate limit" | Now limited: `server/analytics/rate.ts:10-12`, `app/users/actions.ts:429`. Report *previews* not verified. |
| S-03: "Exporting … doesn't need a permission separate from viewing" | Now `canExport` (EXPORTER role / ROLE mode) plus `canUseReports` (IT/SA only): `server/settings/features.ts:29-42`. |
| S-06: "No alert fires if the cron job stops" | Partly addressed: `/api/health` triggers `checkJobRunnerStopped` when LATE (`app/api/health/route.ts:24`). It still depends on something polling `/api/health`. |
| S-07: "Pause and resume of schedules and alerts aren't audited" | **Still true**: `toggleScheduleAction` (`app/users/report-actions.ts:126-133`) calls no `recordAudit`. `toggleAlertAction` (line 168) should be checked the same way. |
| §1 "Areas … checked in each layout, page, action, route handler" | True (verified, §2 C5–C7). |
| §1 "Record access … requester, task holder, delegate, consultee" | True, and collaborators were added since (`visibility.ts:18`). |
| KNOWN_ISSUES "Security: no open finding at baseline" | SEC-01 is open. |
| Missing from the docs | v1.8.0 controls are undocumented: page access, idle timeout, the Super Admin idle exemption, signed path header, keep-alive/status endpoints, origin lock, EXPORTER role. |

#### SEC-04 (P3, confirmed): workflow export returns raw error messages to the client

`app/api/admin/workflows/[id]/export/route.ts:30-33` returns `error.message` in a 400 response. This contradicts D-016 ("never stack traces, SQL or provider details", `lib/http/api-response.ts:5-6`). It is admin-only, so impact is low.

#### SEC-05 (P3, confirmed): login-history gap in the set-password and forgot-password OTP flows

`consumeOtpCode(..., async () => undefined)` at `server/auth/set-password.ts:150,192` means wrong-code attempts in these flows are not written to login history or the audit log. The sign-in flow does log them (`password-sign-in.ts:157`). The attempt cap still applies.

---

## G. Potential security risks (detail)

### 6. Potential risks (need verification or a decision)

| ID | Sev | Risk | Evidence | How to verify / fix |
|---|---|---|---|---|
| SEC-02 | P3 | **Page access is keyed on the posting URL, not the Server Action.** `requireApiArea` reads the page from the signed path of the request. An action imported by two pages (e.g. `decideAction` on both the request page and `/users/queue`) can be posted to the page that is Full while the other is View or Hidden. Area and record checks still apply, so this only weakens the v1.8.0 Hidden/View restriction. | `server/authorization/guards.ts:51-52`, `page-access.ts:24-29`, `pages.ts:29` | Write an e2e test: mark `users.request` as View, then POST `decideAction`'s action ID to `/users/queue`. Fix by declaring a page key per action (e.g. `requireApiArea("users", { page: "users.request" })`). |
| SEC-06 | P2 | **`ORIGIN_SECRET` is optional.** Without it, anyone can reach the GoDaddy origin directly and send their own `CF-Connecting-IP`. That defeats every per-IP limit (CODE, GOOGLE, SET_PASSWORD, the IP part of SIGNIN/FORGOT) and poisons IPs in the audit log. Per-login and per-challenge caps still hold. | `config/environment.ts:28`, `middleware.ts:52-55`, `lib/http/client-ip.ts:11-12` | Check the GoDaddy env and Cloudflare Transform Rule. Make `ORIGIN_SECRET` required when `NODE_ENV=production`, or trust CF-Connecting-IP only when the origin secret matched. |
| SEC-07 | P2 | **An IT Admin can take over any non-admin user by design.** Changing a USER's email unlinks Google (`admin-users.repository.ts:207-219`). An IT Admin can then sign in as a high-authority approver (e.g. a DoA approver or director). P-04 protects only admins. | `user-rules.ts:49-53` | Owner decision: require Super Admin approval, or notify the old email and WhatsApp when contact details change, or exclude approver-eligible users. |
| SEC-08 | P3 | **The Super Admin is exempt from idle timeout,** so a Super Admin session lives the full 12 h on an unattended machine. | `server/auth/session.ts:31,64-66` | Owner decision; consider a longer idle limit (e.g. 2 h) rather than none. |
| SEC-09 | P3 | **No rate limit on costly authenticated GETs** (`/api/requests/[id]/summary.pdf` builds a PDF each time; `/api/me/quick` runs a LIKE search), nor on most Server Actions (comment, consult, submit). | Routes in §4 | Add `hitRateLimit` per user (e.g. 30/min) on the PDF and quick search. |
| SEC-10 | P3 | **Sign-in rate-limit bucket is "unknown" when no IP can be read** (e.g. no proxy headers). Every caller shares one bucket, so one client can lock everyone out for 15 min. | `server/auth/rate-limit.ts:36` | Only matters outside Cloudflare; acceptable with the origin lock enabled. |
| SEC-11 | P3 | **Account lockout can be triggered deliberately.** Anyone who knows a User ID can lock that account with wrong passwords (up to 10 per 15 min per login, before the lockout threshold). | `password-sign-in.ts:105-114`, `rate-limit.ts:20` | Accepted pattern; the owner is alerted. |
| SEC-12 | P3 | **WhatsApp webhook uses a static shared header, not an HMAC of the body,** and has no replay protection. Impact is limited to delivery statuses. | `app/api/webhooks/ceoitbox/route.ts:18-22` | Use the provider's signature if CEOITBox offers one. |
| SEC-13 | P3 | **Provider error bodies are logged.** If CEOITBox echoes the template variables, a 6-digit OTP could reach the logs: the redaction masks only digit runs of 9 or more. | `lib/logging/logger.ts:106-112`, `server/integrations/ceoitbox/client.ts:96-105`, `otp-flow.ts:79` | Mask template variable values, or any 4–8 digit run, when the purpose is an OTP. |
| SEC-14 | P3 | **Set-password and not-me tokens are carried in URL query strings,** so they can appear in Cloudflare and GoDaddy access logs and browser history. Referrer-Policy limits external leaks. | `set-password.ts:102`, `complete-sign-in.ts:138` | Accepted trade-off; the tokens are single-use. |
| SEC-15 | P3 | **One `SESSION_SECRET` keys everything:** the session HMAC, purpose tokens, device cookies, OTP and challenge hashes, and path signatures. Domain separation prefixes are used, but rotating the secret logs everyone out and invalidates outstanding OTPs and links. | `lib/session/token.ts:17,56,94`, `lib/security/hashing.ts:9`, `middleware.ts:86` | Document the rotation runbook; optionally split the keys. |
| SEC-16 | P3 | **Logout doesn't revoke the DB row** when `getCurrentSession()` returns null (idle-expired or deactivated user); only the cookie is cleared. The row stays unusable because of the idle check, but it isn't marked revoked. | `app/api/auth/logout/route.ts:10-11` | Revoke by `sid` from the verified token even when the session isn't live. |
| SEC-17 | P3 | **Sign-out-everywhere can be blocked** if `users.security` is set to View only, because the route requires `change:true`. A user would lose a security control. | `app/api/me/sign-out-everywhere/route.ts:10`, `pages.ts:42` | Exempt the security page from View restrictions (like `neverHidden`). |
| SEC-18 | P3 | **`/api/health` is public and reveals the version and job-runner state.** A LATE runner lets anyone trigger the SA alert (rate-limited to once a day). | `app/api/health/route.ts:24-30` | Acceptable; optionally drop the version. |
| SEC-19 | P3 | **No `__Host-` prefix on the session cookie,** and `Secure` depends on `NODE_ENV` being exactly `production`. | `server/auth/http.ts:9-18` | Hardening. |
| SEC-20 | P3 | **52 MB Server Action body limit,** with all files read into memory (`file.arrayBuffer()`), so a few large concurrent uploads could pressure memory on shared hosting. | `next.config.ts:139-142`, `server/attachments/service.ts:50` | Monitor; the 10 MB × 5 limit is checked only after the body is parsed. |
| SEC-21 | P3 | **The Super Admin can set the CEOITBox base URL,** so the server's outbound requests can be pointed at any address (an SSRF risk, limited to Super Admins). | `server/integrations/ceoitbox/client.ts:74` | Allowlist the host. |

---

## H. SQL injection, XSS, CSRF, headers and uploads

### 7. SQL injection review

- **Sweep:** I grepped every `${...}` in `lib/db` and `server` that sits next to SQL keywords (41 files). Every interpolated fragment is one of:
  - a code constant (`INDIA_TODAY_SQL`, `JOINS`, `OPEN`, `PENDING`, `REQUEST_COLUMNS`, `SLA_SQL[...]`, `OUTCOME_COLUMNS`);
  - a builder output whose values go through `?` placeholders (`where`, `w.sql`, `t.sql`, `scope.sql`, `visibleToSql`);
  - a code-chosen string (`order` in `search.repository.ts:73-90`; `groupExpr` from `catalogue.ts:201,209`; `INDIA_DATE(<column literal>)`);
  - a typed enum value (`stuck.ts:36` `reason: StuckReason`).
- **JSON paths:** these are passed as parameters (`readiness.ts:146,169`, `` `$.${key}` `` as a `?` value), and keys are filtered to form field keys.
- **LIKE search:** wildcards are escaped (`list-filters.ts:293`, `admin-users.repository.ts:51`).
- **Backup:** identifiers are backtick-quoted from `SHOW TABLES` output (`server/ops/backup.ts:49`).
- **Result:** no injectable path found. Residual risk: `SLA_SQL[filter.sla]` with an unvalidated key would give a SQL error, not injection.

### 8. XSS / CSRF / headers / uploads summary

- **XSS:** no raw-HTML sinks. React escapes output. User-supplied `href` values are app paths only. Inline file preview is limited to PNG/JPEG/WEBP/PDF with a sandbox CSP.
- **CSRF:** the Server Actions Origin check, the `Sec-Fetch-Site` gate on unsafe `/api/*` methods, `SameSite=Lax`, and machine endpoints protected by secrets. The not-me link never acts on GET.
- **Headers:** CSP nonce + strict-dynamic, HSTS, XFO DENY, COOP `same-origin-allow-popups` (needed for the Firebase popup), nosniff, Referrer-Policy, Permissions-Policy.
- **Uploads:**
  - Attachments: extension allowlist + magic bytes + size and count limits + random stored name + path containment.
  - Admin CSV import: ≤ 2 MB (`server/import/service.ts:24-25`).
  - Workflow package import: ≤ 512 KB (`app/admin/workflows/import/actions.ts:10-16`).

## I. Reliability: notifications, reports and jobs (detail)

### 3. Confirmed defects

Each item below is confirmed by reading the code. P0 means release-blocking and P3 means minor.

| ID | P | Defect | Evidence | Impact | Fix |
|---|---|---|---|---|---|
| DEF-01 | P2 | Job steps that catch their own errors are recorded as **OK**. `runAutomations` treats only `counts.backup === "FAILED"` as a failure. `runDailyTemplateSync` returns `{templateSync: "failed: …"}` instead of throwing, so the automation board shows OK, the health check never says FAILING, and no `JOB_RUNNER_FAILED` alert goes out. | `server/ops/automation.ts:223`; `server/notifications/template-registry.ts:166-168` | Silent provider or template drift | Return a structured `{status}` from each step, or throw. Treat any `failed:` value as FAILED. |
| DEF-02 | P2 | The outbox can lose a message. `deliverOutbox` calls `notify(message)` and then always `markOutboxSent(id)`. But `notify` never throws: if `findRecipient` or `createNotification` hits a transient DB error, it logs and returns `{recorded:false}`, and the row is still marked sent. | `server/approvals/service.ts:366-370`; `server/notifications/notify.ts:88-102` | A committed decision whose message never arrives, with nothing to show for it | Check `summary.recorded`. Leave the row unsent (the claim lease expires) when nothing was recorded and the recipient is active. |
| DEF-03 | P2 | The `turnaround_by_step` report fetches `LIMIT 50000` with **no ORDER BY** and returns `truncated:false`. Above 50,000 decided tasks in the period, its median, P90, averages and in-time % are computed silently on an arbitrary subset. | `server/reports/catalogue.ts:163-192` | Wrong numbers without any warning (also in exports and schedules) | Aggregate avg and counts in SQL, or set `truncated` from `rows.length === 50000`. |
| DEF-04 | P3 | Analytics `loadQuality` and `loadHistory` are capped at `ROW_LIMIT = 20000`, with no ORDER BY and no truncation flag. Median, first-pass, rework, backlog and overdue history become silently wrong above 20,000 rows. | `lib/db/repositories/analytics-more.repository.ts:19,40,67,74` | Metric correctness at scale; fine at current volume (perf doc: 6,300 requests) | Same as DEF-03. Show "based on first N" when capped. |
| DEF-05 | P3 | The admin dashboard CSV download (`/api/admin/dashboards/[slug]`) is not audited, not rate-limited, and ignores the `features.reports` and `features.exports` switches. Report exports do all of these. It also turns every 500 into a 404. | `app/api/admin/dashboards/[slug]/route.ts:12-31` vs `app/api/reports/[key]/route.ts:22-41` | Unaudited bulk download of per-person performance data; inconsistent switch-off | Reuse the report route's guards, `recordAudit`, `hitRateLimit` and error mapping. |
| DEF-06 | P3 | Scheduled report emails call `sendEmail` directly, outside the notification and delivery pipeline. The result: no `notification_deliveries` row, no retry, and nothing in the Deliveries log. If sending to the 3rd recipient fails, the whole slot is marked FAILED and counts towards auto-pause, even though recipients 1 and 2 already received it. | `server/reports/schedules.ts:219-249` | Missed reports with no retry; misleading run history | Record each recipient as a delivery, or as `report_runs` per recipient. Retry the failed recipients only. |
| DEF-07 | P3 | Inconsistent approver attribution. The Analytics "approver workload" groups decisions by `t.approver_id`, while the "Approver performance" report groups by `t.decided_by`. A decision made by a delegate counts for the original approver on the dashboard but for the delegate in the report. | `lib/db/repositories/analytics.repository.ts:361`; `server/reports/catalogue.ts:135` | Two numbers for the same person disagree | Pick one rule (document it in the metric dictionary) and apply it to both. |
| DEF-08 | P3 | The webhook ignores Meta `failed` / `undelivered` statuses. Only delivered and read are parsed, so an accepted-then-failed WhatsApp message stays `SENT` for ever and is never retried. | `server/notifications/receipts.ts:16-25` | Users think a WhatsApp went out | Map `failed` to `FAILED` with the error code, never downgrading READ. Consider an email fallback. |

### 4. Potential risks

These are plausible problems that need conditions or scale to show.

| ID | P | Risk | Evidence |
|---|---|---|---|
| RISK-01 | P2 | **No global runner lock.** Two runs overlap when a run takes longer than 5 minutes, for example a large backup, 5 background exports of up to 50,000 rows, or template sync with 20 pages. Most steps are claim-safe, but `runDailyBackup` (check-then-create on file mtime) and the template sync (check-then-sync on the audit log) are not, so two full dumps can run at once and hold 2 of the 10 pool connections. | `server/ops/automation.ts:209-236`; `server/ops/backup.ts:188-193`; `lib/db/client.ts:20` |
| RISK-02 | P2 | **All automation runs inside one cron HTTP request**, steps run in order. A long backup or export can exceed the proxy or host timeout (behind Cloudflare, a timeout returns a 524 to curl). The heartbeat is written only at the end (`route.ts:23`), so a slow run reads as LATE or STOPPED. | `app/api/jobs/run/route.ts:19-35` |
| RISK-03 | P3 | **Duplicate sends after a timeout.** A `CEOITBOX_TIMEOUT` or Resend abort may already have been delivered, yet it is retryable. No idempotency key is sent: Resend `Idempotency-Key` is not used, and the WhatsApp retry omits `userMessageId`. | `server/jobs/retry-deliveries.ts:31,44-53`; `server/integrations/resend/client.ts:42-56` |
| RISK-04 | P3 | **SLA, due-soon and escalation notices are at-most-once.** The `task_reminders` claim is written before `notify`. If notify can't record (DB error) or the process dies, that level is never sent. | `server/jobs/sla.ts:69,150-296` |
| RISK-05 | P3 | **Poison export loop.** A RUNNING export older than 30 minutes is set back to QUEUED with no attempt counter. An export that OOM-kills the process (XLSX of 50,000 rows is built in memory, `export.ts:170-201`) is retried for ever. | `server/reports/background.ts:134` |
| RISK-06 | P3 | **Backup data protection.** Dumps are plain gzip (no encryption) on the same GoDaddy account. Off-site copies are a manual weekly download (doc §1). The attachments copy is never pruned, so files removed from the app stay in backups indefinitely, which conflicts with any future retention run. | `server/ops/backup.ts:127-167`; `docs/BACKUP_RESTORE_AND_ROLLBACK.md:13` |
| RISK-07 | P3 | **Alert starvation.** `evaluateAlerts` reads the first 200 active rules by id each run. At 20 per person, 11 or more people with full quotas means later rules are never checked. Report schedules take 20 per run, which is fine. | `server/reports/schedules.ts:364` |
| RISK-08 | P3 | The report preview page runs the full report (up to 5,000 rows) on every load, with no rate guard (`/admin/reports/[key]`), although analytics pages have one. | `app/admin/reports/[key]/page.tsx:39` |
| RISK-09 | P3 | **Outbox payloads are plaintext.** `notification_outbox.payload_json` holds the full `NotifyInput` (email body, links) unencrypted and keeps it 30 days after sending. Delivery payloads, by contrast, are sealed with AES-GCM (S-01). | `lib/db/repositories/outbox.repository.ts:9-16,61-68` |
| RISK-10 | P3 | **Metric basis mix.** Decision and cycle hours are calendar time and include time on hold, while due times use working hours shifted by hold time. As a result, "Average hours" and "in time %" can look contradictory. | `server/analytics/semantics.ts:7-9,22-23`; `server/reports/catalogue.ts:134` |
| RISK-11 | P3 | **Preferences gap.** Events with no group (COLLABORATOR_ADDED/UPDATE, CONSULTATION_REQUESTED/ANSWERED, INFORMATION_REQUESTED/ANSWERED, REQUEST_RECALLED, APPROVAL_EXPIRING, EXPORT_READY, ANALYTICS_ALERT, OPS_ALERT) are mandatory by fallback, so users can't switch off those emails. | `server/notifications/preferences.ts:58-66`; grep of `eventType:` across `server`/`app` |
| RISK-12 | P3 | The WhatsApp per-minute limiter is DELETE, then COUNT, then INSERT without a lock, so concurrent senders can exceed the limit. It also runs a global DELETE on every send. | `lib/db/repositories/whatsapp.repository.ts:47-56` |
| RISK-13 | P3 | The webhook uses a static secret, not an HMAC: a captured request can be replayed. The impact is low, since receipts only move status forward. | `app/api/webhooks/ceoitbox/route.ts:11-21` |
| RISK-14 | P3 | `department_scorecard` mixes cohorts: "Raised" is by submitted date, while "Approved" and "rate" are by closed date. `type_summary` and `department_summary` use the submitted cohort for outcomes, so the same period gives different "Approved" numbers across reports. | `server/reports/catalogue.ts:312-321` vs `468-477` |

---

## J. Admin and Super Admin: confirmations, audit logging and guards

### 3.3 Destructive / high-impact actions lacking confirmation
| Action | Where | Impact |
|---|---|---|
| Load demo data | `features/superadmin/DemoForms.tsx` L7-16 (no `confirm`), no environment guard in `server/demo/service.ts` L45 | Creates 20 users, 7 departments, groups and 12 published approval types in whatever DB it runs on, including production |
| Remove encrypted provider key | `SettingsGroupForm.tsx` L45 checkbox, form has no confirm (L12) | Silently disables email or WhatsApp delivery |
| Feature switches off | same form | Hides features for everyone |
| Set page HIDDEN for EVERYONE / remove rule | `features/superadmin/PageRuleForm.tsx` L27 (no confirm) | Can hide a whole page for all staff |
| Deactivate group / department / designation | `GroupForms.tsx` L44, `OrganisationForms.tsx` L39/L75 | Affects routing of future steps; designations drive approver eligibility |
| Close approval type ("Open for new requests" off) | `WorkflowPanels.tsx` L178/L206 | Stops new requests of that type |
| Working days change | `CalendarForms.tsx` L9 | Changes SLA computation for new approvals |
Confirmed (good): deactivate user, sign out everywhere, handover, bulk reassign, publish, delete type, restore, migrate, import (both), remove holiday, remove group member, custom approval save, retire demo, try-as, release hold, delete request (dialog + reason), template submit.

### 3.4 Actions lacking audit logging
- `GET /api/admin/workflows/[id]/export` (no audit; also returns raw `error.message`, route L32).
- `GET /api/admin/dashboards/[slug]` CSV download (no audit), unlike `/api/admin/import/[kind]` and `/api/superadmin/audit`, which audit.
- `saveThemeAction`, `dismissOnboardingAction`, `markRead*` (personal, acceptable).
- Audit **field inconsistency**: Admin actions record `sessionId` + `ipAddress`; Super Admin actions (backup, automation, deliveries, pages, demo load/retire, holds, custom-config, delegation) omit `ipAddress`, and `loadDemoData` (`demo/service.ts` L108) and delegation audits (`collab.ts` L129/L138) omit `sessionId` too.
- Non-atomic write+audit: `saveCustomConfig` (`custom-config.ts` L55-67), `createHold`/`releaseHold` (`governance.ts` L84-85, L93-95), `saveBudgetAction` (`budgets/actions.ts` L25-26), calendar actions. A crash between the two leaves an unaudited change.
Everything else (users, org, groups, workflows, migration, imports, settings, templates, holds, deletes, page rules, jobs, outbox, deliveries) is audited (verified per function).

### 3.6 Guard inconsistencies
- **G-1** `/admin/analytics`, `/admin/analytics/list`, `/admin/analytics/metrics` have no page-level `requireArea("admin")`; the shared screens call `requireArea("users")` (`AnalyticsScreen.tsx` L29). The project's own comment says a layout check is not enough (`app/admin/(home)/page.tsx` L11-12). Data is scoped by viewer role (`resolveScope`), so impact is low, but the pattern is inconsistent.
- **G-2** IT setting out-of-office for another person goes through the **users**-area action `createDelegationAction` (`collab-actions.ts` L117-125) with a role-only check (`collab.ts` L113). An IT admin whose `admin.users` page is View-only can still do it by submitting from `/users/delegation` with a `userId` field.
- **G-3 (needs runtime verification, medium)** Page access trusts the signed request path, and any path that is not a configured page is allowed (`page-access.ts` L43). The admin import actions are also bundled into `/superadmin/import` (`app/superadmin/import/page.tsx` L2), which is not a configured page. An IT_ADMIN whose `admin.import` is Hidden or View-only could POST the `runImportAction` action ID to `/superadmin/import`: `getAdminActor()` passes (area admin), page = null, so it is allowed. The action runs before the superadmin layout's 404. The same applies to any admin action reachable from an unconfigured path. Fix: map action IDs to page keys, or make admin actions declare their page key explicitly (`requireApiArea("admin", { page: "admin.import" })`), and fail closed for restricted users on unknown pages.
- `setPageRuleAction` passes `{ change: true }` explicitly while every other action relies on header detection (`pages/actions.ts` L21). Harmless, since the Super Admin is exempt.
- `simulateAction` does not check that the version belongs to a PREDEFINED type (`workflows/actions.ts` L113-127). Low impact, admin only.
- Raw SQL in a page and an action (`app/superadmin/pages/page.tsx` L24-27, `pages/actions.ts` L37) bypasses the repository layer.

## K. Security recommendations (from the security sub-audit)

### 9. Recommendations (priority order)

1. **Fix SEC-01 now (P1).** Enforce `checkContactChange` in `server/import/plan.ts` `planUsers`, and add an import-plan test: "IT Admin can't change another IT Admin's email or WhatsApp via import".
2. **Make the origin lock mandatory in production (SEC-06).** At minimum, trust `CF-Connecting-IP` only when the origin secret matched.
3. **Decide on SEC-07.** Notify the old email and WhatsApp on any contact or sign-in method change, and/or require Super Admin approval for approver-eligible users.
4. **Bind page access to actions (SEC-02).** Add an explicit page key per guarded action or route, and exempt `users.security` (SEC-17).
5. **Add rate limits** to `summary.pdf` and `/api/me/quick` (SEC-09). Audit schedule and alert toggles (S-07).
6. **Hardening:**
   - Mask short digit runs in provider-body logs (SEC-13).
   - Generic error in the workflow export (SEC-04).
   - Revoke the session row on logout regardless of liveness (SEC-16).
   - `__Host-` cookie (SEC-19).
   - Log forgot/set-password OTP failures (SEC-05).
7. **Update the docs.** Refresh `docs/SECURITY_AND_AUTHORIZATION_REVIEW.md` and `docs/KNOWN_ISSUES.md` for v1.7–v1.8 (page access, idle timeout, EXPORTER, origin lock, keep-alive/status) and record SEC-01.

### 10. Test evidence run in this audit

`npx vitest run tests/auth tests/security tests/admin/user-rules.test.ts tests/attachments/files.test.ts tests/approvals/v180-rules.test.ts tests/ui/guard-action.test.ts`: **13 files, 97 tests passed.** Integration and E2E suites were not run, because they need a database.
