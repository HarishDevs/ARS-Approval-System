# Mobile redesign: screen inventory (v1.43.0)

Every users-area screen, what a phone (below 768 px) shows in v1.43.0, and where it
comes from. "Mobile screen" = a dedicated mobile presentation built from the page's
own data; "Shell" = the page's existing responsive content inside the mobile shell
(top bar, bottom tabs). Admin and Super Admin keep their responsive layout (setup
work, done on a computer).

| Brief | Address | On a phone (v1.43.0) | Source |
|---|---|---|---|
| Bottom navigation | every users page | Home, Approvals, Tasks, Inbox, More; badges for waiting approvals and unread | `features/mobile/MobileTabBar.tsx` |
| Top bar | every users page | ARS CMS mark, Search, bell, account | `features/shell/AppShell.tsx` |
| Home | `/users` | **Mobile screen**: attention line, 4 counts, quick actions, waiting approvals (cards), tasks due today, my requests in progress | `features/mobile/MobileHome.tsx` |
| Approvals hub | `/users/approvals` | **Mobile screen**: Waiting for me, My requests, Approved, Drafts as cards (computer: opens Waiting for me) | `app/users/approvals/page.tsx`, `features/mobile/ApprovalCard.tsx` |
| Approval detail | `/users/requests/[id]` | Shell: the record layout stacks to one column (the approval journey from v1.44.0, scrolled to the van; details, levels, actions, attachments); the decision bar Approve / Return / Hold / Reject stays above the tabs | `features/requests/ActionPanel.tsx` (RA-02 bar) |
| Tasks | `/users/work/my-tasks` | **Mobile screen**: Today, Upcoming, Overdue, Completed, Assigned by me as cards; red + opens Create task | `features/mobile/MobileTasks.tsx` |
| Task detail | `/users/tasks/[id]` | Shell (existing one-column task page); `my-tasks?task=` opens it | |
| Create task | the app's one window | Shell: its existing bottom panel on phones | `features/work/TaskCreator.tsx` |
| Inbox | `/users/inbox` | **Mobile screen**: All, Approvals, Tasks, Information, Mentions; Bookmarks, Archive, System, Settings below | `app/users/inbox/page.tsx` |
| More | `/users/more` | **Mobile screen**: profile card; Work, Intelligence, Tools, Account, Spaces; Sign out (asks first). Computer: opens Home | `app/users/more/page.tsx` |
| Information | `/users/information` | Shell | |
| AI chat | `/users/ai/assistant` | Shell (existing chat; Pico Bot launcher clears the tabs) | |
| Calendar | `/users/calendar` | Shell (Agenda/Month views already responsive) | |
| Analytics | `/users/analytics` | Shell (FitPages: phone tab strip on its own row, v1.42.1) | |
| Search | `/users/search` | Shell | |
| Profile and settings | `/users/profile*`, `/users/notifications/settings`, `/users/delegation`, `/users/security` | Shell | |
| New request | `/users/new`, `/users/custom` | Shell (single-column steps, existing) | |
| Lists | `/users/queue`, `/users/requests`, `/users/approved`, … | Shell (existing lists); the hub is the phone's entry | |
| Splash | installed app | Manifest background `#F2F4F7` and the app icon | `app/manifest.ts` |
| App shortcuts | installed app | Approvals, Tasks, Inbox (long-press the icon) | `app/manifest.ts` |
| Install | `/users/profile/devices` | Existing install card and steps | |
| Offline | any | Existing offline banner (SessionWatch) and `public/offline.html` | |
| Empty states | hub, tasks, inbox | Per tab, with what will appear there | |

Not built in v1.43.0 (stated, not faked): a separate onboarding carousel (the existing
tour and first-use checklist run on phones too), biometric sign-in (no WebAuthn in the
app), offline work (the app keeps nothing private on the device by design, D-106).
