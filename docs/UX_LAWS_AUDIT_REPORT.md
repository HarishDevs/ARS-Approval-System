# UX Laws Audit Report

ARS-CMS v1.35.0, 31 Oct 2026. A read-only audit of the source, done before any UX change. Every finding cites a file and line. The two highest findings (Reject has no confirmation; budget warnings sit below the decision buttons) were re-read by hand.

Implementation: [UX_LAWS_IMPLEMENTATION_REPORT.md](UX_LAWS_IMPLEMENTATION_REPORT.md). Standards: [UX_DESIGN_STANDARDS.md](UX_DESIGN_STANDARDS.md). Tests: [UX_LAWS_TEST_CASES.md](UX_LAWS_TEST_CASES.md).

Statuses: **FULL** (fully implemented), **PARTIAL**, **MISSING**, **N/A**, **IMPROVE** (requires improvement). Priority: Critical / High / Medium / Low.

## 1. Application overview

- **Stack:** Next.js 15 App Router, React 19, Tailwind with the ARS tokens (light and dark), MySQL.
- **Size:** 128 pages in four areas: public, `/users` (54), `/admin` (44), `/superadmin` (21).
- **Two views:**
  - Compact: collapsible sidebar, universal search, + Create.
  - Classic: Tally-style Gateway, keyboard menus.
- **Main workflows:**
  - Raise, approve and track multi-level approval requests (custom or predefined types).
  - Tasks and projects (Asana-style table, board, calendar).
  - Information broadcasts with acknowledgement.
  - Admin set-up: workflows, forms, users, rules.
  - Super Admin operations.
- **Shared UI:**
  - `features/ui`: Dialog, ConfirmDialog, Menu, DataTable, Display (EmptyState, NoResults), Skeleton, Toast, form helpers, ListToolbar, Drop, UnsavedGuard, Avatar, clipboard.
  - `features/shell`: AppShell, SidebarFrame, SideNav, CreateMenu, CommandPalette, ProfileMenu, NotificationBell, SessionWatch, Classic.

## 2. Inventory reviewed

| Area | Modules and pages | Key components |
|---|---|---|
| Users | Overview; approvals (new request, custom approval, request page, pending, approved, waiting for me, approved by me, collaborating, templates, search); tasks and projects (home, inbox, My Tasks, projects, project, settings, new project, periodic, search, task page, typed tasks); information (inbox, sent, item, new); calendar; analytics; profile, people, notifications, settings, out of office, sign-in and devices; help; AI assistant | ActionPanel, StepMap, Timeline, RequestForm, CustomApprovalForm, TaskGrid, TaskPane, TaskCreator, InfoForms, NotificationCenter |
| Admin | Workflows (list, builder, compare, migrate, import), users, organisation, groups, DoA, budgets, calendar, task and information types, reminders, AI rules, analytics, reports, records, dashboards, insights, workload, attention, imports | WorkflowBuilder, FormFieldsEditor, UserForm, RecordsRegister, DashboardFrame |
| Super Admin | Overview, settings, integrations, Salesforce, AI, audit, logins, deliveries, templates, pages, retention, demo, automation | SettingsGroupForm, TemplateForm |

## 3. Audit matrix

