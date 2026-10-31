# 02 — UI/UX and frontend audit

**Method.** The tests ran in the in-app browser (Chromium) against the v1.39.0 production build on `http://localhost:3100`, signed in as the seeded test users: Ravi Requester (USER), Manoj Manager (USER, approver), Elena Admin (IT_ADMIN) and Sam Super (SUPER_ADMIN). Screenshots are in `TEST_EVIDENCE/BROWSER/` (B00–B17). Page sweeps were made with in-page `fetch` and curl (`TEST_EVIDENCE/BROWSER/admin-superadmin-sweep.txt`). The existing automated UI checks are re-run in `20_AUTOMATED_TEST_REPORT.md`. These include axe light/dark (v160-ui RA-03), the site audit (zz-site-audit: every page, link and download for each role on desktop and a touch phone), the UI-state specs (v136) and the UX-law specs (v137).

## 6.1 Layout and design

| ID | Check | Method | Status | Evidence |
|---|---|---|---|---|
| UI-L1 | Same shell on every user page (header with search, bell and account; sidebar; content) | Browser, 30 user pages | PASS | B01, B06, B07, B11; sweep list below |
| UI-L2 | Admin and Super Admin shells consistent | Browser + curl, 55 pages | PASS | B14–B16; `admin-superadmin-sweep.txt` |
| UI-L3 | Navigation hierarchy: Home, Inbox, My Approvals, Tasks & projects, Information, Calendar, Analytics | Browser | PASS | B01; e2e v190 (re-run) |
| UI-L4 | Tokens and colours consistent (light and dark from the same tokens) | Browser | PASS | B07 (dark), B11 (light) |
| UI-L5 | Page names consistent with the navigation | Browser + code | **FAIL** (Low) | UI-D01, UI-D02, UI-D03 |
| UI-L6 | Buttons, inputs and tables follow one style (btn-*, field-input, data-table, tb-*) | Browser, code review | PASS | B08, B11, B14 |

## 6.2 Interactive components (sample executed by hand; the rest are covered by e2e)

| ID | Control | Status | Evidence |
|---|---|---|---|
| UI-C1 | Create menu → Task opens the Draft task panel; the For Others search picks a person with the keyboard (Enter) | PASS | B12 |
| UI-C2 | Draft task → Create task saves and opens the task pane | PASS | B13; DB row `tasks.id=20` |
| UI-C3 | Decision buttons (Approve) on a request | PASS | B10; DB `approval_tasks` APPROVED |
| UI-C4 | Theme radio (Profile → Light) applies, and persists on the next page | PASS | `data-theme=light`, body `rgb(248,250,252)`; B11 |
| UI-C5 | Settings search filters the categories | PASS | B16 |
| UI-C6 | Workflow Designer map, problem badge, Test mode inputs | PASS | B14, B15 |
| UI-C7 | Every other control (filters, sort, group, pagination, uploads, tabs, modals, drawers) | Covered by e2e (201 tests, re-run in 20) | — |

## 6.3 Forms

| ID | Check | Status | Evidence |
|---|---|---|---|
| UI-F1 | Empty submission of New request shows field messages ("Give the request a title of 3 to 200 characters.", "Details is required.", "Check the highlighted fields.") | PASS | Page text after submit (session log) |
| UI-F2 | Valid submission creates the request (CUS-2026-000003) | PASS | B09; DB `approval_requests.id=18` IN_PROGRESS |
| UI-F3 | Special characters and markup (`<script>alert(1)</script>`, ₹, &, quotes) stored and shown as text | PASS | B09 shows it literally; no script ran |
| UI-F4 | Default approver (the reporting manager) preselected | PASS | Page text: "Manoj Manager (E2E_MGR) … 1 chosen" |
| UI-F5 | Draft autosave text ("Your typing is saved as a draft as you go.") | PASS (shown); the behaviour is covered by e2e v150 | Page text |
| UI-F6 | Unsaved-changes guard, double submission, min/max lengths and the other validations | Covered by e2e (v136, v137, v160 and others) | Re-run in 20 |

## 6.4 Tables

| ID | Check | Status | Evidence |
|---|---|---|---|
| UI-T1 | Waiting for me: list and table with count ("8 waiting"), bulk "Approve several at once", Filter/Sort/Options | PASS (displayed) | Page text, B11 |
| UI-T2 | Sorting, filtering, grouping, saved views, export, empty results | Covered by e2e (v133, v135, v136) | Re-run in 20 |

## 6.5 Page states

