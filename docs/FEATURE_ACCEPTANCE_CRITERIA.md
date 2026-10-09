# Feature acceptance criteria (v1.6.0)

Each item is done only when it works end to end, the server enforces access, it has loading, empty and error states, it works on phones, and it has tests. Status is kept in `IMPLEMENTATION_REPORT.md`.

## Phase 1: design system
| ID | Criteria |
|---|---|
| UI-01 Tokens | Every colour used by the components comes from a CSS variable; no hex values in components except the brand logo |
| UI-02 Dark mode | System default; Light, Dark or System in Profile, stored per account and applied on the first paint (no flash); dialogs, menus, tables and forms are readable; axe contrast passes in both themes on the main pages |
| UI-03 UI kit | The components in IMPLEMENTATION_PLAN §5 exist in `features/ui/`, are typed, have a visible focus, take keyboard input where interactive, use roles and names, and are used on the main pages |
| UI-04 Icons | Navigation and key buttons have lucide icons with `aria-hidden`; text labels stay |
| UI-05 Table | `DataTable`: sorting (where given), sticky header, density toggle, empty state, captions and scope; used on at least the admin users, workload and search lists |

## Phase 2: feedback
| ID | Criteria |
|---|---|
| FB-01 Skeletons | Every space and main page has a `loading.tsx` that matches its layout |
| FB-02 Errors | Each space's `error.tsx` renders inside the shell, with Try again and Copy details (with a reference); a request page section error doesn't break the page |
| FB-03 Toasts | Announced politely (assertive for errors), can be dismissed, not colour-only; undo for mark-as-read and saved-view removal |
| FB-04 Session | When an action finds the session ended, a dialog says so and offers to sign in again; the draft is kept server-side; nothing is shown to the next person |
| FB-05 Offline | A banner while offline; nothing claims to be saved while offline |
| FB-06 Form errors | A summary with links, focus on the first error, valid input kept |
| FB-07 404/403 | One page for both (no leak), with search and a My work link |

## Phase 3: responsive and accessibility
| ID | Criteria |
|---|---|
| RA-01 Bottom nav | Below `md`: My work, Waiting (count), New, Search, Profile; counts come from the server |
| RA-02 Sticky actions | On the request page, people who can act get a bar with only the allowed actions; the comment opens in a drawer; the content isn't covered (padding); safe areas are respected |
| RA-03 A11y | Skip link; one h1 per page; axe has no serious or critical issues on the key pages in E2E (or the exceptions are written down) |

## Phase 4: workspace
| ID | Criteria |
|---|---|
| WS-01 Queue | Filters (type, overdue, kind) and sort; the counts match the server |
| WS-02 Shortcuts | J/K move, Enter opens, A/C open the request's action with a confirmation; inactive in inputs; `?` lists them |
| WS-03 Palette | Ctrl+K opens it; pages filtered by role; requests through the access-checked search; keyboard only |
| WS-04 Recent | The last 10 requests the person opened, only ones they can still see |
| WS-05 Breadcrumbs | On nested pages (request, admin workflow and user pages) |

## Phase 5: request detail
| ID | Criteria |
|---|---|
| RD-01 Timeline | Built from stored events only; icons, actors, day groups, relative and full times |
| RD-02 Preview | Images and PDFs inline for people with access; other types download; SVG and HTML never inline; a sandbox CSP on inline responses |
| RD-03 Diff | After a resubmit: changed, added and removed fields and files since the previous round; old requests say the earlier version isn't recorded |

## Phase 6: engine
| ID | Criteria |
|---|---|
| EN-01 Conditional fields | `showIf`/`requiredIf` with operators EQ, NEQ, GT, GTE, LT, LTE, IN, FILLED; hidden fields are cleared on the server; cycles refused when the form is saved |
| EN-02 Calculated | Expression tree with + − × ÷ and round; no eval; recomputed on the server; can't be overridden by the client |
| EN-03 Line items | Description, quantity, rate, GST %; paise integers; the total is set by the server and can feed the DoA amount |
| EN-04 Recall | BD-1; tests for parallel steps and a concurrent decision (version conflict) |
| EN-05 Ask for info | BD-2; the requester answers and it resumes; audited; the SLA pauses |
| EN-06 Consultation | Invite a consultee; they can see and answer, but have no decision buttons; audited |
| EN-07 Request delegation | BD-10 checks; audited; notified |
| EN-08 Links | Link related requests (both must be visible to the linker); "Raise follow-up" pre-fills and links; the follow-up goes through its own approval |
| EN-09 Budget | BD-3; a snapshot is stored at submit; a warning is shown to the requester and approvers; "no budget loaded" is handled |
| EN-10 Expiry | BD-4; `valid_until` is set when approved; reminder 7 days before; Expired badge |
| EN-11 Reply approval | Not built; design notes only |

## Phase 7
| ID | Criteria |
|---|---|
| RP-01 Templates | Save as template; raise again like this; validated against the current form; attachments and people not copied unless still valid |
| RP-02 Watchers | Watch and unwatch only for people who can already see it; told about final outcomes; no extra access |
| RP-03 Calendar | Month view by the "needed by" field; only visible requests; IST dates |
| RP-04 Builder | Sections, defaults, help; desktop and phone preview; a published version is unchanged by draft edits |

## Phase 8
| ID | Criteria |
|---|---|
| AD-01 Version history | Author, time and status per version; diff between any two; restore creates a new draft |
| AD-02 Analytics | Per type: counts by status, median and average hours to finish, median hours per level, changes asked; defined in the page |
| AD-03 Weekly report | BD-5; deduplicated per week and HOD; only counts and links |
| AD-04 Bulk reassignment | Filter (from person, type) → preview → to person → per-item result; audited; checks as in handover |

## Phases 9–12
- Every route uses the shared shell, headings, states and toasts.
- Performance is measured.
- A security review of all new actions.
- The test suite is green.
- Docs and report are complete.