| Module | Page or component | Law | Name | Status | Problem | Recommended improvement | Priority |
|---|---|---|---|---|---|---|---|
| Approvals | Request page, ActionPanel `features/requests/ActionPanel.tsx:59-62` | 01 | Fitts | IMPROVE | Reject sits among the secondary buttons in the same style, with red text only, and submits with no confirmation step. It is irreversible. | Put Reject apart (at the end, danger outline) and confirm before rejecting | **Critical** |
| Approvals | Phone decision bar `ActionPanel.tsx:211-219` with PicBot `features/ai/PicBot.tsx:201` | 01, 14 | Fitts, Figure-ground | IMPROVE | The Pico Bot launcher floats over the bar's Reject corner | Lift the launcher above the bar on phones | High |
| Tasks | TaskCheck `features/work/client.tsx:96` | 01 | Fitts | IMPROVE | The most-used control is 16–20px | Keep the look, give it a 32px hit area | High |
| Tasks, search, fields, templates, comments | `MyTasks.tsx:224-230`, `SearchParts.tsx:33-38`, `MoreParts.tsx:138`, `Templates.tsx:29`, `CommentThread.tsx:131` | 01, 10 | Fitts, Similarity | IMPROVE | About 22px delete icons next to rename or star, with no confirmation | One ConfirmButton (ask first, danger style); larger hit areas | High |
| Approvals | Request page `app/users/requests/[id]/page.tsx:153` vs `:245` | 15 | Banner blindness | IMPROVE | Budget and submission warnings render below Approve/Reject | Show the warnings right above the decision buttons | High |
| Approvals | After a decision `app/users/actions.ts:188-190` | 12, 16 | Peak-end, Parkinson | MISSING | The approver stays on a finished page with no next step | "Next waiting for you →" after a decision, plus the count left | High |
| Approvals | Custom approval `features/requests/CustomApprovalForm.tsx` | 09, 24 | Tesler, Default | MISSING | Approvers start empty | Default the first step to the reporting manager (when eligible) | High |
| Approvals | Request page "Raise again" `[id]/page.tsx:357` | 09, 22 | Tesler, Working memory | PARTIAL | Only typed requests can be raised again; custom requests need everything picked again | Raise a custom request again (title, details, amount, approvers) | High |
| Approvals | Desktop decision buttons `ActionPanel.tsx:41-61` | 04 | Doherty | PARTIAL | Buttons only grey out; no "Working…" on the pressed one | Show "Working…" on the pressed button | Medium |
| Approvals | StepMap `features/requests/StepMap.tsx:102-117` | 07, 17 | Goal gradient, Connectedness | PARTIAL | Step numbers are always grey and there are no connecting lines; done and upcoming look alike | A connected stepper: ✓ done, current highlighted, upcoming muted | Medium |
| Approvals, lists | Queue and My requests `app/users/queue/page.tsx:220`, `requests/(list)/page.tsx:51` | 24 | Default | PARTIAL | The saved default view is ignored; it is applied only on other lists | Apply the default view as on the other lists | Medium |
| Overview | "Overdue for me" tile `app/users/(home)/page.tsx` | 22 | Working memory | IMPROVE | Opens the unfiltered queue | Open the queue filtered to overdue | Low |
| Search | Request numbers `server/search/filters.ts:63` | 08 | Postel | PARTIAL | `pur2026123` or `PUR 2026 123` doesn't match `PUR-2026-000123` | Recognise numbers typed without dashes, with spaces, or without leading zeros | Medium |
| Admin, users | WhatsApp numbers `server/admin/user-rules.ts:117-125` | 08 | Postel | PARTIAL | `09876543210` (leading 0) is refused | Drop the leading 0 | Low |
| Tasks | Custom number fields `server/work/more-rules.ts:110` | 08 | Postel | PARTIAL | "₹ 1,200" is refused | Accept ₹ and spaces, as request forms do | Low |
| Tasks, many | About 28 `useWorkCall` buttons with no pending state (`ProjectForms.tsx:156`, `ProjectWorkspace.tsx:626`, `TaskWorkPanel.tsx:63`, `TaskGrid.tsx:246`) | 04 | Doherty | PARTIAL | Can be clicked twice; no busy cue | Disable while working, on the destructive and once-only ones first | Medium |
| Everywhere | Tabs and boards that scroll sideways `Classic.tsx:257`, `ProfileTabs.tsx:19`, boards | 13 | Closure | MISSING | No sign that more is off-screen | Scroll shadows at the edges that only show when there is more | Medium |
| Everywhere | "Remove" in seven styles, mixed destructive styles (`FormFieldsEditor.tsx:131,230,342`, `WorkflowBuilder.tsx:307,580`, `ShareDialogs.tsx:278`) | 10, 21 | Similarity, Prägnanz | IMPROVE | The same action looks different | One destructive style (`btn-danger-quiet`) and the ConfirmButton | Medium |
| Admin | WorkflowBuilder, FormFieldsEditor, Super Admin AI settings (39 fields) | 02, 18 | Hick, Choice overload | PARTIAL | Long flat editors | Already partly disclosed (levels, preview). Field options could collapse; AI settings could group | Medium (recorded; admin-only) |
| Approvals | Request page action column | 02 | Hick | PARTIAL | Five decisions plus delegate, recall, withdraw and header actions | Keep Approve first, Reject apart; delegation is already folded | Medium |
| Help | FirstUseChecklist `features/help/FirstUseChecklist.tsx` | 07 | Goal gradient | PARTIAL | No "2 of 5 done" | Count real completion | Medium |
| Admin | Admin nav `app/admin/layout.tsx:23-52` | 11 | Serial position | IMPROVE | Five analytics pages come before Users & roles | Owner decision on order (recorded, not changed) | Low |
| Approvals | Request "← Back" `[id]/page.tsx:110` | 19 | Jakob | IMPROVE | Always goes to Overview, not to the list you came from | Go back to the breadcrumb's list | Low |
| Users | Sidebar label "My pending requests" vs page title "My requests" | 10 | Similarity | IMPROVE | Two names for one page | Use one name | Low |
| Shell | Page-top banners `AppShell.tsx:227-257` | 15 | Banner blindness | PARTIAL | Five banners share one warning stripe | Icons plus words already; give each its own icon and role | Low |
| Shell | MobileNav `features/shell/MobileNav.tsx:58` | 14 | Figure-ground | PARTIAL | A hand-made modal | Check focus trap and backdrop (recorded) | Medium |
| Everywhere | Raw `text-white`, `bg-slate-900/55`, z-index values outside the tokens | 21 | Prägnanz | IMPROVE | Off-token colours (dark mode) and a stacking clash (PicBot) | Tokens | Low |
| Tasks, information, admin editors | No autosave `TaskCreator`, `InfoForms`, `WorkflowBuilder` | 23 | Active user | PARTIAL | Request drafts autosave; others don't (UnsavedGuard covers several) | Recorded; UnsavedGuard on information and typed task forms | Medium |
| — | Dialogs `ui/Dialog.tsx` (native modal, dimmed backdrop, focus return) | 14 | Figure-ground | FULL | — | — | — |
| — | Navigation: logo top-left, search centre, bell and profile top-right, collapsible sidebar, + Create | 19 | Jakob | FULL | — | — | — |
| — | Menus are click-to-open with no hover paths (`ui/Menu.tsx`) | 20 | Steering | FULL | Hover-only reveals (chat row menu, calendar +) are small | Recorded | Low |
| — | Proximity: labels above fields, hints beside labels, ReadinessPanel above Submit | 05 | Proximity | FULL | Budget warnings (see 15) | — | — |
| — | Primary actions use btn-primary, one per form | 06 | Von Restorff | FULL | Reject/Withdraw need the danger treatment (see 01) | — | — |
| — | Chunking: request forms in sections; numbers grouped in Indian style; record numbers are already in 3 parts | 03 | Chunking | PARTIAL | Phone numbers shown as raw digits | Group them as `+91 98765 43210` | Low |
| — | Request drafts autosave and are restored; drafts listed on Overview | 22, 23 | Working memory, Active user | FULL (requests) | — | — | — |
| — | Skeletons, button spinners, navigation bar, slow notice (D-233) | 04 | Doherty | FULL (D-233) | — | — | — |
| — | Defaults: Myself, saved default views, remembered sidebar and density | 24 | Default | PARTIAL | See queue and custom approval | — | — |
| — | Templates, autofill from profile, raise again (typed requests) | 09 | Tesler | PARTIAL | See custom approval | — | — |
| — | Parkinson: + Create, quick-add, bulk actions, Ctrl+K | 16 | Parkinson | PARTIAL | Next item after a decision | — | — |
| — | Carousels | 13 | Closure | N/A (none) | — | — | — |

