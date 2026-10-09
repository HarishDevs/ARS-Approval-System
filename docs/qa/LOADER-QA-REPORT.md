# Loader and loading-state QA audit — ARS Approval Platform

**Run:** 9 Oct 2026. Application v1.3.0 (commit f949f2e), production build (`next build && next start`) against the throw-away e2e database `ars_approvals_test`. Chromium (Playwright Desktop Chrome), with device, network and CPU emulation where stated.
**Scope:** TC-001 to TC-085 from the owner's master prompt.
**How:** an executable suite, `tests/qa-loaders/`, run with `npx playwright test -c playwright.loaders.config.ts`.
- **What the tests assert:** every test asserts the *target* behaviour, so a red test is a finding.
- **How the conditions were made:** by intercepting the app's own requests (Server Action POSTs, page fetches, API calls) to make them slow, fail, never answer, answer with garbage, or be replayed.
- **What was measured:** the database was queried after each transaction to count real records.
- **No application code was changed;** defects are reported here for the owner to approve fixes.

Evidence is in `docs/qa/evidence/loaders/`:
- `observations.jsonl`: every measurement;
- `run-results.json`: the final run;
- screenshots.

No credentials, cookies or real data appear in this report: test sessions are generated for throw-away e2e users.

---

## E. Execution summary

| | Count |
|---|---|
| Total test cases | 85 |
| **Passed** | **51** |
| **Failed** | **19** |
| Blocked | 2 |
| Not executed | 0 |
| Not applicable | 13 |
| Executed (Passed + Failed) | 70 |
| Applicable (85 − Not applicable) | 72 |
| **Execution coverage** = executed ÷ applicable | **97.2 %** |
| **Pass rate** = passed ÷ executed | **72.9 %** |

- **What counts as executed:** PASS and FAIL only. BLOCKED and NOT APPLICABLE are excluded, and nothing was marked PASS on reading code alone.
- **NOT APPLICABLE:** used only where the feature doesn't exist, with the evidence given in the register. That covers TC-019, the branded animation TC-053–059, the charts/profile/sorting/polling cases TC-037/038/042/043, and the dark theme TC-081.
- **Defects by severity:** High 1 · Medium 4 · Low 4 (DEF-01 … DEF-09).
- **Critical blockers:** none of severity Critical. **DEF-02 (High)** is the release blocker: any failed or unreadable server answer to a form crashes the whole page and loses what the person typed.
- **Suite stability:** the main suite was run 3 times. The 12 failing test functions failed every time, with the same symptoms (one test function covers several TC ids).

---

## F. Management summary

- **Readiness:** the happy path is solid. Loaders appear, last as long as the work and clear afterwards; skeletons match the final layout with zero layout shift; and the loaders behave on phone, at 200 % zoom, with reduced motion and with a 6× slower CPU.
- **Transaction integrity is the strongest area (all P0 integrity cases pass):**
  - double/triple clicks on Submit and Approve made exactly one record;
  - two people approving at the same moment gave one approval, and the other was told;
  - a replayed approval changed nothing;
  - a plain user replaying a captured Super Admin "Delete" was refused and nothing was deleted;
  - closing or refreshing during a submit never made a duplicate.

  These were checked in the database, not just through disabled buttons.
- **The main risk is failure handling.**
  - A form whose answer fails (server error 500, network drop, cut-off upload, garbage answer, or a session that ended) **crashes to a blank "Application error" screen**, and the typed text is lost. On plant Wi-Fi and mobile data this will happen to real users.
  - A request that never answers **spins forever**, with no time limit or retry.
- **Feedback gaps:**
  - Most page changes and the dashboard period links show **no loading feedback** on a slow connection; only Dashboards and Import have skeletons.
  - Quick period changes on a slow connection can leave the dashboard showing **a different period from the one in the address**.
  - The busy primary button ("Working…") has **1.42 : 1 contrast**, so it is barely readable.
- **Accessibility:** keyboard use and reduced motion pass. Ordinary forms don't announce their busy state to screen readers; the Import screen does.
- **Performance:**
  - pages are visible in about 0.26 s locally;
  - a 300-row import check takes 1.4 s even at a 6× slower CPU;
  - no build-up after 10 repeated cycles.
- **Recommended release decision:** **conditional**. Fix DEF-02 (High) and DEF-03 and DEF-06 (Medium) before the next Publish to Live; the rest can follow. These defects also exist in the version that is live now, so the fixes reduce risk rather than add it.

---

## A. Loader inventory

