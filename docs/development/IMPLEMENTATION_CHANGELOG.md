# Implementation changelog (v1.5.0)

Source: the owner's development spec (`ARS_Approval_Platform_Development_Spec_and_Claude_Prompt.docx`, 9 Oct 2026). Plan: `ENHANCEMENT_IMPLEMENTATION_PLAN.md`. Each part is one commit on `main`.

**Rules kept throughout:**
- every decision goes through the approval service (`decideTask`), never a direct state write;
- existing routes and behaviour are unchanged;
- the database changes only add (one migration);
- nothing was deployed and no production data was touched.

## Migration
`database/migrations/202610100900_v150_user_comfort.sql` (additive; v1.4.0 code ignores it):
- **new tables:**
  - `request_drafts`;
  - `saved_views`;
  - `notification_preferences`;
  - `user_flags`;
- **changed tables:**
  - `task_reminders.kind` gains `DUE_SOON`;
  - `delegations` gains `activation_logged_at` and `expiry_logged_at`. Rows that already started or ended are marked logged, so the first run doesn't write a burst of late entries.

## By feature

| # | Feature | What changed | Main files |
|---|---|---|---|
| 1 | My Work | Overview tiles: waiting, overdue for me, open, changes asked. Sections: due soon/overdue, Waiting for me, returned for changes, drafts, recent, finished in the last 30 days. First-use checklist | `app/users/page.tsx`, `listAttentionTasksFor` |
| 2 | Tracker | A summary above the level map: who it waits for, since when, the next step, and an "x of y" progress bar. Statuses in words as well as colour | `server/approvals/step-map.ts` (`summarizeTracker`), `features/requests/StepMap.tsx` |
| 3 | Drafts | Server-side drafts per person and form (predefined and custom), with autosave (1.5 s debounce, and on leaving a field). Saving/Saved/Couldn't save states; restore with a note; discard with confirmation; a version check across tabs; expiry after 30 days; submitting removes the draft | `server/drafts/rules.ts`, `drafts.repository.ts`, `useDraftAutosave.tsx`, `draft-actions.ts` |
| 4 | Search | `/users/search` over the requests a person may see. Access is built into the SQL: requester, task holder or decider, active delegate, or IT. Filters, sorting, paging (25), and private saved views (save, rename, default, delete) | `server/search/filters.ts`, `search.repository.ts`, `app/users/search` |
| 5 | Phones | Waiting for me and My requests become cards below 640 px. Touch targets are 44 px on touch screens. The request page shows the actions first | `features/requests/lists.tsx`, `globals.css` |
| 6 | Notification choices | Per person, per channel. Security and "approval needed" are always on. Switched-off messages are logged as SKIPPED / USER_PREFERENCE, and the inbox keeps everything. Audited | `server/notifications/preferences.ts`, `notify.ts`, `/users/notifications/settings` |
| 7 | Bulk approval | On Waiting for me: tick → review → approve, at most 25 at a time. Each item goes through `decideTask` and gets its own result. Work tasks and requests on hold aren't offered | `server/approvals/bulk.ts`, `BulkApprove.tsx` |
| 8 | Out of office | Policy text (covers waiting and new approvals; India dates; requests you raised are never decided by your delegate). A preview of what the delegate will see now. The delegate's approver eligibility is checked again when they act. The job runner logs each start and end once | `app/users/delegation/page.tsx`, `directory.repository.ts` (`canActFor`), `server/jobs/delegations.ts` |
| 9 | @mentions | `@UserID` in a comment tells that person once ("You were mentioned", instead of the plain comment notice), only if they can already see the request. Anyone who wasn't told is listed back to the writer. Quick "Mention" buttons for people on the request. The audit records who was mentioned | `server/approvals/mentions.ts`, `collab.ts`, `Discussion.tsx` |
| 10 | PDF summary | `/api/requests/[id]/summary.pdf`: the same access check as the page (404 otherwise). Contents: details, levels and decisions, files, history, and a footer with who generated it, when, and page numbers. Audited (`REQUEST_SUMMARY_DOWNLOADED`) | `server/pdf/request-summary.ts`, route |
| 11 | Test mode | Shows which way each choice went and why each skipped step was skipped. Compares with the live version for the same sample. Adds an impact note: open requests keep their version | `service.ts` (`simulateVersion`), `route-compare.ts`, `WorkflowPanels.tsx` |
| 12 | Workload | `/admin/workload`: waiting, overdue, on hold, age bands, median and oldest per person. A "due soon" heads-up once at 75 % of the response time (inbox and email). It doesn't use up an escalation slot. Handover suggests the eligible people with the fewest waiting | `server/workload/summary.ts`, `workload.repository.ts`, `sla.ts` (`runDueSoon`), `HandoverForm.tsx` |
| 13 | Help | `/users/help`: how-tos, status words, search on the page; "Copy details for IT"; first-use checklist on My Work (hidden per person, stored server-side) | `app/users/help`, `features/help/*` |
| 14 | Monitoring | `x-request-id` on every response (Cloudflare's CF-Ray when present; a caller's own id isn't trusted). It is passed to error logs and shown as the "Reference" in "Copy details for IT" and on the error page. The Super Admin is alerted once a day when the job runner or the backup fails | `middleware.ts`, `lib/logging/*`, `server/ops/alerts.ts`, `app/error.tsx` |

## New dependency
- **`pdf-lib` 1.17.1** (MIT, pure JavaScript, nothing native, so it builds on GoDaddy): makes the PDF.
- **Not used:**
  - `@pdf-lib/fontkit`;
  - the Noto Sans font (as first planned).
- **Why:** pdf-lib's built-in Helvetica keeps the dependency at one package with no font file in the repo.
- **Limit:** text outside Latin-1 is written as a stand-in ("₹" → "Rs.", other scripts → "?") (D-111).
- **Production audit:** `npm audit --omit=dev` = 0 vulnerabilities.

## New audit actions
- `REQUEST_SUMMARY_DOWNLOADED`
- `NOTIFICATION_PREFERENCES_CHANGED`
- `DELEGATION_ACTIVE`, `DELEGATION_EXPIRED`
- `OPS_ALERT_SENT`
- `REQUEST_COMMENTED` now includes `mentioned`.

## New notification events
These go to the inbox and email only, with no WhatsApp templates yet (D-112):
- `REQUEST_MENTION`
- `APPROVAL_DUE_SOON`
- `OPS_ALERT`

## Commits
`a7481a5` Phase 0 · `e255138` part 1 · `152c377` part 2 · `da8e826` part 3 · part 4 (out of office) · part 5 (mentions) · part 6 (PDF) · part 7 (test mode) · part 8 (workload) · part 9 (help, monitoring) · part 10 (E2E, docs, release).
