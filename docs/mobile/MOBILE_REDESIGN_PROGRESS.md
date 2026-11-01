# Mobile redesign: progress

| Phase (MOBILE_REDESIGN_ARCHITECTURE.md) | State | Notes |
|---|---|---|
| 1. Audit, inventory, desktop baseline | Done | Architecture and inventory written; desktop screenshots taken on v1.43.0, not before the change (stated in DESKTOP_BASELINE_SCREENSHOTS.md) |
| 2. Layout mode, shell, bottom bar, More, tokens | Done | `server/ui/layout-mode.ts`, `LayoutSync`, `MobileTabBar`, `/users/more`, `mob-` classes |
| 3. Home | Done | `MobileHome` |
| 4. Approvals hub; request page | Done | `/users/approvals` with four tabs; the request page stacks to one column and keeps the decision bar (Approve / Return / Hold / Reject) above the tabs |
| 5. Tasks | Done for the lists | Tabs, cards, the + button. The task page and projects use their existing responsive layout in the mobile shell |
| 6. Inbox, Information | Inbox done | Tabs with Mentions. Information uses its existing layout |
| 7. AI, Calendar, Analytics, Search, Profile | In the mobile shell | Existing responsive pages; checked at 360 and 390 px (no overflow, overlap or clipping). Dedicated phone screens are a later phase (PLAN V143-16) |
| 8. States, forms, attachments | Existing | Empty states per tab; the existing offline banner, error pages and single-column forms |
| 9. PWA, tests, release | Done | PWA_VALIDATION_REPORT.md; MOBILE_FUNCTIONAL_TEST_REPORT.md; v1.43.0 |

Waiting on the owner: UAT on real phones (PWA_VALIDATION_REPORT.md, "Owner UAT").
