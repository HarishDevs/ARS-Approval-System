# 01 — Feature inventory and requirements traceability (FI)

| | |
|---|---|
| Auditor prefix | **FI** |
| Target | ARS-CMS v1.39.0, commit `0473f2560398844f875a3bec49206e13078d06d7` (`git log -1` confirmed) |
| Date | 31 Oct 2026 |
| Method | Code review of `app/`, `features/`, `server/`, `lib/`, `database/migrations/`; requirement sources listed in §2; test titles harvested from every spec; **unit suite run by FI** (`npx vitest run`). No source, test or config file was changed. |
| Evidence folder | `audit/TEST_EVIDENCE/FI/` |

## 1. How to read this report

**Status column** (brief §6 vocabulary, plus the lead auditor's requested marker):

| Status | Meaning here |
|---|---|
| **PENDING RE-RUN** | Covered by the cited e2e/integration test(s). FI did not run them (brief rule 4). Equivalent to NOT TESTED by FI until the lead auditor re-runs the suites. |
| **PARTIAL** | A test covers only part of the feature (for example, the server logic but not the page or action, or the page is only crawled by `zz-site-audit.spec.ts`). |
| **NOT TESTED** | No automated test found for the feature. |
| **NOT APPLICABLE** | The feature does not exist (a requirement with no feature). |

No row is marked PASS on the strength of e2e or integration tests. Where unit tests cover a row, the unit run below is the evidence for that part only.

**Unit run (produced by FI):** `npx vitest run` gave **88 test files passed, 767 tests passed, 0 failed** (Vitest 5.0.3, 11.2 s). Full output: `audit/TEST_EVIDENCE/FI/vitest-unit-run.txt`.

**Actual behaviour** is from code review only, unless a test is cited.

**Guards** (verified in `server/authorization/guards.ts:19-75`, `app/*/layout.tsx`):
- **U** = `requireArea("users")` (signed in) + the Super Admin page-access rule (`server/authorization/pages.ts`) + module access (APPROVAL/TASK/INFORMATION/AI) + the feature switch where noted.
- **A** = `requireArea("admin")`: IT_ADMIN or SUPER_ADMIN, otherwise a plain 404, plus the page rule.
- **S** = `requireArea("superadmin")`: SUPER_ADMIN only, otherwise a 404.
- **P** = public.
- Server actions and APIs use `requireApiArea(area, {change, page})`. A view-only page refuses actions.

**Supporting evidence files:**
- `test-titles-e2e-int.txt`: 666 e2e and integration test titles with file:line.
- `test-titles-unit.txt`: 925 unit test titles.
- `routes-raw.txt`: all 129 page routes with area, guard and menu flag.
- `register-yet-to-do.txt`: the 465 "Yet to do" rows of the register.
- `register-not-feasible.txt`: the 66 "Not feasible" rows.

## 2. Sources discovered

| Source | Size | Use |
|---|---|---|
| `app/**/page.tsx` | **129 routes**: 7 public, 2 root (`/`, `/try`), 44 admin, 21 superadmin, 55 users | Route inventory (Appendix A) |
| Sidebars and menus | `features/shell/users-nav.ts`, `AppShell.tsx` (Compact "Tasks & projects" group, command palette list), `BottomNav.tsx`, `ProfileMenu.tsx`, `classic-modules.ts`, `app/admin/layout.tsx` (27 entries), `app/superadmin/layout.tsx` (19 entries) | Reachability |
| Server actions | 31 `*actions.ts` files, **163 exported actions** | Feature discovery |
| API routes | **39** `app/api/**/route.ts` | Feature discovery and guards |
| Jobs | `app/api/jobs/run/route.ts` → `server/ops/automation.ts`, 16 steps: outbox, deliveries, sla, templates, housekeeping, delegations, backup, reports, alerts, expiry, rules, modules, calendar, ai, exports, stuck. Also `server/jobs/{sla,delegations,retry-deliveries}.ts` | Background features |
| Notifications | `server/notifications/*`: 4 categories (APPROVAL/TASK/INFORMATION/SYSTEM), 12 task events, 4 information events, 13+ security/system events, email + WhatsApp, outbox, receipts, rule runner, template registry | Notification features |
| Module switches | `server/settings/features.ts`: `analytics, reports, scheduled_reports, amendments, templates, tasks, information, ai` (ON / OFF / IT_ONLY), plus `features.exports` (ROLE) | Switch coverage |
| Page-access keys | `server/authorization/pages.ts`: **50 keys** (28 users, 22 admin). Super Admin pages are never configurable. | Guard coverage |
| Requirements | `docs/requirements/UNIFIED_MASTER_PROMPT.md` (3,664 lines); `docs/IMPLEMENTATION_STATUS_REGISTER.md` (1,857 rows: 1,326 Implemented, **465 Yet to do**, **66 Not feasible**); `docs/FEATURE_ACCEPTANCE_CRITERIA.md` (UI/FB/RA/WS/RD/EN/RP/AD IDs); `FLOWS.md` (F-01 … F-184); `DEVELOPMENT-MEMORY.md` (D-001 … D-241); `PLAN-CHECKLIST.md` (47 open `[ ]` items, 32 `[~]`) | Traceability |

## 3. Feature inventory

Columns: Feature ID | Module | Feature | Route / entry | User role | Expected behaviour (requirement) | Actual behaviour (code) | Test case | Status | Evidence | Defect ID

### 3.1 Sign-in, session and public pages

| ID | Module | Feature | Route | Role | Expected | Actual | Test case | Status | Evidence | Defect |
|---|---|---|---|---|---|---|---|---|---|---|
| FI-001 | Sign-in | Google sign-in, no OTP | `/login`, `POST /api/auth/google` | Admin-created users | F-01, D-006: only admin-created, active users; no OTP | Firebase token verified on server; inactive or unknown users refused | unit `tests/auth/google-provider.test.ts`; int `sign-in-both.int.test.ts:26` | PENDING RE-RUN | unit pass (FI run) | |
| FI-002 | Sign-in | User ID + password + WhatsApp OTP | `/api/auth/password/{start,verify,resend}` | Password users | F-02: OTP on WhatsApp only; attempt limit | OTP challenge with an attempt cap; resend route | unit `password-sign-in.test.ts`; int `otp.int.test.ts:12` "never allows more than max_attempts" | PENDING RE-RUN | unit pass | |
| FI-003 | Sign-in | Google or password ("Both") | user setting | Admin sets | F-149, D-208 | `signInMethod` BOTH accepted; moving to Google-only clears the password | int `sign-in-both.int.test.ts:26,38`; e2e `v1130-invite.spec.ts:67` | PENDING RE-RUN | | |
| FI-004 | Sign-in | New-login alert and "This wasn't me" | `/security/not-me`, `POST /api/auth/not-me` | Any user | F-03, F-05: alert on a new device; one click secures the account | `complete-sign-in.ts:138` builds the not-me link; the route locks the account and ends sessions | unit `password-sign-in.test.ts`, `security.test.ts`; e2e `v140-api.spec.ts` | PARTIAL | No e2e completes the not-me flow end to end | |
| FI-005 | Sign-in | Forgot password | `/forgot-password`, `/api/auth/forgot/{start,complete}` | Password users | F-04 | Two-step reset with a WhatsApp code | unit `set-password.test.ts`; e2e `v1100-web.spec.ts` (link answers) | PARTIAL | No end-to-end reset test | |
| FI-006 | Sign-in | Set password / invitation link | `/set-password`, `/api/auth/set-password/*` | Invited users | D-208, v1.13 invite: 72-hour link plus a WhatsApp code; break-glass excluded | `server/auth/set-password.ts:72-135` | unit `set-password.test.ts`; e2e `v1130-invite.spec.ts:26,45` | PENDING RE-RUN | unit pass | |
| FI-007 | Sign-in | Rate limiting and lockout | auth APIs | All | F-09, D-059 | MySQL window counters (`server/security/limits`) | unit `jobs/retry-rate-limit.test.ts`; int `jobs.int.test.ts:24` | PENDING RE-RUN | | |
| FI-008 | Session | Idle sign-out and signed-out page | `/signed-out`, `SessionWatch.tsx` | All | F-122, F-132, D-142, D-158: 30 minutes by default, page says why | `guards.ts:31` redirects to `/signed-out?reason=` | int `sessions.int.test.ts:22`, `v180.int.test.ts:190`; e2e `v180.spec.ts:143` | PENDING RE-RUN | | |
| FI-009 | Session | Keep-alive, stale-build banner, logout | `/api/auth/keep-alive`, `/api/auth/status`, `/api/auth/logout` | All | v1.12.5 | Keep-alive answers yes/no only | e2e `v1125-stale-page.spec.ts:9,30`; e2e `v128-classic-nav.spec.ts:136` (Quit) | PENDING RE-RUN | | |
| FI-010 | Session | Role routing and area guard | `/` → `/users`; `/admin`, `/superadmin` | All | F-08, D-034/039: wrong role gets a 404 | `requireArea` 404s and audits `AREA_ACCESS_DENIED` | e2e `guard.spec.ts:5,11,19` | PENDING RE-RUN | | |
| FI-011 | Public | Landing, privacy, terms | `/login`, `/privacy`, `/terms` | Public | F-144, D-188 | Static pages that link to each other | e2e `v1122-public.spec.ts:5,35` | PENDING RE-RUN | | |
| FI-012 | Sign-in | Try as (one-time link) | `/try`, `/api/auth/try/[token]`, admin `tryAsLinkAction`, Super Admin `tryAsAction` | IT/Super Admin | F-142, D-185: never replaces a live session | `server/auth/try-as.ts`; `/try` explains when already signed in | unit `auth/try-as.test.ts`; e2e `v119-ai-rules-try-as.spec.ts:28` | PENDING RE-RUN | unit pass | |
| FI-013 | Sign-in | Break-glass account | `scripts/admin/break-glass.js`; `users.break_glass_until` | itadmin@ (holder) | F-07, D-011/041: time-limited; **every sign-in or action** alerts; auto-disables | Sign-in refused after the window (`sign-in-rules.ts:15`, `session.ts:65`); **sign-in** alert `BREAK_GLASS_USED` (`complete-sign-in.ts:146`); no alert on each action; never an approver | unit `password-sign-in.test.ts:245`, `user-rules.test.ts:26`, `approver-rules.test.ts:10` | PARTIAL | Script not tested; per-action alert not built (FLOWS table says "Partly built") | FI-D06 |
| FI-014 | Security | Security headers, CSP, CORS, origin | middleware | All | Brief, SEC-07/18 | Headers on every page | e2e `guard.spec.ts:25`, `v1100-web.spec.ts:165`, `v140-api.spec.ts:70`; unit `csp.test.ts`, `safe-next.test.ts`, `route-inventory.test.ts` | PENDING RE-RUN | unit pass | |

### 3.2 Shell, navigation and UI framework

| ID | Module | Feature | Route | Role | Expected | Actual | Test case | Status | Evidence | Defect |
|---|---|---|---|---|---|---|---|---|---|---|
| FI-015 | Shell | User sidebar (Compact) | all `/users/*` | USER | F-127, D-236/237: Home, Inbox, My Approvals, Tasks & projects, Information, AI, Calendar, Analytics | `users-nav.ts` + `AppShell.tsx:142-157`. In Compact view the Tasks section becomes the "Tasks & projects" group, so *Assigned by me*, *Team tasks* and *Task search* leave the sidebar (they stay in Ctrl K and on My Tasks) | e2e `v190.spec.ts:181`, `v171-nav.spec.ts:37`, `v132-asana-skeleton.spec.ts:19` | PENDING RE-RUN | | |
| FI-016 | Shell | Admin and Super Admin sidebars | `/admin`, `/superadmin` | IT / SA | D-039 | 27 and 19 entries; Analytics and Reports only when switched on | e2e `v1100-web.spec.ts:94` (every sidebar link answers) | PENDING RE-RUN | | |
| FI-017 | Shell | Command palette (Ctrl K) | everywhere | All | WS-03 | Role-filtered pages; access-checked search via `/api/me/quick` | e2e `v160-workspace.spec.ts:41`; unit `queue-and-shortcuts.test.ts` | PENDING RE-RUN | | |
| FI-018 | Shell | Keyboard shortcuts J/K/Enter/A/C/? | lists | All | WS-02 | `shortcuts.ts` | e2e `v160-workspace.spec.ts:15` | PENDING RE-RUN | | |
| FI-019 | Shell | Bottom bar on phones | `/users/*` | USER | RA-01: real waiting count | `BottomNav.tsx` | e2e `v160-ui.spec.ts:93` | PENDING RE-RUN | | |
| FI-020 | Shell | Classic view (gateway, module menus, letters) | `/users/menu/[module]` | USER | F-151, D-210 to D-212, D-227 | `Classic.tsx`, `classic-modules.ts` | e2e `v127-classic-rules.spec.ts:22,94`, `v128-classic-nav.spec.ts:48-144`, `v134-classic-tally.spec.ts:9`; unit `classic-modules.test.ts` | PENDING RE-RUN | | |
| FI-021 | Shell | Sidebar rail collapse | cookie | All | F-175, D-229 | `sidebar-cookie.ts` | e2e `v135-profile-search.spec.ts:13` | PENDING RE-RUN | | |
| FI-022 | Shell | Space switch and account menu | `ProfileMenu.tsx` | Multi-role | D-149 | | e2e `session9.spec.ts:6`, `profile.spec.ts:7` | PENDING RE-RUN | | |
| FI-023 | Shell | Theme (Light/Dark/System) and Classic text size | `saveThemeAction`, `saveTextSizeAction` | All | UI-02, D-211 | Stored per account; painted before first paint | e2e `v160-ui.spec.ts:39,108`; `v127-classic-rules.spec.ts` (text size) | PENDING RE-RUN | | |
| FI-024 | Shell | Onboarding tour and first-use checklist | `OnboardingTour`, `finishTourAction` | USER | F-133, D-167 | | e2e `v1140-tour.spec.ts:22,57,79`; unit `tour-steps.test.ts` | PENDING RE-RUN | | |
| FI-025 | Shell | Help (searchable, copy details) | `/users/help` | USER | F-…, v1.5 #13 | Static how-tos | e2e `v150.spec.ts:135`; unit `help.test.ts` | PENDING RE-RUN | | |
| FI-026 | Shell | Offline, slow, rate-limited, unsaved and maintenance states | global | All | F-176, D-233, FB-05 | | e2e `v136-ui-states.spec.ts:10-76` | PENDING RE-RUN | | |
| FI-027 | Shell | 404/403 page | any | All | FB-07: one page, no leak | `notFound()` everywhere | e2e `v160-ui.spec.ts:74`, `v1100-web.spec.ts:108` | PENDING RE-RUN | | |
| FI-028 | Shell | Loading skeletons and error boundaries | `loading.tsx`, `error.tsx` | All | FB-01/02 | | unit `ui/loading-guard.test.ts` only | PARTIAL | No e2e of the error boundary with a reference | |
| FI-029 | Shell | Installable PWA manifest and icons | `/manifest` | Public | P8-02 | | e2e `v140-api.spec.ts:98`, `v1100-web.spec.ts:117` | PENDING RE-RUN | | |
| FI-030 | Shell | Accessibility and no horizontal scroll | all | All | RA-03, WEB-01 | | e2e `v160-ui.spec.ts:54,83`, `v1100-web.spec.ts:66,139`, `zz-site-audit.spec.ts:159` | PENDING RE-RUN | | |

### 3.3 My Approvals / requests

| ID | Module | Feature | Route | Role | Expected | Actual | Test case | Status | Evidence | Defect |
|---|---|---|---|---|---|---|---|---|---|---|
| FI-031 | My Approvals | Home (what needs you, requests, drafts, tasks) | `/users` (`/users/work` redirects here) | USER | F-179, D-236, M1.1-01 | Server-rendered sections, filtered by module | e2e `v150.spec.ts`, `v160-ui.spec.ts`, `v1140-tour.spec.ts:22` | PENDING RE-RUN | | |
| FI-032 | My Approvals | Request templates list | `/users/new` | USER | F-11, page key `users.new`; who may raise each type (V190-06) | Published types filtered by "who may raise" | e2e `approval-flow.spec.ts:41`; int `v190.int.test.ts:228` | PENDING RE-RUN | | |
| FI-033 | My Approvals | Raise from a template | `/users/new/[workflowId]`, `submitRequestAction` | USER | F-11, F-13: idempotent, request no. PREFIX-YEAR-NNNNNN | Server-validated form, `formKey` dedupe | int `approvals.int.test.ts:90`, `session8.int.test.ts:77,90`; e2e `approval-flow.spec.ts:41`, `session12.spec.ts:126` | PENDING RE-RUN | | |
| FI-034 | My Approvals | Drafts autosave and recovery | `saveDraftAction`, `discardDraftAction` | USER | F-85, M1.1-03 | Owner-only drafts; expiry | int `drafts.int.test.ts:16-48`; e2e `v150.spec.ts:31,52`; unit `drafts/rules.test.ts` | PENDING RE-RUN | | |
| FI-035 | My Approvals | Smart forms (show-if, calculated, line items) | form engine | USER/IT | EN-01..03, F-95 | Server recomputes; no eval | unit `smart-forms.test.ts`, `form-fields.test.ts`; e2e `v160-smart-forms.spec.ts:20,67` | PENDING RE-RUN | unit pass | |
| FI-036 | My Approvals | Readiness check (documents, routing, duplicates, budget) | `checkReadinessAction` | USER | F-96, FN1, FN3, EN-09 | `server/approvals/readiness.ts` | int `readiness.int.test.ts:77-149`, `v170-a.int.test.ts:220-239`; e2e `v160-smart-readiness.spec.ts:47` | PENDING RE-RUN | | |
| FI-037 | My Approvals | Autofill, personal templates, raise again | `saveTemplateFromRequestAction`, `deleteTemplateAction` | USER | F-97, RP-01, FN4; switch `templates` | Templates validated against the current form | int `readiness.int.test.ts:164`; e2e `v137-ux-laws.spec.ts:72` | PENDING RE-RUN | | |
| FI-038 | My Approvals | My pending requests (filters, paging) | `/users/requests` | USER | D-207, F-118 | `RequestListScreen` | int `v172-lists.int.test.ts:140`, `session8.int.test.ts:169`; e2e `v172-lists.spec.ts:74` | PENDING RE-RUN | | |
| FI-039 | My Approvals | My approved requests | `/users/approved` | USER | F-119, D-139 | | int `v180.int.test.ts:88`; e2e `v180.spec.ts:31` | PENDING RE-RUN | | |
| FI-040 | My Approvals | Collaborating ("shared with me") | `/users/collaborating` | USER | F-118, D-138 | | int `v172-lists.int.test.ts:95-130`; e2e `v172-lists.spec.ts:35`, `v161-attachments-collaborators.spec.ts:70` | PENDING RE-RUN | | |
| FI-041 | My Approvals | Request page: tracker, step map, timeline, round diff | `/users/requests/[id]` | Participants | RD-01, RD-03, F-14, F-177 | Built from stored events; append-only | unit `tracker.test.ts`, `request-detail.test.ts`; int `request-detail.int.test.ts:50,74`, `approvals.int.test.ts:208`; e2e `v160-workspace.spec.ts:110` | PENDING RE-RUN | unit pass | |
| FI-042 | My Approvals | Request visibility (strangers refused) | request page, search, PDF | All | F-12, M4-05 | `loadRequestView`, visibility repo | e2e `approval-flow.spec.ts:82`; int `workspace.int.test.ts:109`, `search.int.test.ts:67` | PENDING RE-RUN | | |
| FI-043 | My Approvals | Withdraw | `withdrawAction` | Requester | F-17, D-066 | | int `session5.int.test.ts:47`, `v1100.int.test.ts:97` | PENDING RE-RUN | | |
| FI-044 | My Approvals | Recall | `recallAction` | Requester | EN-04, BD-1 | One winner under concurrency | int `engine-v160.int.test.ts:74,88` | PENDING RE-RUN | No e2e | |
| FI-045 | My Approvals | Resubmit after changes required (same number, re-routing) | `resubmitAction` | Requester | F-26, AUD-02 | Re-routes when routing values change | e2e `approval-flow.spec.ts:60`; int `approvals.int.test.ts:253`, `v190.int.test.ts:238` | PENDING RE-RUN | | |
| FI-046 | My Approvals | Answer "ask for information" | `answerInfoAction` | Requester | EN-05, BD-2 (SLA pauses) | | int `engine-v160.int.test.ts:99`, `v140.int.test.ts:134` | PENDING RE-RUN | | |
| FI-047 | My Approvals | Comments and @mentions | `commentAction` | Participants | F-15 (append-only), F-88 | | int `session4.int.test.ts:137`, `mentions.int.test.ts:61`; e2e `v150.spec.ts:117`; unit `mentions.test.ts` | PENDING RE-RUN | | |
| FI-048 | My Approvals | Attachments and preview | `addFilesAction`, `/api/attachments/[id]`, `/api/files/[id]` | Participants | F-18, RD-02: SVG/HTML never inline; type sniffing | | int `session6.int.test.ts:129-164`, `session8.int.test.ts:139,149`; e2e `v160-workspace.spec.ts:123`; unit `attachments/files.test.ts` | PENDING RE-RUN | | |
| FI-049 | My Approvals | Attachment form field | form field | USER/IT | F-105, D-127 | Server counts files | int `collaborators.int.test.ts:125,142`; e2e `v161-attachments-collaborators.spec.ts:24,42`; unit `attachment-field.test.ts` | PENDING RE-RUN | | |
| FI-050 | My Approvals | Collaborators (add, remove, leave) | `addCollaboratorsAction`, `removeCollaboratorAction` | Requester/IT | F-106, RP-02 (covers "watchers") | Max 20, active only | int `collaborators.int.test.ts:73-113`; e2e `v161-attachments-collaborators.spec.ts:42,70` | PENDING RE-RUN | | |
| FI-051 | My Approvals | Links and follow-ups | `linkAction` | Participants | EN-08 | Both sides must be visible | int `engine-v160.int.test.ts:155,166` | PENDING RE-RUN | No e2e | |
| FI-052 | My Approvals | Request summary PDF | `/api/requests/[id]/summary.pdf` | Participants | F-92, M1.1-10 | | unit `pdf/request-summary.test.ts`; e2e `v150.spec.ts:117` | PENDING RE-RUN | unit pass | |
| FI-053 | My Approvals | Amend an approved request | `/users/requests/[id]/amend`, `submitAmendmentAction` | Requester | F-99, FN5; switch `amendments` | Original stays intact; re-approval | int `amendments.int.test.ts:84-144`, `v170-a.int.test.ts:249`; e2e `v160-smart-zamend.spec.ts:44,73` | PENDING RE-RUN | | |
| FI-054 | My Approvals | Approval expiry (valid-until, 7-day notice) | job `expiry` | Requester | F-107, EN-10, BD-4 | `server/approvals/expiry.ts` | int `v170-a.int.test.ts:90,111` | PENDING RE-RUN | No UI test of the Expired badge | |
| FI-055 | My Approvals | Confidential fields | form | Participants | A8 | Hidden from collaborators | int `v170-a.int.test.ts:193` | PENDING RE-RUN | | |
| FI-056 | My Approvals | Saved views (private, shared, default, undo) | `saveViewAction`, `manageViewAction`, `restoreViewAction`, `shareViewAction`, `defaultViewAction` | USER | F-86, B07 | | int `search.int.test.ts:95`, `v170-bc.int.test.ts:166`; e2e `v160-workspace.spec.ts:92` | PENDING RE-RUN | | |
| FI-057 | My Approvals | Recently viewed | Home | USER | WS-04 | Only still-visible requests | int `workspace.int.test.ts:96` | PENDING RE-RUN | | |
| FI-058 | My Approvals | Reopen an approved request | `reopenAction` | SUPER_ADMIN | F-29 | Same number | int `session5.int.test.ts:59` | PENDING RE-RUN | | |

### 3.4 Custom approvals

| ID | Module | Feature | Route | Role | Expected | Actual | Test case | Status | Evidence | Defect |
|---|---|---|---|---|---|---|---|---|---|---|
| FI-059 | Custom approvals | New request with own approvers | `/users/custom`, `submitCustomAction` | Every USER | F-33, D-026, D-206: anyone; private to them; starts with the reporting manager | One-off type created; removed if submit fails (R-06) | int `session4.int.test.ts:56,68`, `v140.int.test.ts:171`; e2e `v137-ux-laws.spec.ts:18`, `v180.spec.ts:81` | PENDING RE-RUN | | |
| FI-060 | Custom approvals | Approver eligibility | approver pickers | All | D-085, F-72: active and an approver designation; never break-glass | `approver-rules.ts:19-26` | unit `approver-rules.test.ts`; int `session11.int.test.ts:48,66`; e2e `session11.spec.ts:13` | PENDING RE-RUN | unit pass | |
| FI-061 | Custom approvals | Nobody approves their own request | engine | All | CLAUDE.md fixed rule | Refuses a route where the requester approves alone; task-owner check | int `session4.int.test.ts:68`, `approvals.int.test.ts:149`, `v140.int.test.ts:117` | PENDING RE-RUN | | |
| FI-062 | Custom approvals | Choice and skip options (IT switches) | `/users/custom` | USER | D-206, D-235; DoA never | | e2e `v180.spec.ts:81` | PENDING RE-RUN | | |
| FI-063 | Custom approvals | Custom approval set-up (fields, step options) | `/admin/custom-approval`, `saveCustomApprovalAction` | IT | F-120, D-140 | | int `v180.int.test.ts:117,152`; e2e `v180.spec.ts:50`, `v138-form-designer.spec.ts:6` | PENDING RE-RUN | | |
| FI-064 | Custom approvals | Turn a custom approval into an approval type | `promoteCustomAction` | IT | F-84, D-106, P5-04 | | e2e `v140-ui.spec.ts:129` | PENDING RE-RUN | | |

### 3.5 Queue and decisions

| ID | Module | Feature | Route | Role | Expected | Actual | Test case | Status | Evidence | Defect |
|---|---|---|---|---|---|---|---|---|---|---|
| FI-065 | Queue | Waiting for me (filters, chips, sort) | `/users/queue` | Approvers | WS-01, F-118 | | int `workspace.int.test.ts:71`, `v172-lists.int.test.ts:149`; e2e `v160-workspace.spec.ts:71`, `v172-lists.spec.ts:103` | PENDING RE-RUN | | |
| FI-066 | Queue | Approve / reject / changes required / hold | `decideAction` | Assigned approver | F-10, F-12, F-27, F-28; Reject asks first | Lock + `state_version`; one wins | e2e `approval-flow.spec.ts:41,60`, `v137-ux-laws.spec.ts:53`; int `approvals.int.test.ts:149,173` | PENDING RE-RUN | | |
| FI-067 | Queue | Resume from hold; resolve blocked step | `resumeAction`, `resolveBlockedAction` | Approver / IT | F-27, F-80, D-098 | | int `approvals.int.test.ts:277`, `v140.int.test.ts:77`; e2e `v140-ui.spec.ts:88` | PENDING RE-RUN | | |
| FI-068 | Queue | Multi-level engine (sequential, parallel ALL, any-one, any-N, conditional/DoA, hybrid) | `server/engine/*` | — | ★ North star, F-20..F-25 | Node-graph engine; joins ALL / ANY_ONE / ANY_N | unit `engine/engine.test.ts`, `v140-engine.test.ts`, `v160-engine.test.ts`, `workflows/branch.test.ts`; int `approvals.int.test.ts:99,137` | PENDING RE-RUN | unit pass | |
| FI-069 | Queue | Bulk approve | `bulkApproveAction` | Approver | F-87, M1.1-07 | Eligible only; work tasks never | int `bulk.int.test.ts:42,77`; e2e `v150.spec.ts:88` | PENDING RE-RUN | | |
| FI-070 | Queue | Pass an approval on | `delegateTaskAction` | Approver | EN-07, BD-10 | Eligible colleague only; never back | int `engine-v160.int.test.ts:117` | PENDING RE-RUN | No e2e | |
| FI-071 | Queue | Consultation (advice) | `consultAction`, `answerConsultAction` | Approver / consultee | EN-06 | Read-only, no decision buttons | int `engine-v160.int.test.ts:135` | PENDING RE-RUN | No e2e | |
| FI-072 | Queue | Work steps and FYI steps ("Mark as done") | engine | Requester/assignee | F-79, F-32, D-097 | | int `v140.int.test.ts:57`; e2e `v140-ui.spec.ts:57` | PENDING RE-RUN | | |
| FI-073 | Queue | Approved by me | `/users/approved-by-me` | Approver | F-119 | | int `v180.int.test.ts:100`; e2e `v180.spec.ts:31`; unit `v180-rules.test.ts` | PENDING RE-RUN | | |
| FI-074 | Queue | Mobile decision bar and cards | request page | Approver | RA-02 | | e2e `v150.spec.ts:100` | PENDING RE-RUN | | |
| FI-075 | Queue | SLA due time, due soon (75%), reminder, escalation up the chain | jobs `sla`, `rules` | — | F-31, F-82, F-91, D-100 | Working calendar respected; hold time added | int `session4.int.test.ts:150`, `session5.int.test.ts:76`, `v140.int.test.ts:117,134,189`, `workload.int.test.ts:52` | PENDING RE-RUN | | |

### 3.6 Tasks and projects (Work)

Feature switch `tasks` and module TASK apply to every row. Page keys: `users.tasks`, `users.task_new`, `users.task`, `users.work`, `users.projects`.

| ID | Module | Feature | Route | Role | Expected | Actual | Test case | Status | Evidence | Defect |
|---|---|---|---|---|---|---|---|---|---|---|
| FI-076 | Tasks | New task with a type (form) | `/users/tasks/new`, `createTaskAction` | USER | F-124, D-143 | Created once per submission key | int `v190.int.test.ts:71,88`; e2e `v190.spec.ts:58` | PENDING RE-RUN | | |
| FI-077 | Tasks | Task lists: My tasks (table), Assigned by me, Team tasks | `/users/tasks`, `/users/tasks/assigned`, `/users/tasks/team` | USER | F-124; D-216 (reporting line) | `TaskListScreen` | int `v190.int.test.ts:93`, `work-management.int.test.ts:123`; e2e `ai-modules.spec.ts` (assigned) | PARTIAL | No test opens `/users/tasks/team` (grep: 0 hits) | |
| FI-078 | Tasks | Task page (progress, subtasks, comments, likes, files) | `/users/tasks/[id]`, `taskAction`, work actions | Parties | F-153 | One visibility rule for page and search | e2e `v130-work.spec.ts:51`; int `work-management.int.test.ts:93,135,160` | PENDING RE-RUN | | |
| FI-079 | Tasks | My Tasks (sections, board, calendar) | `/users/work/my-tasks` | USER | F-154, D-215 | Personal sections | e2e `v130-work.spec.ts:78`; int `work-management.int.test.ts:191` | PENDING RE-RUN | | |
| FI-080 | Tasks | Projects: list, new (steps), board, timeline, overview | `/users/work/projects`, `/new`, `/[id]` | USER | F-152, F-164 | | e2e `v130-work.spec.ts:20`, `v133-asana-compact.spec.ts:18`; int `work-management.int.test.ts:63`, `work-more.int.test.ts:222` | PENDING RE-RUN | | |
| FI-081 | Tasks | Project settings, members, privacy, permissions | `/users/work/projects/[id]/settings`, `memberAction`, `privacyAction`, `permissionsAction` | Owners/editors | F-168, D-222 | Last owner protected | e2e `v133-asana-compact.spec.ts:108`; int `work-management.int.test.ts:80`, `work-more.int.test.ts:290` | PENDING RE-RUN | | |
| FI-082 | Tasks | Project templates and copies | `saveTemplateAction`, `fromTemplateAction` | USER | F-159 | | e2e `v131-work-more.spec.ts:83`, `v133-asana-compact.spec.ts:94`; int `work-more.int.test.ts:128-153` | PENDING RE-RUN | | |
| FI-083 | Tasks | Project custom fields | `addFieldAction`, `fieldValueAction` | Editors | F-159 | | e2e `v131-work-more.spec.ts:19`; int `work-more.int.test.ts:109` | PENDING RE-RUN | | |
| FI-084 | Tasks | Dependencies | `dependencyAction` | Editors | D-215 | Loops refused; last blocker notifies | int `work-management.int.test.ts:177` | PENDING RE-RUN | Analytics still says "no dependency links" | FI-D02 |
| FI-085 | Tasks | Repeating / periodic tasks | `recurrenceAction`, `/users/work/periodic` | USER | F-158, F-165, D-218/219 | Next one made on completion | e2e `v131-work-more.spec.ts:56`, `v132-asana-skeleton.spec.ts:60`; int `work-more.int.test.ts:58,85,240` | PENDING RE-RUN | Analytics still says tasks "don't repeat" | FI-D02 |
| FI-086 | Tasks | Ad hoc task for several people | `quickAddManyAction` | USER | F-167, D-222 | One linked copy each | e2e `v133-asana-compact.spec.ts:108`; int `work-more.int.test.ts:264,273` | PENDING RE-RUN | | |
| FI-087 | Tasks | Task search and saved searches | `/users/work/search`, `saveSearchAction` | USER | F-155 | | e2e `v130-work.spec.ts:78`, `v132-asana-skeleton.spec.ts:60`; int `work-more.int.test.ts:229` | PENDING RE-RUN | | |
| FI-088 | Tasks | Deleted tasks and restore | `/users/work/deleted`, `deleteTaskAction` | USER | D-215 | Delete closes subtasks; restore brings them back | int `work-management.int.test.ts:201` | PARTIAL | `/users/work/deleted` page not opened by any e2e (only crawled by `zz-site-audit`) | |
| FI-089 | Tasks | Bulk task changes | `bulkAction` | USER | F-160 | Refusals counted, not done | e2e `v131-work-more.spec.ts:19`; int `work-more.int.test.ts:165` | PENDING RE-RUN | | |
| FI-090 | Tasks | Holiday warning on due dates | `HolidayPrompt` | USER | F-157, D-217 | Warn / keep / block / IT moves | e2e `v130-work.spec.ts:101`; int `work-management.int.test.ts:226`; unit `work/holidays.test.ts` | PENDING RE-RUN | | |
| FI-091 | Tasks | Morning summary (digest) | job `modules`, `digestChoiceAction` | USER | F-160, D-218 | Once a day; not on holidays | e2e `v131-work-more.spec.ts:104`; int `work-more.int.test.ts:199` | PENDING RE-RUN | | |
| FI-092 | Tasks | Draft task panel (+ Create, rich text, @mention, files) | `TaskCreator` (layout) | USER | F-166, F-170, F-181, D-221/224/238 | | e2e `v139-draft-task.spec.ts:35,57,130`; unit `rich-text.test.ts` | PENDING RE-RUN | | |
| FI-093 | Tasks | Share project/task; follow; like | `followAction`, `likeAction` | USER | F-163 | | e2e `v133-asana-compact.spec.ts:69`, `v130-work.spec.ts:51` | PENDING RE-RUN | | |
| FI-094 | Tasks | Project status updates | `statusAction`, `removeStatusAction` | Editors | F-152 | | int `work-management.int.test.ts:214` | PENDING RE-RUN | No e2e | |
| FI-095 | Tasks | Task table: filters, grouping, saved tabs | `saveViewAction` (work) | USER | F-162, F-169, D-226 | | e2e `v133-asana-compact.spec.ts:37`; unit `work/grid.test.ts` | PENDING RE-RUN | | |
| FI-096 | Tasks | Task reminders (due soon, overdue) | job `modules` | — | F-124 | Once each | int `v190.int.test.ts:134` | PENDING RE-RUN | | |
| FI-097 | Tasks | Task type lifecycle on tasks (new version, retired) | engine | — | F-123 | New version for new tasks only | int `v190.int.test.ts:101,121` | PENDING RE-RUN | | |

### 3.7 Information

| ID | Module | Feature | Route | Role | Expected | Actual | Test case | Status | Evidence | Defect |
|---|---|---|---|---|---|---|---|---|---|---|
| FI-098 | Information | Information inbox | `/users/information` | USER | F-125, D-143/145; switch `information` | `InfoListScreen` 404s when the switch is off | e2e `v190.spec.ts:101` | PENDING RE-RUN | | |
| FI-099 | Information | Write and publish | `/users/information/new`, `saveInformationAction` | USER | F-125 | Draft is the sender's | int `v190.int.test.ts:148`; e2e `v190.spec.ts:101` | PENDING RE-RUN | | |
| FI-100 | Information | Read, acknowledge, withdraw | `/users/information/[id]`, `informationAction` | Recipients/sender | F-125: reading is not acknowledging | | int `v190.int.test.ts:164`; e2e `v190.spec.ts:101` | PENDING RE-RUN | | |
| FI-101 | Information | Sent by me | `/users/information/sent` | Sender | F-125 | | e2e `v190.spec.ts` | PENDING RE-RUN | | |
| FI-102 | Information | Acknowledgement reminders | job `modules` | — | F-125 | Once to non-acknowledgers | int `v190.int.test.ts:179` | PENDING RE-RUN | | |

### 3.8 Inbox and notifications

| ID | Module | Feature | Route | Role | Expected | Actual | Test case | Status | Evidence | Defect |
|---|---|---|---|---|---|---|---|---|---|---|
| FI-103 | Inbox | One Inbox (activity, bookmarks, archive) | `/users/inbox` (`/users/notifications`, `/users/work/inbox` redirect here), `inboxStateAction` | USER | F-180, D-237 | | int `inbox.int.test.ts:28,36,48`, `work-more.int.test.ts:185`; e2e `v131-work-more.spec.ts:104` | PENDING RE-RUN | | |
| FI-104 | Inbox | Notification bell (10 newest, Read more) | `NotificationBell`, `/api/me/notifications` | USER | F-126, D-146 | | e2e `v190.spec.ts:137` | PENDING RE-RUN | | |
| FI-105 | Inbox | Mark read / unread / all, with undo | `markReadAction`, `markUnreadAction`, `markAllReadAction` | USER | FB-03 | Own notifications only | int `workspace.int.test.ts:119`; e2e `v160-workspace.spec.ts:80` | PENDING RE-RUN | | |
| FI-106 | Inbox | Notification settings / control centre (mandatory locked, Do not disturb) | `/users/notifications/settings`, `savePreferencesAction` | USER | F-89, F-173, D-110, D-231 | Security events locked on | e2e `v150.spec.ts:75`, `v135-profile-search.spec.ts:65`; unit `notifications/control-center.test.ts` | PENDING RE-RUN | | |
| FI-107 | Notifications | Email + WhatsApp pipeline with transactional outbox | `server/notifications/notify.ts`; jobs `outbox`, `deliveries` | — | F-40, D-080/091, D-QA-06 | Recorded with the action, sent after commit; bodies encrypted and wiped | int `session8.int.test.ts:113,122`, `jobs.int.test.ts:35,45,77`; unit `notify.test.ts`, `templates.test.ts` | PENDING RE-RUN | unit pass | |
| FI-108 | Notifications | WhatsApp delivery receipts webhook | `POST /api/webhooks/ceoitbox` | CEOITBox | M1.1-06 | Shared secret, constant-time compare | e2e `v140-api.spec.ts:34`; unit `receipts.test.ts` | PENDING RE-RUN | | |
| FI-109 | Notifications | Security notifications (new login, locked, SA sign-in, break-glass) | SYSTEM events | Users / SA | F-03, F-78 | | unit `password-sign-in.test.ts:245`, `notifications/templates.test.ts` | PARTIAL | Unit only; no e2e/int sends | |

### 3.9 Calendar

| ID | Module | Feature | Route | Role | Expected | Actual | Test case | Status | Evidence | Defect |
|---|---|---|---|---|---|---|---|---|---|---|
| FI-110 | Calendar | Calendar (day/week/month) with personal entries | `/users/calendar`, `/users/calendar/items/[id]`, `saveCalendarItemAction`, `deleteCalendarItemAction` | USER | F-129/130, D-152; entries filtered by module (D-168) | `calendarKindAllowed` filters by module | e2e `v1110-calendar.spec.ts:68`, `v170-abc.spec.ts:29`; unit `calendar/v1110-calendar.test.ts` | PENDING RE-RUN | | |
| FI-111 | Calendar | Needed-by calendar for requests | calendar | USER | F-108, RP-03 | Only visible requests | int `v170-a.int.test.ts:121` | PENDING RE-RUN | | |
| FI-112 | Calendar | Connect own Google Calendar | `/users/profile/calendar`, `/api/integrations/google-calendar/{connect,callback}`, `connectionCommandAction` | USER | F-129, D-152/162 | Nonce/state checked; encrypted tokens | int `v1110-calendar.int.test.ts:111-141`; e2e `v1110-calendar.spec.ts:49,59` | PENDING RE-RUN | | |
| FI-113 | Calendar | Two-way Google sync and push webhook | job `calendar`, `POST /api/webhooks/google-calendar` | — | F-130, D-153/154; AI-04b: leave out modules the person lacks | Full sync logic; **`businessSources` receives `{id, roles}` only (no module list)** (`server/calendar/sync.ts:143`, `sources.ts:32`) | int `v1110-calendar.int.test.ts:159-330` | PENDING RE-RUN | Module filter missing in sync (code review) | FI-D03 |
| FI-114 | Calendar | Super Admin Google Calendar set-up | `/superadmin/integrations/google-calendar`, `saveCalendarConfigAction`, `calendarCommandAction` | SA | F-129 | Secret stored encrypted, never shown again | int `v1110-calendar.int.test.ts:78,90,102`; e2e `v1110-calendar.spec.ts:26,44` | PENDING RE-RUN | | |

### 3.10 Analytics and reports

| ID | Module | Feature | Route | Role | Expected | Actual | Test case | Status | Evidence | Defect |
|---|---|---|---|---|---|---|---|---|---|---|
| FI-115 | Analytics | Analytics Center (boards by module and role, scopes) | `/users/analytics` | USER (own/team/department) | F-131, F-148, D-156, D-206; Addendum A | `AnalyticsScreen.tsx:52` picks boards by module; scopes from `resolveScope` | int `analytics.int.test.ts:72-108`, `v1120-analytics.int.test.ts:75-185`; e2e `v1120-analytics.spec.ts:49,79,95`, `v160-zanalytics.spec.ts:31` | PENDING RE-RUN | Task board "Not tracked" text is wrong | FI-D02 |
| FI-116 | Analytics | Drill-down lists | `/users/analytics/list`, `/admin/analytics/list` | USER / IT | F-112, B01 | Lists match the numbers | int `v170-bc.int.test.ts:103,126`; e2e `v170-abc.spec.ts:49` | PENDING RE-RUN | | |
| FI-117 | Analytics | Metric dictionary page | `/users/analytics/metrics`, `/admin/analytics/metrics` | USER / IT | Addendum A §16 | `MetricsScreen` from `server/analytics/metrics.ts`, `center-metrics.ts` | unit `analytics/semantics.test.ts`, `v1120-center.test.ts` | PARTIAL | No e2e opens `/metrics` (only crawled) | FI-D02 (stale `t_dependencies`) |
| FI-118 | Analytics | Analytics CSV export | `GET /api/analytics/export` | USER / IT | Can-export rule (A9) | Feature switch, `canExport`, rate limit, audit | e2e `v1120-analytics.spec.ts:60`; int `v170-a.int.test.ts:206`; unit `analytics/export.test.ts` | PENDING RE-RUN | | |
| FI-119 | Analytics | Admin analytics (organisation) | `/admin/analytics` | IT | F-101, F-117 | | e2e `v1120-analytics.spec.ts:25`, `v160-zanalytics.spec.ts:11`, `v171-nav.spec.ts:16` | PENDING RE-RUN | | |
| FI-120 | Reports | Reports catalogue and report pages (CSV/XLSX/PDF, saved views) | `/admin/reports`, `/admin/reports/[key]`, `/api/reports/[key]` (`/users/reports*` redirect) | IT / SA (`canUseReports`) | F-102, D-123, v1.7.1: IT only | 404 otherwise | int `reports.int.test.ts:60,96`; e2e `v160-zreports.spec.ts:11,58`, `v171-nav.spec.ts:50` | PENDING RE-RUN | | |
| FI-121 | Reports | Scheduled reports (recipients, edits) | `createScheduleAction`, `updateScheduleAction`, `toggleScheduleAction`; job `reports` | IT | F-113; switch `scheduled_reports` | Slot claimed once | int `reports.int.test.ts:83,105,117`, `v170-bc.int.test.ts:186`; unit `analytics/schedule.test.ts` | PENDING RE-RUN | | |
| FI-122 | Reports | Alert rules (severity, quiet hours, channels) | `createAlertAction`, `toggleAlertAction`; job `alerts` | IT | F-114, B08 | Fires once on crossing | int `reports.int.test.ts:139`, `v170-bc.int.test.ts:203`; e2e `v170-abc.spec.ts:73` | PENDING RE-RUN | | |
| FI-123 | Reports | Background exports | `requestExportAction`, `/api/exports/[id]`; job `exports` | IT | F-115, C02 | | int `v170-bc.int.test.ts:222`; e2e `v170-abc.spec.ts:81` | PENDING RE-RUN | | |
| FI-124 | Reports | Admin dashboards (utilisation, approvers, departments, raisers) + CSV | `/admin/dashboards/*`, `/api/admin/dashboards/[slug]` | IT | F-74, D-087 | Deleted requests left out | int `session11.int.test.ts:105`; e2e `session11.spec.ts:74` | PENDING RE-RUN | | |
| FI-125 | Reports | Insights tiles | `/admin/insights` | IT | F-70 | | int `session5.int.test.ts:100` | PARTIAL | Page only crawled by `zz-site-audit` | |
| FI-126 | Reports | Workload and bulk reassignment | `/admin/workload`, `/admin/workload/reassign`, `bulkReassignAction` | IT | F-91, F-109, AD-04, M1.1-08/12 | Preview → per-item result; audited | int `workload.int.test.ts:52`, `v170-a.int.test.ts:135`; e2e `v150.spec.ts:143`, `v170-abc.spec.ts:40` | PENDING RE-RUN | Register BJ-08 (partial-failure test) Yet to do | |
| FI-127 | Reports | Records registers (requests, tasks, information) + CSV | `/admin/records/*`, `/api/admin/records/[kind]` | IT | F-145, D-191 | Deleted never listed | int `records.int.test.ts:55,63,76`; e2e `v121-records.spec.ts:5,29`; unit `records/filters.test.ts` | PENDING RE-RUN | | |
| FI-128 | Reports | Task and information reports (IT) | report keys | IT | V190 | | int `v190.int.test.ts:251` | PENDING RE-RUN | | |
| FI-129 | Reports | Power BI reporting views (optional SQL) | `database/optional/reporting_views.sql` | DBA | P7-04 | | int `reporting-views.int.test.ts:15` | PENDING RE-RUN | | |
| FI-130 | Reports | **Weekly HOD report** | — | HOD | AD-03, BD-5: "Built, off until the Super Admin switches it on" (`docs/IMPLEMENTATION_PLAN.md:156`) | **Not in code.** No job step (`automation.ts` lists 16 steps, none weekly), no setting, no template (grep `weekly` in `server/`: only schedule frequency, holidays and recurrence) | none | NOT APPLICABLE (missing) | `PLAN-CHECKLIST.md:708` V160-08 still open | FI-D01 |

### 3.11 Pico Bot AI

Feature switch `ai` and module AI apply (nobody has AI by default, D-168).

| ID | Module | Feature | Route | Role | Expected | Actual | Test case | Status | Evidence | Defect |
|---|---|---|---|---|---|---|---|---|---|---|
| FI-131 | Pico Bot | AI Assistant chat (modes, tools, evidence, limits) | `/users/ai/assistant`, `POST /api/ai/chat`, `askAction` | USER with AI | F-135, F-138, F-140, D-169/172/178/180 | Modes enforced on the server; per-minute, daily and global limits; idempotent | int `ai-assistant.int.test.ts:82-174`, `ai-concurrency.int.test.ts:107-152`; e2e `picbot.spec.ts:72,122,136,199`; unit `picbot.test.ts`, `ai-engine.test.ts`, `rich-answer.test.ts` | PENDING RE-RUN | unit pass | |
| FI-132 | Pico Bot | Conversations (list, pin, rename, isolation) | `/api/ai/conversations`, `/[id]` | Owner | F-135 | Owner only | int `ai-assistant.int.test.ts:146,153`; e2e `ai-modules.spec.ts:98` | PENDING RE-RUN | | |
| FI-133 | Pico Bot | Launcher panel (phone, Escape, history) | shell | USER with AI | F-138 | `ai.launcher` setting | e2e `picbot.spec.ts:63,72,109` | PENDING RE-RUN | | |
| FI-134 | Pico Bot | AI proposals (decide, expire) | `decideProposalAction` | Asker | F-136 | Expire by job or at decision | int `ai-assistant.int.test.ts:311,324` | PENDING RE-RUN | | |
| FI-135 | Pico Bot | Draft a task description | `draftTaskTextAction` | USER with AI | F-181, D-238 | No tools; audited | int `ai-task-draft.int.test.ts:40,52,62` | PENDING RE-RUN | | |
| FI-136 | Pico Bot | Old AI pages redirect to the assistant | `/users/ai`, `/users/ai/{data-sources,history,insights,intelligence,reports}` | USER | D-180 | `redirect("/users/ai/assistant")` | e2e `ai-modules.spec.ts:98,116` | PENDING RE-RUN | | |
| FI-137 | Pico Bot | Module access (APPROVAL/TASK/INFORMATION/AI) | user page, page rules | IT | F-134, D-168 | Default: no AI; pages, actions and APIs refused without the module | int `ai-modules.int.test.ts:56-108`; e2e `ai-modules.spec.ts:25-126`; unit `modules/module-access.test.ts` | PENDING RE-RUN | AI-04b still open | FI-D03 |
| FI-138 | Pico Bot | AI Rules | `/admin/ai-rules`, `saveAiRuleAction` | IT | F-141, D-187 | Saved as Markdown | e2e `v119-ai-rules-try-as.spec.ts:9` | PENDING RE-RUN | | |
| FI-139 | Pico Bot | AI Analytics | `/admin/ai-analytics` | IT | F-146, D-193 | | int `ai-analytics.int.test.ts:30,34`; e2e `v122-ai-analytics.spec.ts:5,17`; unit `ai/ai-analytics.test.ts` | PENDING RE-RUN | | |
| FI-140 | Pico Bot | AI settings (providers, keys, test, emergency stop) | `/superadmin/ai`, `testProviderAction` | SA | F-143, D-184 | Keys AES-GCM encrypted | e2e `v1392-settings-console.spec.ts:7`, `picbot.spec.ts:186`; int `ai-assistant.int.test.ts:121` | PENDING RE-RUN | | |
| FI-141 | Pico Bot | Data sources, AI reports, AI activity history | `/superadmin/ai/{data-sources,reports,history}` | SA | F-137, F-143 | | e2e `ai-modules.spec.ts:116,126` (access only) | PARTIAL | Content not asserted | |
| FI-142 | Pico Bot | Salesforce connection, live queries, hourly copy | `/superadmin/salesforce`, `/api/integrations/salesforce/{connect,callback}`, `syncSalesforceAction`, `testSalesforceAction`, `disconnectSalesforceAction` | SA / USER with a Salesforce mode | F-139, D-172/181 | OAuth state per SA; encrypted tokens; field allow-list. Code note: "Not yet tested against a real org" (`server/ai/connectors/salesforce.ts:17`) | int `ai-assistant.int.test.ts:204-333` (mocked); e2e `picbot.spec.ts:173` | PARTIAL | Mock only; PB-15, PB-54 open | (risk R-02) |

### 3.12 Profile, security and delegation

| ID | Module | Feature | Route | Role | Expected | Actual | Test case | Status | Evidence | Defect |
|---|---|---|---|---|---|---|---|---|---|---|
| FI-143 | Profile | Profile, photo, About me | `/users/profile`, `uploadPhotoAction`, `removePhotoAction`, `aboutMeAction`, `/api/users/[id]/photo` | USER | F-77, F-172, D-230 | | e2e `v135-profile-search.spec.ts:34`, `profile.spec.ts:7` | PENDING RE-RUN | | |
| FI-144 | Profile | Colleague profile (manager, reports) | `/users/people/[id]` | USER | D-230 | | e2e `v135-profile-search.spec.ts:34` | PENDING RE-RUN | | |
| FI-145 | Security | Sign-in & devices, sign out everywhere | `/users/security`, `POST /api/me/sign-out-everywhere` | USER (never hidden, SEC-17) | SEC-17 | Not in `PAGES` (cannot be hidden) | unit `security/v1100-security.test.ts`; e2e `profile.spec.ts` (tab reached) | PARTIAL | No e2e signs out a second device | |
| FI-146 | Delegation | Out of office (delegate, start/end, notices) | `/users/delegation`, `createDelegationAction`, `stopDelegationAction`; job `delegations` | USER | F-30, D-018; A7 | Delegate must be eligible; start/end audited | int `session4.int.test.ts:75,97`, `delegations.int.test.ts:29`, `v170-a.int.test.ts:181`, `search.int.test.ts:67` | PENDING RE-RUN | e2e only opens the page | |

### 3.13 Search

| ID | Module | Feature | Route | Role | Expected | Actual | Test case | Status | Evidence | Defect |
|---|---|---|---|---|---|---|---|---|---|---|
| FI-147 | Search | Request search with filters and saved views | `/users/search` | USER | F-86, M1.1-04, D-232 | Visibility equals the request page; literal wildcards | int `search.int.test.ts:67-110`; e2e `v150.spec.ts:66`, `v136-ui-states.spec.ts:46`; unit `search-filters.test.ts` | PENDING RE-RUN | | |
| FI-148 | Search | Universal quick search (people, requests, tasks, information) | `GET /api/me/quick` (header, Ctrl K) | USER | F-174, D-232 | Module and switch checked (`quick/route.ts:38`) | e2e `v135-profile-search.spec.ts:100`, `v160-workspace.spec.ts:41`, `v137-ux-laws.spec.ts:45`, `v136-ui-states.spec.ts:37` | PENDING RE-RUN | | |

### 3.14 Admin (IT team)

| ID | Module | Feature | Route | Role | Expected | Actual | Test case | Status | Evidence | Defect |
|---|---|---|---|---|---|---|---|---|---|---|
| FI-149 | Admin | Admin overview | `/admin` | IT | page key `admin.overview` (never hidden) | Counts of types and stuck items | e2e `guard.spec.ts:19` (reach) | PARTIAL | Content not asserted | |
| FI-150 | Admin | Needs attention (stuck requests, snooze, resend, re-check and fix) | `/admin/attention`, `snoozeStuckAction`, `resendRequestMessagesAction`, `recheckRequestAction`; job `stuck` | IT | F-98, F-111, FN2, D-131 | Task rows made to match the workflow; never changes the state | int `reliability.int.test.ts:61-102`, `v170-a.int.test.ts:156`; e2e `v160-reliability.spec.ts:13` | PENDING RE-RUN | Register FN2 rows Yet to do (stage, assignment, correlation id, resolution history) | |
| FI-151 | Admin | Users: list, add, edit, roles, modules | `/admin/users`, `/new`, `/[id]`, `createUserAction`, `updateUserAction` | IT (SA for SA/IT targets) | F-06, D-033; users inactivated, never deleted | `user-rules.ts` protects SA and break-glass | unit `admin/user-rules.test.ts`; int `ai-modules.int.test.ts:66-101`; e2e `v1130-invite.spec.ts:26`, `ai-modules.spec.ts:25` | PENDING RE-RUN | | |
| FI-152 | Admin | User commands: deactivate, reactivate, unlock, sign out, invite, set-password link, reset password | `userCommandAction` | IT | F-06, F-78 | Confirmation required | e2e `user-commands.spec.ts:7` (sign out, deactivate), `v1130-invite.spec.ts:26,45` (invite, reset) | PARTIAL | Unlock and set-password-link command not exercised | |
| FI-153 | Admin | Handover before deactivation | `handoverAction` | IT | F-16, D-064 | Refused while approvals wait; never to the requester | int `session4.int.test.ts:109,126`, `v140.int.test.ts:117` | PENDING RE-RUN | | |
| FI-154 | Admin | Departments and designations (approver tick) | `/admin/organisation`, `saveDepartmentAction`, `saveDesignationAction` | IT | D-085 | | e2e `session11.spec.ts:13`, `session10.spec.ts`; int `session11.int.test.ts:48` | PENDING RE-RUN | | |
| FI-155 | Admin | Approver groups | `/admin/groups`, `saveGroupAction`, `groupMemberAction` | IT | F-20 approver source | | int `session10.int.test.ts:99` (via import); groups used in `approvals.int.test.ts:99` | PARTIAL | Neither page action is tested (grep: 0 hits in e2e/int) | |
| FI-156 | Admin | Approval types and workflows: list, new, designer, working draft, publish | `/admin/workflows`, `/new`, `/[id]`, `createWorkflowAction`, `saveDraftAction`, `publishAction`, `updateDetailsAction` | IT | F-50, F-182, F-184, D-239/241 | Publish race leaves one version | e2e `approval-flow.spec.ts:16`, `v1391-workflow-designer.spec.ts:7,57`, `v140-ui.spec.ts:16`; int `workflow-draft.int.test.ts:27-52`, `v140.int.test.ts:153`; unit `builder.test.ts`, `workflow-designer.test.ts`, `v140-builder.test.ts` | PENDING RE-RUN | unit pass | |
| FI-157 | Admin | Delete a workflow / draft | `deleteWorkflowAction` | IT | F-50 | | none | NOT TESTED | grep `deleteWorkflow` in tests: 0 | |
| FI-158 | Admin | Form designer (library, reorder, undo, preview) | workflow page | IT | F-178, F-110, D-235, RP-04 | | e2e `v138-form-designer.spec.ts:6`, `session12.spec.ts:24`, `v170-abc.spec.ts:14`; unit `form-designer.test.ts` | PENDING RE-RUN | | |
| FI-159 | Admin | Test mode / simulate | `simulateAction` | IT | M1.1-11 | Shows differences against the live version | e2e `session12.spec.ts:104`; int `test-mode.int.test.ts:26`; unit `validate-simulate.test.ts` | PENDING RE-RUN | | |
| FI-160 | Admin | Compare versions, restore, migrate open requests | `/admin/workflows/[id]/compare`, `/migrate`, `restoreVersionAction`, `runMigrationAction` | IT | F-100, FN7, AD-01 | Dry run changes nothing | e2e `v160-smart-zversions.spec.ts:15`; int `migration.int.test.ts:55,93`; unit `version-migration.test.ts` | PENDING RE-RUN | | |
| FI-161 | Admin | Import / export approval types (promotion) | `/admin/workflows/import`, `previewImportAction`, `applyImportAction`, `/api/admin/workflows/[id]/export` | IT | F-103, FN9 | Portable references; new draft only | int `promotion.int.test.ts:57-89` | PENDING RE-RUN | Register FN9 rows Yet to do (templates, reference data, flags) | |
| FI-162 | Admin | Type settings (duplicates, budget, who may raise, amendments, validity) | `updateTypeSettingsAction` | IT | F-96, F-99, FN3, V190-06 | | e2e `v160-smart-readiness.spec.ts:29`, `v160-smart-zamend.spec.ts:44`; int `v190.int.test.ts:228` | PENDING RE-RUN | | |
| FI-163 | Admin | Approval authority (DoA matrix) | `/admin/doa` | IT | F-24, F-54, D-075 | Bands, non-cumulative levels | e2e `session7.spec.ts:14,35`; int `session7.int.test.ts:57,61`; unit `doa-matrix.test.ts` | PENDING RE-RUN | | |
| FI-164 | Admin | Budgets | `/admin/budgets`, `saveBudgetAction` | IT | EN-09, BD-3 | Warn by default; BLOCK by SA | e2e `v160-smart-readiness.spec.ts:29`; int `readiness.int.test.ts:116,136` | PENDING RE-RUN | | |
| FI-165 | Admin | Task types and information types (draft, publish, versions, retire) | `/admin/task-types[/id]`, `/admin/information-types[/id]`, `createModuleTypeAction`, `saveModuleTypeDraftAction`, `moduleTypeCommandAction` | IT | F-123, D-144 | | int `v190.int.test.ts:44,61`; e2e `v190.spec.ts:28`; unit `v190-rules.test.ts` | PENDING RE-RUN | | |
| FI-166 | Admin | Task settings (holidays, department holidays, moving tasks, summary, repeating) | `/admin/task-holidays` + 4 actions | IT | F-161, D-217/218 | | e2e `v130-work.spec.ts:135`, `v131-work-more.spec.ts:128` | PENDING RE-RUN | | |
| FI-167 | Admin | Reminder and escalation rules (build, preview, turn off, delete) | `/admin/reminders`, `/[id]`, `saveRuleAction`, `ruleCommandAction`, `previewRuleAction` | IT | F-150, D-209 | | e2e `v127-classic-rules.spec.ts:128`; int `notification-rules.int.test.ts:68,99,118`; unit `rule-model.test.ts` | PENDING RE-RUN | | |
| FI-168 | Admin | Working calendar (working days, holidays) | `/admin/calendar`, `saveWorkingDaysAction`, `holidayAction` | IT | F-31 | Engine skips non-working days | int `session5.int.test.ts:76` (engine), `session10.int.test.ts:99` (holiday import) | PARTIAL | Neither page action is tested | |
| FI-169 | Admin | Import data (users, departments, designations, groups, holidays) | `/admin/import`, `checkImportAction`, `runImportAction`, `/api/admin/import/[kind]` | IT (SA role grants SA only) | F-59, D-084, AUD-01 | All or nothing | e2e `session10.spec.ts:7,38`; int `session10.int.test.ts:26-99`; unit `import-plan.test.ts` | PENDING RE-RUN | | |

### 3.15 Super Admin

| ID | Module | Feature | Route | Role | Expected | Actual | Test case | Status | Evidence | Defect |
|---|---|---|---|---|---|---|---|---|---|---|
| FI-170 | Super Admin | Overview: health, file storage, backups | `/superadmin` | SA | F-83, D-103/104 | `backupStatus()` shows the last backup age | e2e `guard.spec.ts`; int `v1124-storage.int.test.ts:22-39` | PARTIAL | Page content not asserted | |
| FI-171 | Super Admin | Backups (daily job, Back up now, restore drill) | job `backup`, `backupNowAction` | SA | F-83, F-116, GL-04 | | int `backup.int.test.ts:33,44`, `v170-bc.int.test.ts:262`; unit `ops/backup-error.test.ts` | PARTIAL | The "Back up now" action is not tested | |
| FI-172 | Super Admin | Health endpoint | `GET /api/health` | Public (monitor) | D-103 | Version, database, job runner | e2e `v140-api.spec.ts:25` | PENDING RE-RUN | | |
| FI-173 | Super Admin | Providers & security settings console (search, unsaved marks, test send) | `/superadmin/settings`, `saveSettingsAction`, `testSendAction` | SA | F-183, D-240; keys encrypted | | e2e `v1392-settings-console.spec.ts:7`, `v136-ui-states.spec.ts:76`; unit `settings/plan-changes.test.ts` | PARTIAL | `testSendAction` not tested | |
| FI-174 | Super Admin | Feature switches (8 modules + export role) | settings `features.*` | SA | D-124, BI-01/02/06 | ON / OFF / IT_ONLY | int `reports.int.test.ts:117` (scheduled_reports), `v170-a.int.test.ts:206` (exports) | PARTIAL | Only 2 of 9 switches are tested | |
| FI-175 | Super Admin | Page access (hidden / view / full by everyone, department, person) | `/superadmin/pages`, `/[key]`, `setPageRuleAction` | SA | F-121, F-128, D-141/151 | Person > department > everyone; landing pages never hidden | int `v180.int.test.ts:169`, `v1100.int.test.ts:54`; e2e `v180.spec.ts:108` | PENDING RE-RUN | | |
| FI-176 | Super Admin | WhatsApp template creator and sync | `/superadmin/templates`, `/[code]`, 4 actions; job `templates` | SA | F-42, D-076 | Sent only once Meta approves | int `session6.int.test.ts:170`, `session7.int.test.ts:108-159`, `session8.int.test.ts:190`; e2e `session6.spec.ts:32`; unit `template-authoring.test.ts` | PENDING RE-RUN | | |
| FI-177 | Super Admin | Delete a request (with reason) | `/superadmin/requests`, `deleteRequestAction` | SA | F-73, D-086 | Through the engine; parties told | int `session11.int.test.ts:80`, `v140.int.test.ts:93`; e2e `session11.spec.ts:33` | PENDING RE-RUN | | |
| FI-178 | Super Admin | Import data (same screen) | `/superadmin/import` | SA | F-59 | | e2e `session10.spec.ts:38` | PENDING RE-RUN | | |
| FI-179 | Super Admin | Demo data (load, retire, try as) | `/superadmin/demo`, `loadDemoAction`, `retireDemoAction`, `tryAsAction` | SA | F-57, D-071 | Idempotent; retire = inactive | int `session6.int.test.ts:37-94`; e2e `session6.spec.ts:18`; unit `demo-data.test.ts` | PENDING RE-RUN | | |
| FI-180 | Super Admin | Automation (job history, run now, resend outbox) | `/superadmin/automation`, `runJobsNowAction`, `resendOutboxAction` | SA | F-98, FN11 | | int `reliability.int.test.ts:102,122`; e2e `v160-reliability.spec.ts:31` | PENDING RE-RUN | Register FN11 rows Yet to do (status model, Retry Export etc.) | |
| FI-181 | Super Admin | Retention and legal holds | `/superadmin/retention`, `createHoldAction`, `releaseHoldAction` | SA | F-104, FN10 | Holds and a **dry run** only; no scheduled cleanup | int `governance.int.test.ts:68-107` | PENDING RE-RUN | Register FN10-12.1-14 "Scheduled cleanup" Yet to do | |
| FI-182 | Super Admin | Message deliveries and Retry now | `/superadmin/deliveries`, `retryNowAction` | SA | F-41 | Shows when the runner last ran | e2e `job-runner.spec.ts:5`; int `jobs.int.test.ts:45` | PENDING RE-RUN | | |
| FI-183 | Super Admin | Audit log and CSV export | `/superadmin/audit`, `GET /api/superadmin/audit` | SA | S8-02, append-only log | | e2e `cloudflare-safe.spec.ts:19`, `v1100-web.spec.ts` (page answers); int `v1100.int.test.ts:97` (events written) | PARTIAL | The CSV download is not asserted by name | |
| FI-184 | Super Admin | Sign-in history | `/superadmin/logins` | SA | S8-02 | | unit `ui/loading-guard.test.ts` only | NOT TESTED | No functional test (only crawled by `zz-site-audit`) | |
| FI-185 | Super Admin | Integrations hub | `/superadmin/integrations` | SA | F-129 | Links to Google Calendar and settings | e2e `v1110-calendar.spec.ts:44`, `v1100-web.spec.ts` | PENDING RE-RUN | | |

### 3.16 Background jobs and operations

| ID | Module | Feature | Route | Role | Expected | Actual | Test case | Status | Evidence | Defect |
|---|---|---|---|---|---|---|---|---|---|---|
| FI-186 | Jobs | Job runner (cron secret, 16 steps, heartbeat, history) | `POST /api/jobs/run` | Cron | F-41, A5 | Constant-time secret check; failure alerts the SA | int `jobs.int.test.ts:65`, `reliability.int.test.ts:122`; e2e `job-runner.spec.ts:5` | PENDING RE-RUN | | |
| FI-187 | Jobs | Stopped-runner and storage alerts to the Super Admin | `checkJobRunnerStopped`, `alertSuperAdmin` | SA | A5 | Once a day per kind | int `ops-alerts.int.test.ts:13`, `v170-a.int.test.ts:261`, `v1124-storage.int.test.ts:29` | PENDING RE-RUN | | |
| FI-188 | Jobs | Housekeeping (drafts expiry, message body wipe, AI upkeep) | jobs `housekeeping`, `ai` | — | D-QA, S-01 | | int `drafts.int.test.ts:38`, `jobs.int.test.ts:77`, `ai-assistant.int.test.ts:324` | PENDING RE-RUN | | |
| FI-189 | Ops | Migrations resume after failure | `scripts/database` | DBA | R-10 | | int `migrate.int.test.ts:42,75` | PENDING RE-RUN | | |

## 4. Summary

### 4.1 Feature counts by module and status

Total: **189 features** (FI-001 … FI-189).

| Module | Features | PENDING RE-RUN | PARTIAL | NOT TESTED | NOT APPLICABLE (missing) |
|---|---|---|---|---|---|
| Sign-in, session, public | 14 | 11 | 3 | 0 | 0 |
| Shell and navigation | 16 | 15 | 1 | 0 | 0 |
| My Approvals / requests | 28 | 28 | 0 | 0 | 0 |
| Custom approvals | 6 | 6 | 0 | 0 | 0 |
| Queue / decisions | 11 | 11 | 0 | 0 | 0 |
| Tasks and projects | 22 | 20 | 2 | 0 | 0 |
| Information | 5 | 5 | 0 | 0 | 0 |
| Inbox / notifications | 7 | 6 | 1 | 0 | 0 |
| Calendar | 5 | 5 | 0 | 0 | 0 |
| Analytics / reports | 16 | 13 | 2 | 0 | 1 |
| Pico Bot AI | 12 | 10 | 2 | 0 | 0 |
| Profile / security / delegation | 4 | 3 | 1 | 0 | 0 |
| Search | 2 | 2 | 0 | 0 | 0 |
| Admin | 21 | 16 | 4 | 1 | 0 |
| Super Admin | 16 | 10 | 5 | 1 | 0 |
| Jobs and operations | 4 | 4 | 0 | 0 | 0 |
| **Total** | **189** | **165** | **21** | **2** | **1** |

Unit tests run by FI: 88 files and 767 tests passed (`vitest-unit-run.txt`). This makes no feature PASS. It is evidence for the unit-level logic cited in the rows.

### 4.2 Requirements with no feature (missing)

1. **Weekly HOD report** (AD-03 / BD-5). Documented as "Built, off", but absent from the code. See FI-D01.
2. **Register "Yet to do": 465 rows.** The full list is in `audit/TEST_EVIDENCE/FI/register-yet-to-do.txt`. The largest groups:
   - KPI cards: 5.1 Requester 16, 5.2 Approver 13, 5.3 Admin 11, 5.4 Super Admin 13.
   - Charts: 6.3 Turnaround 15, 6.6 Automation 14, 6.2/6.4/6.5/6.7 11 each.
   - Required filters: 17.
   - 15.1 Alert catalogue: 12.
   - Cross-functional: 12. Global acceptance: 11.
   - 10.3 Admin reports: 11.
   - Tests: 22.1–22.6, 37 in all.
   - Function rows: FN2 stuck-request dashboard fields (stage, assignment, correlation id, resolution history); FN10 scheduled retention cleanup and execution history; FN11 central automation status model ("Retrying", "Cancelled", failure category, Retry Export); FN9 promotion of templates, reference data and flags.
   - Addendum B rows: BB-02, BB-05, BC-02, BC-06, BD-01, BD-02, BE-02/03/06, BJ-08, BJ-12.
   - M1.1-25 "Enterprise reliability, governance … controlled release".
3. **Register "Not feasible": 66 rows** (`register-not-feasible.txt`). These have the owner's reasons: APM telemetry, ERP integration, priority field, deployment telemetry.
4. **FEATURE_ACCEPTANCE_CRITERIA:**
   - EN-11 Reply approval: "Not built" by design (BD-7). This is intentional, not a gap.
   - RP-02 Watchers: replaced by Collaborators. `PLAN-CHECKLIST.md:682` records this.
   - BD-6 several working calendars: deferred.
5. **Open PLAN-CHECKLIST engineering items that are still not done in code:**
   - V181-A4: DB session time zone. `lib/db/client.ts:22` sets `timezone: "Z"` for the driver, but Q-020 is still open.
   - V181-A8: confirmations on high-impact admin actions (AUD-25).
   - V181-A10: origin lock mandatory in production (AUD-15 / Q-021).
   - AI-04b: Google Calendar sync. See FI-D03.
   - The other items are owner actions (publish, keys, OAuth verification, UAT, P0-31..34 master data, P3-40..43 templates, GL-01..07 go-live).

### 4.3 Features with no formal requirement (undocumented)

Every discovered feature traces to at least one F-number or D-number. **No feature is completely undocumented.**

These features trace only to owner decisions (D/F), not to the unified master prompt, the register or the acceptance criteria. Formal acceptance criteria therefore exist only as FLOWS prose:
- Tasks & Project Management (D-215..D-224, F-152..F-170);
- Information module (D-143/145);
- Pico Bot AI and Salesforce (D-168..D-193);
- Google Calendar two-way sync (D-152..D-162);
- Classic view (D-210..D-212, D-227);
- Try as (D-185);
- Power BI reporting views (P7-04);
- public landing page (D-188);
- onboarding tour (D-167).

### 4.4 Visible but not wired

A grep for "coming soon", "TODO", "not yet", "not implemented", `href="#"`, empty `onClick` and hard-disabled controls in `app/` and `features/` found:
- **no** "coming soon" text;
- **no** dead buttons;
- **no** permanently disabled controls. Every `disabled` attribute is conditional, or is a placeholder `<option>`.

Related findings:
- **Misleading "Not tracked" panel** on the Task analytics board. It says tasks have no dependencies and don't repeat, but both exist (FI-D02).
- `CenterScreen.tsx` "Unavailable" notices for information acknowledgement deadlines, task effort and repeat views. These are accurate: no such fields exist.
- `server/ai/connectors/salesforce*.ts` says "Not yet tested against a real org". The feature is wired but unproven (risk R-02).
- `app/users/new/(list)/page.tsx:13` has a stale comment ("come in a later session, P5"). It is a comment only, with no effect.

### 4.5 Routes unreachable from any menu or link

All 129 routes were checked (Appendix A):
- 73 are menu entries (sidebars, command palette, bottom bar);
- the rest are reached by in-page links (template literals), redirects, email links (`/security/not-me`, `/set-password`), or the session watcher (`/signed-out`).

**No live page is unreachable.**

13 routes are **redirect-only legacy addresses**, kept on purpose so old links keep working:
- `/users/ai`, `/users/ai/{data-sources,history,insights,intelligence,reports}` (D-180);
- `/users/reports`, `/users/reports/[key]` (v1.7.1);
- `/users/notifications`, `/users/work/inbox` (D-237);
- `/users/work` (D-236);
- `/admin/dashboards`, `/admin/records`.

Navigation nuance: in the default Compact view, *Assigned by me*, *Team tasks* and *Task search* are not in the sidebar (`AppShell.tsx:142-157` replaces the Tasks section). They stay reachable from Ctrl K and the My Tasks page (`app/users/work/my-tasks/page.tsx:162`). This is intended (D-221/D-223). It is not a defect.

### 4.6 Coverage gaps (risks, not defects)

| Risk | Detail |
|---|---|
| R-01 | Not tested at all: `deleteWorkflowAction` (FI-157) and Sign-in history (FI-184). Tested only partly: approver-group actions (FI-155), working-calendar actions (FI-168), Back up now (FI-171), test send (FI-173), user unlock (FI-152), Team tasks list (FI-077), 7 of 9 feature switches (FI-174) |
| R-02 | Salesforce connector proven only against mocks. The code itself says it has not been tested against a real org (FI-142) |
| R-03 | Many engine actions (recall, pass on, consult, links) have integration tests but no e2e |
| R-04 | Break-glass enable script (`scripts/admin/break-glass.js`) has no test (FI-013) |

## 5. Defects

| Defect ID | Module | Feature | Category | Description | Expected | Actual | Severity | Priority | Reproduction | Evidence | Root cause | Recommendation | Status |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| FI-D01 | Analytics / reports | Weekly HOD report (FI-130) | Missing feature / documentation mismatch | A requirement documented as built does not exist in the code | AD-03 / BD-5: a weekly HOD report, "Built, **off** until the Super Admin switches it on" (`docs/IMPLEMENTATION_PLAN.md:156`), deduplicated per week and HOD | No job step: `server/ops/automation.ts` has 16 steps, none weekly. No `features.*` key, setting or template. `grep -i weekly server/` finds only schedule frequency, holidays and recurrence. Scheduled reports are IT-only (v1.7.1), so HODs cannot get a substitute. `PLAN-CHECKLIST.md:708` (V160-08) is still `[ ]` | Medium | P2 | Look for a weekly-HOD switch in `/superadmin/settings`; there is none. Grep the code for `weekly`/`HOD` | `server/ops/automation.ts:40-221`; `docs/IMPLEMENTATION_PLAN.md:156`; `docs/FEATURE_ACCEPTANCE_CRITERIA.md:76` | Phase 8 item never built; the plan document was not corrected | Either build it (job step + switch, off by default) or mark AD-03/BD-5 "Yet to do" in the plan and the register | Open |
| FI-D02 | Analytics | Task analytics "Not tracked" panel and metric `t_dependencies` (FI-115, FI-117) | Incorrect UI text / data gap | The Task analytics board tells users that tasks have no dependencies and don't repeat. Both features shipped in v1.30–v1.32 | Analytics should reflect, or at least not deny, task dependencies (`task_dependencies` table) and repeating tasks (D-218) | `features/analytics/CenterScreen.tsx:416` shows "Tasks have no dependency links and don't repeat."; `server/analytics/center-metrics.ts:44` marks `t_dependencies` "Unavailable … Tasks have no dependency links and no recurrence" | Low | P3 | Sign in as E2E_ADMIN → `/admin/analytics?board=tasks` → "Not tracked" section | `database/migrations/202610301000_work_management.sql:158` (`CREATE TABLE task_dependencies`); `work-more.int.test.ts:58` (repeating); code review | The analytics text (v1.12.0) was not revisited when D-215/D-218 added these features | Update the text and dictionary entry, or add dependency/recurrence metrics | Open |
| FI-D03 | Calendar / modules | Google Calendar sync ignores module access (FI-113, FI-137) | Access-rule gap (open item AI-04b) | The in-app calendar filters entries by the person's modules; the Google sync does not | AI-04b / D-168: shared pages, including Google Calendar sync, leave out modules the person lacks | `server/calendar/sync.ts:143` calls `businessSources({ id, roles }, …, config.modules)`. `config.modules` is the Super Admin's global switch set, not the person's modules. `server/calendar/sources.ts:32` has no module parameter. The page uses `calendarKindAllowed` (`app/users/calendar/page.tsx:37`) | Low | P3 | Code review only, not reproduced: a person without the TASK module who connects Google Calendar would still get task due dates synced | `PLAN-CHECKLIST.md:473` (`[ ] AI-04b`) | Module filtering (D-168) was added to pages but not to the sync source | Pass `user.modules` into `businessSources` and filter by `calendarKindAllowed`; add an integration test. Also tick the Analytics half of AI-04b, which `AnalyticsScreen.tsx:52` already does | Open |
| FI-D04 | Living files | PLAN-CHECKLIST and FLOWS status drift | Documentation | Several items are shown as open or planned although the code and tests show them done | CLAUDE.md: living files must be accurate | `PLAN-CHECKLIST.md:611-616`: V181-A1/A2/A3/A5/A6 are still `[ ]`, but they are done per V1100-02/03 (`:567-568`), V190-06 (`:595`) and `DEVELOPMENT-MEMORY.md:971`. U-09 (`:695`) and V160-08 (`:708`) are open, but calendar, expiry and bulk reassignment were built in v1.7.0. `FLOWS.md` summary table: F-10 "Planned", F-32 "Planned" (both built: engine, F-79/D-097) | Low | P3 | Read the cited lines | file:line cited | Items closed under other IDs; the originals were not ticked | Tick or `[~]` them with cross-references; refresh the FLOWS summary table | Open |
| FI-D05 | Requirements register | Register consistency | Documentation | The generated register contradicts itself and the code | One status per requirement; reasons current | `M4-05` "Validate requester, approver, delegate, consultant, watcher and administrator permissions independently" is **Implemented**, but the identical `BB-02` is **Yet to do**. The Not-feasible reasons for A3.4-07, A5.3-15, A5.4-21/22 say "no external business integration", but Salesforce (D-172/181) and Google Calendar (D-152) now exist | Low | P3 | `grep -n "M4-05\|BB-02" docs/IMPLEMENTATION_STATUS_REGISTER.md` | `docs/IMPLEMENTATION_STATUS_REGISTER.md:64,1751,2579+` | `docs/register/status.json` not re-reviewed after the integrations | Reconcile duplicate rows; re-assess the integration-health rows (Salesforce and Calendar health can now be reported) | Open |
| FI-D06 | Sign-in | Break-glass alerts (FI-013) | Partial implementation vs flow | The flow requires alerts on every sign-in **or action**; only sign-in alerts exist | F-07: "every sign-in or action alerts the Super Admin and the holder" | `complete-sign-in.ts:146-147` sends `BREAK_GLASS_USED` at sign-in only. No per-action hook found (grep `isBreakGlass` in `server/`). Sessions end when the window closes (`session.ts:65`). The FLOWS table already says "Partly built" | Low | P3 | Code review | `server/auth/complete-sign-in.ts:146`; `FLOWS.md:27,287` | Remainder of F-07 never scheduled | Decide whether a sign-in alert suffices (supersede F-07 with a D-number), or audit and alert privileged actions by the break-glass account | Open |

## Appendix A — All 129 page routes

Legend:
- **menu** = listed in a sidebar, the command palette or the bottom bar.
- **link/other** = reached by in-page links, redirects or emails (all verified in §4.5).
- "redirect-only?" = the page only redirects (legacy address).

Guards are as described in §1. Admin reports pages also need `canUseReports`. Information, Task and AI pages also check their switch and module.

| Route | Area | Guard | Reach | Note |
|---|---|---|---|---|
| `/forgot-password` | public | none (public) | link/other |  |
| `/login` | public | none (public) | link/other |  |
| `/privacy` | public | none (public) | link/other |  |
| `/security/not-me` | public | none (public) | link/other |  |
| `/set-password` | public | none (public) | link/other |  |
| `/signed-out` | public | none (public) | link/other |  |
| `/terms` | public | none (public) | link/other |  |
| `/admin` | admin | requireArea("admin") IT_ADMIN/SUPER_ADMIN + page rule | menu |  |
| `/admin/ai-analytics` | admin | requireArea("admin") IT_ADMIN/SUPER_ADMIN + page rule | menu |  |
| `/admin/ai-rules` | admin | requireArea("admin") IT_ADMIN/SUPER_ADMIN + page rule | menu |  |
| `/admin/analytics/list` | admin | requireArea("admin") IT_ADMIN/SUPER_ADMIN + page rule | link/other |  |
| `/admin/analytics/metrics` | admin | requireArea("admin") IT_ADMIN/SUPER_ADMIN + page rule | link/other |  |
| `/admin/analytics` | admin | requireArea("admin") IT_ADMIN/SUPER_ADMIN + page rule | menu |  |
| `/admin/attention` | admin | requireArea("admin") IT_ADMIN/SUPER_ADMIN + page rule | menu |  |
| `/admin/budgets` | admin | requireArea("admin") IT_ADMIN/SUPER_ADMIN + page rule | menu |  |
| `/admin/calendar` | admin | requireArea("admin") IT_ADMIN/SUPER_ADMIN + page rule | menu |  |
| `/admin/custom-approval` | admin | requireArea("admin") IT_ADMIN/SUPER_ADMIN + page rule | menu |  |
| `/admin/dashboards/approvers` | admin | requireArea("admin") IT_ADMIN/SUPER_ADMIN + page rule | link/other |  |
| `/admin/dashboards/departments` | admin | requireArea("admin") IT_ADMIN/SUPER_ADMIN + page rule | link/other |  |
| `/admin/dashboards` | admin | requireArea("admin") IT_ADMIN/SUPER_ADMIN + page rule | menu | redirect-only? |
| `/admin/dashboards/raisers` | admin | requireArea("admin") IT_ADMIN/SUPER_ADMIN + page rule | link/other |  |
| `/admin/dashboards/utilisation` | admin | requireArea("admin") IT_ADMIN/SUPER_ADMIN + page rule | link/other |  |
| `/admin/doa` | admin | requireArea("admin") IT_ADMIN/SUPER_ADMIN + page rule | menu |  |
| `/admin/groups` | admin | requireArea("admin") IT_ADMIN/SUPER_ADMIN + page rule | menu |  |
| `/admin/import` | admin | requireArea("admin") IT_ADMIN/SUPER_ADMIN + page rule | menu |  |
| `/admin/information-types/[id]` | admin | requireArea("admin") IT_ADMIN/SUPER_ADMIN + page rule | link/other |  |
| `/admin/information-types` | admin | requireArea("admin") IT_ADMIN/SUPER_ADMIN + page rule | menu |  |
| `/admin/insights` | admin | requireArea("admin") IT_ADMIN/SUPER_ADMIN + page rule | menu |  |
| `/admin/organisation` | admin | requireArea("admin") IT_ADMIN/SUPER_ADMIN + page rule | menu |  |
| `/admin/records/information` | admin | requireArea("admin") IT_ADMIN/SUPER_ADMIN + page rule | menu |  |
| `/admin/records` | admin | requireArea("admin") IT_ADMIN/SUPER_ADMIN + page rule | link/other | redirect-only? |
| `/admin/records/requests` | admin | requireArea("admin") IT_ADMIN/SUPER_ADMIN + page rule | menu |  |
| `/admin/records/tasks` | admin | requireArea("admin") IT_ADMIN/SUPER_ADMIN + page rule | menu |  |
| `/admin/reminders/[id]` | admin | requireArea("admin") IT_ADMIN/SUPER_ADMIN + page rule | link/other |  |
| `/admin/reminders` | admin | requireArea("admin") IT_ADMIN/SUPER_ADMIN + page rule | menu |  |
| `/admin/reports/[key]` | admin | requireArea("admin") IT_ADMIN/SUPER_ADMIN + page rule | link/other |  |
| `/admin/reports` | admin | requireArea("admin") IT_ADMIN/SUPER_ADMIN + page rule | menu |  |
| `/admin/task-holidays` | admin | requireArea("admin") IT_ADMIN/SUPER_ADMIN + page rule | menu |  |
| `/admin/task-types/[id]` | admin | requireArea("admin") IT_ADMIN/SUPER_ADMIN + page rule | link/other |  |
| `/admin/task-types` | admin | requireArea("admin") IT_ADMIN/SUPER_ADMIN + page rule | menu |  |
| `/admin/users` | admin | requireArea("admin") IT_ADMIN/SUPER_ADMIN + page rule | menu |  |
| `/admin/users/[id]` | admin | requireArea("admin") IT_ADMIN/SUPER_ADMIN + page rule | link/other |  |
| `/admin/users/new` | admin | requireArea("admin") IT_ADMIN/SUPER_ADMIN + page rule | link/other |  |
| `/admin/workflows` | admin | requireArea("admin") IT_ADMIN/SUPER_ADMIN + page rule | menu |  |
| `/admin/workflows/[id]/compare` | admin | requireArea("admin") IT_ADMIN/SUPER_ADMIN + page rule | link/other |  |
| `/admin/workflows/[id]/migrate` | admin | requireArea("admin") IT_ADMIN/SUPER_ADMIN + page rule | link/other |  |
| `/admin/workflows/[id]` | admin | requireArea("admin") IT_ADMIN/SUPER_ADMIN + page rule | link/other |  |
| `/admin/workflows/import` | admin | requireArea("admin") IT_ADMIN/SUPER_ADMIN + page rule | link/other |  |
| `/admin/workflows/new` | admin | requireArea("admin") IT_ADMIN/SUPER_ADMIN + page rule | link/other |  |
| `/admin/workload` | admin | requireArea("admin") IT_ADMIN/SUPER_ADMIN + page rule | menu |  |
| `/admin/workload/reassign` | admin | requireArea("admin") IT_ADMIN/SUPER_ADMIN + page rule | link/other |  |
| `/` | public | none (public) | link/other |  |
| `/superadmin` | superadmin | requireArea("superadmin") SUPER_ADMIN | menu |  |
| `/superadmin/ai/data-sources` | superadmin | requireArea("superadmin") SUPER_ADMIN | menu |  |
| `/superadmin/ai/history` | superadmin | requireArea("superadmin") SUPER_ADMIN | menu |  |
| `/superadmin/ai` | superadmin | requireArea("superadmin") SUPER_ADMIN | menu |  |
| `/superadmin/ai/reports` | superadmin | requireArea("superadmin") SUPER_ADMIN | menu |  |
| `/superadmin/audit` | superadmin | requireArea("superadmin") SUPER_ADMIN | menu |  |
| `/superadmin/automation` | superadmin | requireArea("superadmin") SUPER_ADMIN | menu |  |
| `/superadmin/deliveries` | superadmin | requireArea("superadmin") SUPER_ADMIN | menu |  |
| `/superadmin/demo` | superadmin | requireArea("superadmin") SUPER_ADMIN | menu |  |
| `/superadmin/import` | superadmin | requireArea("superadmin") SUPER_ADMIN | menu |  |
| `/superadmin/integrations/google-calendar` | superadmin | requireArea("superadmin") SUPER_ADMIN | link/other |  |
| `/superadmin/integrations` | superadmin | requireArea("superadmin") SUPER_ADMIN | menu |  |
| `/superadmin/logins` | superadmin | requireArea("superadmin") SUPER_ADMIN | menu |  |
| `/superadmin/pages/[key]` | superadmin | requireArea("superadmin") SUPER_ADMIN | link/other |  |
| `/superadmin/pages` | superadmin | requireArea("superadmin") SUPER_ADMIN | menu |  |
| `/superadmin/requests` | superadmin | requireArea("superadmin") SUPER_ADMIN | menu |  |
| `/superadmin/retention` | superadmin | requireArea("superadmin") SUPER_ADMIN | menu |  |
| `/superadmin/salesforce` | superadmin | requireArea("superadmin") SUPER_ADMIN | menu |  |
| `/superadmin/settings` | superadmin | requireArea("superadmin") SUPER_ADMIN | menu |  |
| `/superadmin/templates` | superadmin | requireArea("superadmin") SUPER_ADMIN | menu |  |
| `/superadmin/templates/[code]` | superadmin | requireArea("superadmin") SUPER_ADMIN | link/other |  |
| `/try` | public | none (public) | link/other |  |
| `/users` | users | requireArea("users") + page rule/module | menu |  |
| `/users/ai/assistant` | users | requireArea("users") + page rule/module | menu |  |
| `/users/ai/data-sources` | users | requireArea("users") + page rule/module | link/other | redirect-only? |
| `/users/ai/history` | users | requireArea("users") + page rule/module | link/other | redirect-only? |
| `/users/ai/insights` | users | requireArea("users") + page rule/module | link/other | redirect-only? |
| `/users/ai/intelligence` | users | requireArea("users") + page rule/module | link/other | redirect-only? |
| `/users/ai` | users | requireArea("users") + page rule/module | link/other | redirect-only? |
| `/users/ai/reports` | users | requireArea("users") + page rule/module | link/other | redirect-only? |
| `/users/analytics/list` | users | requireArea("users") + page rule/module | link/other |  |
| `/users/analytics/metrics` | users | requireArea("users") + page rule/module | link/other |  |
| `/users/analytics` | users | requireArea("users") + page rule/module | menu |  |
| `/users/approved-by-me` | users | requireArea("users") + page rule/module | menu |  |
| `/users/approved` | users | requireArea("users") + page rule/module | menu |  |
| `/users/calendar/items/[id]` | users | requireArea("users") + page rule/module | link/other |  |
| `/users/calendar` | users | requireArea("users") + page rule/module | menu |  |
| `/users/collaborating` | users | requireArea("users") + page rule/module | menu |  |
| `/users/custom` | users | requireArea("users") + page rule/module | menu |  |
| `/users/delegation` | users | requireArea("users") + page rule/module | menu |  |
| `/users/help` | users | requireArea("users") + page rule/module | menu |  |
| `/users/inbox` | users | requireArea("users") + page rule/module | menu |  |
| `/users/information/[id]` | users | requireArea("users") + page rule/module | link/other |  |
| `/users/information/new` | users | requireArea("users") + page rule/module | menu |  |
| `/users/information` | users | requireArea("users") + page rule/module | menu |  |
| `/users/information/sent` | users | requireArea("users") + page rule/module | menu |  |
| `/users/menu/[module]` | users | requireArea("users") + page rule/module | link/other |  |
| `/users/new` | users | requireArea("users") + page rule/module | menu |  |
| `/users/new/[workflowId]` | users | requireArea("users") + page rule/module | link/other |  |
| `/users/notifications` | users | requireArea("users") + page rule/module | link/other | redirect-only? |
| `/users/notifications/settings` | users | requireArea("users") + page rule/module | menu |  |
| `/users/people/[id]` | users | requireArea("users") + page rule/module | link/other |  |
| `/users/profile/calendar` | users | requireArea("users") + page rule/module | link/other |  |
| `/users/profile` | users | requireArea("users") + page rule/module | menu |  |
| `/users/queue` | users | requireArea("users") + page rule/module | menu |  |
| `/users/reports/[key]` | users | requireArea("users") + page rule/module | link/other | redirect-only? |
| `/users/reports` | users | requireArea("users") + page rule/module | link/other | redirect-only? |
| `/users/requests` | users | requireArea("users") + page rule/module | menu |  |
| `/users/requests/[id]/amend` | users | requireArea("users") + page rule/module | link/other |  |
| `/users/requests/[id]` | users | requireArea("users") + page rule/module | link/other |  |
| `/users/search` | users | requireArea("users") + page rule/module | menu |  |
| `/users/security` | users | requireArea("users") + page rule/module | menu |  |
| `/users/tasks/[id]` | users | requireArea("users") + page rule/module | link/other |  |
| `/users/tasks/assigned` | users | requireArea("users") + page rule/module | menu |  |
| `/users/tasks/new` | users | requireArea("users") + page rule/module | menu |  |
| `/users/tasks` | users | requireArea("users") + page rule/module | menu |  |
| `/users/tasks/team` | users | requireArea("users") + page rule/module | menu |  |
| `/users/work/deleted` | users | requireArea("users") + page rule/module | link/other |  |
| `/users/work/inbox` | users | requireArea("users") + page rule/module | link/other | redirect-only? |
| `/users/work/my-tasks` | users | requireArea("users") + page rule/module | menu |  |
| `/users/work` | users | requireArea("users") + page rule/module | link/other | redirect-only? |
| `/users/work/periodic` | users | requireArea("users") + page rule/module | menu |  |
| `/users/work/projects/[id]` | users | requireArea("users") + page rule/module | link/other |  |
| `/users/work/projects/[id]/settings` | users | requireArea("users") + page rule/module | link/other |  |
| `/users/work/projects/new` | users | requireArea("users") + page rule/module | menu |  |
| `/users/work/projects` | users | requireArea("users") + page rule/module | menu |  |
| `/users/work/search` | users | requireArea("users") + page rule/module | menu |  |