## 4. Gap analysis (Critical and High)

| # | Now | Problem | Law | Change | Benefit | Complexity | Affects existing |
|---|---|---|---|---|---|---|---|
| 1 | Reject next to Hold or Question, same style, sends at once | An irreversible decision taken by mistake | 01, 06 | Reject apart at the end with danger outline; a confirmation dialog | Fewer wrong rejections | Low | Tests that reject must confirm |
| 2 | Budget warnings below the buttons | The approver decides before seeing them | 15, 05 | Show the checks right above the decision buttons | Decisions made with the facts | Low | None |
| 3 | Done page after a decision | Extra navigation for each queue item | 12, 16 | "Next waiting for you →" with the count left | Faster queue | Medium | Decision message gains a link |
| 4 | Custom approval approvers empty | Every requester picks the same manager again | 09, 24 | First step defaults to the reporting manager when they may approve | One step less for most requests | Low | Form default only |
| 5 | No raise again for custom requests | Re-typing and re-picking | 09, 22 | "Raise again" on custom requests opens the custom form prefilled | Faster repeat requests | Medium | New entry point |
| 6 | PicBot over the phone Reject corner | Mis-taps | 01, 14 | Lift the launcher on pages with the decision bar | Safer taps | Low | None |
| 7 | 16–20px task tick | Misses on touch | 01 | 32px hit area, same look | Easier ticking | Low | None |
| 8 | 22px unconfirmed delete icons | Data lost by a slip | 01, 10 | ConfirmButton | No accidental deletes | Low | Tests must confirm |

The Medium and Low items are in the matrix. Those changed are listed in the implementation report; the others are listed there as recorded limitations.