| ID | State | Status | Evidence |
|---|---|---|---|
| UI-S1 | Unknown route `/users/this-does-not-exist` → 404 page "This page isn't available" | PASS | Sweep result (status 404, h1) |
| UI-S2 | Missing record `/users/requests/999999`, `/users/tasks/999999` → 404 | PASS | Sweep result |
| UI-S3 | No permission: a requester on `/admin` or `/superadmin`, an admin on `/superadmin` → 404 (not "forbidden", D-016) | PASS | Sweep |
| UI-S4 | Expired or invalid session → `/signed-out?reason=unknown&next=…`; no session → `/login?next=…` | PASS | curl (see 04) |
| UI-S5 | Empty state: "Nothing waiting for you" on Home | PASS | B01 |
| UI-S6 | Offline, slow network, error boundary, view-only | Covered by e2e v136 | Re-run in 20 |

## 6.6 Themes

| ID | Check | Status | Evidence |
|---|---|---|---|
| UI-TH1 | Dark (the seeded user's choice) | PASS | B01–B10 |
| UI-TH2 | Light, chosen in Profile, persists across pages | PASS | B11 |
| UI-TH3 | axe in light and dark on the main pages | Covered by e2e v160-ui RA-03 | Re-run in 20 |

## 6.7 Responsive

Horizontal overflow was measured as `document.documentElement.scrollWidth` against `innerWidth` after each page loaded. A width a few pixels lower than the viewport is the scrollbar.

| Size | Pages measured | Sideways scroll | Status | Evidence |
|---|---|---|---|---|
| 1920×1080 | Home | none (1910/1920) | PASS | B07 |
| 1440×900 | Home | none | PASS | B01 |
| 1366×768 | Inbox | none (1357/1367) | PASS | B06 |
| 1280×720 | Home, My Tasks | none (1270/1280) | PASS | session log |
| 1024×768 | My requests, My Tasks | none (1014/1024) | PASS | session log |
| 768×1024 | Home, My requests, My Tasks, Inbox, New request | none (758/768) | PASS | B05 |
| 390×844 | the same five pages | none (391/391) | PASS | B02–B04 |
| 360×800 | the same five pages | none (361/361) | PASS | session log |

The phone bottom bar (Home, Waiting, New, Search, Profile) appears below 768 px (B02). The rest of the pages are covered on a touch phone by the e2e site audit (zz-site-audit).

## Defects

| Defect ID | Module | Feature | Category | Description | Expected | Actual | Severity | Priority | Reproduction | Evidence | Root cause | Recommendation | Status |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| UI-D01 | Shell / naming | "Overview" renamed "Home" (D-236) | UI text | Several places still say "Overview" | "Home" everywhere | Breadcrumbs on the request, amend and template pages and the analytics drill-down; the error state's "Go to Overview" link (`features/ui/States.tsx:57`); Help text ("Open it from Overview") | Low | P3 | Open any request: the breadcrumb starts with "Overview" | B10; `app/users/requests/[id]/page.tsx:106`, `app/users/new/[workflowId]/page.tsx:74`, `app/users/requests/[id]/amend/page.tsx:57`, `features/analytics/AnalyticsListScreen.tsx:55`, `app/users/help/page.tsx:16,21` | Rename in v1.37.0 missed these strings | Replace with "Home" | Open |
| UI-D02 | Profile | Notifications page (D-237) | UI text | Browser title is still "Notification settings"; the heading is "Notifications" | Same name | Title "Notification settings · ARS-CMS", h1 "Notifications" | Low | P3 | Open Profile → Notifications | Sweep result; `app/users/notifications/settings/page.tsx:12` | Rename missed the metadata | Set the title to "Notifications" | Open |
| UI-D03 | Super Admin | Settings page | UI text | Browser title "Settings & providers", heading "Providers & security" (sidebar: "Providers & security") | Same name | Differ | Low | P3 | Open `/superadmin/settings` | B16; sweep | Old naming | Use one name | Open |
| UI-D04 | Tasks | Draft task for someone else | UX | After creating a task for another person, the app opens the *creator's* My Tasks with the task in the pane. The task isn't in that list, so closing the pane leaves the creator without it. | Open somewhere the task stays visible (for example "Assigned by me", or the task page) | `/users/work/my-tasks?task=20` for Manoj, task assigned to Ravi | Low | P3 | As Manoj: Create → Task → Others → Ravi → Create task | B13 | `TaskCreator.submit` always pushes to My Tasks when there is no project | Go to `/users/tasks/assigned?task=…` (or the task page) when the assignee isn't the creator | Open |