| # | Loader | Where | Trigger | Ends when | On failure | Test cases |
|---|---|---|---|---|---|---|
| L-01 | Route skeleton (`loading.tsx`) | /admin/dashboards/*, /admin/import, /superadmin/import | Client navigation into those routes | The page renders | No error boundary: the whole page errors | TC-003, 024, 035, 036, 039 |
| L-02 | *(absent)* navigation feedback | Every other route | Client navigation | The page renders | — | TC-003, 039, 041 (DEF-01) |
| L-03 | SubmitButton "Working…" (text only, disabled) | ~50 forms using `useActionForm` (comment, decide, save, submit, resubmit, attach…) | Server Action in flight | The action answers | **Page crash on a transport/HTTP error (DEF-02)**; no timeout (DEF-03) | TC-004, 005, 011–018, 020, 029–032, 045–049, 063, 064, 066, 070, 074, 076, 077, 079 |
| L-04 | Decision buttons (Approve / Changes / Hold / Reject) disabled while pending | Request page | Decide action | The action answers | As L-03 | TC-020, 021, 022, 079, 085 |
| L-05 | In-page confirm bar (Yes, continue / Cancel) | Withdraw, Publish… | Before sending | — | — | TC-019 |
| L-06 | Import panel: Spinner on buttons + status bar "Checking… / Importing… keep this page open" (`role=status`, `aria-busy`) | /admin/import, /superadmin/import | Check / Import / Download | The answer, or a caught error | Caught: "The server didn't answer…" | TC-025, 034, 050, 052, 060–062, 065, 066, 068, 069, 075, 078 |
| L-07 | Delete-request spinner "Deleting…" | Super Admin → Requests, request page | Delete action | Redirect / refresh | As L-03 | TC-084 |
| L-08 | Sign-in "Checking…" / "Opening Google…" | /login | `fetch` to /api/auth/* | The JSON answer | Caught: "Something went wrong. Please try again." | TC-074 |
| L-09 | Sign out "Signing out…" | Account menu | `fetch` logout | Redirect | Errors ignored, redirect anyway | — |
| L-10 | Skeleton blocks (`SkeletonBlock`) | L-01 screens | — | — | — | TC-035, 036 |
| L-11 | Browser's own indicator | GET filter form on dashboards (full page load) | Apply | Load | Browser error page | TC-039 |
| L-12 | CSV export link (direct download) | Dashboards | Click | The browser saves the file | Browser download error | TC-051 |

There is **no branded loading animation**, no upload % progress (Server Actions don't report it), no top-of-page progress bar, and no `error.tsx` / `global-error.tsx` anywhere.

---

## B. Test case register

Preconditions for all rows:
- production build; e2e database freshly migrated and seeded;
- e2e users (E2E_ADMIN, E2E_SUPER, E2E_REQ, E2E_MGR, E2E_HOD, E2E_STAFF);
- one published "QA Loader Type" (DoA: manager, then HOD) and a base request, made by the suite's setup step.

| ID | Module | Scenario | Steps | Expected | Actual | Status | Priority | Severity | Evidence | Defect | Automation |
|---|---|---|---|---|---|---|---|---|---|---|---|
| TC-001 | Page | Initial load | Sign in → open /users | Content shows; no loader left behind | Server-rendered page complete in 261 ms (TTFB 20 ms); 0 leftover loaders | PASS | P1 | - | firstVisibleMs=267; reloadVisibleMs=107; nav={"ttfb": 17, "domContentLoaded": 201, "load": 207}; leftoverLoaders=0 | - | Automated (tests/qa-loaders/loaders.spec.ts) |
| TC-002 | Page | Browser refresh | Reload /users | Content returns; no stuck loader | Visible again in 112 ms; 0 leftover loaders | PASS | P2 | - | firstVisibleMs=267; reloadVisibleMs=107; nav={"ttfb": 17, "domContentLoaded": 201, "load": 207}; leftoverLoaders=0 | - | Automated (tests/qa-loaders/loaders.spec.ts) |
| TC-003 | Navigation | Loader on slow page change | 3 s delay on page fetches; click Dashboards, then Users & roles | Feedback while waiting | Dashboards: skeleton shown. Users & roles: NO feedback for 3 s; old page stays with no sign the click registered | FAIL | P1 | Medium | dashboardsSkeletonShown=true; usersPageFeedbackWithin1200ms=false; oldPageStillShownWhileWaiting=true; usersPageMs=3133; FAIL-TC-003*.png | DEF-01 | Automated (tests/qa-loaders/loaders.spec.ts) |
| TC-004 | Navigation | No distracting flicker | Post a comment with no delay | Loader not a jarring flash | 'Working…' appeared after 64 ms, gone by 140 ms (≈76 ms flash); the button shrinks from 115 px to 90 px while it shows | FAIL | P2 | Low | loaderAppearedAfterMs=65; totalMs=150; buttonWidthBefore=115.34375; buttonWidthDuring=89.71875 | DEF-08 | Automated (tests/qa-loaders/loaders.spec.ts) |
| TC-005 | Navigation | Slow request keeps loader | Comment with 4 s server delay | Loader stays until answer | 'Working…' and disabled at 3 s; cleared after the answer (4.5 s) | PASS | P1 | - | actions=1; stillWorkingAt3s=true; totalMs=4484 | - | Automated (tests/qa-loaders/loaders.spec.ts) |
| TC-006 | Navigation | Invalid route | Open /users/nowhere-at-all | Not-found page, no loader | HTTP 404, 'This page isn't available' | PASS | P2 | - | unknownRouteStatus=404; unknownRecordStatus=404 | - | Automated (tests/qa-loaders/loaders.spec.ts) |
| TC-007 | Navigation | Back / Forward | Admin → Dashboards → Import → Back ×2 → Forward | Right pages, no stuck loader | Right pages; 0 leftover loaders | PASS | P2 | - | leftoverLoaders=0 | - | Automated (tests/qa-loaders/loaders.spec.ts) |
| TC-008 | Auth | Post-login redirect | Signed out → /admin/dashboards; then signed in → /login?next=… | Back to the page asked for | Signed-out visit → /login?next=%2Fadmin%2Fdashboards; a signed-in visit to that link lands on /admin/dashboards. (The Google/OTP sign-in itself can't run in the test environment.) | PASS | P1 | - | signedInVisitToLoginLandsOn="/admin/dashboards" | - | Automated (tests/qa-loaders/loaders.spec.ts) |
| TC-009 | Auth | Expired session | Open a request, clear cookies, post a comment | Told to sign in again | The page CRASHES to 'Application error: a client-side exception'; the typed comment is lost | FAIL | P0 | High | stuck=false; redirectedToLogin=false; message="none"; crashed=true; TC-009-session-ended.png | DEF-02 | Automated (tests/qa-loaders/loaders.spec.ts) |
| TC-010 | Navigation | Rapid navigation | 4 nav links clicked 150 ms apart (800 ms latency) | Ends on the last page, no loader | Ended on Working calendar; 0 leftover loaders | PASS | P1 | - | finalHeading="Working calendar"; finalUrl="/admin/calendar"; leftoverLoaders=0 | - | Automated (tests/qa-loaders/loaders.spec.ts) |
| TC-011 | Forms | Save shows a spinner | Hold the Save action on a designation | Busy state while saving | Button 'Working…' and disabled; only that button | PASS | P1 | - | workingButtonsWhileHeld=1; otherSaveEnabled=true; workingAfter=0 | - | Automated (tests/qa-loaders/loaders.spec.ts) |
| TC-012 | Forms | Submit loading state | Submit a request | Busy state | 'Working…', disabled, one action POST | PASS | P0 | - | uiClicks=3; actionPosts=1; requestsCreated=1 | - | Automated (tests/qa-loaders/loaders.spec.ts) |
| TC-013 | Integrity | Double-click Submit | dblclick + a forced third click | One request | 1 action POST; 1 request row in the database | PASS | P0 | - | uiClicks=3; actionPosts=1; requestsCreated=1 | - | Automated (tests/qa-loaders/loaders.spec.ts) |
| TC-014 | Integrity | Repeated clicks while processing | As TC-013 | No duplicates | 1 row (the button is disabled, plus a one-time submission key on the server, D-QA-01) | PASS | P0 | - | uiClicks=3; actionPosts=1; requestsCreated=1 | - | Automated (tests/qa-loaders/loaders.spec.ts) |
| TC-015 | Forms | Invalid form | Submit an empty request form | Field errors, loader ends | Errors shown, button re-enabled; 1 server round trip (validation is server-side) | PASS | P2 | - | roundTrips=1 | - | Automated (tests/qa-loaders/loaders.spec.ts) |
| TC-016 | Forms | Success clears spinner | As TC-011, then release | Spinner gone + success | 'Saved.' shown; 0 'Working…' left | PASS | P1 | - | workingButtonsWhileHeld=1; otherSaveEnabled=true; workingAfter=0 | - | Automated (tests/qa-loaders/loaders.spec.ts) |
| TC-017 | Errors | Server error | The comment action answers HTTP 500 | Error message, button usable | The page CRASHES to the generic 'Application error' screen; no message; input lost | FAIL | P0 | High | crashedToErrorPage=true; loaderStuck=false; errorMessages=0; TC-017-server-error.png | DEF-02 | Automated (tests/qa-loaders/loaders.spec.ts) |
| TC-018 | Errors | Timeout | The comment action never answers; wait 35 s | Timeout/recovery state | Still 'Working…' after 35 s; no cancel/retry; no time limit | FAIL | P1 | Medium | waitedMs=35000; stillSpinning=true; cancelOrRetryOffered=false | DEF-03 | Automated (tests/qa-loaders/loaders.spec.ts) |
| TC-019 | Forms | Cancellation | - | Cancel works where offered | No in-flight cancel exists anywhere (actions are short server calls; Confirm bars cancel only before sending) | NOT APPLICABLE | P3 | - | Code: features/ui/form.tsx, ImportPanel.tsx — no AbortController | - | Inspection |
| TC-020 | Integrity | Approve: progress + no duplicates | Manager double-clicks Approve | One approval | 1 action POST; 1 approved task | PASS | P0 | - | uiClicks=2; actionPosts=1; approvedTasks=1 | - | Automated (tests/qa-loaders/loaders.spec.ts) |
| TC-021 | Integrity | Reject updates the right record | Two requests; reject one | Only that one rejected | Kept request: not rejected; target: rejected | PASS | P0 | - | keptRequestRejected=0; rejectedRequestRejected=1 | - | Automated (tests/qa-loaders/loaders.spec.ts) |
| TC-022 | Integrity | Concurrent approvals | Same approver, two browsers, Approve at once | One wins, the other is told | 1 approved task; the other tab told it was already done | PASS | P0 | - | approvedTasks=1; tabsToldItWasAlreadyDone=1 | - | Automated (tests/qa-loaders/loaders.spec.ts) |
| TC-023 | Data | Success shows data | Open Raiser-wise dashboard | Data, no loader | Rows shown | PASS | P2 | - | dataShown=true; emptyStateShown=true | - | Automated (tests/qa-loaders/loaders.spec.ts) |
| TC-024 | Data | Slow API feedback | 3 s delay; dashboard / action | Feedback throughout | Dashboard skeleton; action 'Working…' held 4.5 s | PASS | P1 | - | actions=1; stillWorkingAt3s=true; totalMs=4484; TC-035-skeleton.png | - | Automated (tests/qa-loaders/loaders.spec.ts) |
| TC-025 | Data | HTTP 400 | Import template download answers 400 | Clear error | 'The download didn't work. Please try again.' | PASS | P2 | - | errorShownOn400=true; otherButtonLockedWhileBusy=true; downloadedFile="ars-departments-template.csv" | - | Automated (tests/qa-loaders/loaders.spec.ts) |
| TC-026 | Auth | HTTP 401 / no session on an action | As TC-009 | Sign-in prompt | Crash (as TC-009) | FAIL | P0 | High | stuck=false; redirectedToLogin=false; message="none"; crashed=true | DEF-02 | Automated (tests/qa-loaders/loaders.spec.ts) |
| TC-027 | Auth | HTTP 403 / no access | Plain user opens /admin | Access denied | 404 page by design (D-016: admin spaces don't reveal they exist) | PASS | P1 | - | adminPageStatus=404; adminApiStatus=404; replayStatus=200; replaySaysNotFound=true; requestStillPresent=1 | - | Automated (tests/qa-loaders/loaders.spec.ts) |
| TC-028 | Data | HTTP 404 record | Open /users/requests/99999999 | Not found | HTTP 404 page | PASS | P2 | - | unknownRouteStatus=404; unknownRecordStatus=404 | - | Automated (tests/qa-loaders/loaders.spec.ts) |
| TC-029 | Errors | HTTP 500 stops loader | As TC-017 | Error shown | Crash (as TC-017) | FAIL | P0 | High | crashedToErrorPage=true; loaderStuck=false; errorMessages=0 | DEF-02 | Automated (tests/qa-loaders/loaders.spec.ts) |
| TC-030 | Errors | API timeout | As TC-018 | No infinite spinner | Infinite spinner (as TC-018) | FAIL | P1 | Medium | waitedMs=35000; stillSpinning=true; cancelOrRetryOffered=false | DEF-03 | Automated (tests/qa-loaders/loaders.spec.ts) |
| TC-031 | Network | Offline | Go offline, post a comment | Connection message | CRASH to 'Application error'; no connection message | FAIL | P0 | High | crashedToErrorPage=true; loaderStuck=false; connectionMessage=0; recoveredAfterRetry=false; TC-031-offline.png | DEF-02 | Automated (tests/qa-loaders/loaders.spec.ts) |
| TC-032 | Network | Recovery after reconnect | Back online, retry | Retry works | Not possible without reloading: the page had crashed; the comment was lost | FAIL | P0 | High | crashedToErrorPage=true; loaderStuck=false; connectionMessage=0; recoveredAfterRetry=false | DEF-02 | Automated (tests/qa-loaders/loaders.spec.ts) |
| TC-033 | Data | Empty response | Dashboard for 2001 | Empty state | 'No requests in this period.' | PASS | P2 | - | dataShown=true; emptyStateShown=true | - | Automated (tests/qa-loaders/loaders.spec.ts) |
| TC-034 | Data | Concurrent calls | Download template, then Download current at once | Correct states | Second button locked while the first works | PASS | P2 | - | errorShownOn400=true; otherButtonLockedWhileBusy=true; downloadedFile="ars-departments-template.csv" | - | Automated (tests/qa-loaders/loaders.spec.ts) |
| TC-035 | Skeleton | Dashboard skeleton matches layout | 3 s delay → Dashboards | Same structure | 4 skeleton tiles → 4 KPI tiles; header, filter and table block match | PASS | P2 | - | skeletonTiles=4; finalTiles=4; cumulativeLayoutShift=0; TC-035-skeleton.png / TC-035-final.png | - | Automated (tests/qa-loaders/loaders.spec.ts) |
| TC-036 | Skeleton | Table skeleton, no layout shift | Full load of the dashboard; measure CLS | No significant shift | CLS = 0. The table skeleton is one grey block, not rows (cosmetic) | PASS | P3 | - | skeletonTiles=4; finalTiles=4; cumulativeLayoutShift=0 | - | Automated (tests/qa-loaders/loaders.spec.ts) |
| TC-037 | Skeleton | Chart placeholders | - | - | No charts: outcome bars are rendered on the server with the data, so they have no separate loading | NOT APPLICABLE | P3 | - | Code: features/admin/dashboards/DashboardFrame.tsx | - | Inspection |
| TC-038 | Skeleton | Profile placeholders | - | - | No profile/account placeholders: the account menu is rendered on the server | NOT APPLICABLE | P3 | - | Code: features/shell/AppShell.tsx | - | Inspection |
| TC-039 | Dashboards | Filter loading feedback | 1.5 s latency; click a period preset | Feedback while updating | No feedback: the old period stays on screen until the new one arrives | FAIL | P2 | Low | feedbackWhileApplying=false; finalFrom=null; fromFieldShows="2026-04-01" | DEF-01 | Automated (tests/qa-loaders/loaders.spec.ts) |
| TC-040 | Dashboards | Stale responses vs rapid filters | 1.5 s latency; Last FY → Last 90 days → This month quickly | The last choice wins | Run 1: the URL says This month (from=2026-10-01) but the page shows Last FY (fields and CSV link from=2025-04-01). Final run: no navigation applied (URL and page stayed on the default). Either way the last click isn't what's shown | FAIL | P1 | Medium | feedbackWhileApplying=false; finalFrom=null; fromFieldShows="2026-04-01"; DIAG-040b (earlier run): urlFrom=2026-10-01, renderedFilterFrom=2025-04-01 | DEF-04 | Automated (tests/qa-loaders/loaders.spec.ts) |
| TC-041 | Tables | Pagination | 30 extra rows; 2 s latency; Older → | Feedback + right page | Right page 2; NO feedback during the 2 s | FAIL | P2 | Low | feedbackWhileLoadingPage2=false; firstRowChanged=true | DEF-01 | Automated (tests/qa-loaders/loaders.spec.ts) |
| TC-042 | Tables | Sorting | - | - | No sortable tables in the app | NOT APPLICABLE | P3 | - | Code: no sort controls (grep) | - | Inspection |
| TC-043 | Data | Background refresh | - | - | No background polling or auto-refresh anywhere | NOT APPLICABLE | P3 | - | Code: no setInterval/polling in app/features | - | Inspection |
| TC-044 | Dashboards | One failing widget | Needs one dashboard query to fail on the server | Other widgets survive | Can't inject a single-query failure without changing code. Risk: each dashboard is one server render and the app has no error.tsx, so any server error replaces the whole page | BLOCKED | P2 | - | Missing: server-side fault injection | - | Not automatable without a code hook |
| TC-045 | Files | Upload progress | Attach a small PDF with a 2 s delay | Loader during upload | 'Working…' during the upload, file listed after; indeterminate (no %) | PASS | P1 | - | loaderDuringUpload=true; actions=1; wrongTypeRefused=true; tooBigRefused=true; loaderStuck=false; progressShown="indeterminate only (button text)" | - | Automated (tests/qa-loaders/loaders.spec.ts) |
| TC-046 | Files | Large upload | 9 MB PDF at 750 KB/s | Responsive, loader stays | 13.3 s upload; typing worked meanwhile; indeterminate loader (no % available from server actions) | PASS | P2 | - | uploadMs=13293; pageResponsiveDuringUpload=true; progress="indeterminate (no % shown)" | - | Automated (tests/qa-loaders/loaders.spec.ts) |
| TC-047 | Files | Unsupported type | Attach tool.exe | Refused, no stuck loader | Refused with a message | PASS | P1 | - | loaderDuringUpload=true; actions=1; wrongTypeRefused=true; tooBigRefused=true; loaderStuck=false; progressShown="indeterminate only (button text)" | - | Automated (tests/qa-loaders/loaders.spec.ts) |
| TC-048 | Files | Oversized file | Attach a 10 MB + 10 bytes file | Clear error | 'big.pdf is larger than 10 MB.'; loader cleared | PASS | P1 | - | loaderDuringUpload=true; actions=1; wrongTypeRefused=true; tooBigRefused=true; loaderStuck=false; progressShown="indeterminate only (button text)" | - | Automated (tests/qa-loaders/loaders.spec.ts) |
| TC-049 | Files | Interrupted upload | The upload connection is cut | Safe failure + retry | CRASH to 'Application error'; nothing partial saved (good) | FAIL | P0 | High | crashedToErrorPage=true; loaderStuck=false; errorMessages=0; partialFileSaved=0; TC-049-interrupted.png | DEF-02 | Automated (tests/qa-loaders/loaders.spec.ts) |
| TC-050 | Files | Download | Download the import template | File + feedback | Spinner while fetching; ars-departments-template.csv arrived | PASS | P2 | - | errorShownOn400=true; otherButtonLockedWhileBusy=true; downloadedFile="ars-departments-template.csv" | - | Automated (tests/qa-loaders/loaders.spec.ts) |
| TC-051 | Files | Export | Dashboard Download CSV | Completes | ars-approvers-<period>.csv downloaded (direct link; small data, no loader needed) | PASS | P2 | - | csvFile="ars-approvers-2026-04-01-to-2026-10-09.csv"; actions=1; statusBarWhileChecking=true; statusBarAfter=0; importOfferedWithProblems=0; goodRowSaved=0 | - | Automated (tests/qa-loaders/loaders.spec.ts) |
| TC-052 | Files | Import processing status | Holiday CSV with one bad row, 1.5 s delay | Status + errors | 'Checking…' status bar, then '1 of 2 rows have problems' | PASS | P1 | - | csvFile="ars-approvers-2026-04-01-to-2026-10-09.csv"; actions=1; statusBarWhileChecking=true; statusBarAfter=0; importOfferedWithProblems=0; goodRowSaved=0 | - | Automated (tests/qa-loaders/loaders.spec.ts) |
| TC-053 | Branded loader | Branded animation starts cleanly | - | - | The app has no branded loading animation: loaders are a plain spinner icon, 'Working…' text and grey skeleton blocks | NOT APPLICABLE | P3 | - | Code: features/ui/Spinner.tsx, features/ui/form.tsx (grep for animations) | - | Inspection |
| TC-054 | Branded loader | Branded animation sequence | - | - | The app has no branded loading animation: loaders are a plain spinner icon, 'Working…' text and grey skeleton blocks | NOT APPLICABLE | P3 | - | Code: features/ui/Spinner.tsx, features/ui/form.tsx (grep for animations) | - | Inspection |
| TC-055 | Branded loader | Branded animation logo/colours | - | - | The app has no branded loading animation: loaders are a plain spinner icon, 'Working…' text and grey skeleton blocks | NOT APPLICABLE | P3 | - | Code: features/ui/Spinner.tsx, features/ui/form.tsx (grep for animations) | - | Inspection |
| TC-056 | Branded loader | Branded animation brand text | - | - | The app has no branded loading animation: loaders are a plain spinner icon, 'Working…' text and grey skeleton blocks | NOT APPLICABLE | P3 | - | Code: features/ui/Spinner.tsx, features/ui/form.tsx (grep for animations) | - | Inspection |
| TC-057 | Branded loader | Branded animation stops on success | - | - | The app has no branded loading animation: loaders are a plain spinner icon, 'Working…' text and grey skeleton blocks | NOT APPLICABLE | P3 | - | Code: features/ui/Spinner.tsx, features/ui/form.tsx (grep for animations) | - | Inspection |
| TC-058 | Branded loader | Branded animation stops on failure | - | - | The app has no branded loading animation: loaders are a plain spinner icon, 'Working…' text and grey skeleton blocks | NOT APPLICABLE | P3 | - | Code: features/ui/Spinner.tsx, features/ui/form.tsx (grep for animations) | - | Inspection |
| TC-059 | Branded loader | Branded animation no overlap | - | - | The app has no branded loading animation: loaders are a plain spinner icon, 'Working…' text and grey skeleton blocks | NOT APPLICABLE | P3 | - | Code: features/ui/Spinner.tsx, features/ui/form.tsx (grep for animations) | - | Inspection |
| TC-060 | Visual | Resize during loading | Hold an import check; resize desktop → phone → 200% | Loader stays placed | Status bar visible, inside the width, no sideways scroll at every size | PASS | P3 | - | desktop={"visible": true, "insideWidth": true, "horizontalScroll": false}; mobile={"visible": true, "insideWidth": true, "horizontalScroll": false}; zoom200={"visible": true, "insideWidth": true, "horizontalScroll": false} | - | Automated (tests/qa-loaders/loaders.spec.ts) |
| TC-061 | Visual | Mobile not clipped | As TC-060 at 375 px | Not clipped | Inside 375 px | PASS | P2 | - | desktop={"visible": true, "insideWidth": true, "horizontalScroll": false}; mobile={"visible": true, "insideWidth": true, "horizontalScroll": false}; zoom200={"visible": true, "insideWidth": true, "horizontalScroll": false} | - | Automated (tests/qa-loaders/loaders.spec.ts) |
| TC-062 | Performance | Low-power device | CPU throttled 6×; check a 300-row import | Usable | Finished in 1.39 s | PASS | P3 | - | cpuThrottle="6x"; rows=300; checkMs=1247; longTaskTotalMs=857 | - | Automated (tests/qa-loaders/loaders.spec.ts) |
| TC-063 | Accessibility | Keyboard | Type comment → Tab → Enter | Reachable, works | Tab lands on 'Post comment'; Enter submits | PASS | P2 | - | tabReachesPostButton="Post comment"; enterSubmits=true; genericForm={"formAriaBusy": null, "buttonAriaDisabled": null, "liveRegionNearButton": false}; importStatusRegion=1; importAriaBusy=1 | - | Automated (tests/qa-loaders/loaders.spec.ts) |
| TC-064 | Accessibility | Screen reader announcements | Hold a comment; inspect ARIA | Busy state announced | Ordinary forms: no aria-busy and no live region (only the button text changes). The import screen does it right (role=status, aria-busy) | FAIL | P2 | Low | tabReachesPostButton="Post comment"; enterSubmits=true; genericForm={"formAriaBusy": null, "buttonAriaDisabled": null, "liveRegionNearButton": false}; importStatusRegion=1; importAriaBusy=1 | DEF-05 | Automated (tests/qa-loaders/loaders.spec.ts) |
| TC-065 | Accessibility | Reduced motion | prefers-reduced-motion: reduce | Animation suppressed | Spinner animation-duration 0.00001 s | PASS | P2 | - | reducedMotionAnimationDuration="1e-05s"; statusContrast=9.64; busyButtonContrast=1.42; busyButtonColors={"fg": "rgb(255, 255, 255)", "bg": "rgb(201, 218, 238)"}; darkPreferenceBodyBg="rgb(248, 250, 252)" | - | Automated (tests/qa-loaders/loaders.spec.ts) |
| TC-066 | Accessibility | Contrast | Measure busy states | ≥ 4.5:1 | Import status bar 9.64:1 PASS; the busy primary button ('Checking…'/'Working…' white on #C9DAEE) is 1.42:1 | FAIL | P1 | Medium | reducedMotionAnimationDuration="1e-05s"; statusContrast=9.64; busyButtonContrast=1.42; busyButtonColors={"fg": "rgb(255, 255, 255)", "bg": "rgb(201, 218, 238)"}; darkPreferenceBodyBg="rgb(248, 250, 252)" | DEF-06 | Automated (tests/qa-loaders/loaders.spec.ts) |
| TC-067 | Security | Server-side authorisation | Plain user calls the admin dashboard API | Refused | HTTP 404 | PASS | P0 | - | adminPageStatus=404; adminApiStatus=404; replayStatus=200; replaySaysNotFound=true; requestStillPresent=1 | - | Automated (tests/qa-loaders/loaders.spec.ts) |
| TC-068 | Performance | Main-thread blocking | 6× CPU, 300-row check, longtask observer | Within budget (total long tasks < 2 s at 6×) | 928 ms of long tasks in total | PASS | P3 | - | cpuThrottle="6x"; rows=300; checkMs=1247; longTaskTotalMs=857 | - | Automated (tests/qa-loaders/loaders.spec.ts) |
| TC-069 | Performance | Repeated cycles | 10 check/fail cycles | No build-up | 0 leftover status bars; DOM 125 → 163 nodes (the result table); JS heap 10 → 10 MB | PASS | P2 | - | cycles=10; domNodesBefore=125; domNodesAfter=163; heapBeforeMB=10; heapAfterMB=10; leftoverStatusBars=0 | - | Automated (tests/qa-loaders/loaders.spec.ts) |
| TC-070 | Errors | Long-running requests | As TC-018 | Timeout/cancel/recovery | None | FAIL | P1 | Medium | waitedMs=35000; stillSpinning=true; cancelOrRetryOffered=false | DEF-03 | Automated (tests/qa-loaders/loaders.spec.ts) |
| TC-071 | Edge | Background tab | Hold an action; switch tab; release; come back | Result shown | Comment shown on return | PASS | P3 | - | resultShownOnReturn=true | - | Automated (tests/qa-loaders/loaders.spec.ts) |
| TC-072 | Integrity | Close tab during submit | Submit (1.5 s delay), close the tab | Consistent server state | 1 request: completed once, no partial data | PASS | P0 | - | requestsAfterRefreshDuringSubmit=0; requestsAfterCloseDuringSubmit=1 | - | Automated (tests/qa-loaders/loaders.spec.ts) |
| TC-073 | Integrity | Refresh right after submit | Submit (1.5 s delay), reload at 300 ms | No duplicate | 0 requests: the browser cut the call before it reached the server; no duplicate. (The person isn't told it didn't go.) | PASS | P0 | - | requestsAfterRefreshDuringSubmit=0; requestsAfterCloseDuringSubmit=1 | - | Automated (tests/qa-loaders/loaders.spec.ts) |
| TC-074 | Errors | Malformed response | Sign-in API answers '{not json'; comment action answers garbage | Handled, no endless loader | Sign-in: 'Something went wrong. Please try again.' PASS. Comment form: CRASH to 'Application error' | FAIL | P1 | High | signInShowsMessage=false; signInStuck=false; formCrashedToErrorPage=true; formLoaderStuck=false; DIAG-074-sign-in.png; TC-074-malformed.png | DEF-02 | Automated (tests/qa-loaders/loaders.spec.ts) |
| TC-075 | Integrity | Partial results | Import a file with 1 good + 1 bad row | Not reported as success | '1 of 2 rows have problems. Nothing has been saved.'; the good row isn't saved; no Import button | PASS | P0 | - | csvFile="ars-approvers-2026-04-01-to-2026-10-09.csv"; actions=1; statusBarWhileChecking=true; statusBarAfter=0; importOfferedWithProblems=0; goodRowSaved=0 | - | Automated (tests/qa-loaders/loaders.spec.ts) |
| TC-076 | Auth | Token expiry during a request | Hold the action; revoke the session; release | Safe + told to sign in | Not saved (good), not stuck (good), but the message is 'Not found.' instead of a sign-in prompt | FAIL | P2 | Low | shownText="MY APPROVALS\n\nOverview\nWaiting for me\nMy requests\nNew request\nCustom approval\nOut of office\nNotifications\nSign-in & devices\n1\nRavi Requester\nMy approvals\nRR\nQA base mv0m3xzk\n\nQAL-2026-000001 \u00b7 QA Loader Type \u00b7 raised by Ravi Requester\n\nIn progress\n\u2190 Back\; TC-076-session-mid-flight.png | DEF-07 | Automated (tests/qa-loaders/loaders.spec.ts) |
| TC-077 | Forms | Independent buttons | Hold Save on one designation | Others unaffected | The second Save stays enabled and labelled 'Save' | PASS | P2 | - | workingButtonsWhileHeld=1; otherSaveEnabled=true; workingAfter=0 | - | Automated (tests/qa-loaders/loaders.spec.ts) |
| TC-078 | Forms | Shared indicator only while needed | Import check | Status bar only while pending | Shown while checking; 0 after | PASS | P2 | - | csvFile="ars-approvers-2026-04-01-to-2026-10-09.csv"; actions=1; statusBarWhileChecking=true; statusBarAfter=0; importOfferedWithProblems=0; goodRowSaved=0 | - | Automated (tests/qa-loaders/loaders.spec.ts) |
| TC-079 | Integrity | Retry while active | Double-click Approve while the first is in flight | No duplicate processing | 1 POST, 1 approval | PASS | P0 | - | uiClicks=2; actionPosts=1; approvedTasks=1 | - | Automated (tests/qa-loaders/loaders.spec.ts) |
| TC-080 | Visual | 200% zoom | 640×400 viewport (≈1280×800 at 200%) | Usable | Status bar visible, no sideways scroll | PASS | P2 | - | desktop={"visible": true, "insideWidth": true, "horizontalScroll": false}; mobile={"visible": true, "insideWidth": true, "horizontalScroll": false}; zoom200={"visible": true, "insideWidth": true, "horizontalScroll": false}; TC-080-zoom200.png | - | Automated (tests/qa-loaders/loaders.spec.ts) |
| TC-081 | Visual | Light and dark themes | prefers-color-scheme: dark | Legible in both | The app has no dark theme (it stays light: body #F8FAFC); light-theme legibility is covered in TC-066 | NOT APPLICABLE | P3 | - | reducedMotionAnimationDuration="1e-05s"; statusContrast=9.64; busyButtonContrast=1.42; busyButtonColors={"fg": "rgb(255, 255, 255)", "bg": "rgb(201, 218, 238)"}; darkPreferenceBodyBg="rgb(248, 250, 252)" | - | Automated (tests/qa-loaders/loaders.spec.ts) |
| TC-082 | Network | Slow network | 400 ms latency, 750 KB/s, 9 MB upload | Loading and recovery intact | Completed in 13.3 s; loader throughout | PASS | P2 | - | uploadMs=13293; pageResponsiveDuringUpload=true; progress="indeterminate (no % shown)" | - | Automated (tests/qa-loaders/loaders.spec.ts) |
| TC-083 | Errors | Render error after success | Needs a component that throws after a good answer | No stuck UI | Needs a code hook to inject. Risk: with no error.tsx anywhere, any render error shows the generic 'Application error' screen (as in DEF-02) | BLOCKED | P2 | - | Missing: render-fault injection | - | Not automatable without a code hook |
| TC-084 | Security | Bypassing client controls | Capture the Super Admin Delete action; replay it as a plain user | Refused | 'Not found.'; the request is NOT deleted | PASS | P0 | - | adminPageStatus=404; adminApiStatus=404; replayStatus=200; replaySaysNotFound=true; requestStillPresent=1 | - | Automated (tests/qa-loaders/loaders.spec.ts) |
| TC-085 | Integrity | Duplicate responses / replays | Replay the captured Approve request after success | No repeat | 1 approved task, 1 TASK_DECIDED event | PASS | P0 | - | replayStatus=200; approvedTasks=1; approvalEvents=1 | - | Automated (tests/qa-loaders/loaders.spec.ts) |

---

## D. Defect register

### DEF-02 — High — A failed or unreadable form answer crashes the page and loses input
- **Tests:** TC-009, 017, 026, 029, 031, 032, 049, 074 (form part).
- **Reproduce:** open any request → type a comment → make the comment action fail. Any of these does it: the server answers 500, the browser goes offline, the upload connection is cut, the server answers with garbage, or the session cookie has gone → press Post comment.
- **Expected:** the button returns to normal and a message says what happened ("Couldn't reach the server — check your connection and try again"); the typed text stays.
- **Actual:** the whole page is replaced by "Application error: a client-side exception has occurred…"; the typed text is lost; a reload is needed. Evidence: `TC-017-server-error.png`, `TC-031-offline.png`, `TC-049-interrupted.png`, `TC-074-malformed.png`, `TC-009-session-ended.png`.
- **Root cause (established from the code paths the tests hit):**
  - `features/ui/form.tsx` → `useActionForm` dispatches the Server Action through `useActionState`; a transport or protocol failure throws inside React.
  - The app has **no `error.tsx` or `global-error.tsx`**, so the throw reaches Next's root handler.
  - When the session cookie is missing, the middleware answers the action with a redirect to /login, which the action client can't parse.
- **Recommended fix:**
  1. In `useActionForm`, wrap the action in a function that catches any thrown error and returns `{ ok: false, message: "Couldn't reach the server. Check your connection and try again." }`, so the form keeps its input.
  2. Add `app/error.tsx` and `app/global-error.tsx`, with a friendly "Something went wrong — Try again" and a reset button.
  3. In the middleware, answer Server Action POSTs without a session with a status the client can read, and have the form show "Your session has ended — sign in again" (this also covers DEF-07).
- **Regression test:** `tests/qa-loaders/loaders.spec.ts` TC-009, TC-017, TC-031, TC-049, TC-074 must turn green.

### DEF-03 — Medium — No time limit: a request that never answers spins forever
- **Tests:** TC-018, 030, 070.
- **Reproduce:** hold the comment action → wait 35 s.
- **Expected:** after a set limit (e.g. 30 s) the form says it's taking too long, re-enables, and warns that the action may already have gone through.
- **Actual:** "Working…" forever; no cancel or retry.
- **Fix:** add a timeout to the same `useActionForm` wrapper (e.g. 30 s) using a race. The message should say "It may still have gone through — check before trying again"; request submission already has a one-time key (D-QA-01), so a retry is safe there.
- **Regression test:** TC-018.

### DEF-06 — Medium — Busy primary button text is unreadable (1.42 : 1)
- **Tests:** TC-066.
- **Actual:** while busy, `.btn-primary:disabled` shows white text on #C9DAEE ("Working…", "Checking…", "Deleting…"). The import status bar is fine (9.64 : 1).
- **Fix:** in `styles/globals.css`, give disabled primary buttons `bg-primary-600 opacity-70` (or `text-primary-700` on `primary-100`), so the label stays at ≥ 4.5 : 1.
- **Regression test:** TC-066.

### DEF-01 — Medium — No loading feedback for most page changes and period/page links
- **Tests:** TC-003, 039, 041.
- **Reproduce:** 3 s latency → Admin → Users & roles (or a dashboard period link, or Older → on Super Admin → Requests).
- **Actual:** the old page stays for the full wait with no sign the click registered. Only routes with `loading.tsx` (Dashboards, Import) show a skeleton.
- **Fix:** add a thin top progress bar that shows during any client navigation, or a `loading.tsx` per space (`app/users`, `app/admin`, `app/superadmin`). For the dashboard period links, show a pending state on the links.
- **Regression test:** TC-003, TC-039, TC-041.

### DEF-04 — Medium — Quick period changes on a slow connection: the screen and the address disagree
- **Tests:** TC-040.
- **Reproduce:** 1.5 s latency on page fetches → click Last financial year, Last 90 days, This month about 100 ms apart.
- **Actual (2 runs):**
  - Run 1: the address shows `from=2026-10-01` (This month), but the page, its filter fields and its CSV link show Last financial year (`from=2025-04-01`).
  - Final run: no navigation was applied; the address and the page stayed on the default period.
  - Either way, the last click isn't what's on screen.
- **Fix:** make the period links show a pending state and ignore further clicks while a navigation is pending, or drive the filters through `useRouter().push` inside `startTransition` and render from the URL only. Re-test with the same latency.
- **Regression test:** TC-039/040, DIAG-040b.

### DEF-05 — Low — Ordinary forms don't announce their busy state to screen readers
- **Tests:** TC-064.
- **Actual:** while busy, there is no `aria-busy` on the form and no live region; only the button text changes. The import screen does it right.
- **Fix:** in `SubmitButton`/`useActionForm`, set `aria-busy` on the form and put the "Working…" text in a `role="status"` region.

### DEF-07 — Low — A session ended mid-request shows "Not found."
- **Tests:** TC-076.
- **Actual:** the comment isn't saved and nothing is stuck (both good), but the message "Not found." doesn't tell the person to sign in again.
- **Fix:** with DEF-02 step 3, have actions return "Your session has ended — sign in again" with a link to /login?next=<page>.

### DEF-08 — Low — Fast actions flash "Working…" and the button changes width
- **Tests:** TC-004.
- **Actual:** "Working…" shows for about 76 ms, and the button shrinks from 115 px to 90 px, a small jolt.
- **Fix:** give action buttons a min-width (or keep the label and add a spinner icon beside it), and optionally show the busy label only after about 150 ms.

### DEF-09 — Low — Observed, cause not established: the first period-link click after a server start is ignored
- **Evidence:**
  - DIAG-040, a single "Last financial year" click with no added latency, run 7 times: the first run after each fresh server start failed to navigate within 10 s (3 of 3 cold starts); every later run worked (4 of 4).
  - Real users would meet this after a deploy or restart.
- **Next step:** reproduce by hand right after a restart; check whether the click lands before hydration finishes.

---

## C. Automated test suite

| File | What |
|---|---|
| `playwright.loaders.config.ts` | Uses the e2e config (production build on port 3100, the throw-away DB), `testDir: tests/qa-loaders`, a 120 s timeout, JSON results in `test-results/loader-audit/`. **Not part of CI**, on purpose: it asserts target behaviour and stays red until the defects are fixed. |
| `tests/qa-loaders/helpers.ts` | Interception of Server Actions (hold / delay / 500 / abort / malformed) and page fetches; DB counts; crash detection; WCAG contrast. |
| `tests/qa-loaders/loaders.spec.ts` | 38 tests covering the executable TCs. Each title names its TC ids. |
| `tests/qa-loaders/diagnose.spec.ts` | DIAG-040 / 040b / 074 follow-ups. |

- **Setup:** `npm run db:up` (Docker MySQL on 3307), then `npx playwright test -c playwright.loaders.config.ts`.
- **Clean-up:** the suite recreates `ars_approvals_test` at the start (global setup); nothing touches the development or live databases.
- **Waiting:** no fixed sleeps are used for correctness waits (state-based waits throughout). Fixed waits appear only where the test *observes* that nothing happens, e.g. a 35 s "never answers" window.

---

## G. Remediation plan (in order)

| # | Fix | Defects | Severity / impact | Effort | Before release? |
|---|---|---|---|---|---|
| 1 | Catch failures in `useActionForm`; add `error.tsx` + `global-error.tsx`; handle a missing session on Server Actions | DEF-02, DEF-07 | High: data loss and a dead page on any network blip | ~½ day | **Yes** |
| 2 | Client time limit with an "it may have gone through" message | DEF-03 | Medium: endless spinner | ~2 h (same wrapper) | **Yes** |
| 3 | Readable busy button (disabled style) | DEF-06 | Medium: accessibility, legibility | 15 min | **Yes** |
| 4 | Navigation feedback: a top progress bar or a `loading.tsx` per space; pending period links | DEF-01, DEF-04 | Medium: perceived hang; wrong period shown | ~½ day | Recommended |
| 5 | `aria-busy` + live region in the forms; button min-width / delayed busy label | DEF-05, DEF-08 | Low | ~1 h | Next release |
| 6 | Investigate the first click after a cold start | DEF-09 | Low | ~1 h | Next release |

**Remaining risks:**
- The Google and WhatsApp-OTP sign-in flows can't run in the test environment.
- Only Chromium was used.
- GoDaddy and Cloudflare behaviour (real latency, proxy timeouts) wasn't tested.
- TC-044 and TC-083 are blocked until a fault-injection hook exists.
- Upload progress is indeterminate by design (Server Actions don't report bytes sent).
