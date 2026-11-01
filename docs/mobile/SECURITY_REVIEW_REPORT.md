# Mobile redesign: security review (v1.43.0)

Scope: every change made for the phone layout (D-272). Reviewed by reading the code
paths; the access rules were exercised by the e2e suite (`tests/e2e/v143-mobile.spec.ts`
plus the existing authorization specs) and the QA API sweep (`tests/qa-e2e/api-authz.spec.ts`).

| # | Area | What could go wrong | What the code does | Result |
|---|---|---|---|---|
| 1 | Layout cookie `ars_layout` | A forged value changes what the server renders | Only `mobile` or `desktop` is accepted (anything else falls back to the user agent). It picks a presentation only; every page still runs its own guard (`requireArea`, page access, record checks) | No exposure |
| 2 | New addresses `/users/approvals`, `/users/more` | Show lists or pages the person may not open | Both call `requireArea("users")`; tabs and entries are filtered with `navAccess` / `isHiddenHref` (the sidebar's own rule); lists come from the existing per-user queries (`listPendingTasksFor`, `listMyRequests`, `listDrafts`) | No exposure |
| 3 | Card facts (`server/mobile/card-facts.ts`) | Amounts or department of requests the viewer can't see; confidential values on a card | Called only with ids from the viewer's own lists (waiting for them or raised by them); a field marked confidential is never used for the amount; `IN (?)` with bound values | No exposure |
| 4 | Inbox Mentions tab | Another person's notifications | `listInbox` keeps `n.user_id = ?`; the filter adds a fixed event-type list (no user input in SQL) | No exposure |
| 5 | Mobile Home and Tasks | Tasks of others | Task queries are `assignee_id = ?` / `assigned_by = ?` with the session user's id; opening a task goes through the existing task page and its checks | No exposure |
| 6 | Decision bar | Deciding without the checks | Same `DecisionForm` and server action (`decideAction`) as the desktop form: the same permission, confirmation for Reject and audit | No change in rules |
| 7 | Sign out | Accidental sign-out; session left alive | Confirm dialog, then the existing `POST /api/auth/logout` (revokes the server session) | As before |
| 8 | Manifest shortcuts | Deep links into private pages | They are plain addresses; each needs sign-in and runs its guard | No exposure |
| 9 | Caching | Private pages kept on the device | No service-worker change: the worker still caches only static files and `offline.html` (D-106) | As before |
| 10 | XSS | Titles and names rendered in new components | Rendered as React text (`SafeText`), no `dangerouslySetInnerHTML` | No exposure |

No new API route, no new write action, no new table or column, no secret handled.
