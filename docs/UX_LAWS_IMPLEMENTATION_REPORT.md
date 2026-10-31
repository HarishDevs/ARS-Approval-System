# UX Laws Implementation Report

ARS-CMS v1.36.0, 31 Oct 2026 (decision D-234). It follows [UX_LAWS_AUDIT_REPORT.md](UX_LAWS_AUDIT_REPORT.md). Every Critical and High finding was fixed; Medium and Low ones were fixed where practical, and the rest are listed in §5.

## 1. Improvements made

| # | Law(s) | Module | Change | Files |
|---|---|---|---|---|
| 1 | 01 Fitts, 06 Von Restorff | Approvals | **Reject is set apart** (at the end of the row, a danger outline `btn-danger-quiet`) and **asks first** ("Reject this request?", Cancel / Yes, reject) when a reason has been given. With no reason it goes straight to the server, which asks for one. Withdraw, cancel task, remove level and delete request use the same danger style. | `features/requests/ActionPanel.tsx`, `styles/globals.css`, `WorkflowBuilder.tsx`, `TaskForms.tsx`, `TaskWorkPanel.tsx`, `DeleteRequestButton.tsx` |
| 2 | 04 Doherty | Approvals | The pressed decision button says **"Working…"** (before, only the drawer did) | `ActionPanel.tsx` |
| 3 | 12 Peak-end, 16 Parkinson | Approvals | After any decision: **"Next waiting for you →"** with that request's number and title and how many are still waiting, or "Nothing else is waiting for you. All done." | `app/users/actions.ts` (`decideAction` returns `data.next`, `data.left`), `ActionPanel.tsx` |
| 4 | 15 Banner blindness, 05 Proximity | Approvals | **Budget and submission warnings now sit right above the decision buttons** for an approver; for everyone else they stay where they were | `app/users/requests/[id]/page.tsx` |
| 5 | 24 Default, 09 Tesler | Approvals | A new custom request's **first approver is the reporting manager** when they may approve (the person can change or add) | `app/users/custom/page.tsx`, `CustomApprovalForm.tsx` |
| 6 | 09 Tesler, 22 Working memory | Approvals | **"Raise again like this" for custom requests.** Title, details and the whole approver set-up come back; files don't, and the page says to add them again. The server checks everything again on submit. | `app/users/custom/page.tsx`, `app/users/requests/[id]/page.tsx` |
| 7 | 07 Goal gradient, 17 Connectedness | Approvals | **Connected approval stepper:** ✓ on done levels, the current level highlighted, upcoming levels muted, stopped levels red, and a line joining each level to the next (solid once done). Screen readers hear "Level 2 of 4: now". | `features/requests/StepMap.tsx` |
| 8 | 19 Jakob | Approvals | **"← Back to …"** goes to the list the breadcrumb names (Waiting for me, My requests or Search), not always Overview | `app/users/requests/[id]/page.tsx` |
| 9 | 01 Fitts, 14 Figure-ground | Approvals (phone) | The **Pico Bot button moves above the phone decision bar** while it is shown, so nothing covers Reject | `ActionPanel.tsx`, `PicBot.tsx`, `globals.css` |
| 10 | 01 Fitts | Tasks | The **task tick keeps its look but takes clicks 8px around it** (about 36px) | `features/work/client.tsx` |
| 11 | 01, 10 | Tasks, search, fields, templates, comments | **`ConfirmButton`:** every small delete asks first in the app's dialog and waits for the answer. Hit area raised to 32px. Used for: delete My Tasks section, delete saved search, remove project field, delete request template, delete comment. | `features/ui/ConfirmButton.tsx` and the five callers |
| 12 | 04 Doherty | Tasks | Once-only buttons wait and say "Working…": delete or archive project, delete section, restore task (plus the five forms from D-233) | `ProjectForms.tsx`, `ProjectWorkspace.tsx`, `TaskWorkPanel.tsx` |
| 13 | 24 Default | Approvals lists | **Waiting for me and My requests open your default saved view**, like the other lists | `app/users/queue/page.tsx`, `app/users/requests/(list)/page.tsx` |
| 14 | 22 Working memory | Overview | The "Overdue for me" tile opens the queue **already filtered to overdue** | `app/users/(home)/page.tsx` |
| 15 | 08 Postel | Search | A request number typed loosely is found: `pur2026123`, `PUR 2026 123`, `pur/2026/000123` | `server/search/filters.ts` (`normaliseRecordNumber`) |
| 16 | 08 Postel | Users | A WhatsApp number with the trunk 0 (`09876543210`) is accepted | `server/admin/user-rules.ts` |
| 17 | 08 Postel | Tasks | Number fields accept `₹ 1,200` and `1 200` | `server/work/more-rules.ts` |
| 18 | 13 Closure | Tabs, boards | **Scroll shadows** on strips that scroll sideways (profile tabs, Classic tabs, My Tasks and project boards). They show only on the side that has more. | `styles/globals.css` (`.scroll-hint`) |
| 19 | 23 Active user | Tasks, information | "Leave without saving?" on New task (typed) and the information form (UnsavedGuard, D-233) | `TaskForms.tsx`, `InfoForms.tsx` |
| 20 | 21 Prägnanz | Shell | The off-token `bg-white` / `text-white` in the touched parts now use tokens (Pico Bot launcher, task tick) | `PicBot.tsx`, `client.tsx` |

