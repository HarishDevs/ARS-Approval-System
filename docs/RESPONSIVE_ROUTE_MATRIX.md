# Responsive route matrix (v1.41.0, D-254)

Produced by `tests/qa-e2e/responsive-sweep.spec.ts`. It covers:
- every main route for each role: requester, IT Admin, Super Admin, plus a request page;
- five widths (320, 375, 768, 1024 and 1440 px), with touch on.

For each page it checks that:
- the page is no wider than the window (no sideways scrolling of the whole page);
- no button, link or field sticks out past the right edge without a scrolling box that reaches it.

Wide content (tables, the approval road, status cards, tabs) scrolls inside its own box by design.

- ✓ = fits.
- ✗ = a problem (the extra width or the first control cut off).

Re-run with:

```
npx playwright test -c playwright.qa.config.ts responsive-sweep
```

Results also go to `test-results/responsive-sweep.json`.

**1 Nov 2026 results (production build, test database).** The first sweeps found these, all fixed:
- the Do-not-disturb weekday strip (53 px too wide at 320 px; older);
- My Tasks' new summary cards on tablets (6 px);
- the Task calendar's month title at 320 px (the Today button was cut off);
- Admin → Notifications on phones (145 px; found by the site audit).

The table below is the final sweep, on the v1.41.0 release build: **46 routes × 5 widths, all fit**. A request page wasn't in this pass, because the QA setup starts from an empty database; the e2e suite and the phone check (v141) cover it.

Also checked: the site-audit crawl (every reachable page per role at desktop width, the menu pages at 375 px: 0 findings) and the axe accessibility scan of the main pages in light and dark (0 serious).

Not covered here: real phones and tablets (iOS Safari, the installed app). Check those after publishing (DEPLOYMENT Part V).

| Role | Route | 320px | 375px | 768px | 1024px | 1440px |
|---|---|---|---|---|---|---|
| E2E_REQ | `/users` | ✓ | ✓ | ✓ | ✓ | ✓ |
| E2E_REQ | `/users/inbox` | ✓ | ✓ | ✓ | ✓ | ✓ |
| E2E_REQ | `/users/queue` | ✓ | ✓ | ✓ | ✓ | ✓ |
| E2E_REQ | `/users/requests` | ✓ | ✓ | ✓ | ✓ | ✓ |
| E2E_REQ | `/users/collaborating` | ✓ | ✓ | ✓ | ✓ | ✓ |
| E2E_REQ | `/users/approved` | ✓ | ✓ | ✓ | ✓ | ✓ |
| E2E_REQ | `/users/approved-by-me` | ✓ | ✓ | ✓ | ✓ | ✓ |
| E2E_REQ | `/users/new` | ✓ | ✓ | ✓ | ✓ | ✓ |
| E2E_REQ | `/users/custom` | ✓ | ✓ | ✓ | ✓ | ✓ |
| E2E_REQ | `/users/search?q=E2E` | ✓ | ✓ | ✓ | ✓ | ✓ |
| E2E_REQ | `/users/work/my-tasks` | ✓ | ✓ | ✓ | ✓ | ✓ |
| E2E_REQ | `/users/work/my-tasks?view=board` | ✓ | ✓ | ✓ | ✓ | ✓ |
| E2E_REQ | `/users/work/my-tasks?view=calendar` | ✓ | ✓ | ✓ | ✓ | ✓ |
| E2E_REQ | `/users/work/projects` | ✓ | ✓ | ✓ | ✓ | ✓ |
| E2E_REQ | `/users/work/periodic` | ✓ | ✓ | ✓ | ✓ | ✓ |
| E2E_REQ | `/users/tasks` | ✓ | ✓ | ✓ | ✓ | ✓ |
| E2E_REQ | `/users/tasks/new` | ✓ | ✓ | ✓ | ✓ | ✓ |
| E2E_REQ | `/users/information` | ✓ | ✓ | ✓ | ✓ | ✓ |
| E2E_REQ | `/users/information/new` | ✓ | ✓ | ✓ | ✓ | ✓ |
| E2E_REQ | `/users/calendar` | ✓ | ✓ | ✓ | ✓ | ✓ |
| E2E_REQ | `/users/analytics` | ✓ | ✓ | ✓ | ✓ | ✓ |
| E2E_REQ | `/users/analytics?board=tasks` | ✓ | ✓ | ✓ | ✓ | ✓ |
| E2E_REQ | `/users/profile` | ✓ | ✓ | ✓ | ✓ | ✓ |
| E2E_REQ | `/users/profile/devices` | ✓ | ✓ | ✓ | ✓ | ✓ |
| E2E_REQ | `/users/notifications/settings` | ✓ | ✓ | ✓ | ✓ | ✓ |
| E2E_REQ | `/users/delegation` | ✓ | ✓ | ✓ | ✓ | ✓ |
| E2E_REQ | `/users/security` | ✓ | ✓ | ✓ | ✓ | ✓ |
| E2E_REQ | `/users/help` | ✓ | ✓ | ✓ | ✓ | ✓ |
| E2E_ADMIN | `/admin` | ✓ | ✓ | ✓ | ✓ | ✓ |
| E2E_ADMIN | `/admin/attention` | ✓ | ✓ | ✓ | ✓ | ✓ |
| E2E_ADMIN | `/admin/analytics` | ✓ | ✓ | ✓ | ✓ | ✓ |
| E2E_ADMIN | `/admin/records/requests` | ✓ | ✓ | ✓ | ✓ | ✓ |
| E2E_ADMIN | `/admin/workflows` | ✓ | ✓ | ✓ | ✓ | ✓ |
| E2E_ADMIN | `/admin/users` | ✓ | ✓ | ✓ | ✓ | ✓ |
| E2E_ADMIN | `/admin/organisation` | ✓ | ✓ | ✓ | ✓ | ✓ |
| E2E_ADMIN | `/admin/notifications` | ✓ | ✓ | ✓ | ✓ | ✓ |
| E2E_ADMIN | `/admin/notifications?tab=history` | ✓ | ✓ | ✓ | ✓ | ✓ |
| E2E_ADMIN | `/admin/notifications?tab=devices` | ✓ | ✓ | ✓ | ✓ | ✓ |
| E2E_ADMIN | `/admin/reminders` | ✓ | ✓ | ✓ | ✓ | ✓ |
| E2E_ADMIN | `/admin/budgets` | ✓ | ✓ | ✓ | ✓ | ✓ |
| E2E_SUPER | `/superadmin` | ✓ | ✓ | ✓ | ✓ | ✓ |
| E2E_SUPER | `/superadmin/settings` | ✓ | ✓ | ✓ | ✓ | ✓ |
| E2E_SUPER | `/superadmin/automation` | ✓ | ✓ | ✓ | ✓ | ✓ |
| E2E_SUPER | `/superadmin/deliveries` | ✓ | ✓ | ✓ | ✓ | ✓ |
| E2E_SUPER | `/superadmin/audit` | ✓ | ✓ | ✓ | ✓ | ✓ |
| E2E_SUPER | `/superadmin/logins` | ✓ | ✓ | ✓ | ✓ | ✓ |
