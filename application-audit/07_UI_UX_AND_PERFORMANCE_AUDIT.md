# 07 — UI/UX, accessibility, performance and maintainability audit

ARS Approval Platform v1.8.0, audited 16 Oct 2026 (read-only; no build was run for this report).

## Summary

- **The UI foundation is strong.**
  - Every page is a Server Component, and charts are server-side SVG with no chart library.
  - There is a shared token set and native `<dialog>` modals.
  - Forms use one `useActionForm` that locks double submits and confirms destructive actions.
- **Runtime evidence (16 Oct 2026):**
  - The axe accessibility checks run inside the E2E suite (27 URLs, light and dark): passed.
  - QA-A11Y-01/02 (every control named, one h1, visible focus) passed.
  - QA-UI-01 (no sideways scrolling at phone width) passed.
  - QA-PERF-01 (key pages under 1.5 s median, locally) passed.
  - QA-PERF-02 (20 concurrent users, p95 under 3 s, locally) passed.
- **There are no P0 or P1 UI issues.** The P2 items are:
  - mobile navigation, AUD-26 (N1, N2, N6);
  - `window.confirm` in the custom approval form (F1);
  - sequential queries on the request page and the new-request page, AUD-27 (P2).
- **Known-issues drift:** V6-D02 and V6-D03 are fixed in code, and V6-D01 and V6-D04 are partly fixed. `docs/KNOWN_ISSUES.md` still lists all four as open.
- **Measured performance:** the only measured figures are those in `docs/PERFORMANCE_ANALYTICS.md` (10 Oct 2026, laptop, 6,300 requests): whole-dashboard p95 151.9 ms. This audit invented no numbers. Section "Measurements to take" lists what to measure next.

The detailed UI audit follows, then the performance observations from the analytics/ops and database audits, then the list-pagination review from the admin audit.

---

Scope: `app/**`, `features/**`, `styles/`, `tailwind.config.ts`, `next.config.ts`, `public/`, plus `tests/ui`, `tests/e2e` (for axe) and `.next` manifests (existing build output only, built 15 Oct; no build was run). No file was changed. Severity: P0 critical · P1 major · P2 significant · P3 minor. "Confirmed" = seen in code; "Potential" = likely, needs measurement or a runtime check.

### Overall picture

The UI foundation is better than average. Every page is a Server Component (only 6 `"use client"` files in `app/`: 4 `error.tsx`, `global-error.tsx`, `providers.tsx`). Charts are hand-written server-rendered SVG with no chart library. There's a shared token set, native `<dialog>` modals, a well-built `useActionForm` with double-submit locking, a timeout and session-expiry handling, an `ErrorSummary` that takes focus, and a `DataTable` that uses proper table semantics. axe runs in E2E across 27 URLs in both themes. Most findings below are consistency gaps and a few accessibility gaps in hand-rolled widgets, not structural problems.

Inventory: 74 `page.tsx` · 16 `loading.tsx` · 4 `error.tsx` (root + one per space) + `global-error.tsx` · 4 `not-found.tsx` (root + one per space) · 0 `<Suspense>` in app/features · 82 `"use client"` files (76 of 99 `.tsx` in `features/`).

---

### 1. Navigation

