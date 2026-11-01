# Desktop screenshots (v1.43.0)

**Honest note:** the brief asked for desktop screenshots *before* the mobile work. They
were not taken before the first mobile change. What stands in for them:

1. **The desktop code path is the old one.** Every mobile difference is behind
   `layoutMode() === "mobile"` (server) or `[data-layout="mobile"]` (CSS). With the
   desktop layout the shell renders the same elements as v1.42.x plus `LayoutSync`,
   which renders nothing (it only sets the `ars_layout` cookie). The only change a
   computer can see is outside the layout: the decision drawer's label "Return"
   (phones only, `md:hidden`) and the Help and User Guide text.
2. **The desktop e2e suite** (225+ tests at 1280–1440 px: every role, every flow,
   axe on the main pages, the Classic view) passes on the v1.43.0 build
   (DESKTOP_REGRESSION_REPORT.md).
3. **Screenshots of the v1.43.0 desktop layout** at 1440 × 900, taken with the layout
   cookie set to `desktop`, are the baseline from now on:

| Page | File |
|---|---|
| Home (Approval Overview) | `screens/desk-users.jpg` |
| Waiting for me | `screens/desk-users_queue.jpg` |
| My requests | `screens/desk-users_requests.jpg` |
| My Tasks | `screens/desk-users_work_my-tasks.jpg` |
| Inbox | `screens/desk-users_inbox.jpg` |
| Calendar | `screens/desk-users_calendar.jpg` |
| Analytics | `screens/desk-users_analytics.jpg` |
| New request | `screens/desk-users_custom.jpg` |

The remaining 24 desktop pages of the run (users area, 1440 px) were checked for
overflow, overlaps and clipped text (all clean, MOBILE_VISUAL_TEST_REPORT.md).
Sizes 1366 and 1920 are covered by the QA responsive sweep (`QA_VIEWPORTS=all`).
