# UI State Audit Report

ARS-CMS (ARS Approval System), v1.34.0 (unreleased), 31 Oct 2026. This was a read-only audit of the source: each finding is backed by code that was opened, not by documentation. The implementation that followed is described in [UI_STATE_IMPLEMENTATION_REPORT.md](UI_STATE_IMPLEMENTATION_REPORT.md).

Classification used throughout: **IMPLEMENTED** (works and was checked), **PARTIAL** (exists, with gaps), **MISSING**, **N/A** (does not apply).

## 1. Architecture summary

| Layer | What it is |
|---|---|
| Frontend | Next.js 15 App Router, React 19 (server components plus client islands), TypeScript, Tailwind with the ARS tokens, light and dark themes on CSS variables |
| Backend | Next.js server actions and route handlers (`app/api/**`), MySQL 8 (`mysql2`), zod |
| Authentication | Google (Firebase) or User ID + password + WhatsApp code. HMAC session cookie, idle timeout, keep-alive. `requireArea` / `requireApiArea` run on the server for every page and API route. Super Admin page access can hide a page or make it view-only. |
| Client data | Mostly server-rendered. Client code calls server actions (`useActionForm`, `guardAction`, `useWorkCall`) and a few JSON routes (quick search, notifications, auth). There is no global client state store. |
| Tests | Vitest unit (744), Vitest integration on MySQL (303), Playwright e2e against a production build (180) |

Areas and pages: 128 `page.tsx` files.

| Area | Pages | Covers |
|---|---|---|
| Public / root | 9 | sign-in, password reset, policies, not-me, try |
| `/users` | 54 | approvals, tasks and projects, information, calendar, search, analytics, profile, AI |
| `/admin` | 44 | workflows, users, organisation, reports, records, dashboards, imports, rules |
| `/superadmin` | 21 | settings, integrations, audit, logins, deliveries, templates, retention |

## 2. Existing UI-state components

| Component | Where | States |
|---|---|---|
| `EmptyState` | `features/ui/Display.tsx` (re-exported by `features/shell/PageHeader.tsx`) | Empty |
| `ErrorState` (inline / card / page) | `features/ui/States.tsx` | Error, with retry, home link and "Copy details for IT" carrying the error reference |
| `SectionBoundary` | `features/ui/SectionBoundary.tsx` | Error for one section of a page (used only on the request page) |
| `app/{users,admin,superadmin}/error.tsx`, `app/error.tsx`, `app/global-error.tsx` | app | Page error |
| `PageSkeleton` and family; `SkeletonBlock`, `Spinner` | `features/ui/Skeleton.tsx`, `Spinner.tsx` | Loading (list, dashboard, table, detail, form skeletons) |
| `BrandLoader` | `features/ui/BrandLoader.tsx` | Full-screen processing (sign-in, Classic view) |
| `PendingLink`, `PendingMark` | `features/ui/PendingLink.tsx`, `SideNav.tsx` | Slow navigation feedback |
| `useActionForm` / `guardAction` / `SubmitButton` / `ResultMessage` / `FieldError` / `ConfirmDialog` | `features/ui/form.tsx`, `Dialog.tsx` | Loading (button), duplicate-submit guard, 30 s timeout ("taking longer than expected"), offline, server unreachable, session ended, app updated, server error reference, validation (field errors), success message, confirmation |
| `ToastProvider` | `features/ui/Toast.tsx` | Success / info / warning / error toasts with Undo |
| `SessionWatch`, `OfflineBanner`, `UpdateNotice` | `features/shell/SessionWatch.tsx` | Session expiry (idle warning, keep-alive, redirect to `/signed-out?reason=`), offline, new build |
| `ViewOnlyNote` | `features/shell/ViewOnlyNote.tsx` | Read-only |
| `app/not-found.tsx` and the three area `not-found.tsx` | app | Not found / no access (404 by design) |
| `useDraftAutosave` | `features/requests/useDraftAutosave.tsx` | Draft conflict (version check) |
| `rowVersion` on tasks and information | `server/modules/tasks.ts`, `information.ts` | Conflict when two people edit the same record |
| `submissionKey` | request and task creation | Server-side duplicate-submit protection |

## 3. Status of the 10 primary states (application-wide)

