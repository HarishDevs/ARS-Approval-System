# UI State Implementation Report

ARS-CMS v1.35.0, 31 Oct 2026 (decision D-233). It follows [UI_STATE_AUDIT_REPORT.md](UI_STATE_AUDIT_REPORT.md).

## 1. What the audit found

The app already had a solid base:
- `EmptyState`, `ErrorState`, skeletons and `BrandLoader`;
- `useActionForm` / `guardAction` (time limit, offline, session ended, app updated);
- `SessionWatch`, `OfflineBanner`, `ViewOnlyNote`;
- `notFound()` everywhere;
- conflict checks on drafts, tasks and information.

The gaps:
- the task area's calls bypassed the guard;
- the five forms built on them could be sent twice;
- "no results" was shown four different ways, mostly without a way back;
- there was nothing between "pending" and the 30-second limit;
- going offline had no "restored" message and no check that the server was reachable;
- quick search and the bell didn't say "slow down" on a 429;
- a view-only refusal said "Not found.";
- most long editors had no unsaved-changes guard;
- some failed queries looked like empty data;
- there were six clipboard copies;
- there was no maintenance notice;
- most pages had no loading feedback.

## 2. Reused (not duplicated)

`EmptyState`, `ErrorState`, `PageSkeleton`, `Spinner`, `ConfirmDialog`, `useActionForm`, `ToastProvider`, `OfflineBanner` (extended), `SessionWatch`, `ViewOnlyNote`, settings registry, `ListToolbar`.

## 3. Changed and new

| What | Where | State(s) |
|---|---|---|
| `guardCall()`: one guarded call for every Server Action caller. It handles the time limit, offline, ended session, view-only, app updated and server reference. It never throws and announces slowness. `guardAction` now wraps it. | `features/ui/form.tsx` | Error, offline, slow network, session expired, read-only |
| `useWorkCall` guarded by `guardCall`. `pending` now covers the call itself, not only the refresh. | `features/work/client.tsx` | Same, for the whole task area |
| The five task-area forms disable while saving: My Tasks add/rename section, calendar quick-add, project Add section, edit comment. | `features/work/MyTasks.tsx`, `TaskCalendar.tsx`, `ProjectWorkspace.tsx`, `CommentThread.tsx` | Duplicate-submit, loading |
| `SlowNetworkNotice`: "Still working… the connection seems slow" after 8 s. No percentage. | `features/shell/SessionWatch.tsx`, mounted in `AppShell` | Slow network |
| `OfflineBanner` now checks the server when the browser comes back online. It shows "Back online" for 4 s, or "Connected, but ARS can't be reached" with re-checks at 5 s, 10 s … up to 1 minute. | `features/shell/SessionWatch.tsx` | Offline, connection restored |
| `NavigationProgress`: a thin top bar on every page change after 150 ms. Skeletons stay on read-only pages only (KNOWN_ISSUES V6-D06). | `features/shell/NavigationProgress.tsx` | Loading |
| `loading.tsx` on the read-only registers (Records ×3) and AI Analytics | `app/admin/records/*/loading.tsx`, `app/admin/ai-analytics/loading.tsx` | Loading |
| `NoResults`: names the words searched, with Clear search and Reset filters, and is kept apart from `EmptyState`. Used on: request lists, Waiting for me, Information lists, typed task lists, Records, Super Admin audit / logins / requests, Search, Projects, task search. | `features/ui/Display.tsx` | No search results |
| `UnsavedGuard`: closing or reloading the tab gets the browser's question. A link in the app gets "Leave without saving?" (Cancel / Leave without saving). Saving or resetting clears the guard. Used on the user form, custom approval set-up, task/information type set-up, AI rules editor and notification centre. | `features/ui/UnsavedGuard.tsx`, `SAVED_EVENT` in `form.tsx` | Unsaved changes |
| 429 answers: quick search and the bell say "Too many … in a short time. Wait a moment" | `features/shell/CommandPalette.tsx`, `NotificationBell.tsx` | Rate limited |
| A view-only refusal says "This page is view-only for you, so nothing was changed." | `guardCall` | Read-only / access |
| `copyText()`: one copy helper. It uses the Clipboard API, then the older copy command, then a visible "Your browser blocked copying…" with the text shown. It replaces six copies (ShareDialogs, ProjectHeader, work/client, CopyAnswer, TryAsButton, PicBot). | `features/ui/clipboard.ts` | Browser permission denied |
| Maintenance notice: a Super Admin setting (General → "Maintenance notice shown to everyone"). Every page shows it while it is filled in. | `server/settings/definitions.ts`, `AppShell` | Maintenance |
| Failures no longer look like empty data: home "Recently viewed", Salesforce (it used to say "Not set up"), the Analytics "Stuck requests" tile. Notification settings no longer show defaults when a read fails (Save would have overwritten the real values). | `app/users/(home)/page.tsx`, `app/superadmin/salesforce/page.tsx`, `features/analytics/AnalyticsScreen.tsx`, `app/users/notifications/settings/page.tsx` | Error vs empty |
| Header search bar can shrink (no sideways scroll at 768 px); profile photo column width capped | `CommandPalette`, `AppShell`, `ProfileForms` | Responsive |

