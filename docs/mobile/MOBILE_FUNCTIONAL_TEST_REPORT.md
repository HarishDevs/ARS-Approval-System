# Mobile functional test report (v1.43.0 phone layout, tested again in v1.44.0)

| Area | Test | What it proves | Result |
|---|---|---|---|
| Layout choice | `tests/mobile/layout.test.ts` | Phones known by browser (iPhone, Android phone), not tablets or computers; 767 px line; waiting-time text | 3/3 |
| Shell and Home | v143 "a phone opens Home…" | Attention line, 4 counts, 5 tabs, Home lit, top bar, no sideways scroll; widening switches to the desktop layout without reload; `/users/approvals` → Waiting for me and `/users/more` → Home on a computer | Pass |
| Approvals hub and decisions | v143 "Approvals: four tabs…" | Four tabs; a card (requester, waiting) opens the request; the decision bar sits on the tab bar; Return opens its drawer with a comment box; Drafts tab | Pass |
| Tasks | v143 "Tasks: tabs, cards and the +" | Five tabs; tab change; + opens the one Create task window | Pass |
| Inbox and More | v143 "Inbox has … Mentions; More…" | Five views incl. Mentions; More's profile card; Sign out asks first and Cancel keeps you signed in | Pass |
| Tab counts | v160-ui RA-01 (rewritten) | The Approvals tab's count equals the cards waiting | Pass |
| Phone navigation | session9 (rewritten), v1100 WEB-03 (rewritten) | Users area: tabs, no drawer; Admin keeps its drawer (focus kept inside, Escape closes) | Pass |
| Every page fits | QA responsive sweep, mobile audit | 10 widths; 41 routes at 360 and 390 px | Pass / 117 clean |
| Journey on a phone | v144 (computer), screenshots at 390 px | Road scrolls to the van; compact cards show progress | Checked |

Same server actions and queries as the computer, so the approval, task and inbox
rules are the ones the desktop suites test (REGRESSION_TEST_RESULTS.md).

Not run: real devices, installed-app behaviour on iOS, push delivery (owner's UAT,
PWA_VALIDATION_REPORT.md).