| # | State | Status | Evidence and gaps |
|---|---|---|---|
| 01 | Empty | **PARTIAL** | `EmptyState` exists and many lists use it. About 20 lists use ad-hoc `<p>` text instead; charts use `empty` props. Some failed queries turn into an empty list (§6). |
| 02 | Loading | **PARTIAL** | Skeletons exist but only 22 of 128 pages have a `loading.tsx`. Heavy pages with none: `/users` (home), the queue, request lists, search, tasks, information, the whole `/users/work/*` area, analytics, records, AI analytics, Google Calendar settings. Forms on `useActionForm` have button-level loading. The task-area calls (`useWorkCall`) do not disable their buttons. |
| 03 | Error | **PARTIAL** | Area error boundaries and `ErrorState` are good. `app/error.tsx` duplicates the markup instead of using `ErrorState`. `useWorkCall` and the import panel have no timeout or session handling. Several queries fail silently (§6). |
| 04 | Offline | **PARTIAL** | `OfflineBanner` reacts to the browser's online/offline events, and forms keep their input and say "You're offline". Missing: a "connection restored" message, and a check that the server itself is reachable (the browser's online flag is not enough). |
| 05 | Slow network | **PARTIAL** | Forms stop waiting after 30 s. Links show a spinner. There is no "still working" signal before the timeout and nothing for task-area calls. No fake progress anywhere (good). |
| 06 | No search results | **PARTIAL** | The request lists and queue are good ("Nothing matches these filters" plus Show everything). Information and task lists use one message for both cases. Admin users, audit, logins, Super Admin requests, Search, projects, task search, analytics list and Help show only a status line, or the same text as the empty state, with no Clear action. |
| 07 | Permission denied (device/browser) | **PARTIAL** | No camera, microphone, location, notification or push APIs are used, so those are N/A. The clipboard is used in six places with three behaviours: two fail silently, three do nothing when the clipboard API is missing, and one has a fallback. File inputs are checked on the server only. |
| 08 | Session expired | **IMPLEMENTED** (forms) / **PARTIAL** (other calls) | `SessionWatch` and `guardAction` detect it and redirect with a reason; there is no redirect loop (`/signed-out` is public). Tokens live in httpOnly cookies, never browser storage. `useWorkCall`, Pico Bot, the import panel and quick search show a generic error instead. |
| 09 | Form validation | **IMPLEMENTED** | zod on the server for every action; `FieldError` shows field-level messages; required fields are marked. Auth panels show one message, not per-field. |
| 10 | Success | **IMPLEMENTED** | `ResultMessage` / toasts appear only after the action returns `ok`. Requests and tasks show their number. Undo toasts exist. |

## 4. Additional enterprise states

| State | Status | Evidence |
|---|---|---|
| Partial success | **PARTIAL** | Bulk approve and bulk task changes report counts. There is no shared component for this. |
| Access denied (role) | **IMPLEMENTED** | Server-side 404 for hidden pages and areas (deliberate: it does not reveal the page exists). However, a view-only refusal of an action says "Not found.", which is misleading. |
| Maintenance | **MISSING** | Only the Google Calendar integration has a maintenance switch. No app-wide notice. |
| Rate limited (429) | **PARTIAL** | The server limits search, exports, PDFs and files. Sign-in and Pico Bot show the message. Quick search and the bell show a generic error. |
| Conflict | **PARTIAL** | Drafts, tasks, information and calendar sync have it; admin configuration edits do not. A stale page after a deploy is detected (`UpdateNotice`). |
| Unsaved changes | **PARTIAL** | Only the workflow builder warns before leaving. Long admin forms, the notification centre and permission panels do not. |
| Processing | **IMPLEMENTED** | Button spinners, `BrandLoader`, the import preview, background exports. |
| Not found | **IMPLEMENTED** | `notFound()` on every detail page; three area not-found pages (duplicates). |
| Read-only | **IMPLEMENTED** | `ViewOnlyNote`, plus server-side refusal (wording issue above). |
| Pending (awaiting approval) | **IMPLEMENTED** | Request statuses and the waiting-with column; task statuses. |

## 5. Page matrix

Key: ✔ = implemented, ◐ = partial, ✖ = missing, – = not applicable. Offline, session and slow network are app-wide mechanisms. They are marked ◐ where the page's own calls bypass them.