## 4. Not changed on purpose

- **Shell badge counts** (unread, waiting, inbox) still fall back to 0 if their query fails. The shell must always draw, and every list behind a badge shows its own error.
- **`app/error.tsx`** keeps its own markup. It renders outside the app shell and needs its own `<main>` and `<h1>`.
- **Hidden and no-access pages** still answer a plain 404. This is deliberate (D-016): it does not confirm that the page exists.
- **Device permissions:** the app uses no camera, microphone, location, notifications or push, so those are not applicable. File inputs are checked on the server: type sniffing, size and count.
- **Partial success:** bulk approve already lists each request's outcome. Bulk task changes report "N changed; M not (why)". When some fail, the toast is now a **warning** rather than green (`useWorkCall`). No separate component was needed.
- **Conflicts on admin configuration edits:** no version check yet. Two IT admins editing the same workflow at once: the last save wins, and every save is in the audit log and version history. Recorded as a remaining limitation.

## 5. Tests

| Test | Trigger | Expected |
|---|---|---|
| `tests/ui/guard-call.test.ts` (5) | Normal answer; a call that never answers; offline; status says signed out; server error with digest | Passed through; "taking longer than expected"; "You're offline"; "session has ended"; the reference shown |
| `tests/notifications/control-center.test.ts` | Do not disturb, per-kind choices (from D-231) | — |
| e2e `v136-ui-states.spec.ts` | `context.setOffline`; a Server Action delayed 9.5 s; quick search answering 429; a search matching nothing; leaving a changed form; the maintenance setting | Offline banner then "Back online"; slow notice then "Saved."; "Too many searches"; `NoResults` with Clear search / Reset filters; "Leave without saving?" (Cancel keeps, Leave goes); the notice on every page |
| e2e `v180.spec.ts` (updated) | Saving a view on a view-only page | "This page is view-only for you…" |
| e2e `v160-workspace.spec.ts` (updated) | Queue filtered to nothing | `NoResults` |
| `tests/ui/loading-guard.test.ts` (updated) | The list of pages with skeletons | Only reviewed read-only pages |

The test results are recorded in DEVELOPMENT-MEMORY.md (work log, v1.35.0).

## 6. Remaining limitations

- No conflict check on admin configuration edits (see §4).
- Skeletons only on read-only pages until Next fixes V6-D06; elsewhere the navigation bar, button spinners and the slow notice give the feedback.
- Downloads (CSV, PDF) are plain links. A 429 on a download shows the browser's own page with the JSON message.
- Clipboard: on a page served over plain HTTP the older copy command is used; a browser that refuses both shows the text to copy by hand.

## 7. Accessibility and performance

- Every new state uses `role="status"` or `role="alert"` with text (never colour alone). The progress bar is `role="progressbar"` with a label.
- `NoResults` actions are links (keyboard and screen-reader friendly).
- The unsaved-changes dialog is the app's focus-trapped `ConfirmDialog`.
- No new dependencies. The slow-notice and progress listeners are passive and do nothing until a call or click happens.
