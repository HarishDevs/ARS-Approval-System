# Mobile visual test report (v1.43.0, 1 Nov 2026)

## Method

A Playwright script (Chromium, production build, test database, signed in as the
seeded manager E2E_MGR, Compact view) opened every users-area route and the new
mobile routes at three sizes and, on each page, measured:

- **sideways overflow** (document wider than the window);
- **overlaps**: visible controls, labels and headings on top of one another (hit-tested, so hidden or covered elements don't count);
- **clipped text**: text cut by its own box (deliberate truncation excluded);

and saved a screenshot. It also opened Create task (desktop: Add task; phone: the + button).

| Size | Layout | Pages | Overflow | Overlaps | Clipped | HTTP |
|---|---|---|---|---|---|---|
| 1440 × 900 | desktop (cookie `desktop`) | 32 + Create task | 0 | 0 | 0 | 200 (request 1: 404, not the manager's) |
| 390 × 844 | mobile | 41 + Create task | 0 | 0 | 0 | 200 (request 1: 404; AI Assistant: 404, switched off for this user) |
| 360 × 740 | mobile | 41 + Create task | 0 | 0 | 0 | as 390 |

117 page checks, all clean. The responsive sweep in the QA suite (`QA_VIEWPORTS=all`:
320, 360, 375, 390, 414, 430, 768, 1024, 1366, 1920 px, every role) passed as well.

## Looked at by eye (contact sheets of every phone page)

- Top bar, bottom tabs and their active marker on every page; the tab that owns the page is lit (Approvals for lists and requests, Tasks for work pages, More for the rest).
- Home: hero line, 2 × 2 counts, quick actions, sections with "Open list" / "All tasks".
- Approvals: chips, cards, empty states for each tab; Tasks: chips, empty states, the red + above the tabs; Inbox: chips, list, the views below; More: profile card and grouped menu.
- Pages without a dedicated phone screen (Calendar, Analytics, Search, Profile, Notifications, Out of office, Information, New request, Request templates, lists) fit the width and scroll above the tab bar.

## Defects found and fixed during the visual pass

| ID | What | Fix |
|---|---|---|
| QA-MOB-01 | Top bar 64 px in from every side (Tailwind read `m-topbar` as a margin) | Mobile classes renamed `mob-` |
| QA-MOB-02 | Decision bar 8 px under the 64 px tab bar | Mobile offset and 48 px buttons |
| QA-MOB-03 | Pico Bot launcher on the + button | Launcher moves up on Tasks and over the decision bar |
| QA-MOB-04 | Scrollbar under the chip rows | Hidden (`mob-chips`) |

## Screenshots

`docs/mobile/screens/` (phone 390 px, small 360 px, desktop 1440 px). The full set
(117) stays with the run's working files; the repository keeps a representative 19.

## Not covered

Real devices (iOS Safari, Android Chrome), dark mode on every page (the mobile tokens
have dark values and the existing dark checks pass; the new screens were not each
photographed in dark), and landscape phones. Listed for the owner's UAT.