| # | Sev | Status | Finding | Evidence | Recommendation |
|---|---|---|---|---|---|
| N1 | P2 | Confirmed | On phones, the bottom nav for the user space appears in the Admin and Super Admin spaces as well. Its links (Overview, Waiting, New, Search, Profile) all go to `/users/*`, so an admin on a phone who taps "Overview" is sent out of the Admin space. | `features/shell/AppShell.tsx:139` renders `<BottomNav>` unconditionally; `BottomNav.tsx:9-15` hard-codes `/users` hrefs | Render `BottomNav` only when `area === "users"`, or pass items for each space. The admin spaces already have the drawer (`MobileNav`). |
| N2 | P2 | Confirmed | The mobile drawer is a hand-made `role="dialog" aria-modal` div. Focus doesn't move into it, focus isn't trapped (Tab reaches the page behind), and focus doesn't return to the menu button when it closes. Everywhere else the app uses native `<dialog>.showModal()`. | `features/shell/MobileNav.tsx:27-41` (also `z-50`, `bg-black/30`, `shadow-xl` instead of `z-drawer`/`bg-overlay`/`shadow-overlay` tokens) | Reuse `features/ui/Dialog` with `variant="drawer"` (it already supports a drawer). |
| N3 | P3 | Confirmed | The command palette always lists "Analytics" for the user space, even when the `analytics` feature is OFF. The sidebar hides it, but the palette leads to a 404. | `AppShell.tsx:70` (static `userPages`) vs `app/users/layout.tsx:23` (`features.analytics` gate) | Pass the feature flags into `AppShell` and filter `userPages` the same way. |
| N4 | P3 | Confirmed | Breadcrumbs are inconsistent. The root crumb is "Admin" (`admin/users/[id]:32`, `admin/workflows/[id]:39`), "Overview" (`admin/reports/[key]:54`) or missing (`admin/workflows/import:13`, `[id]/compare:52`). The compare page also adds a separate "← Back" link (`compare/page.tsx:55`). Only 9 detail pages have breadcrumbs; `/users/requests/[id]` (the most-used detail page) has none. | grep `Breadcrumbs` | Pick one root label for each space (e.g. the space name) and add crumbs to request detail and amend pages. |
| N5 | P3 | Confirmed | The sidebar's active-state rule never highlights a top-level entry on its sub-pages (`item.href.split("/").length > 2`). That's intended for "Overview". But the Admin nav has no entry for some sub-pages (e.g. `/admin/workload/reassign` highlights "Workload" correctly, while `/admin/users/new` highlights "Users & roles" only through `startsWith`). This is acceptable; just verify `/admin/analytics/list` and `/metrics` highlight "Analytics". | `features/shell/SideNav.tsx:19-22` | Add a unit test of `active` against the full route list. |
| N6 | P3 | Confirmed | The account menu (`role="menu"`) has no arrow-key navigation, doesn't move focus into the menu, doesn't return focus to the button on Escape, and leaves every item in the Tab order. It duplicates `features/ui/Menu.tsx`, which does all of this correctly. | `features/shell/ProfileMenu.tsx:38-51, 83-123` vs `features/ui/Menu.tsx:22-52` | Build ProfileMenu on `Menu`, or copy its key handler and roving focus. Also replace `z-40`/`shadow-lg` with tokens. |
| N7 | info | Confirmed | Good: skip link, `<main id="main" tabIndex=-1>`, `aria-current` on nav links, a pending spinner on nav links (`useLinkStatus`), waiting counts with sr-only text, an in-space 404 that keeps the shell, and pages hidden by Page Access left out of the sidebar, palette and bottom nav. | `AppShell.tsx:88,136`; `SideNav.tsx:40-44` | — |

### 2. Forms