| Module | Page(s) | Empty | Loading | Error | Offline | Slow | No results | Permission | Session | Validation | Success |
|---|---|---|---|---|---|---|---|---|---|---|---|
| Public | /login, /forgot-password, /set-password | – | ✔ (busy) | ✔ | ◐ (`postJson`) | ✖ | – | – | – | ◐ (one message) | ✔ |
| Users | / (home) | ✔ | ✖ | ◐ (recents fail silently) | ✔ | ✔ | – | – | ✔ | – | – |
| Users | /queue | ✔ | ✖ | ✔ | ✔ | ✔ | ✔ | – | ✔ | – | ✔ |
| Users | /requests, /approved, /approved-by-me, /collaborating | ◐ (`<p>`) | ✖ | ✔ | ✔ | ✔ | ✔ | – | ✔ | – | ✔ |
| Users | /requests/[id] | ◐ | – (404 by design) | ✔ (section boundaries) | ✔ | ✔ | – | ✔ | ✔ | ✔ | ✔ |
| Users | /custom, /new/[id] | – | ✔ (list) | ✔ | ✔ | ✔ | – | – | ✔ | ✔ | ✔ |
| Users | /search | ✔ | ✖ | ✔ | ✔ | ✔ | ◐ (no Clear) | – | ✔ | – | – |
| Users | /tasks, /assigned, /team | ✔ | ✖ | ✔ | ✔ | ✔ | ◐ (same message) | – | ✔ | – | – |
| Users | /tasks/[id], /tasks/new | ◐ | – | ✔ | ✔ | ✔ | – | ✔ | ✔ | ✔ | ✔ |
| Users | /information, /sent | ✔ | ✖ | ✔ | ✔ | ✔ | ◐ (same message) | – | ✔ | – | – |
| Users | /information/[id], /new | ◐ | – | ✔ | ✔ | ✔ | – | ✔ | ✔ | ✔ | ✔ |
| Users | /work, /my-tasks, /inbox, /periodic, /deleted | ◐ | ✖ | ◐ (`useWorkCall`) | ◐ | ✖ | ◐ (My Tasks) | – | ◐ | ✔ | ✔ |
| Users | /work/projects, /projects/[id], /settings, /new | ◐ | ✖ | ◐ | ◐ | ✖ | ◐ (no Clear) | ✔ (project roles) | ◐ | ✔ | ✔ |
| Users | /work/search | ✔ | ✖ | ✔ | ✔ | ✔ | ◐ (no Clear) | – | ✔ | – | – |
| Users | /calendar, /calendar/items/[id] | ◐ | ✖ | ✔ | ✔ | ✔ | – | – | ✔ | ✔ | ✔ |
| Users | /notifications, /notifications/settings | ✔ | ✖ | ◐ (settings default silently) | ✔ | ✔ | – | – | ✔ | ✔ | ✔ |
| Users | /profile, /people/[id] | – | ✔ | ◐ (settings default silently) | ✔ | ✔ | – | ◐ (photo: server check only) | ✔ | ✔ | ✔ |
| Users | /delegation, /security, /help | ◐ | ◐ (help ✔) | ✔ | ✔ | ✔ | ◐ (help) | – | ✔ | ✔ | ✔ |
| Users | /analytics (+ list, metrics) | ◐ (props) | ✖ | ◐ (stuck tile hides) | ✔ | ✔ | ◐ (list: no Clear) | ✔ | ✔ | – | – |
| Users | /ai/assistant | – | ✖ | ◐ (no 401 branch) | ◐ | ✔ (5 min) | – | ✔ | ◐ | ✔ | ✔ |
| Admin | home, doa, insights, workload, dashboards, users list, workflows list, import | ◐ | ✔ | ✔ | ✔ | ✔ | ◐ (users: no Clear) | ✔ | ✔ | – | – |
| Admin | analytics, ai-analytics, records/*, reports, attention, budgets, calendar, reminders, task-holidays, groups, organisation | ◐ (`<p>` in many) | ✖ | ✔ | ✔ | ✔ | ◐ (records: toolbar X only) | ✔ | ✔ | ✔ | ✔ |
| Admin | workflows/[id], users/[id], reminders/[id], types/[id] | – | – | ✔ | ✔ | ✔ | – | ✔ | ✔ | ✔ | ✔ |
| Admin | long editors (custom approval, rules, templates, user form, types) | – | – | ✔ | ✔ | ✔ | – | ✔ | ✔ | ✔ | ✔ — but no unsaved-changes guard (only the workflow builder has one) |
| Super Admin | audit, logins, requests, import, templates | ◐ | ✔ | ✔ | ✔ | ✔ | ◐ (same message, no Clear) | ✔ | ✔ | – | – |
| Super Admin | home, settings, automation, deliveries, integrations, gcal, salesforce, pages, retention, demo, ai/* | ◐ | ✖ | ◐ (salesforce load error shows "not configured") | ✔ | ✔ | – | ✔ | ✔ | ✔ | ✔ |

## 6. Problems found

1. **Failures shown as empty or default:**
   - `users/(home)` recents (`.catch(() => [])`);
   - Salesforce settings (a load error looks like "not configured");
   - profile and notification settings (a read error shows defaults, and saving would overwrite the real value);
   - the Analytics "stuck" tile disappears.
   - Badge counts in the shell fall back to 0. This is deliberate, because the shell must always draw, and it is kept.
2. **Task-area actions:** `useWorkCall` has no timeout, offline, session-ended or slow-network handling. Five raw forms built on it never disable their button while busy: My Tasks add/rename section, calendar quick-add, project Add section, edit comment.
3. **Loading:** 106 of 128 pages have no skeleton, including the busiest ones.
4. **No results:** four different patterns, and most have no Clear action.
5. **Offline:** no "connection restored" message; no check that the server is reachable.
6. **Slow network:** nothing between "pending" and the 30 s timeout.
7. **Unsaved changes:** only the workflow builder guards against leaving.
8. **429:** quick search and the bell show a generic error.
9. **Read-only:** a view-only refusal says "Not found."
10. **Clipboard:** six copy implementations with three different failure behaviours.
11. **Maintenance:** no way to tell everyone the app is going down for maintenance.
12. **Root error page:** hand-written instead of `ErrorState`.

## 7. Duplicates

- **Empty states:** `EmptyState` versus about 20 ad-hoc `<p>` empties, plus the `TaskLines`, `DashboardTable` and insights `Table` empties.
- **No results:** four patterns (see §6.4).
- **Skeletons:** `PageSkeleton` versus a hand-built dashboards skeleton and `ImportScreenLoading`.
- **Error pages:** the three area `error.tsx` and three area `not-found.tsx` files are identical copies, and `app/error.tsx` uses its own markup.
- **Server-action callers:** six (`useActionForm`, `useWorkCall`, direct `guardAction`, ImportPanel, ThemeControls, auth `postJson`).
- **Session-ended detection:** three (SessionWatch, guardAction, NotificationBell).
- **Clipboard copy:** six.

## 8. Recommended changes (the implementation plan)

1. One guarded call for every server-action caller (`guardCall` in `features/ui/form.tsx`), used by `guardAction` and `useWorkCall`. That gives timeout, offline, session-ended, app-updated and slow-network handling everywhere. The raw task-area forms disable while busy.
2. A **slow-network notice:** after 8 s of any guarded call, "Still working — the connection is slow". Never a fake percentage.
3. **Offline:** after reconnecting, check `/api/auth/status`. Say "Back online" when the server answers, or "Connected, but ARS can't be reached" when it doesn't.
4. A **`NoResults`** component: shows the search words, with Clear search / Reset filters. Used on every searchable or filterable list, keeping "empty" and "no matches" apart.
5. **Loading feedback for every page change.** Note added during implementation: `tests/ui/loading-guard.test.ts` records KNOWN_ISSUES V6-D06. On Next 15.5 a `loading.tsx` turns a later `notFound()` into a 200 and sometimes makes a page miss its refresh after a save. So skeletons go only on read-only pages, and an app-wide **navigation progress bar** covers every other page.
6. **Silent failures:** show an inline `ErrorState` (recents, the stuck tile, Salesforce). Settings pages fail visibly instead of showing defaults that could be saved over the real values.
7. **Unsaved changes:** `useActionForm({ guardUnsaved: true })` warns before leaving a long form that has edits; used on the long editors.
8. **429:** quick search and the bell say "Too many searches, wait a moment".
9. **Read-only:** a refused action says "This page is view-only for you".
10. **One `copyText`** helper with a fallback and a visible message when the browser blocks copying.
11. **Maintenance notice:** a Super Admin setting that shows a banner to everyone (planned downtime). The app keeps working until IT takes it down.
12. `app/error.tsx` uses `ErrorState`.
13. **Tests** for each state under its real trigger: offline (Playwright `setOffline`), slow (delayed route), 429, no results with Clear, unsaved changes, view-only wording, plus unit tests for `guardCall`.
