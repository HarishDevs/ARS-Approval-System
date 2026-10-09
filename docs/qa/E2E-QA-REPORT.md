# End-to-end QA, fixes and retest — ARS Approval Platform

**Date:** 9 Oct 2026.
**Prompt:** "Claude Master Prompt — Full End-to-End Application Testing, Defect Fixing and Retesting" (owner's .docx), plus "complete the failed tests from the previous test" (the loader audit, `LOADER-QA-REPORT.md`).
**Build:** the starting commit was 22e6e3f (v1.3.0); the fixes are in the commit that adds this report (v1.3.1).
**Environment:** local Windows; Docker MySQL 8 with a throw-away database (`ars_approvals_test`); a production build (`next build && next start`, port 3100); Chromium via Playwright.
**Rules:**
- **No real secrets or live services were used.** Test sessions are generated for throw-away users.
- **No schema changes and no new dependencies.**
- Defects were fixed only after they were reproduced.

> **Status update (9 Oct 2026, later releases):**
> - **DEF-E1** (dependency advisories) was closed in **v1.3.4** (D-093): production audit 0.
> - **DEF-E2** (rate-limit IP source) was closed in **v1.3.4** (D-092): the client IP comes from CF-Connecting-IP, and QA-SEC-06 passes.
> - The QA suite is **27/27** since v1.3.4 and runs in CI from **v1.4.0**.
> - QA-AUTH-04 was updated in v1.4.0 (S-06): a locked account now gives the same generic answer as an unknown one, unless the password is right.
>
> The rest of this report is kept as it was on 9 Oct (v1.3.1).

## 1. Scope inventory (features that really exist → where they are tested)

| Area | What exists | Tested by |
|---|---|---|
| Spaces and roles | My approvals / Admin / Super Admin; USER, IT_ADMIN, SUPER_ADMIN; per-request access | e2e guard, QA-AZ-*, loader TC-027/067/084 |
| Sign-in | Google (Firebase), User ID + password + WhatsApp OTP, lockout, rate limits, set/forgot password, sessions, sign out, new-device alerts | QA-AUTH-*, QA-SEC-06, unit tests/auth (Google/OTP live flows blocked) |
| Approval engine | Node graph: sequential, parallel, any-one, any-N, conditions, choices, DoA matrix, hold/resume, changes and resubmit, withdraw, reopen, delegation, handover, SLA reminders/escalation | unit tests/engine and workflows, integration, e2e, QA-BL-* |
| Workflow builder | Form field creator (all types incl. Department/Designation lists), levels, DoA, test mode, publish | e2e session7/12, QA-A11Y-01 |
| Custom approvals; approver designations | Anyone, approver-eligible people only (D-085) | integration session4/11, e2e session11 |
| Attachments | Upload (type sniffing, 10 MB, 5 per upload, 20 per request), download with access check | e2e session6, QA-SEC-05, QA-FILE-01, loader TC-045..049 |
| Import / export | CSV templates, check, all-or-nothing import; dashboard CSV | e2e session10, integration session10, QA-FILE-01, loader TC-050..052 |
| Dashboards / insights | 4 admin dashboards with filters; Insights | e2e session11, QA-FILE-01, QA-PERF-01, loader TC-035..041 |
| Super Admin | Providers & security, WhatsApp templates, demo data, requests + soft delete, audit log, import | e2e session6/11, loader TC-084 |
| Notifications / jobs | Outbox, email/WhatsApp adapters, cron endpoint | QA-INT-*, QA-OPS-01, integration (delivery blocked: no keys) |
| **Not in this app** | payments, orders, dispatch, multi-tenancy, a public API, monitoring integration | marked NOT APPLICABLE |

## 2. Execution summary (this prompt's register, §5)

| | Count |
|---|---|
| Register rows | 50 |
| **PASS** | **38** |
| **FAIL** | **2** |
| BLOCKED | 5 |
| NOT EXECUTED | 2 |
| NOT APPLICABLE | 3 |
| Executed (PASS + FAIL) | 40 of 47 applicable |
| **Execution coverage** = executed ÷ applicable × 100 | **85.1 %** |
| **Pass rate** = passed ÷ executed × 100 | **95.0 %** |

- **What counts as executed:** PASS and FAIL only. BLOCKED, NOT EXECUTED and NOT APPLICABLE are excluded.
- **Rows that point to existing suites** (unit, integration, e2e, the loader audit) are counted PASS only because those suites were **run** in this session: baseline, after every fix, and as the final regression.

**Underlying automated totals (final regression, after all fixes):**

| Suite | Command | Result |
|---|---|---|
| Typecheck / lint | `npx tsc --noEmit`, `npm run lint` | exit 0 / exit 0 |
| Unit | `npm test` | 259 / 259 pass (+5 new: `tests/ui/guard-action.test.ts`) |
| Integration (MySQL) | `npm run test:integration` | 64 / 64 pass |
| End-to-end (CI suite, production build) | `npm run test:e2e` | 25 / 25 pass |
| Loader audit | `npx playwright test -c playwright.loaders.config.ts` | 45 / 45 pass (was 29 / 42 before the fixes) |
| New QA suite | `npx playwright test -c playwright.qa.config.ts` | 26 / 27 pass; 1 open (QA-SEC-06) |

## 3. Test register

| Test ID | Feature | Scenario | Expected | Actual | Status | Priority | Evidence | Defect | Fix / changed files | Retest |
|---|---|---|---|---|---|---|---|---|---|---|
| QA-BUILD-01 | Build | Production build, lint, typecheck | All succeed | next build OK (inside the e2e run); lint 0 problems; tsc 0 errors | PASS | P0 | evidence/e2e/baseline.txt, regression.txt | - | - | PASS after fixes |
| QA-MIG-01 | Database | Migrations idempotent | Second run applies nothing | 'No pending migrations.' twice, exit 0 | PASS | P1 | baseline.txt | - | - | - |
| QA-DEP-01 | Security | Dependency vulnerabilities (npm audit, production deps) | No high/critical | 13 findings (6 high, 7 moderate), all in third-party packages: next/postcss (fix next 15.5.27, minor), firebase client (fix needs a major), firebase-admin chain (fix 14.5.0) | FAIL | P1 | baseline.txt (package list) | DEF-E1 | Not changed: dependency upgrades need the owner's approval | Open |
| QA-SMOKE-01 | Smoke | Sign-in page, brand assets, unknown page | 200 / 200 / redirect or 404 | login=200; logo=200; logoType="image/svg+xml"; unknown=307 | PASS | P0 | tests/qa-e2e/app.spec.ts | - | Test corrected (it followed the redirect) | PASS |
| QA-OPS-01 | Operations | Scheduled-jobs endpoint auth | No/wrong secret → 404; right secret → 200 | anonymous=404; wrong=404; right=200; body={"success": true, "data": {"outbox": {"outboxSent": 0}, "retries": {"attempted": 0, "sent": 0, "rescheduled": 0, "gaveUp": 0}, "sla": {"reminders": 0, "escalations": 0}, "templates": {"templateSync": "skipped: no CEOIT | PASS | P0 | tests/qa-e2e/app.spec.ts | - | - | - |
| QA-AUTH-01 | Session | Sign out | Server session revoked; old cookie refused | sessionRevoked=1; oldCookieUrl="/login" | PASS | P0 | tests/qa-e2e/app.spec.ts | - | - | - |
| QA-AUTH-02 | Session | Deactivated user | Locked out at once | status=200; url="/login" | PASS | P0 | tests/qa-e2e/app.spec.ts | - | - | - |
| QA-AUTH-03 | Session | Forged / tampered cookie (uid changed) | Not accepted | landedOn="/login"; superAdminShown=0 | PASS | P0 | tests/qa-e2e/app.spec.ts | - | - | - |
| QA-AUTH-04 | Session | Wrong passwords | Same answer for real/unknown IDs; locked on 5th; per-ID limit on 11th | realVsUnknown=["The user ID or password is incorrect.", "The user ID or password is incorrect."]; lockMessages=["The user ID or password is incorrect.", "The user ID or password is incorrect.", "The user ID or password is incorrect.", "The user ID or password  | PASS | P0 | tests/qa-e2e/app.spec.ts | - | Test rewritten to match the configured limits (5 / 10 / 20) | PASS |
| QA-AUTH-05 | Session | Google sign-in (Firebase) | Signs in the matching user | Needs the real Firebase project and a Google account; not available in the test environment. Server-side token rules are unit-tested (tests/auth) | BLOCKED | P0 | - | - | - | - |
| QA-AUTH-06 | Session | Password + WhatsApp OTP | Code sent, verified once | Needs CEOITBox keys; the OTP flow is covered by unit tests with fakes (tests/auth/password-sign-in.test.ts, executed in the baseline) | BLOCKED | P0 | - | - | - | - |
| QA-AUTH-07 | Session | Set / forgot password | Single-use link, rules enforced | Covered by unit tests tests/auth/set-password.test.ts (executed, pass) | PASS | P1 | unit run 259/259 | - | - | - |
| QA-AZ-01 | Authorization | Another person's request / attachment by URL | 404 | otherUsersRequest=404; requestId=1; attachmentApi=404 | PASS | P0 | tests/qa-e2e/app.spec.ts | - | - | - |
| QA-AZ-02 | Authorization | IT Admin → Super Admin pages; grant Super Admin | All 404; cannot grant | superadminPages=[404, 404, 404, 404]; superAdminCheckboxShown=1; enabled=false | PASS | P0 | tests/qa-e2e/app.spec.ts | - | - | - |
| QA-AZ-03 | Authorization | A captured Approve replayed by a non-approver | Refused; nothing approved | replayStatus=200; approvedTasks=0 | PASS | P0 | tests/qa-e2e/app.spec.ts | - | - | - |
| QA-AZ-04 | Authorization | Route protection per space (existing e2e guard.spec) | Plain user 404 on /admin, /superadmin | 25/25 e2e pass | PASS | P0 | tests/e2e/guard.spec.ts | - | - | PASS after fixes |
| QA-AZ-05 | Authorization | Replayed Super Admin delete by a plain user (loader TC-084) | Refused | Pass | PASS | P0 | tests/qa-loaders/loaders.spec.ts | - | - | PASS after fixes |
| QA-BL-01 | Business rules | DoA routing by amount | ₹50,000: senior level not needed; ₹15,00,000: needed | smallSeniorSkipped=true; largeSeniorNeeded=true; small=3; large=4 | PASS | P0 | tests/qa-e2e/app.spec.ts | - | - | - |
| QA-BL-02 | Business rules | Hold → resume → approve both levels | Approved; timeline + outbox written | approved=1; timelineEvents=13; outboxMessages=4 | PASS | P0 | tests/qa-e2e/app.spec.ts | - | - | - |
| QA-BL-03 | Business rules | Withdraw | Cancelled; leaves the approver's queue | cancelled=1; stillInManagerQueue=0 | PASS | P1 | tests/qa-e2e/app.spec.ts | - | - | - |
| QA-BL-04 | Business rules | Reject needs a reason; no self-approval | Reason required; requester has no Approve | requesterSeesApprove=0 | PASS | P0 | tests/qa-e2e/app.spec.ts | - | - | - |
| QA-BL-05 | Business rules | Super Admin reopens an approved request | Back to In progress with pending tasks | reopened=true; pendingTasks=1 | PASS | P1 | tests/qa-e2e/app.spec.ts | - | - | - |
| QA-BL-06 | Business rules | Multi-level patterns (sequential, parallel, any-one, any-N, conditions, DoA, choices) | Engine routes correctly | Unit + integration suites (engine, builder, DoA, approver designations): 259 unit / 64 integration pass | PASS | P0 | tests/engine, tests/workflows, tests/integration | - | - | PASS after fixes |
| QA-BL-07 | Business rules | Duplicate submit / concurrent approval / replay (loader TC-013/014/020/022/085) | One record | Pass (DB-verified) | PASS | P0 | tests/qa-loaders/loaders.spec.ts | - | - | PASS after fixes |
| QA-SEC-01 | Security | Stored XSS in title and comment | Shown as text; never runs | firedInQueue=null; firedOnRequestPage=null; injectedImgElements=0 | PASS | P0 | tests/qa-e2e/app.spec.ts | - | - | - |
| QA-SEC-02 | Security | SQL injection in search | Treated as text; DB intact | results=[{"q": "' OR 1=1 -- ", "status": 200, "rows": 0, "shown": true}, {"q": "%' UNION SELECT password_hash FROM users -- ", "status": 200, "rows": 0, "shown": true}, {"q": "\\' ; DROP TABLE users; --", "status": 200, "rows": 0, "shown": true}]; usersTableIn | PASS | P0 | tests/qa-e2e/app.spec.ts | - | - | - |
| QA-SEC-03 | Security | Security headers; no stack leaks | CSP (frame-ancestors none), XFO, nosniff, Referrer-Policy, HSTS, COOP; no X-Powered-By | present={"content-security-policy": "default-src 'self'; script-src 'self' 'nonce-HVVBWESw/5vOMKBrJBW14Q==' 'strict-dynamic' https://apis.google.com; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self'; connect-src 'self' https://iden | PASS | P1 | tests/qa-e2e/app.spec.ts | - | - | - |
| QA-SEC-04 | Security | CSRF: Server Action posted with a foreign Origin | Refused; nothing saved | forgedStatus=500; commentSaved=0 | PASS | P0 | tests/qa-e2e/app.spec.ts | - | - | - |
| QA-SEC-05 | Security | Executable disguised as .pdf | Refused by content check | saved=0 | PASS | P1 | tests/qa-e2e/app.spec.ts | - | - | - |
| QA-SEC-06 | Security | Per-IP sign-in limit vs spoofed X-Forwarded-For | Changing the claimed address doesn't reset the limit | spoofedStatuses=[401, 401, 401, 401, 401, 401, 401, 401, 401, 401, 401, 401, 401, 401, 401, 401, 401, 401, 401, 401, 401, 401]; sameClaimedIpStatuses=[401, 401, 401, 401, 401, 401, 401, 401, 401, 401, 401, 401, 401, 401, 401, 401, 401, 401, 401, 401, 429, 429] | FAIL | P1 | tests/qa-e2e/app.spec.ts | DEF-E2 | Not changed: the fix depends on the GoDaddy/Cloudflare proxy chain (wrong choice could lock out everyone); needs the owner | Open |
| QA-SEC-07 | Security | CORS | No cross-origin access | No cross-origin API is offered; not probed separately | NOT EXECUTED | P3 | - | - | - | - |
| QA-FILE-01 | Files | Dashboard CSV equals the page; attachment download name/type | Match; attachment + application/pdf | downloadStatus=200; contentType="application/pdf"; disposition="attachment; filename=\"quote 1.pdf\"; filename*=UTF-8''quote%201.pdf"; raisedOnScreen="12"; csvRow="E2E Department,Ravi Requester,12,1,0,1,10,100,0.0,2026-10-09" | PASS | P1 | tests/qa-e2e/app.spec.ts | - | - | - |
| QA-FILE-02 | Files | Uploads: type, size, interrupted, slow (loader TC-045..049) | Validated; safe failure | Pass after fixes (interrupted upload no longer crashes) | PASS | P1 | tests/qa-loaders/loaders.spec.ts | DEF-02 | features/ui/form.tsx | PASS |
| QA-FILE-03 | Files | Bulk import (template, check, all-or-nothing) | Works | e2e session10 + integration session10 pass | PASS | P1 | tests/e2e/session10.spec.ts | - | - | PASS after fixes |
| QA-INT-01 | Integrations | Notifications queued for every decision (outbox) | Rows written | approved=1; timelineEvents=13; outboxMessages=4 | PASS | P1 | tests/qa-e2e/app.spec.ts | - | - | - |
| QA-INT-02 | Integrations | Real email (Resend) / WhatsApp (CEOITBox) delivery | Delivered | No provider keys or sandbox in the test environment (never use real keys in tests); adapters are tested against fakes in integration session7 | BLOCKED | P1 | - | - | - | - |
| QA-INT-03 | Integrations | Scheduled reminders/escalation | Once each | Integration SLA test passes | PASS | P1 | tests/integration/session4.int.test.ts | - | - | PASS after fixes |
| QA-LOAD-01 | Loaders / resilience | Loader audit TC-001…TC-085 (re-run after fixes) | All applicable pass | 70 PASS, 0 FAIL, 2 BLOCKED (TC-044, TC-083 need fault injection), 13 N/A; 45/45 audit tests green | PASS | P0 | evidence/loaders-after-fix/ | DEF-01…09 | See change log | PASS |
| QA-PERF-01 | Performance | Key page timings (median of 5) | < 1.5 s | medianMs={"/users": 82, "/users/requests": 85, "/admin": 98, "/admin/dashboards/utilisation": 107, "/admin/dashboards/approvers": 109, "/admin/users": 104} | PASS | P2 | tests/qa-e2e/app.spec.ts | - | - | - |
| QA-PERF-02 | Performance | 20 concurrent users (server only) | All 200; p95 < 3 s | users=20; totalMs=239; p50=230; p95=235; max=237; statuses=[200] | PASS | P2 | tests/qa-e2e/app.spec.ts | - | Test corrected to measure the server, not 20 browsers on one PC | PASS |
| QA-PERF-03 | Performance | Stress / endurance load | Recovers from overload | Deliberately not run: a local PC can't represent GoDaddy, and load tests must not hit production | NOT EXECUTED | P3 | - | - | - | - |
| QA-A11Y-01 | Accessibility | Every control named; one h1; lang; alt | No gaps | /login={"controls": 2, "unnamed": [], "h1": 1, "lang": "en", "imagesWithoutAlt": 0}; /users={"controls": 0, "unnamed": [], "h1": 1, "lang": "en", "imagesWithoutAlt": 0}; /users/new={"controls": 0, "unnamed": [], "h1": 1, "lang": "en", "imagesWithoutAlt": 0}; / | PASS | P2 | tests/qa-e2e/app.spec.ts | DEF-E3 | features/admin/WorkflowBuilder.tsx (aria-labels) | FAIL → fixed → PASS |
| QA-A11Y-02 | Accessibility | Visible keyboard focus (sign-in) | Visible on every control | focusSequence=[{"tag": "input:loginId", "outline": "solid 2px", "shadow": "rgb(255, 255, 255) 0px 0px 0px 0px, rgb(201, 218, 238) 0px 0px 0px 2px, rgba(0, 0, 0, 0) 0px 0px 0px 0px"}, {"tag": "input:password", "outline": "solid 2px", "shadow": "rgb(255, 255, 25 | PASS | P2 | tests/qa-e2e/app.spec.ts | - | Test corrected (stop when focus leaves the page) | PASS |
| QA-A11Y-03 | Accessibility | Busy states announced; contrast; reduced motion (loader TC-063..066) | Pass | Pass after fixes (live region; disabled button 4.72:1) | PASS | P2 | tests/qa-loaders/loaders.spec.ts | DEF-05, DEF-06 | form.tsx, globals.css | PASS |
| QA-UI-01 | Compatibility | Phone width: no sideways scrolling | sidewaysScroll={"/users": false, "/users/new": false, "/users/requests": false, "/admin": false, "/admin/dashboards/utilisation": false, "/admin/import": false, "/admin/workflows/new": false} | sidewaysScroll={"/users": false, "/users/new": false, "/users/requests": false, "/admin": false, "/admin/dashboards/utilisation": false, "/admin/import": false, "/admin/workflows/new": false} | PASS | P2 | tests/qa-e2e/app.spec.ts | - | - | - |
| QA-UI-02 | Compatibility | Firefox / Safari | Same behaviour | Only Chromium is installed for Playwright here; installing browsers needs approval | BLOCKED | P2 | - | - | - | - |
| QA-OPS-02 | Operations | Backup / restore | Restorable | GoDaddy's Hosted Database backups are managed in its console; no access from here | BLOCKED | P1 | - | - | - | - |
| QA-OPS-03 | Operations | Monitoring / alerts | Alerts on failure | No monitoring integration exists in the app (logs only); a hosting-level concern | NOT APPLICABLE | P3 | - | - | - | - |
| QA-NA-01 | Business rules | Payments, sales orders, dispatch orders | - | Not features of this application | NOT APPLICABLE | - | Feature inventory | - | - | - |
| QA-NA-02 | Authorization | Multi-tenant isolation | - | Single organisation (ARS); no tenants | NOT APPLICABLE | - | Feature inventory | - | - | - |

## 4. Defect register

| Defect | From | Severity | Status | Root cause (established) | Fix | Retest |
|---|---|---|---|---|---|---|
| DEF-02 | Loader TC-009/017/026/029/031/032/049/074 | High | **Fixed** | `useActionForm` let a failed Server Action throw into React; there was no error boundary | `guardAction` catches it and returns a plain message (offline / couldn't reach / session ended); fields are kept; `app/error.tsx` and `app/global-error.tsx` added | PASS |
| DEF-03 | TC-018/030/070 | Medium | **Fixed** | No time limit; `useActionState` stays pending while the action's request is open | 30 s limit, with "it may still go through"; the form keeps its own busy state | PASS |
| DEF-06 | TC-066 | Medium | **Fixed** | White text on #C9DAEE (1.42:1) | Disabled primary = #53769E (4.72:1) | PASS |
| DEF-01 | TC-003/039/041 | Medium | **Fixed** | No feedback for client navigations outside Dashboards/Import | A pending spinner on the clicked sidebar link (`useLinkStatus`); a pending spinner on period/paging links | PASS |
| DEF-04 | TC-040 | Medium | **Fixed** | Rapid client navigations on the same route could render an older request | Period and paging links do a normal page load (the last click wins) with a pending state | PASS |
| DEF-05 | TC-064 | Low | **Fixed** | No busy announcement on ordinary forms | `aria-busy` on the button + a polite live region | PASS |
| DEF-07 | TC-076 | Low | **Fixed** | "Not found." when the session ends mid-action | The guard asks `/api/auth/status` and says "Your session has ended…" | PASS |
| DEF-08 | TC-004 | Low | **Fixed** | The busy label changed the button's width | The label stays (hidden) to keep the width; a spinner overlays it; labels don't wrap | PASS |
| DEF-09 | DIAG-040 | Low | **Fixed** (side effect) | The first period click after a cold start was lost (most likely during hydration) | Plain links work before hydration | PASS (7/7 runs, incl. cold start) |
| DEF-E3 | QA-A11Y-01 | Low | **Fixed** | Step name / "Who approves" in the builder had no accessible name (6 controls on a new workflow) | `aria-label`s | PASS |
| DEF-E4 | Found while fixing | High (introduced, never released) | **Fixed before commit** | My first DEF-01 attempt (a `loading.tsx` per space) made missing pages return HTTP 200 instead of 404 (D-016), and left Admin → Departments Save stuck | Reverted; replaced by link-level pending state | TC-006 and TC-011 PASS |
| DEF-E1 | QA-DEP-01 | High (dependencies) | **Open — needs approval** | `npm audit`: 6 high / 7 moderate in production dependencies | Recommend: next 15.5.27 (patch, also fixes postcss); firebase-admin 14.5.0 (minor). The firebase client fix is a major upgrade: plan separately | — |
| DEF-E2 | QA-SEC-06 | Medium | **Open — needs a decision** | The per-IP limit keys on the left-most `X-Forwarded-For` value, which the client controls | Use the address set by the trusted proxy: `CF-Connecting-IP` when traffic always comes through Cloudflare, otherwise the right-most XFF entry added by GoDaddy's proxy. Needs confirmation of the live proxy chain; a wrong choice could put all users on one address and lock everyone out. The per-account lockout (5) and the per-ID limit (10) still apply | — |

## 5. Change log (files changed by fixes)

| File | Why |
|---|---|
| `features/ui/form.tsx` | `guardAction` (catch, 30 s limit, session-ended detection); the form's own busy state; SubmitButton: fixed width, spinner, `aria-busy`, live region, no wrapping (DEF-02/03/05/07/08) |
| `app/api/auth/status/route.ts` (new) | Yes/no "still signed in", for the guard (DEF-07). Public like the other /api/auth routes; returns nothing else |
| `app/error.tsx`, `app/global-error.tsx` (new) | A friendly fallback instead of the blank "Application error" (DEF-02, TC-083 risk) |
| `styles/globals.css` | Readable disabled primary button (DEF-06) |
| `features/shell/SideNav.tsx` | A pending spinner on the clicked menu link (DEF-01) |
| `features/ui/PendingLink.tsx` (new); `features/admin/dashboards/DashboardFrame.tsx`; `app/users/requests/page.tsx`; `app/superadmin/requests/page.tsx` | Period/paging links: a normal page load + pending state (DEF-01/04/09) |
| `features/admin/WorkflowBuilder.tsx` | `aria-label`s (DEF-E3) |
| Tests | New: `tests/qa-e2e/app.spec.ts`, `playwright.qa.config.ts`, `tests/ui/guard-action.test.ts`. Loader suite: checks moved from raw text to the accessible name/`aria-busy` where the button DOM changed; the width check for DEF-08 added; feedback detected before the page change; TC-074 matches its message, not Next's empty route announcer. **No assertion was weakened.** |

There are no migration or configuration changes.

## 6. Remaining risks and limitations

- **Open:** DEF-E1 (dependency upgrades) and DEF-E2 (the IP source for rate limits), both waiting for the owner.
- **Blocked:**
  - live Google sign-in, the WhatsApp OTP and real email/WhatsApp delivery (no provider access in tests);
  - Firefox and Safari;
  - backup/restore (GoDaddy console);
  - TC-044 and TC-083 (need a fault-injection hook; `error.tsx` now limits their impact).
- **Not run:** stress/endurance load (it must not target production; a local PC isn't representative); CORS probing.
- **Never tested here:** GoDaddy and Cloudflare in front of the app (real latency, proxy timeouts, the 30 s action limit against proxy limits).

## 7. Release recommendation

**Release v1.3.1** (Update Preview → Publish).
- It fixes every defect from the loader audit and the builder accessibility gap, with the full regression green.
- **Before or right after publishing, decide on DEF-E1:** at least the Next.js patch 15.5.27.
- **Also decide on DEF-E2:** confirm whether traffic always comes through Cloudflare.

This report doesn't claim the application is defect-free. It states what the executed evidence supports.