| # | Sev | Status | Finding | Evidence | Recommendation |
|---|---|---|---|---|---|
| F1 | P2 | Confirmed | `CustomApprovalForm` uses `window.confirm` and `window.alert` for "Discard draft". `form.tsx` itself warns against this because embedded and managed browsers block pop-ups silently, which makes the button look dead. | `features/requests/CustomApprovalForm.tsx:130-133`; rule stated at `features/ui/form.tsx:72-74` | Use `ConfirmDialog` and a toast. |
| F2 | P3 | Confirmed | A saved view is deleted with one click on a 1-character "×" target. There's no confirmation and no undo, and a failure isn't shown (`result` is never rendered). | `features/analytics/ReportForms.tsx:40-50` | Add an undo toast (the pattern exists in `NotificationList.tsx:38-60`) or `confirm`, render the error, and enlarge the hit area to at least 24×24 px (WCAG 2.5.8). |
| F3 | P3 | Potential | After the 30 s timeout `useActionForm` unlocks the form while the original Server Action may still be running, so a second click can submit twice. The message warns the user, but nothing enforces it server-side unless the action is idempotent. | `features/ui/form.tsx:44-58, 93-110` | Confirm that create-type actions use idempotency keys (request submit already uses `submission_key`, `approvals.repository.ts:348`). Audit the other create actions (comments, delegations, templates). |
| F4 | P3 | Confirmed | `FieldError` uses `id={`${name}-error`}`, and `ErrorSummary` uses a fixed `id="error-summary-title"`. Two forms on one page (e.g. Group editors, Organisation rows) produce duplicate IDs. `FieldError` also isn't linked to its input through `aria-describedby`, unlike `Field`. | `features/ui/form.tsx:200-207`; `features/ui/Field.tsx:120,124` | Use `useId()` and let callers link the input. Prefer `Field` for new forms. |
| F5 | P3 | Confirmed | Destructive confirmation uses two patterns: `ConfirmDialog` (21 `useActionForm` calls with `confirm`) and the inline "second red button" in `DeleteRequestButton`, which works and requires a reason. Both are acceptable, but the inline form doesn't move focus to the reason field when it opens. | `features/superadmin/DeleteRequestButton.tsx:23-48` | Add `autoFocus` to the textarea. No redesign needed. |
| F6 | P3 | Confirmed | `useActionForm` calls `router.refresh()` after every successful action, on top of the action's own `revalidatePath`. That's a second full RSC render of the page (and its layout's 4–9 DB queries, see P3). This is deliberate (V6-D06 workaround). | `features/ui/form.tsx:104-108` | Keep it, but measure. If server time per action matters, make it opt-in only on pages that stream behind a skeleton. |
| F7 | info | Confirmed | Good: one-at-a-time submit lock (`busy` ref), `SubmitButton` keeps its width with a polite live region, the confirm dialog names the action, fields keep their values on error, an offline/session-ended/timeout message replaces the crash, and `ErrorSummary` takes focus once per new error set. | `features/ui/form.tsx` | — |

### 3. Lists and tables

| # | Sev | Status | Finding | Evidence | Recommendation |
|---|---|---|---|---|---|
| L1 | info | Confirmed | Request lists are paginated and filtered on the server (`LIMIT ? OFFSET ?`): queue (25), My requests / Collaborating / Approved / Approved-by-me (`RequestListScreen`), search, Super Admin requests, admin users (50), and keyset paging for audit, logins and notifications (`beforeId`). Filters live in the URL (GET forms). | `app/users/queue/page.tsx:20-24`; `admin-users.repository.ts:79` | — |
| L2 | P3 | Confirmed | `features/ui/DataTable` is used by **one** page (admin users). It sorts only the current page on the client while paging is on the server, so "sort by name" sorts 50 rows, not the dataset. | `app/admin/users/(list)/page.tsx`; `DataTable.tsx:25-36` | Add a caption hint ("sorts this page") or move the sort to the URL/server for that page. |
| L3 | P3 | Confirmed | `Pagination` in `features/ui/Display.tsx:131` is never used. Six pages hand-roll their own paging, with mixed labels ("← Previous/Next →" vs "← Newer/Older →"). | grep `<Pagination` = 0; `admin/users/(list):102-110`, `search:169-174`, `superadmin/requests:133-138`, `RequestListScreen:415-423` | Adopt the shared component, with label props. |
| L4 | P3 | Potential | Several admin lists load whole tables with no paging: groups and their members (`groups.repository.ts:16-21`), workflows, budgets, departments and designations, deliveries (200), templates. Fine at today's size (one company), but they grow without a bound. | listed pages | Leave as is. Add a cap or a warning test once any of them passes about 500 rows. |
| L5 | P3 | Confirmed | Workload loads up to 20,000 pending-task rows and summarises them in JS. | `workload.repository.ts:8-17`; `app/admin/workload/page.tsx:11` | Move the per-approver aggregation into SQL (`GROUP BY approver_id`); keep the median in JS if needed. |
| L6 | P3 | Confirmed | `DataTable`'s "Columns" popover doesn't close on Escape or on an outside click, and focus isn't managed. | `DataTable.tsx:90-117` | Reuse the `Menu` behaviour. |
| L7 | info | Confirmed | Empty states exist on almost every list (`EmptyState`, "No requests match.", "Nothing…"). Gaps are in the table below. | | |

### 4. Accessibility

| # | Sev | Status | Finding | Evidence | Recommendation |
|---|---|---|---|---|---|
| A1 | P2 | Confirmed | Mobile drawer focus handling (see N2), and account menu keyboard support (see N6). | | |
| A2 | P3 | Confirmed | `PeoplePicker` combobox is solid: `aria-activedescendant`, arrow keys, Enter, Escape, Backspace removes the last chip, labelled chips. Minor gaps: `aria-controls` points at a listbox that isn't rendered while closed; the "Nobody matches." `<li>` inside `role=listbox` has no role (use a status message outside the listbox); `invalid` doesn't link an error message. | `features/ui/PeoplePicker.tsx:91-147` | Small fixes only. |
| A3 | P3 | Confirmed | `Dialog` with `role="alertdialog"` closes on a backdrop click. Alert dialogs should normally need an explicit choice. | `features/ui/Dialog.tsx:72-75, 135` | Skip the backdrop close when `role === "alertdialog"`. |
| A4 | P3 | Potential | The `ink-faint` token (#64748b, light theme) on `surface-muted` (#f1f5f9) is about 4.3:1, below 4.5:1 for small text. It's used 75 times, often for captions or the space label. On white it passes (4.76:1). axe runs only on the default state of each page, so this combination may not be caught. | `styles/globals.css:23,28`; grep `text-ink-faint` = 75 | Check the contrast where `text-ink-faint` sits on `bg-surface-muted`, or darken the token slightly. |
| A5 | P3 | Potential | Input focus style is `focus:outline-none focus:ring-2 ring-primary-100`. The #c9daee ring on white is about 1.4:1. Focus is still shown by the 1px border changing to `primary-600`, which passes 3:1 but is thin. | `styles/globals.css:173` | Consider `ring-primary-600/40` or a 2px border. |
| A6 | P3 | Confirmed | `Tooltip` shows on hover only (`role="tooltip"` with no `aria-describedby` link), and there's no Escape dismiss (WCAG 1.4.13). | `features/ui/Display.tsx:119-128` | Link it with `aria-describedby`, add `group-focus-within`, and dismiss on Escape. |
| A7 | info | Confirmed | axe (`@axe-core/playwright`) runs over 11 user URLs and 16 admin/super URLs, light and dark, and fails on serious or critical violations. | `tests/e2e/v160-ui.spec.ts:28-70` | Add `/users/new/[workflowId]` (the biggest form), `/admin/workflows/[id]` (the builder), `/login`, `/admin/groups`, and one scan with a dialog or drawer **open** at mobile width. |
| A8 | info | Confirmed | Good: global `:focus-visible` outline, `prefers-reduced-motion` handling, `Switch` with `role=switch`, `RadioGroup` in a fieldset, `DataTable` with caption, `scope` and `aria-sort`, toasts in polite/assertive regions that don't steal focus, `lang="en"`, every `<img>` has `alt`. | `styles/globals.css:154,159`; `Field.tsx`; `Toast.tsx:53-58` | — |

### 5. Design system

| # | Sev | Status | Finding | Evidence | Recommendation |
|---|---|---|---|---|---|
| D1 | P3 | Confirmed | **V6-D04 is partly fixed.** The disabled button now uses `--color-primary-solid-disabled` (`globals.css:19,177`). Hex is left in `AuthLayout.tsx:10` (`to-[#003B6E]`, close to `primary-700` #003f75) and `:16` (`#ED1C25`, which is exactly the `--color-accent-red` token), plus `text-white` and `border-white` on the auth panel. Acceptable exceptions: `global-error.tsx` (CSS may not load), `GoogleButton` brand colours, `manifest.ts` and `layout.tsx` themeColor. | grep hex | Swap the two AuthLayout hex values for `var(--color-…)` and update KNOWN_ISSUES. |
| D2 | P3 | Confirmed | Raw z-index and shadows bypass the tokens: `z-50` (MobileNav), `z-40` (ProfileMenu), `z-20` (PeoplePicker), `shadow-xl` and `shadow-lg`. | grep | Use `z-drawer`/`z-dialog` and `shadow-overlay`. |
| D3 | P3 | Confirmed | Duplicated UI patterns. The tab-style `<nav>` pills are written inline about 13 times (e.g. `users/requests/(list):12-21`, `superadmin/requests:120-133`). Paging is hand-rolled 6 times (L3). Two dropdown-menu implementations exist (N6). `initials()` (`Display.tsx:27`) is duplicated as `initialsOf` (`AppShell.tsx:27`). | grep | Add a small `Tabs`/`SegmentNav` component. Remove the duplicates as files are touched; no page redesign. |
| D4 | P3 | Confirmed | Largest components (lines). See the table below for the judgement on each. | `wc -l` | — |

Largest `.tsx` files:

| Lines | File | Split? |
|---|---|---|
| 906 | features/admin/WorkflowBuilder.tsx | **Yes, when next touched.** It already holds 7 separate components (`StageList` 246, `DoaEditor` 440, `RuleEditor` 610, `ConditionEditor` 661, `StepEditor` 698). Move each to `features/admin/workflow-builder/*`; the context stays in one file. |
| 536 | features/analytics/Charts.tsx | Optional. Five independent chart components (KpiCard, LineChart, BarList, StackedBar, Heatmap) could become one file each. Server-only, so there's no bundle cost. |
| 514 | features/admin/FormFieldsEditor.tsx | Yes, lightly. Move the condition helpers (`operatorsFor`, `needsValue`, `freshCondition`, `ConditionValueInput`, lines 429+) to their own module; they're also used by the builder. |
| 467 | features/analytics/AnalyticsScreen.tsx | No. One server screen; data comes from a single `Promise.all`. |
| 432 | app/users/requests/[id]/page.tsx | **Yes.** The data loading (16 sequential awaits, see P2) should move to a `loadRequestPage()` server helper; the page keeps the JSX. |
| 430 | features/requests/RequestListScreen.tsx | No. One cohesive screen; the filter chips could go to a helper. |
| 396 | features/admin/ImportPanel.tsx | Acceptable (one wizard). |
| 359 | features/admin/WorkflowPanels.tsx | Acceptable. |
| 340 | features/analytics/ReportForms.tsx | Optional. It holds 6+ unrelated forms. |
| 337 | features/requests/ActionPanel.tsx | Acceptable. |
| 275 | features/requests/RequestForm.tsx | OK |
| 257 | app/users/queue/page.tsx | OK |
| 239 | features/shell/CommandPalette.tsx | OK |
| 222 | features/auth/components/SignInPanel.tsx | OK |
| 216 | features/requests/lists.tsx | OK |

### 6. Performance

| # | Sev | Status | Finding | Evidence | Recommendation |
|---|---|---|---|---|---|
| P1 | info | Confirmed | Rendering model is good. All pages are server components. Charts are server SVG (`Charts.tsx` has no `"use client"`). Firebase loads only on demand (`GoogleButton.tsx:14` uses dynamic `import()`). No heavy UI libraries (dependencies: lucide-react, clsx, tailwind-merge, zod). | `package.json` | — |
| P2 | P2 | Confirmed | **Sequential awaits on the busiest detail pages.** `/users/requests/[id]` runs about 16 awaits one after another: `recordView`, `listMentionable`, `loadFieldLookups`, `featureOn`, `listCollaborators`, `amendmentPlan`, and so on. `listActiveUserOptions()` runs up to **3 times** and `listApproverOptions()` twice in one render (lines 53, 59-60, 68, 75-76). The same pattern appears in `/users/new/[workflowId]` (14 awaits, `listActiveUserOptions` twice, lines 28/32), `/admin/workflows/[id]` (9), and `/admin/reports/[key]` (10). | `app/users/requests/[id]/page.tsx:40-76`; `app/users/new/[workflowId]/page.tsx:20-49` | After the access check, group the independent queries in `Promise.all`. Wrap `listActiveUserOptions` and `listApproverOptions` (and `getSettingValue`/`featureOn`) in React `cache()` so each runs once per request. Measure server time before and after with the existing `playwright.perf.config.ts` or `tests/perf`. |
| P3 | P3 | Confirmed | Layout overhead on every navigation, because everything is `force-dynamic` (needed for the CSP nonce, `app/layout.tsx:10`). Each request runs `requireArea`, then `AppShell` does 4 parallel queries; the users layout reads 5 feature settings (`enabledFeatures`); the admin layout runs `featureOn` then `canUseReports` **sequentially** (`admin/layout.tsx:16-17`), and `canUseReports` itself calls `featureOn` again. `getSettingValue` reads the DB fresh on every call, with no per-request cache (`server/settings/values.ts:9-15`). | as cited | Use `cache()` per request for settings and features, and `Promise.all` in the admin layout. Don't add cross-request caching (settings must apply on the next request by design). |
| P4 | P3 | Potential | The complete active-user list is sent to the client as PeoplePicker or `<select>` options on 14 pages (each item is `name (loginId)`). Fine for hundreds of users, but it grows linearly. On `/admin/groups` the same `options` array goes to every `GroupEditor` (RSC usually dedupes identical references; verify in the payload). | grep `listActiveUserOptions\|listApproverOptions` in app = 14 files | Measure the RSC payload size on `/admin/groups` and `/users/requests/[id]`. If it's large, switch PeoplePicker to a search-as-you-type Server Action. |
| P5 | P3 | Potential | Client JS per route, from the existing `.next` build (raw, uncompressed, includes the shared framework and polyfills): smallest route about 343 KB, layouts about 402 KB, heaviest `/admin/workflows/[id]` 523 KB, `/users/custom` 508 KB, `/admin/workflows/new` 504 KB, `/users/requests/[id]` 501 KB. Largest shared chunks: framework 183 KB, 1255-* 174 KB, 4bd1b696-* 173 KB, main 123 KB, polyfills 113 KB. The build may be stale (built 15 Oct). | `.next/app-build-manifest.json` | Run `next build` (it prints First Load JS) or `@next/bundle-analyzer` to see what makes up the ~160 KB on top of the baseline for the builder and custom-approval routes (likely WorkflowBuilder plus FormFieldsEditor plus PeoplePicker). Consider `next/dynamic` for the rarely opened builder panels. |
| P6 | P3 | Confirmed | No `<Suspense>` anywhere. Because route-level `loading.tsx` is banned on pages with Server Actions or `notFound()` (V6-D06), the highest-traffic pages (`/users`, `/users/queue`, `/users/requests`, `/users/requests/[id]`) show nothing until the whole page is ready. | grep `<Suspense` = 0 | Optional and careful: after the access check or `notFound()` has run, wrap slow, read-only sections (e.g. timeline, analytics tiles on home) in in-page `<Suspense>` with the existing `Skeleton` pieces. Re-run the V6-D06 E2E checks before keeping it. |
| P7 | info | Confirmed | `AnalyticsScreen` loads its 17 data sets in a single `Promise.all` (line 60), and list pages use `Promise.all`. | | — |

### 7. Maintainability

| # | Sev | Status | Finding | Evidence | Recommendation |
|---|---|---|---|---|---|
| M1 | P3 | Confirmed | ``people.map(p => ({ id, label: `${p.name} (${p.loginId})` }))`` is copied 24 times across pages. | grep = 24 | Add a `toPersonOptions()` helper next to the repositories. |
| M2 | P3 | Confirmed | Nav entries are defined in three places that must stay in sync: each space layout, `AppShell.userPages` (palette), and `BottomNav.ITEMS`. This is the root cause of N1 and N3. | `app/users/layout.tsx:12-24`; `AppShell.tsx:60-77`; `BottomNav.tsx:9-15` | Keep one nav registry for each space (`features/shell/nav.ts`), including feature gates, and derive the sidebar, palette and bottom nav from it. |
| M3 | P3 | Confirmed | `docs/KNOWN_ISSUES.md` is out of date (header still says "v1.6.0 work"): V6-D01, D02, D03 and D04 are marked Open, but the code has since changed (see section 8). | | Update the statuses. Required by the living-files rule. |
| M4 | info | Confirmed | Testability is good: `loading-guard.test.ts` pins the allowed skeletons, the axe E2E suite exists, and server logic is in `server/` and `lib/` and is unit tested. | | — |

### 8. KNOWN_ISSUES cross-check (UI items)

| ID | Doc status | Status in code today |
|---|---|---|
| V6-D01 blank screen while loading (3/48) | Open → Phase 2 | **Partly fixed:** 16 `loading.tsx` now cover 16 read-only routes out of 74 pages. The rest are excluded on purpose by V6-D06. Nav links show a pending spinner (`SideNav.tsx:40-44`). Main user pages still have no skeleton (P6). |
| V6-D02 a page error replaces the whole space | Open → Phase 2 | **Fixed:** `app/users/error.tsx`, `app/admin/error.tsx` and `app/superadmin/error.tsx` keep the shell, and `SectionBoundary` isolates parts of the request page. |
| V6-D03 mark-all-read reloads the page, no undo | Open → Phase 4 | **Fixed:** `NotificationList.tsx:38-60` uses `router.refresh()` and an Undo toast. |
| V6-D04 hex outside tokens | Open → Phase 1 | **Partly fixed:** the disabled button is tokenised; 2 hex values remain in `AuthLayout.tsx` (D1). |
| V6-D06 loading.tsx vs Server Actions / `notFound()` | Fixed by design | Holds: `tests/ui/loading-guard.test.ts` list = the 16 files on disk. |

### 9. Pages lacking loading / empty / error states

Error coverage: **every route** is covered by a segment `error.tsx` (one per space plus the root and `global-error`), so no page lacks an error state. Empty states: listed only where a list can be empty and no empty message was found.

"Why no loading" codes: **SA** = the page has Server Action forms (V6-D06), **NF** = it calls `notFound()`, **RO** = read-only, so a skeleton could be added.

| Route | Loading | Empty state | Why no loading / note |
|---|---|---|---|
| /users (home) | none | yes | SA (FirstUseChecklist). Highest-traffic page: consider in-page Suspense (P6) |
| /users/queue | none | yes | SA (bulk approve) |
| /users/requests, /collaborating, /approved, /approved-by-me | none | yes | SA (saved views) |
| /users/requests/[id], /[id]/amend | none | n/a | SA + NF |
| /users/new/[workflowId] | none | n/a | SA + NF |
| /users/search | none | yes | SA (saved views) |
| /users/calendar | none | yes | **RO: candidate for `loading.tsx`** (no action, no `notFound`); check it, then add it to the guard list |
| /users/notifications, /notifications/settings | none | yes / n/a | SA |
| /users/delegation, /security, /custom | none | yes / n/a / n/a | SA |
| /users/analytics (+ list, metrics), /users/reports (+[key]) | none | partial | NF inside `AnalyticsScreen` / reports |
| /admin/attention, /budgets, /calendar, /custom-approval | none | yes | SA |
| /admin/groups | none | **no** (an empty group list shows just the "new group" form) | SA. Add a one-line "No groups yet" |
| /admin/organisation | none | **no** (departments and designations lists have no empty text) | SA. Add an empty line |
| /superadmin/pages | none | **no** | SA |
| /admin/reports, /reports/[key] | none | yes | NF |
| /admin/users/[id], /users/new | none | n/a | NF / SA |
| /admin/workflows/[id] (+compare, migrate), /new, /import | none | n/a | NF / SA |
| /admin/analytics (+ list, metrics) | none | partial | NF |
| /superadmin (home), /automation, /deliveries, /demo, /retention, /settings | none | yes | SA (backup, retry, holds, settings) |
| /superadmin/pages/[key], /templates/[code] | none | n/a | NF |
| (public) login, forgot-password, set-password, security/not-me | none | n/a | Light pages, no data lists; not needed |

### Measurements to take (no figures were invented here)

1. `next build`: record First Load JS per route, and run `@next/bundle-analyzer` on `/admin/workflows/[id]`, `/users/custom` and `/users/requests/[id]`.
2. Server render time and DB query count for `/users/requests/[id]` and `/users/new/[workflowId]`, before and after `Promise.all` + `cache()` (use `playwright.perf.config.ts` / `tests/perf`).
3. RSC payload bytes for `/admin/groups` and `/users/requests/[id]` (Network tab, `?_rsc` responses).
4. Contrast of `text-ink-faint` on `bg-surface-muted`, and axe with the mobile drawer, a dialog and the account menu open at 375 px width.

## Performance observations from the analytics and operations audit

### 5. Performance observations

1. **PERF-01: Date predicates can't use the period indexes.** Every period filter is written `DATE(DATE_ADD(col, INTERVAL 330 MINUTE)) BETWEEN ? AND ?`. The same pattern appears in `analytics.repository.ts:31`, `catalogue.ts:36`, `search.repository.ts:24` and `analytics-more.repository.ts`. Because the function wraps the column, MySQL cannot range-scan it. The indexes added in `202610140900_v170.sql` on `submitted_at`, `closed_at` and `decided_at` (`docs/PERFORMANCE_ANALYTICS.md:52-67`) therefore help these filters little; filtering is a scan of the scoped rows. Fix: compute UTC bounds in JS (`from 00:00 IST` minus 5:30) and write `col >= ? AND col < ?`.
2. **PERF-02: Measured numbers are healthy at today's size.** These figures are from the doc, not my own measurement. `docs/PERFORMANCE_ANALYTICS.md` (10 Oct 2026, 6,300 requests and 18,900 tasks, organisation scope, laptop with MySQL in Docker) reports a whole-dashboard p95 of 151.9 ms. The slowest single query is KPIs with step plus SLA filters, at p95 215.0 ms. Approver workload is at p95 67.8 ms. The doc itself notes GoDaddy's shared MySQL will be slower.
3. **PERF-03: Connection-pool pressure.** The analytics page fires 20 loaders at once (`AnalyticsScreen.tsx:60`), and many of them run 2 to 4 queries. The pool has 10 connections (`lib/db/client.ts:20`). One dashboard load can therefore take the whole pool while the cron run and approvals wait.
4. **PERF-04: Search.** It uses a leading-wildcard `LIKE '%q%'` on three columns, a correlated `COUNT(*)`, OFFSET paging up to page 1,000, and the `due` sort runs two correlated subqueries per row (`search.repository.ts:43-92`).
5. **PERF-05: Full-history scans.** `loadSteps` and `loadApproverLoad` put the period only inside `SUM`/`AVG`, not in the WHERE clause, so they scan every task in scope every time (`analytics.repository.ts:316-369`). `department_scorecard`'s "now" query joins every request to every task in scope (`catalogue.ts:328-333`). The `STUCK` alert metric runs `findStuckRequests()` once per rule (`schedules.ts:347-348`), with the same scan the `stuck` step already does.
6. **PERF-06: Inline provider calls.** `notify` sends email and WhatsApp synchronously, in sequence per recipient. Worst case per recipient is the 15 s email timeout plus the configured WhatsApp timeout (default 10 s). The outbox makes this safe, but the user's request (or the `after()` sender) waits.
7. **PERF-07: Backup blocks the event loop.** `copyNewFiles` uses `readdirSync`, `existsSync` and `copyFileSync` across the whole uploads tree on every daily run (`backup.ts:127-142`). As attachments grow, this blocks Node's event loop, and the app shares a single process on GoDaddy.
8. **In-memory builds.** XLSX and PDF are built fully in memory, as is `turnaround_by_step` with up to 50,000 rows. That is acceptable at 5,000 rows but risky at the 50,000-row background cap (RISK-05).
9. **Per-hit DB rate limiting.** Every analytics load and every export does `INSERT` plus `COUNT` on `rate_limit_hits` (`jobs.repository.ts:8-15`), pruned daily. Cheap at this scale.

---

## List pagination and empty states (admin audit)

### 3.5 Pagination on large lists
| List | State |
|---|---|
| Users (`/admin/users`) | Paged 50, server search; sort is client-side within a page only |
| Audit (`/superadmin/audit`) | Keyset 100, "Older" only; viewer filter = action only |
| Logins | Keyset 100, outcome filter only |
| Requests (Super Admin) | Paged with total |
| Notifications inbox | Keyset 50 |
| **Deliveries** | **Fixed latest 200, no paging or filters** (`deliveries/page.tsx` L21) |
| Unsent outbox | Fixed 100; heading count misleading (`automation/page.tsx` L33, L113) |
| Job runs | Fixed 50 |
| Bulk reassign | Silent cap 300 (`workload.repository.ts` L53) |
| Workload ages | Cap 20000 (fine) |
| Holds | Cap 200 (fine) |
| Small lists with no limit | groups, departments, designations, workflows, budgets, page rules, `listActiveUserOptions` (all active users rendered into `<select>` lists on reassign, groups, custom approval, page access, reports). Fine for the current headcount, will need a type-ahead picker as staff grows. |
| Home tiles (`listMyRequests` LIMIT 200) | tile counts "My open requests" / "Changes asked of me" (`app/users/(home)/page.tsx` L33-41) are wrong for anyone with more than 200 requests. Delegation preview caps at 200 (`delegation/page.tsx` L15). |

### 3.7 Loading / empty states
- `loading.tsx` missing for: attention, analytics (3), reports (2), workflows new/[id]/compare/migrate/import, custom-approval, groups, budgets, calendar, users new/[id], organisation; Super Admin home, settings, pages (2), templates/[code], demo, automation, retention, deliveries; user home, notifications (2), security, delegation. Area-level `error.tsx` and `not-found.tsx` exist for all three areas.
- Missing empty-state text: `/admin/groups` (0 groups), `/admin/organisation` (0 departments/designations), `/superadmin/retention` (0 holds).