**Already in place and kept:**
- Figure-ground: native modal dialogs with a dimmed backdrop and focus return.
- Jakob: logo, search, bell and profile where people look.
- Steering: menus open on click, no hover paths.
- Chunking: request numbers in three parts, Indian number grouping.
- Working memory and active user: request drafts autosave and are restored.
- Doherty: skeletons, button spinners, navigation bar and slow notice (D-233).

## 2. New components

- `features/ui/ConfirmButton.tsx`: a small destructive control that asks first.
- `.btn-danger-quiet`: the outlined danger button for irreversible actions that aren't the confirm button itself.
- `.scroll-hint`: scroll shadows.

## 3. Duplicates removed or unified

Destructive buttons used to be styled three ways (`btn-secondary text-danger-600`, `btn-secondary border-danger-200 …`, plain red text). Irreversible actions now use one style. Small row deletes use one component. The seven "Remove" looks inside the admin editors (FormFieldsEditor, WorkflowBuilder) are recorded in §5.

## 4. Testing

| Check | Result |
|---|---|
| `tests/ui/ux-laws.test.ts` (3 unit tests): loose request numbers, the WhatsApp trunk 0, stepper level states | pass |
| `tests/e2e/v137-ux-laws.spec.ts` (4 e2e tests): reporting manager as default approver; stepper "current"; Back to My requests; the loose number found by quick search; Reject asks (Cancel keeps it waiting, Yes rejects); "Next waiting" after deciding; raise a custom request again with title and approvers | pass |
| `approval-flow.spec.ts`: Reject with no reason is still refused by the server | pass |

Full results (types, lint, unit, integration, the whole e2e suite) are recorded in DEVELOPMENT-MEMORY.md (v1.36.0 work log) and in [UX_LAWS_TEST_CASES.md](UX_LAWS_TEST_CASES.md).

## 5. Remaining limitations (recorded, not changed)

- **Hick / choice overload, admin editors:**
  - WorkflowBuilder and FormFieldsEditor still show every option of every row.
  - The Super Admin AI settings group is one form of 39 fields.
  - These are IT-only screens; grouping them is a larger redesign for a later release.
- **Admin navigation order:** Users & roles comes after five analytics pages (Serial position). Changing the order is the owner's call.
- **"My pending requests" vs "My requests":** the sidebar label was the owner's choice (D-207), and the page lists every status. Left as is.
- **FirstUseChecklist:** shows no "n of 5 done", because the app doesn't record completion for those steps yet.
- **Autosave** exists for requests only. Tasks, information and the admin editors have the unsaved-changes guard instead.
- **MobileNav:** hand-made modal; a full focus-trap check is left for the accessibility pass.
- **Remaining "Remove" styles** inside FormFieldsEditor and WorkflowBuilder (✕, text, button) are not unified yet.
- **Phone number display grouping** (`+91 98765 43210`): not done.
