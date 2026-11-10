# Release notes

## v1.50.3 (10 Nov 2026): follow-ups from New request; a clear "no access" screen (owner)
- **Fixed: Raise a follow-up.** On a request raised with **New request** (CUS-…), the button sent you to Request templates, which only lists IT's approval types (and can be turned off for some people), so the follow-up couldn't be raised. It now opens **New request** with the title and matching details copied and a note "Raising a follow-up to …"; on submit the new request is linked to the approved one (an expired approval asks why, as before). Requests raised from a template still go to Request templates to choose the type; its "Something else? New request" link keeps the follow-up too.
- **Follow-up management on the request page** (custom and template requests):
  - A **Follow-ups** card lists every follow-up raised from the request, with its status and who has it now, and holds **Raise a follow-up**.
  - The **Work tasks** card has **Add a follow-up task** (task, assign to, priority, optional due date). The task is linked to the request, listed in the card and in the person's Task Management, without raising a new approval. Needs the Task module; assignment follows the General task type's rules.
- **No-access screen.** A page you can't open (turned off for you by IT, or part of a module you don't have) now says **"You don't have access to this page"**, names the page and why, and offers Go to Home. A request or task that isn't shared with you still shows "This page isn't available", so nothing private is confirmed.

## v1.50.2 (10 Nov 2026): no more false failure messages (owner)
- **Fixed:** creating a user could first show a failure message although the user was created. The welcome email (and WhatsApp) was sent while the page waited, and a slow provider ran past the page's time limit. The user page now opens at once and says **"A welcome email is on its way"**; the email follows a moment later.
- The same fix everywhere messages are sent while you wait: approval submits and decisions, comments and mentions, collaborators, task changes, information notices and Super Admin request deletes. Messages are saved first and sent just after the screen answers; anything that can't be sent is retried by the background job every 5 minutes, as before.
- **Bulk Re-invite / Send set-password link** (Users & roles) now answers at once and sends the emails in the background.
- **Task Management audit:** a full gap analysis against the 145-point Task Management checklist is in `docs/task-management-audit/` (11 reports). No application changes were made for it.

## v1.50.1 (10 Nov 2026): task links open for everyone on the task; new task priorities (owner)
- **Fixed:** the link in a "Task for you" email showed "This page isn't available" for someone without the Task module (for example an approval-only user given a task). Anyone a task is assigned to, assigned by or created by can now open that task and work on it; the Task module still controls Task Management (lists, creating tasks, projects).
- **Task priorities** are now **Critical**, **Most Important**, **Important** and **Normal** (in that order), in Create task, task lists, search, bulk "Set priority", work-task levels and task pages. Existing tasks keep their meaning (Urgent shows as Critical, High as Most Important, Normal stays Normal).
- This release runs one small database change on start (adds the Important priority). Nothing else to do.

## v1.50.0 (5 Nov 2026): go-live release: work task options, linked items, PDF like the screen, security fixes (owner)
- **Work task steps:** a level set to **Work task** now has **Task priority** (Low, Normal, High, Urgent) and an optional **Task due date**. The task reaches the person's Task Management with that priority and due date when the step starts (put the work level after the approval levels to have it start once they approve). The due date also shows in **Waiting for me**.
- **Request page:** a **Work tasks** card lists the tasks raised from the request (number, title, who, due date, status), next to **Linked requests**.
- **Linked requests:** type a number or words of the title and pick from the list; only requests you can see are offered.
- **PDF download** now looks like the request screen: the ARS header, title with status and priority, Request details in two columns, Approval levels, Work tasks, Linked requests, Attachments and History, with page numbers.
- **Security:** a lock from wrong passwords no longer signs someone out of sessions already open, and the count starts again after a lock runs out (so nobody can keep a colleague locked out using their email or mobile number). A User ID can't be 10 to 15 digits (it would look like a mobile number). Sign-in limits count one mobile number once however it is typed.
- **Shorter wording** on many screens (Out of office, bulk approve, collaborators, admin approval types, DoA, form fields). Admin calls them **Approval types** everywhere.

## v1.49.6 (4 Nov 2026): welcome emails, users bulk actions, Home tidy-up (owner)
- **New users get a welcome email:** every user added with **Add user** or created by an **import** is emailed their User ID and a link to set their password (Google users are told to sign in with Google). There is no tick box any more. After an import the message says how many emails are on their way.
- **Set-password and invitation links now work for 12 hours** (they were 72).
- **Admin → Users & roles:** tick users (or **Select all on this page**) and **Re-invite**, **Send set-password link**, **Deactivate** or **Activate** them together. Each asks first; the answer says how many were done and why any weren't. Only people you may change can be ticked.
- **Home:** **Recently viewed** and **Finished in the last 30 days** are gone. **My recent requests** shows 8 at a time, with page numbers for the rest.
- **Waiting for me:** the last column is **Due date**; a step without a response time says **No due date**.

## v1.49.5 (4 Nov 2026): approvals pages by role, the right tab for each request, Delete selected (owner)
- **Pages by role:** people whose designation isn't ticked **Approver** now see only **New request**, **My pending requests**, **My approved requests** and **Collaborating** under My Approvals (sidebar, Classic tabs, search and the phone bar). Approvers see every page. Anyone with something waiting for them still sees Waiting for me.
- **Fixed:** a request opened from **Waiting for me** highlighted **My pending requests**. The highlighted page, the breadcrumb and **← Back** now name the list the request belongs to for you: Waiting for me, My pending requests, My approved requests, Approved by me or Collaborating. Same in the Compact and Classic views.
- **My pending requests:** the **Open** card is gone (Waiting for approvers, Sent back and On hold cover it). **My approved requests:** no cards; use Filter.
- **Request page:** the decision buttons keep each label on one line ("Ask for changes", "Ask a question").
- **Super Admin → Requests:** tick requests (or the box in the header for the whole page) and **Delete selected**, with one reason. Each request is deleted and logged on its own; one under a legal hold is skipped and named.
- The phone bar's **New** opens New request.
- **Sign in:** in the User ID box you can type your **User ID**, your **mobile number** (with or without +91, spaces allowed) or your **email**. The password and the WhatsApp code are still asked every time. Forgot password takes the same.

## v1.49.4 (3 Nov 2026): notifications panel layout (owner)
- **Fixed:** in the bell's panel, the All / Approvals / Tasks / Information row was squeezed when the list was long (cut off, with a small scrollbar). It now keeps its height on every screen; only the list scrolls.

## v1.49.3 (3 Nov 2026): users list actions and Department filter; see-through dropdowns fixed (owner)
- **Admin → Users & roles:** a **Department** filter (or "No department") next to Status and Module, and an **Actions** column with a three-dot menu on each row: **Re-invite**, **Send set-password link** (or **Send reset-password link** when they already have a password), **Deactivate user** / **Activate user**, and **Open user**. Each asks first, naming the person, and the answer shows as a message. People you can't change (yourself, or another IT Admin unless you are the Super Admin) only offer Open user.
- **Fixed:** the people search list ("Nobody matches.", the names) was see-through, so the text under it showed through. Checked every dropdown and panel: faded colours (the phone top bar and tab bar, highlighted rows, coloured borders) also didn't show and now do.

## v1.49.2 (3 Nov 2026): module access in the users import (owner)
- The users file has a **modules** column (before roles): **APPROVAL**, **TASK**, **INFORMATION**, **AI** separated by ; or **ALL**. Empty: a new person gets Approval, Task and Information; an existing person keeps what they have.
- The same rule as the user page: nobody changes their own module access, and only the Super Admin changes another IT Admin's.
- Files made before this column still import (the column can be left out).

## v1.49.1 (3 Nov 2026): import with Excel files (owner)
- **Admin → Import** works with **Excel**: **Download template** and **Download current …** give an Excel workbook (.xlsx) with the sheet to fill (columns set to Text, so User IDs and WhatsApp numbers stay as typed) and a **How to fill** sheet. Upload the filled workbook as it is; dates, numbers and TRUE/FALSE are read correctly. The problem list downloads as Excel too.
- CSV files still work, with commas, semicolons or tabs (Excel's "Text (Tab delimited)" too; before, a tab file showed every column as missing).
- An old .xls file asks to be saved as Excel Workbook (.xlsx).
- The users file's roles column lists EXPORTER (may download reports) with USER, IT_ADMIN and SUPER_ADMIN.

## v1.49.0 (2 Nov 2026): the ARS GREEN STEEL CMS brand, and New request / New task straight to the form (owner)
**Branding** (the owner's approved ARS GREEN STEEL CMS logo and brand sheet):
- The app is called **ARS CMS** everywhere: browser tab ("… · ARS CMS"), installed app, sign-in, emails' subjects, phone notifications, PDF summary and loading screens.
- The approved logo is in the header, the sign-in and other sign-in pages, the phone top bar, the public pages and the approval journey; the square icon (from the same logo) is the browser tab icon, the phone/desktop app icon (Android, iPhone, maskable) and the install card. Colours: primary blue #004B8D, accent #0A72D9, ARS red #E30613.
- **Sign-in and loading screens** (owner's phone references): sign-in pages have a pale background with a city skyline and the ARS swooshes; on a phone the logo sits large above "Welcome to ARS CMS". The loading screen is the splash: the logo on its own blue, with a bar and what is happening. New loaders: the ring round the mark, the dotted ring, and "Loading ARS CMS…" with a bar (Classic view's loading box uses the dotted ring and bar).
- **Logo without a background** on the blue sign-in panel (the one-line ARS | GREEN STEEL CMS), on the loading screen and on the phone sign-in (navy lettering on light, white on dark).
- **Round loaders** have the ARS lettering in the middle; each time one appears it is the ring or the dotted ring, at random.
- **Default profile picture:** until someone uploads a photo, they show the ARS CMS round icon: **blue for approvers**, **white for other users** (header, account menu, More, Profile, people cards). Anyone can still upload their own photo.
- **Phones with the app installed:** close and reopen it to pick up the new icon; some launchers need the app removed and installed again.

**Shortcuts to the form:**
- On a phone, the **+** on Approvals and Home's **New request** open the **custom approval form** (the templates list is still under More → Request templates).
- **New task** and **Add task** everywhere open the **Create task** window directly; the old "choose a task type" page is gone from the menus (a task type IT set up with its own form still opens from its link).

**Fixed:** in the Classic view, the Tasks Management tab bar now shows on every task page.

## v1.48.1 (2 Nov 2026): a slimmer Approval Journey (owner)
- The journey is smaller: the road and the van take less height, and the side column (Request Status, Approval Levels (Detailed), Status guide) and the level details panel are gone; the request page below shows the same facts.
- A level's details (name, status, time and **approver**) show when you **hover** over it (or reach it with the keyboard); tapping a level takes you to the page's Approval levels card.
- Folded, the journey keeps a **small road with the van** in its header, from the title to the status, so you still see where the request is.
- The percentage (e.g. "100% Completed") always shows in the header.
- On a phone the refresh, share and fold buttons sit in the header's top-right corner, beside the ARS mark.
- **Fixed:** in New request, choosing **Work task** or **FYI** for a step (and other dropdowns in the form) now sticks; the form used to put the old choice back.
- **On hold:** the approver who put a request on hold sees **Resume** first, with the reason, and the decisions return after it; on a phone the bottom bar is one **Resume** button while it is on hold.

## v1.48.0 (2 Nov 2026): the new Approval Journey, request page and one colour per status (owner)
**Approval Journey** (from the owner's design and reference folder), on computers and phones:
- A header with the ARS mark, the request number and title, its status, the number of levels, **refresh** (checks for news now) and **share** (copies the link).
- A scenic road (hills, trees, the ARS plant) with the van; each level shows its name, status and time; the flag at the finish.
- **Request Status**: a ring with the percentage, "X of Y levels completed", request number, requester, submitted on, valid until.
- **Approval Levels (Detailed)**: every level, who decided and when; the current one highlighted; tap one for its details.
- When it ends, a banner: Request Approved (with confetti, once), Rejected at <level> by <name>, On hold, Changes required, Expired, Withdrawn.
- A **Status guide** (closed by default) explains every status.

**Request page**, laid out like the owner's picture:
- **Request details** with an icon per row in two columns (Priority as its coloured pill); **Approval levels** with a "Waiting for … to decide" banner and tiles (Progress, Completed, Remaining, Time in process, Last update) above the level cards.
- On the right: your decision (if it's yours to decide), Recall & change, Withdraw, Attachments, Collaborators, Discussion.
- Below: Linked requests, **Timeline** (the latest 3, newest first; **Show more** opens the rest in a scrolling box), Reuse; then Raise again like this (and, for the Super Admin, Super Admin and Delete).
- On a phone everything is one column, in the owner's order: the journey (the road and its banner; the Request Status and detailed-levels cards are left out, their facts are below), then Request details, then Approval levels and the rest.

**One colour per status, everywhere** (lists, cards, the request page, the journey, phone cards): In progress / Waiting / Pending blue; On hold amber; Changes required / Asked for changes orange; Approved / Done green; Rejected red; **Withdrawn purple** (was grey); Skipped / Given the task / Told purple; **Expired grey**; Not started / Not needed / Closed grey; Blocked orange-red. Readable in light and dark themes.

## v1.47.1 (2 Nov 2026): priority colours everywhere (owner)
- Every priority now shows in colour wherever it appears: tables (task lists, project lists and boards, My Work on Home, Analytics "Oldest open tasks", Records, the request lists), headings (the task page, the task pane, the request page, an information item) and the phone rows.
- Built-in priorities: **Urgent** red, **High** orange, **Important** yellow, **Normal** blue, **Low** grey (Home → My Work used to say "Medium" for Normal; it now says Normal like everywhere else). Editable priority boxes in task tables wear the same colour.
- A request priority option IT hasn't coloured yet takes a colour from its name (Critical red, Most important and High orange, Important yellow, Normal/Medium blue, Low grey); a colour chosen in the Form Designer always wins.

## v1.47.0 (2 Nov 2026): priority and coloured choices (owner)
- **Colours for choices:** in the Form Designer, each option of a Dropdown, Radio buttons or Multi-select field can have a colour (red, orange, yellow, green, teal, blue, purple, pink, grey, or none). Wherever that value shows (request and task details, task tables, the New request summary) it is a coloured pill, readable in light and dark mode.
- **Request priority:** if a request's form has a choice field with the key `priority` (as in Custom approval), its value is the request's priority, in its colour: beside the title on the request page and in the PDF; a **Priority** column (after Status) in My requests, Collaborating, My approved requests, Approved by me and Waiting for me, with **Sort: Priority (highest first)** and **Group: Priority** in your option order; in search, Super Admin requests, Admin Records (and its CSV), the Home widgets (My recent requests, Waiting for me, Due soon, Returned, Finished, Recently viewed) and the phone cards. Requests without one show "—". A confidential priority field shows *Hidden* to people who may not see confidential values.
- **Task priority** shows as the same kind of pill in every task list, board and table (Urgent red, High orange, Low grey).

## v1.46.0 (2 Nov 2026): the remaining build, and the owner's decisions (owner)
**On your phone**
- A task keeps **Add a comment** at the bottom of the screen, as in Asana: tap it, write, @mention, **Send**.
- **Information** uses the phone pattern (Choose view, Manage view with search and sort, **+**, **…** for Received and Sent by me).
- **New request:** the steps and the buttons are one slim row each (Details, Workflow, Review; Draft, Reset, Next), so most of the form fits on the first screen.
- **Analytics:** the dashboard, whose numbers and period fold into one row above the numbers.
- **Calendar:** **Show** is one dropdown (ticked kinds with their counts), on a computer too.
- **Pico Bot** opens to about three quarters of the screen; it grows out of its button and shrinks back into it.

**Approvals (owner's decisions)**
- **Resubmitting after a change that alters the route** (for example a higher amount needing another level) restarts from the first level the change affects; earlier levels keep their approvals. The history shows what changed.
- **Parallel levels where any one or any N is enough:** a new setting, *If one branch rejects*: end the request (default, as before) or only when the required number can no longer be reached.
- **No request ends approved by nobody:** if every level is skipped, it goes to the requester's HOD (or IT), unless IT ticked *May finish without an approver* on that predefined type.
- **Expired** approvals show as Expired in lists, search, the request page, phone cards and the PDF; amending one or raising a follow-up asks for a reason.
- **Rules:** form rules and workflow rules now use one editor (all or any of several rows; dates compare as dates). Saved rules are converted once when this version starts (the one migration in this release).

**IT and Super Admin**
- Confirmations before high-impact admin actions (deactivating groups, departments, designations; closing a type; saving working days; removing a provider key; hiding a page for everyone). Loading demo data needs **LOAD DEMO** typed and is refused on a database with many real people.
- Page restrictions can no longer be side-stepped through an address that isn't a configured page.
- Break-glass signs in with its password alone while its emergency window is open; every such sign-in is recorded and alerted.
- Super Admin home: **Origin lock** on/off and **WhatsApp templates still to switch on**.
- **Google Drive backup:** the encrypted daily backup can be copied to an ARS shared-drive folder (settings, Test, newest copies kept).
- **Security records** (sign-in attempts, WhatsApp codes, ended sessions, used links) are deleted after 90 days.
- **Records:** requests show their **Amount** (Hidden when confidential and you may not see it), in the CSV too.

**Fixes**
- Create task: choosing a collaborator closes the list; the calendar and repeat buttons now work on a wide window (they open the due date and the repeat settings).
- Records CSV: a stray character before the first heading (two byte-order marks) is gone.

## v1.45.0 (2 Nov 2026): the phone app, laid out like Asana (owner)
On a phone (a computer is unchanged):
- **The same pattern on every list:** a big title with **…** for that screen's other pages, flat lists, and a floating bar above the tabs: **Manage view**, **Choose view** (which list) and the red **+**. Choices open as sheets from the bottom.
- **Tabs:** Home, Approvals, **My tasks**, Inbox, More; the open one sits in a pill and shows its name.
- **My tasks:** one row per task: tick the circle to complete it (with Undo), the title, its projects, the priority dot (Important, Urgent) and the due date (red when overdue). Manage view: **Compact mode**, **Sort** (due date, priority, title, newest) and **Group by** (none, due date, project); groups fold.
- **A task:** back, **Mark complete**, copy link and **…** (its actions) at the top; a big title with **Assigned to** and **Due date**.
- **Inbox:** grouped by day, each notification as a card (kind, title, message with **See more**, time), bookmark and archive. Choose view: **All activity**, **Bookmarks**, **Archived**; Manage view: filters, unread only, newest first.
- **Approvals:** the four lists in Choose view, **+** for a new request, **Compact mode** for one line per request.
- **Search:** one box for requests or tasks, then quick filters and shortcuts.
- **More:** your photo, name and email; **Out of office** (says whether it is on) and **Notifications** tiles; Settings (including colour mode), Support (Help centre, terms, privacy), Sign out and the app version.
- Not copied from Asana because ARS-CMS doesn't have them: Do not disturb, likes on a task, a language choice, several accounts.

## v1.44.1 (2 Nov 2026): phone fixes (owner)
- **On your phone, the notifications panel fits the screen.** It ran off the left edge; it now spans the screen under the top bar, stops above the bottom bar, and its filters (All, Approvals, Tasks, Information) scroll sideways if they don't fit. On a computer it is unchanged.
- **Loading screens on your phone:** while a page loads, you see the shape of that screen (Home, Approvals, Tasks, Inbox, More, a request with its journey, a task, or a general list) instead of the old page. Pages that load at once show nothing extra. A computer is unchanged.

## v1.44.0 (2 Nov 2026): the approval journey (owner)
- **The approval journey** on every request: your request is sealed into an envelope and loaded into the red ARS van, which drives along the road of approval levels. It waits beside the level deciding now with the request out for review; each approval stamps it green, it goes back into the van and the van drives on to the next level; at the flag the road turns green and shows 100%.
- A rejection shows a red stamp where it stopped; changes asked show an orange stamp and the van drives back to you, then sets off again when you resubmit.
- **Work tasks** and **Information (FYI)** are shown beside the road, each with its own status: who has the task and whether the request waits for it; who was told and whether the message was delivered, is pending or failed.
- It follows the request live (every 10 seconds while open, at once when you come back) and never replays on a reload. Hide it with the arrow at its top right. With "reduce motion" on, nothing moves.
- **Work steps that don't hold the request up:** in New request, a Work task level now has **The request waits until it's done**. Untick it to give the work as tasks and let the request move straight on; finishing those tasks doesn't decide anything on the request, and the people given them can read the request.
- A task from a request shows that request's journey (small) on its page; lists and phone cards show its progress in small.

## v1.43.0 (2 Nov 2026, published with v1.44.0): the phone layout; tasks from approvals highlighted; QA fixes; Classic and request page layouts (owner)
**On your phone** (screens below 768 px; a computer looks and works exactly as before):
- A bar at the bottom with **Home**, **Approvals**, **Tasks**, **Inbox** and **More**, with the number waiting for you and unread.
- **Home** says what needs you in one line, then four counts, quick actions (New request, New task, Search, Ask AI), the first approvals waiting, your tasks due today and your requests in progress.
- **Approvals**: Waiting for me, My requests, Approved and Drafts as cards: number, title, who raised it and their department, the amount, who has it, when it was submitted, how long it has waited, Overdue or Due soon, and the status.
- **On a request**, Approve, **Return** (ask for changes), Hold and Reject stay at the bottom, above the bar.
- **Tasks**: Today, Upcoming, Overdue, Completed and Assigned by me as cards; the red **+** adds a task.
- **Inbox**: All, Approvals, Tasks, Information and a new **Mentions** tab.
- **More**: your profile and every other page you can open, and Sign out (it asks first).
- The installed app's splash screen uses the new page colour; long-press its icon for Approvals, Tasks and Inbox.

**Tasks from approvals:** a task made by an approval's work step is tinted and shows the request number (it opens the request) in every task list, board and table, on Home and in the task pane.

**Fixes from the full QA pass** (`qa/BUG_REGISTER.md`):
- files of a confidential field could be downloaded by people who may not see confidential values; their names now show as "a confidential file" in the history;
- people told by an FYI step can read the request but not comment, add files or link it;
- IT's and the Super Admin's sign-ins always end after the idle time, even on a phone;
- "Try as" can no longer connect someone's Google Calendar or mark their notices read;
- a work-step task can't be added to a project, moved under another task, repeated or deleted on its own;
- a monthly repeating task due on the 31st keeps the 31st (or the month's last day);
- Home loads with fewer database queries; two optional indexes speed up the Inbox and completed tasks (`database/optional/v1421_qa_indexes.sql`; IT runs it once approved, nothing runs by itself).

**Classic view layouts:**
- **Create task in the Classic view** is now the same centred, two-column floating window as in Compact, dressed like a Tally window: a solid blue title bar in capitals, square corners, a blue frame and a grey button bar. (The fields used to be drawn over one another.)
- **Classic forms:** a field's box no longer shrinks to nothing next to its label in narrow spaces (Task search filters, Out of office dates, the step name in New request): it moves under its label instead.
- **Analytics on phones:** the page bar puts its section names on their own row.
- **Sidebar logo:** "ARS-CMS" stays on one line.
- **Request page, laid out as the owner's sketch:** the title and request number with the approval road beside them across the top (each level's approver, then the finish flag); on the left Request details, then Approval levels (the status, the progress figures and level by level); on the right Needs your action, with the decisions as a grid of buttons (Approve, Ask for changes, Put on hold, Ask a question, Reject), then Attachments, Collaborators and the rest.
- Every screen of the Classic view was checked on a computer and a phone.
- **Work and FYI steps (owner's report):**
  - a **Work task** step is now also a task in Task Management for each person on it (My Tasks, boards, calendar, Home), linked to the request. Ticking it done marks the work done on the request, which moves on; if the step closes on the request (done there, withdrawn, rejected), the task closes too. Only the person it's for can tick it; it's handed over on the request;
  - people told by an **FYI** step can now open the request from their message (it said "Not found" before);
  - the "Kind of step" box no longer cuts its words off (Approval, Work task, FYI), with a line saying what each does; the summary says "needs someone to do…" or "someone to tell…" for those steps.

## v1.42.0 (1 Nov 2026): the remaining screens in the new look; editable task tables (owner)
- **Calendar:**
  - a clearer toolbar (round arrows, Today, and Month / Week / Day / **Agenda**);
  - category chips with a tick and how many entries each has;
  - today circled, weekends shaded;
  - each kind of entry has its own coloured stripe.
- **Boards (My Tasks and projects):** columns have a coloured top edge and a count. Cards show who it's for (initials), the due date with an icon, the priority and the project.
- **Create task:**
  - on a computer, a card in the middle of the screen: task details on the left, task settings on the right (due date, **priority**, repeat, collaborators, Task with a form);
  - on a phone, the bottom panel as before;
  - the Classic view keeps the corner panel.
- **Task tables:** due date, assignee, priority, **collaborators** and **tags** now change in their cells in every task table (projects, My Tasks, task search), wherever you may change the task. Created by can't be changed.
- **Analytics:**
  - People and Departments show completion and on-time bars in their tables;
  - Departments add comparison charts;
  - Data quality shows a card per check (green when clean);
  - Trends opens with headline cards and the change against the comparison period.
- **Analytics, "My tasks":** a new choice in Whose numbers for the tasks given to you, with the Overview and the Tasks dashboard.
- **New request:** the Save as draft / Reset / Back / Next / Submit bar is at the top of the page, under the steps.
- **New request:** **Next** only when every required field is filled in (a red star marks them; what's missing is shown beside it). The approval workflow can be changed only after Next. **Submit** is on the last step.
- **The road:** while a level waits, the van is halfway to it; it reaches the approver's name once they approve.
- **Request page:** the road is at the top, centred and smaller, with **Request details** below it, now including the requester's details (User ID, department, designation, email, reporting manager). On the right: your action box first (smaller), then Attachments, then Collaborators.
- **Home, redesigned:**
  - **Approval Overview:** cards for what's waiting, overdue, your open requests and changes asked; Waiting for me first; your drafts (open or delete), recently viewed and **Quick insights** (requests raised, approved, average approval time) for a period you choose.
  - **My Work – Overview:** Total, Upcoming, Overdue and Completed for a period you choose (Today to a custom range); My Tasks with tabs; your projects with progress; the latest updates on your tasks and projects; your weekly workload.
  - Approvers open on Approvals, everyone else on Task Management; switch at the top.
- **New look for ARS-CMS:** a new ARS-CMS mark and logo beside ARS Green Steel, new app and browser icons (install the app again to see the new icon on your phone), ARS Blue throughout, and blue sidebar icons.
- **Loading and results:** animated ticks, seals and crosses for done, approved and failed (from IconScout, in ARS colours); a new loading screen, shimmering placeholders while pages load, and an animated tick when something is saved, submitted, decided or a task is completed (a cross when it fails). With "reduce motion" turned on, nothing moves.
- **New request:** on a computer each column scrolls on its own; each approval level is a small card on top (click to edit it); options IT has fixed aren't spelled out on every level.
- **Request details** opens with the requester's name and department.
- **Fixed:**
  - Admin → Custom approval (and other long forms) asked "Leave without saving?" after Save;
  - choosing a status in a project's header (Set status) now selects it in Post a status update and takes you there;
  - in the dark theme, the open list of dropdowns (for example Share → Invite) was unreadable.
- User Guide, Help and the tour cover the above. The privacy policy and terms are unchanged: no new data is collected or shared.

## v1.41.0 (1 Nov 2026): install the app, notifications on your phone, the approval road (owner)
- **Install ARS-CMS as an app** on Android, iPhone, iPad, Windows and Mac. A card offers it on the first visit (on iPhone and iPad it shows the Share → Add to Home Screen steps). **Maybe later** is remembered. Profile → **App & devices** always has it.
- **Phone and desktop notifications:** turn them on per device in Profile → App & devices.
  - Approvals, tasks, reminders, information and IT's notices arrive even when the app is closed or you're signed out. Tapping one opens the record.
  - Choose which kinds come under Profile → Notifications → **Phone & desktop**.
  - The Super Admin makes the keys once (Settings → Phone & desktop notifications); no outside account is needed.
- **Stay signed in all day on phones:** on a phone, a tablet or the installed app you stay signed in until midnight (India time); computers keep the inactivity sign-out. The Super Admin can change who gets this.
- **Admin → Notifications:**
  - IT sends a notice to people, departments, roles, heads of department, managers or everyone, with a category and priority.
  - History shows how many the push services accepted.
  - Devices lists every registered device.
- **The approval road:** on every request, a road shows the journey, with the red ARS van at the level waiting now. It drives on by itself as levels finish and reaches the flag with a big tick when fully approved. Tap a point to see who decides there.
- **My requests, redesigned:**
  - Raised by me / Shared with me with totals.
  - Status cards (All to Overdue).
  - Search also by approval type and approver.
  - Your own columns, a progress bar per row and a ⋮ menu of what you can do.
  - Numbered pages.
  - The same on My approved requests, Approved by me and Collaborating.
- **New request in three steps** (details, workflow, review) with a live summary and an action bar. People pickers show initials, designation and department.
- **Tables and Analytics fit the window:** every table scrolls in its own box with the header kept in view, and long tables come in pages. Each Analytics board is split into pages that fit the screen.
- **Look:** the main screens get the new header icons and summary cards in the Compact view (Classic stays as it was), in both light and dark themes.
- **Fixed:** with the sidebar folded, the Create (+) menu was hidden and labels such as "Information" were cut off.
- Privacy policy, terms, User Guide, Help, tour and first-use checklist cover all of the above.

## v1.40.0 (1 Nov 2026): every audit finding addressed (owner)
- **Security:** four Super Admin pages could be read without signing in through a client-navigation request; every admin page now checks access itself, and a test keeps it so. Signing in no longer hints which User IDs exist. The break-glass account's actions are recorded and alerted.
- **Approvals:** nobody can skip a step of their own request, and a request is never approved without at least one real approval (a step skipped for having nobody now waits for IT instead). Changing the approver chosen in a field restarts that step on resubmit.
- **Resubmit:** a request sent back for changes goes through the same duplicate, unique-value and budget checks as a new one. A background step that partly failed is shown as failed.
- **Privacy, terms, Help and tour:** updated for every module (AI Assistant, tasks and projects, Inbox, profile photo, weekly HOD email, encrypted backups); the tour now covers Home, Inbox, Create, My Tasks, Draft task, Projects and your profile.
- **Messages:** WhatsApp rate limits are retried properly, sign-in codes can't be crowded out by bulk messages, a message is never sent twice after a crash, and a scheduled report reaches everyone else when one address fails.
- **Backups:** every backup gets a checksum; with a key set they are encrypted, and an automatic off-site copy can be switched on (S3-compatible storage). `/api/health/deep` lets a monitor alert when backups or jobs stop.
- **New:** a weekly email to each head of department (off until switched on).
- **Smaller:** "Home" everywhere (no more "Overview"), page titles that match their headings, a task given to someone else opens on its page, Home's task sections load after the approvals, project edits can't overwrite each other, and the user guide and technical documents are up to date.
- **Database:** two additive migrations (`notification_outbox.claim_token`, `hod_report_runs`), applied on start.


## v1.39.0 (31 Oct 2026): workflows save as you work (owner)
- **Workflows (IT):** changes save into the draft by themselves a few seconds after you stop (nothing is published), and Save draft saves at once. If a colleague saved or published in the meantime, you're told and nothing of theirs is overwritten.
- **Rules:** the "only when" rules on form fields and the conditions in workflows now use the same row (field, test, value), and both show a field that is no longer on the form.
- **Publishing:** this release adds one column to the database; it is applied when the app starts.

## v1.38.0 (31 Oct 2026): Workflow Designer and settings console (owner)
- **Workflows (IT):** a map of the flow above the levels: click a box to open that level. Levels fold, can be dragged or moved with Alt+↑/↓, duplicated, and removed with a question first and Undo after. Each level says what needs fixing before you save. Unsaved changes are kept in your browser and offered back next time. Test mode now has the right box for every kind of field.
- **Settings (Super Admin):** categories down the side, a search across every setting, a mark on anything not saved yet, and a question before leaving with unsaved changes. AI settings are saved with one button (it was nine).

## v1.37.0 (31 Oct 2026): Form Designer, Home and one Inbox (owner)
- **Form fields (IT):** a new designer. Add fields from a library, drag them into order (or use ↑/↓), duplicate them, and remove them with a question first and Undo after. Settings are grouped in tabs, and changing a field's type tells you what would be lost.
- **Custom approvals:** the DoA option is gone (it never applied to custom requests).
- **Home:** Overview and Task home are now one page, **Home**: your approvals first, then your tasks, team and projects.
- **Inbox:** notifications and the task inbox are one **Inbox** in the sidebar, with Bookmarks and Archive for every kind of notice. Notification settings are now **Profile → Notifications**.
- **Sidebar:** Search and Search tasks are gone (use the search bar at the top); the space is called **Central Management System**.
- **Draft task like Asana:** a taller, narrower panel that grows with your screen, and a toolbar: formatting (bold, italic, lists), emoji, @mention (people mentioned become collaborators), attach a file or paste a screenshot, collaborators, due date and repeat. Type **/** in the description for the menu. If Pico Bot is on for you, ✨ writes the description from the task's name.
- **Fixed:** after a decision, "Next waiting for you" now always appears.

## v1.36.0 (31 Oct 2026): easier to use, everywhere (owner)
- **Approving:** Reject now stands apart and asks before it rejects; after any decision a **Next waiting for you** button takes you to the next one; budget warnings show right above the decision buttons; the approval steps are a connected line with ✓ for done.
- **Raising:** a new request starts with your reporting manager as approver; a custom request can be **raised again** with the same approvers.
- **Search** finds a request number typed without dashes or zeros (e.g. "pur 2026 123").
- **Fewer slips:** deleting a section, saved search, field, template or comment asks first; the task tick is easier to hit.
- **Small things:** "← Back to …" returns to your list; the Overdue tile opens the overdue items; strips that scroll sideways show there's more.

## v1.35.0 (31 Oct 2026): every screen state handled (owner)
- **Slow connection:** a save that takes more than a few seconds says "Still working…", and a thin bar at the top shows a page is on its way.
- **Offline:** when the connection comes back the app checks ARS answers, then says "Back online".
- **No results** for a search or filter now name what you searched and offer **Clear search** and **Reset filters**, everywhere.
- **Leaving a long form you changed** asks first.
- **Clearer messages** for view-only pages, too many searches, copying blocked by the browser, and parts of a page that failed to load (instead of looking empty).
- **Maintenance notice:** IT can show a message to everyone (Super Admin → Settings → General).

## v1.34.0 (31 Oct 2026): Classic view like Tally (owner)
_Shipped in the same commit as v1.35.0 (b764c41); the `v1.34.0` tag points there (audit OPS-05)._
- In the **Classic** view every screen now looks like Tally: a title bar, square ruled boxes, forms laid out as **Label : value**, the field you are typing in highlighted, ruled tables with the current row highlighted.
- **Every list's toolbar looks like Asana's:** Filter, Sort and Group show as soft blue pills with × when in use, a line before Options, and Search as an icon (Admin → Records too).
- **Collapsible sidebar:** ☰ folds it into a narrow row of icons (like Asana) and opens it again; the app remembers.
- **Your profile:** upload your photo, write About me, and see everything IT holds about you (manager, head of department, your team, access, modules…). Colleagues' names open their profile card.
- **Notification settings, all in one place:** choose kind by kind what reaches you in the app, by email and on WhatsApp; the morning summary; **Do not disturb** (pause, quiet hours, days off).
- **Search like Asana:** the search bar in the middle of the top bar finds requests, tasks, projects, people, information and pages; recents and saved searches; **Filters** for a full search.
- **Tally keys on every form:** **Enter** moves to the next field (and finally to the button), **Ctrl+A** accepts the form, **Esc** goes back. The Compact view is unchanged.

## v1.33.0 (31 Oct 2026): sidebar, Myself/Others, Overdue, list toolbar (owner)
- **Tasks & projects** is now a group in the sidebar with Home, Inbox, My Tasks, All projects, Periodic tasks, Search tasks, New project, Templates and Task with a type; the Tasks pages use the full width.
- **Draft task:** the task is for **Myself** by default, or **Others**: type part of a name to find people.
- **My Tasks** has an **Overdue** section at the top for open tasks past their due date.
- **Every list** (requests, Waiting for me, information, typed tasks) has the task table's toolbar: **Filter**, **Sort**, **Group** (request lists), **Options** (per page, save the view) and **Search**.

## v1.32.0 (30 Oct 2026): Tasks like Asana (owner)
- **The Tasks area looks and works like Asana** in the ARS colours: a left bar with Create task, Home, Inbox, My Tasks, all your projects (by department, with Starred), Periodic tasks and Search; tasks open in a panel beside the list.
- **Compact table** for projects, My Tasks and search: numbered rows, ticks, Filters (quick filters and field filters), Sort, Groups, Options and **saved tabs**.
- **Tick to complete** on every task list, and **Mark complete** on every task.
- **Periodic and ad hoc tasks:** choose when creating; periodic tasks are marked ↻ and have their own list.
- **Share** any project (invite people or a department with a role, who can see it, copy link) or task (collaborators, copy link).
- **+ Create** at the top of the sidebar: Approval request, Task, Project (and Information); the sidebar has the new look and one **Tasks & projects** entry.
- **Ad hoc tasks** can go to several people at once (each gets their own copy); only the creator changes an ad hoc task's details. **Periodic tasks** repeat.
- **Project permissions:** choose who can update a field (for example the due date) and who can share the project's tasks with other projects.
- **Draft task** panel to create a task in seconds; **New project** step by step, blank or from a template; **Save as template** from the project menu.

## v1.31.0 (30 Oct 2026): the rest of Task & Project Management (owner)
- **Repeating tasks:** daily, weekly on chosen days, monthly, yearly, or some days after completion; the next one is made when a task is completed, with its people, projects, tags and subtasks, never on a holiday.
- **Project fields:** your own columns (text, number, choice, date) in a project's List and on its tasks.
- **Templates and copies:** save a project as a template, start projects from templates, or copy a project; dates move to the new start.
- **Change many tasks at once:** tick tasks in a project List or My Tasks to complete, assign, date, prioritise, move, tag or delete them together.
- **Task inbox:** everything about your tasks in one place, with bookmarks and archive.
- **Morning summary:** each working morning, your overdue, due-today and new tasks by email and in the app (switch it off in My Tasks).
- **Department holidays:** a department's own days off count for its people's tasks. Set up in Admin → Task set-up → **Task settings** (formerly Task holidays), with the summary and repeating-task options.

## v1.30.0 (30 Oct 2026): Task & Project Management (owner)
- **Projects** under Tasks: private, department or everyone; members (people or departments) as owner, editor, commenter or viewer; sections; **List, Board, Calendar, Timeline** and **Overview** with status updates; star, join, archive, delete and restore.
- **Tasks and subtasks:** subtasks up to five levels, "waiting for" other tasks, milestones, start dates, tags, a task in several projects, delete and restore within 30 days.
- **Working together:** comments with replies, @mentions, likes and pins; followers who see the task and hear about it.
- **My Tasks** (Recently assigned, Today, Upcoming, Later and your own sections; list, board, calendar) and **Task home** (your tasks, what you assigned, your team, your projects, latest status updates).
- **Task search** with filters, quick and saved searches; Ctrl+K finds tasks and projects; keyboard: Q, G then H/M/P/S, J/K, X.
- **Reporting line:** managers see the tasks of everyone below them at every level (read and comment), Team tasks covers every level, and Task home shows your team.
- **Holidays:** a task date on a holiday asks to keep it or move it to a working day (or is refused, as IT chooses); holidays show on task calendars; no task reminders on holidays; IT can move or tell about all tasks due on a holiday. Set up in Admin → Task set-up → **Task holidays**.

## v1.29.0 (29 Oct 2026): loaders and the full Classic way around (owner)
- **After signing in** (also after setting or resetting a password) an ARS loading screen shows until your workspace is ready.
- **Classic view:** every page change shows a Central Management System box ("Opening Waiting for me…") while it loads.
- **Classic navigation, in and out:** Overview dashboard and pages like Profile or Help now show where you are and go back with Esc; Esc in a search or text box first leaves the box, then goes back; the Central Management System lists your other spaces (Admin, Super Admin) and **Quit (sign out)**.

## v1.28.1 (29 Oct 2026): Classic view keyboard fixed (owner)
- **Fixed:** in the Classic view the arrow keys, Enter, the highlighted letters and Esc did nothing for some people (for example the Super Admin). They now work for everyone.

## v1.28.0 (28 Oct 2026): text size in the Classic view (owner)
- The Classic view now follows the sketch exactly: sign-in, then the **Central Management System** box listing the modules, then each **module page** with its pages as tabs and its boxes.
- In the Classic view, choose a **text size** (Small, Normal, Large, Larger, Largest) under View in the profile menu or on Profile. All text in the app changes at once; the layout keeps its shape. Saved on your account.

## v1.27.0 (28 Oct 2026): Classic view; reminders and escalations your way (owner)
- **Classic view** (Tally-style), chosen per person in the profile menu → View: after sign-in a Gateway menu (Approval, Tasks and Information Management, Pico Bot, Overview, Search, Calendar, Analytics) with highlighted letters; each module has its own menu and summary boxes; pages show their module's pages as tabs; Esc goes back. **Compact** is today's layout.
- **Reminders & escalations** (Admin → Automation): rules for pending approvals and open tasks on any field and value, including form fields; escalation levels to managers, the requester, HOD, IT or named people; repeats; your own wording; email or inbox only; a Test button that sends nothing. Escalation emails always go out.

## v1.26.0 (28 Oct 2026): sign in either way (owner)
- **New sign-in choice "Both"** in Admin → Users → How they sign in: the person can sign in with Google or with their User ID and password plus a WhatsApp code, whichever they prefer. Both needs a WhatsApp number; Re-invite sends them a link to set their password.
- CSV user import accepts BOTH in the sign_in_method column.

## v1.25.1 (28 Oct 2026): My Approvals menu (owner)
- The My Approvals menu now reads: New request, My pending requests, My approved requests, Waiting for me, Approved by me, Collaborating, Request templates.

## v1.25.0 (27 Oct 2026): simpler approvals and analytics for each person (owner)
- **New names:** "New request" is now **Request templates** (the approval types IT set up), and "Custom approval" is now **New request** (choose your own approvers).
- **New request is simpler:** everyone can add levels and parallel steps. The DoA matrix, choices (if / otherwise) and "Skip this step when…" appear only if IT switches them on in Admin → Custom approval.
- **Tasks menu order:** New task, My tasks, Assigned by me, Team tasks.
- **Analytics shows what you need:** only the dashboards for your modules and role, and the overview shows only your modules.
- **Fixed:** "Opening…" stayed on the Analytics page after a dashboard had opened.

## v1.24.0 (26 Oct 2026): Pico Bot knows the ARS Salesforce (owner)
- **A Salesforce guide for Pico Bot** is added to Admin → AI Rules → Salesforce chats (only if that page is empty): which object holds what, the words people use (dealer code, executive, CO/DO, secondary order, regions), the status values in use, data traps to avoid and ready recipes for common questions (executives logged in by region, attendance, secondary orders, dealer 360, targets, collections, stock). Pico Bot now goes straight to the right data.
- **Combined chats** also follow the Salesforce (and other) rules.
- **Privacy:** date of birth and KYC ids in Salesforce are never read by Pico Bot.

## v1.23.3 (26 Oct 2026): 360-degree dashboards (owner)
- **Big requests work:** a dealer 360 view (sales, orders, payments, targets…) gets more lookups and room for a long answer; an answer that runs out of room is retried with more.
- **Fixed: a Salesforce chat could refuse Salesforce questions** ("This chat is limited to Salesforce data").
- **Partly answerable requests** (for example ERP data, which Pico Bot can't see) are answered for the Salesforce part, with a note on the rest.
- **Privacy:** Aadhaar, PAN and bank details in Salesforce are never read by Pico Bot.

## v1.23.2 (26 Oct 2026): your question leaves the box when you send it (owner)
- In the AI Assistant, pressing Enter now empties the box at once; your question shows in the chat while Pico Bot is analysing. If asking fails, the question comes back to the box so you can edit or resend it. The floating Pico Bot panel does the same.

## v1.23.1 (26 Oct 2026): Pico Bot finds and fetches more reliably (owner)
- **Ask with everyday names:** "executives", "attendance", "region", "last login" are understood directly, so answers need fewer steps.
- **No more page-size totals:** a list that was cut off is never reported as the total.
- **A failed question no longer derails the next one** in the same chat.
- **Fewer "try again" failures:** busy providers are waited out and malformed lookups are retried.
- **Long answers aren't cut short:** the assistant page waits up to 5 minutes instead of 30 seconds.

## v1.23.0 (26 Oct 2026): Pico Bot gives real numbers or none (owner)
- **No more invented figures.** Every number in an answer is checked against the data Pico Bot actually read. If a number isn't there, Pico Bot must fetch it or leave it out; if nothing could be read, it says so instead of showing a made-up dashboard.
- **"Today", "this week" and dates work in Salesforce** (for example orders created today), in India time.
- **Regions, dealers, owners and other linked records show their names**, not Salesforce ids, in lists and breakdowns, and you can filter by name ("orders in Chennai North").
- **Breakdowns by two things at once** (region and status) with count and quantity together.
- **Pico Bot finds things by the names you use** ("executives" finds the Executive records).
- **Security:** password, session, token and key fields in Salesforce are never readable by Pico Bot.

## v1.22.4 (26 Oct 2026): the split-screen home page is back (owner)
- **The home page is the split screen again** (blue panel left, welcome right), now with what Google's review needs on the page itself: the name ARS-CMS, what it is for, what you can do, who can use it and how Google data is used, with the privacy policy link. **Sign in** turns smoothly into the sign-in form.

## v1.22.3 (26 Oct 2026): back on approval.arssteels.net (owner)
- **ARS-CMS lives at https://approval.arssteels.net again.** The app's fallback address, the privacy policy, the terms and the sample links in message templates use it. The name ARS-CMS and the new home page stay.
- Links already sent on arssteels.net can open the same page on approval (`LEGACY_HOSTS=arssteels.net,www.arssteels.net`). Steps: docs/DOMAIN-MIGRATION.md → Rollback.

## v1.22.2 (26 Oct 2026): a real home page for ARS-CMS (owner)
- **The home page is now a public page about ARS-CMS**, not the sign-in screen: the name ARS-CMS at the top, what it is for, what you can do (approvals, information, tasks, Google Calendar), who can use it and how Google data is used, with links to the privacy policy and terms. **Sign in** is one click away. Google's verification needs this.

## v1.22.1 (26 Oct 2026): home page ready for Google's review (owner)
- **The home page now says what ARS-CMS is for**, in plain view on desktop and phones, including the optional Google Calendar link. Google's OAuth review needs this.
- **docs/DOMAIN-MIGRATION.md:** DNS steps are in GoDaddy (arssteels.net uses GoDaddy's name servers), and a new "Google verification" section explains each finding from Google's review and the order to resubmit.

## v1.22.0 (25 Oct 2026): ARS-CMS, ready for arssteels.net, Pico Bot, AI Analytics, New chat fix, full site audit (owner)
- **New name: ARS-CMS (Central Management System)** on the home page, sign-in, browser tabs, the installed app, emails, the privacy policy and terms, and in Pico Bot. WhatsApp wording keeps the Meta-approved text until the templates are resubmitted.
- **Ready to move to arssteels.net:** every link comes from one setting (`APP_BASE_URL`); the old address can redirect page by page (`LEGACY_HOSTS`) while webhooks, the job runner and sign-in callbacks keep working. Step-by-step guide: docs/DOMAIN-MIGRATION.md.
- **Fixed: six pages scrolled sideways on phones** (AI Analytics, Super Admin Requests, Automation, WhatsApp templates, AI Reports, Budgets): a hidden screen-reader label in wide tables, and wide charts in page grids, widened the page.
- **Pico Bot** (Progress Insight Companion Bot) is the AI assistant's new name everywhere: the floating button, the chat panel, the assistant page, settings and messages.
- **Fixed: New chat** after an answer took you back to the old chat. It now opens an empty chat and stays there (also from the sidebar).
- **Admin → AI → AI Analytics:** adoption, questions, answered %, answer time, conversations, tokens and estimated cost, with the change from the previous period; questions and failures over time; by chat, department and data lookup; providers and models; top users; when people ask (weekday × hour); why answers failed; the daily limit. IT Admins and the Super Admin.
- **Site audit:** an automated check now crawls every page each role can reach (desktop and a touch phone) for broken links, broken downloads, page and console errors, broken images and sideways scrolling, and runs with every release.

## v1.21.0 (25 Oct 2026): Admin → Records (owner)
- **New in Admin: Records → Approval requests, Tasks, Information.** Every record in the app, whoever raised it, in one spreadsheet-style table each: numbered rows, a fixed header, scroll sideways for more columns.
- **Approval requests:** number, title, type, raised by, department, status, current step, waiting on, approvals given, round, submitted, closed, days open.
- **Tasks:** number, title, type, priority, status, overdue, assignee, department, assigned by, created, due, completed, related request.
- **Information:** number, title, type, priority, status, created by, department, created, published, effective, expires, recipients, read, acknowledged.
- **Filters:** search, status, type, department, person (raised by / assignee / created by), waiting on (requests), priority, overdue only (tasks), and a date range. Click a column title to sort.
- **Download CSV** (opens in Excel) with the same filters, up to 10,000 rows; follows the "Can export" setting and is recorded in the audit log.
- IT Admins and the Super Admin only; read-only; deleted requests are never shown.

## v1.20.1 (25 Oct 2026): home page on the sign-in layout (owner)
- The home page now uses the same blue brand panel as the sign-in page, with the welcome on the white side.
- **Sign in to continue** turns the welcome smoothly into the sign-in form; the brand panel stays in place. With reduced motion it simply opens.
- The brand panel reads "ARS Steels · Internal Workspace". The sign-in pages now always fill the window height.

## v1.20.0 (25 Oct 2026): ARS Internal Workspace, cleaner screens everywhere (owner)
- **New home page:** "Welcome to ARS Internal Workspace", one Sign in button, and Privacy Policy, Terms of Use and IT Support at the bottom. Signed-in people still go straight to their space.
- **New name** in the browser tab, the sign-in page and the installed app: ARS Internal Workspace.
- **Cleaner screens across the app:** instructions on Admin, Super Admin, request, task, information, analytics and profile pages are now in ⓘ hover hints. Statuses, figures, warnings and confirmations stay on screen.
- Nothing changed in how approvals, tasks, information, sign-in or permissions work.

## v1.19.0 (25 Oct 2026): analyst chat, cleaner screens, Try as, AI Rules (owner)
- **Pic bot is a business analyst.** Answers start with the point in plain English, then figures, tables, metric cards and charts for dashboards, insights and next steps. Bold text, lists and tables show properly. No technical details on screen (sources and provider are in the ⓘ).
- **AI Assistant screen** (from the owner's sketch): **+ New chat**, your AI limit (used, remaining, total) and connection status at the top; your chats in the sidebar under **AI Assistant** with a search, newest first. Each chat's **⋯** menu: **Rename**, **Pin to top**, **Delete**. Clicking **AI Assistant** opens a new chat and the list.
- **Removed:** AI Dashboard, Business Intelligence, Insights & Recommendations (old links open the assistant).
- **Super Admin:** **Salesforce Settings** (own page), **AI Details** (Data Sources, AI Reports, AI Activity History), and **AI settings** arranged as General, one card per provider, and Common settings.
- **Try as**, for IT Admins and the Super Admin, on every person's page: a one-time link to open in a private window. Your own session is never replaced; the trial is **view-only** and shows who opened it.
- **AI Rules** (Admin): write the company's rules for Pic bot, for all chats or one chat, in a formatted editor. Every AI provider follows them with every question.
- **Cleaner screens:** page and field instructions are in ⓘ hover hints; on/off settings are switches, lists are checkboxes, choices are dropdowns; thin scrollbars in the theme's colours.
- **Behind the scenes:** three additive database changes, applied automatically when the app starts.

## v1.18.0 (24 Oct 2026): Salesforce "all objects"; Super Admin unrestricted (owner)
- **All Salesforce objects:** enter `*` in AI settings → "Objects and fields Pic bot may read" to let Pic bot read any object the connected Salesforce user can read. Pic bot finds the object, reads its field list from Salesforce, then queries, still read-only, at most 50 rows, and with Salesforce's own permissions (WITH USER_MODE). A fixed list still works as before. The hourly copy needs a fixed list.
- **The Super Admin has no restrictions in Pic bot:** every chat (General, Approvals, Tasks, Information, Salesforce, Combined) and all Salesforce records, whatever their own settings or the global chat switches. Only the emergency stop applies (and Salesforce must be connected). Their user page says so instead of showing boxes.
- **More reliable answers:** up to 6 lookup rounds per question (was 4); a provider refusing a malformed lookup (Groq "tool_use_failed") is retried up to twice; on the last round the model is told to answer from what it has.
- **Smaller Salesforce lists** for providers with low token limits (Groq free tier: 8,000 tokens a minute).
- **Checked locally (UAT sandbox, Groq):** "How many Account records are there?" → 90, from Salesforce.
- **Tests:** the AI-settings e2e now expects seven providers (it failed in CI on v1.17.1 because it still expected four).

## v1.17.1 (24 Oct 2026): NVIDIA default model
- The NVIDIA default model is now **nvidia/nemotron-3.5-bolt-e4b** (from NVIDIA's API reference, owner). Checked locally: Test passed in 0.5 s.

## v1.17.0 (24 Oct 2026): three more AI providers (owner)
- **New providers in AI settings:** **Groq** (groq.com; keys start with gsk_; not xAI's Grok), **Gemini** (Google AI Studio) and **NVIDIA (Nemotron)** (build.nvidia.com; keys start with nvapi-). Each has its key, model, "may see business data" (off by default) and Test, and can be the active or fallback provider. There are now seven.
- **Model names may contain "/"** (for example Groq's openai/gpt-oss-120b or NVIDIA's nvidia/… models).
- **Reasoning models:** the provider Test now leaves room for models that think before answering; when an answer runs out of room, Pic bot says so instead of "empty answer".
- **Checked locally:** Groq test passed (0.8 s, openai/gpt-oss-120b); Pic bot refused data chats while Groq was not approved for business data, as designed.

## v1.16.1 (24 Oct 2026): settings fixes (owner, while testing Pic bot)
- **Saving AI settings no longer needs every provider filled in.** An empty box for a provider you don't use (for example the ChatGPT or Grok model) is simply left unset. Before, the save failed with "Too small: expected string to have >=2 characters".
- **Choices are dropdowns.** Every setting with fixed choices is now a dropdown with plain names instead of a text box, on AI settings and Providers & security: who may see business data (Allowed / Not allowed), active and fallback provider, the on/off switches, feature switches (On / Off / IT team only), Salesforce environment, report downloads and the over-budget rule.
- **Clearer messages** for text that is too short or too long ("Use at least 2 characters.").
- **Docs:** Salesforce connect troubleshooting in CHATBOT_DEPLOYMENT_GUIDE (redirect_uri_mismatch, invalid_scope with an MCP-only app).

## v1.16.0 (24 Oct 2026): Pic bot - ai (owner request)
- **Pic bot - ai** is now a floating assistant on every page:
  - **The logo** sits at the bottom right. Click it to chat without leaving the page.
  - **In the panel:** new chat, your chats (history), delete, copy an answer, retry, stop, and a label showing what the chat may use.
  - **On phones** the panel fits the screen.
- **Chat modes**, set per person by IT (user page → **Pic bot - ai**):
  - **Approvals, Tasks, Information:** answers only from that module, for your own data.
  - **Salesforce data:** live, read-only, only allowed objects and fields, and only your own records unless IT allows all.
  - **General chat:** no company data.
  - **Combined:** your data plus general answers.
  - General and Combined are off until the Super Admin switches them on. Nobody gets anything their modules don't allow.
- **Super Admin → AI settings:**
  - **Switches:** an emergency stop, the launcher, general chat, combined chat and which module chats exist.
  - **Limits:** questions per minute, questions at once per person and for everyone, context and answer length.
  - **Salesforce:** Connect (OAuth with PKCE), Test and Disconnect, the allowed objects and fields, and the callback URL to give Salesforce.
  - **Monitoring:** usage by person, failed answers, security events and live counts, plus a cost estimate if you enter your prices.
- **Behaviour:** a question sent twice (double click or retry) is answered once and charged once. Stop cancels the request to the provider.
- **Measured** with a simulated provider: 10 people asking at once were all answered (about 0.8 s each, plus the real provider's time).
- **Not yet connected:** a real Salesforce org needs a sandbox Connected App from you. Oracle ERP is still not reachable from this hosting.
- **After publishing:** `docs/CHATBOT_DEPLOYMENT_GUIDE.md` §3.

## v1.15.0 (24 Oct 2026): the AI module, and module access per person (owner request)
- **Module access.** Each person now has **Approval, Task, Information and AI** check boxes (Admin → Users & roles → a person's page, or Add user).
  - Everyone keeps exactly what they had (Approval, Task, Information). Nobody has AI until it is ticked.
  - Without a module, its pages are hidden from the sidebar and refused even if the address is typed.
  - The Users list shows each person's modules and filters by them. Nobody can change their own; the Super Admin is never limited.
- **The AI module** (for people with AI ticked), a new **AI** group in the sidebar:
  - **AI Dashboard:** your own live figures from ARS (approvals waiting, requests, tasks, information, suggestions to decide), each showing where it came from. Business sections that need Salesforce or Oracle say so until those are connected.
  - **AI Assistant:** ask in plain words.
    - Answers use only approved data tools and your own data, and show their **evidence** (source and time read).
    - Any figure the AI couldn't find in the data is **flagged**. It can't approve, send or change anything.
  - **Insights & Recommendations:** suggestions the AI recorded for a person to decide. Your manager (or an IT Admin) approves or rejects them; they expire after 7 days; nothing is carried out automatically.
  - **Data Sources:** what each source is, whether it is connected, and how fresh it is.
  - **AI Activity History:** your own conversations only.
- **Super Admin → AI settings:**
  - providers **Claude, ChatGPT, Grok and DeepSeek**, with keys stored encrypted;
  - an active provider and a fallback, switchable at any time, and a **Test** button;
  - per provider, whether it **may see business data** (off by default);
  - daily limits, retention and usage per provider;
  - Salesforce (read-only, hourly).
- **Not yet connected:** Salesforce (needs your sandbox integration user), Oracle ERP (needs a relay inside the ARS network; GoDaddy can't reach it), Power BI datasets.
- **Security update:** zod (the validation library used by every form) 3.24 → 4.6.7, for a high-severity advisory published today (GHSA-mrhx-c7xc-m3w5: oversized inputs could exhaust memory). Two small code changes; every test suite passed again on the new version.
- **Owner steps after publishing:** DEPLOYMENT Part R.

## v1.14.0 (23 Oct 2026): onboarding tour for users (owner request)
- **A guided tour** of ARS Approvals opens by itself the first time each person visits Overview. In 15 short steps it opens each page and highlights what it's talking about:
  - **Approvals:** raising a request, custom approval, approving from Waiting for me, following My requests.
  - **Tasks:** My tasks, giving someone a task, Information notices.
  - **Calendar:** the calendar views and kinds of dates, and connecting Google Calendar.
  - **Everyday:** notifications, Go to and search, going on leave.
- Back, Next and Skip (or ← → and Esc). Finishing or skipping is remembered on every device. Take it again any time: account menu → **Take the tour**, or Help.
- Works on phones (the card sits at the bottom of the screen). Steps for pages someone can't open are left out.
- **User management:** Re-invite and Reset password are now only on each user's page, not on the Users & roles list.

## v1.13.0 (23 Oct 2026): invite users and reset passwords by email (owner request)
- **Add user** has a new tick box, "Email an invitation now" (on by default).
  - Google users are told they've been added and to sign in with Google as their email.
  - User ID + password users get their User ID and a link to set their password.
  - If the email can't be sent, the page says so; the user is still created.
- **Re-invite** and **Reset password** are on each user's page and on every row of **Users & roles**.
  - Reset emails a link to choose a new password. The current password keeps working until a new one is set.
  - Reset shows only for people who already have a password; before that, Re-invite sends the set-password link.
- Choosing the password is still confirmed by a WhatsApp code, as before (owner's choice).
- **Owner:** make sure email (Resend) is set up in Super Admin, or nothing can be sent.

## v1.12.7 (23 Oct 2026): Next.js security update
- **Next.js 15.5.27 → 15.5.28** for two advisories published today: a critical remote code execution in image optimisation with SVG files (GHSA-2464-fhr4-w9xw) and a denial of service through Server Actions (GHSA-p3m5-59mp-jv5r). CI's audit step caught it.
- Nothing changes for users. **Owner: publish soon.**

## v1.12.6 (23 Oct 2026): Google Calendar no longer sends people to "localhost" (owner report)
- **Owner report:** after pressing Allow on Google's screen, the browser opened `localhost:20011/…` and said "This site can't be reached".
- **Cause:** the way back to ARS was built from the address the app sees behind the host's proxy, which is its internal one. The calendar was in fact connected.
- **Now:** the way back is relative, so it always stays on approval.arssteels.net.
- **Owner action:** after publishing, open Profile → Calendar. If it doesn't say Connected, press Connect Google Account again.

## v1.12.5 (20 Oct 2026): "Couldn't reach the server" on submit and delete explained (owner report)
- **Owner report:** submitting or deleting a request said "Couldn't reach the server".
- **Cause:** every publish gives the app's form actions new ids. A page that was already open when the new version went live still uses the old ones, so the server doesn't recognise them and every submit, delete or draft save on that page failed until it was reloaded. The message wrongly blamed the connection.
- **Now:** such a page says "ARS was updated since this page opened… reload", and a **Reload page** banner appears. The banner also appears by itself within a minute of a new version going live.
- **Server errors** now say "Something went wrong on the server" with a reference IT can find in the server log, instead of the connection message.
- **Owner action:** after publishing, reload open ARS tabs once.

## v1.12.4 (20 Oct 2026): file uploads that fail now say why (owner report)
- **Owner report:** attaching a file to a task failed with "Couldn't reach the server", and a custom approval was submitted but its files "couldn't be saved". Both happen when the server can't write to its upload folder (`UPLOAD_DIR`).
- **Super Admin → Overview → File storage:** shows whether uploads work, the folder in use, and the cause with its fix (folder not set, missing, no permission, read-only or disk full).
- **Health check:** `/api/health` now also reports `storage` (`ok` or `failed`).
- **When storage fails:** forms say "Your files couldn't be stored on the server", and what was typed is kept. The task form no longer blames the connection. The Super Admin is alerted (at most once a day), and the server log has the exact error code.
- **Owner action:** open Super Admin → Overview after publishing. If File storage is red, set `UPLOAD_DIR` to the Private Storage path (DEPLOYMENT Part C) and restart.

## v1.12.3 (17 Oct 2026): clearer Google Calendar connect errors
- **Calendar boxes not ticked:** Google now shows each permission as a checkbox. If the calendar boxes aren't ticked, ARS says exactly which two to tick, instead of a generic message.
- **Broader grant accepted:** a broader calendar permission granted on an earlier attempt (`calendar.events`) is accepted; before, it was refused as "no calendar access".
- **No lasting access from Google:** shown separately, with how to fix it.
- **Diagnosis:** the audit log records which permissions Google granted (names only, never tokens) when a connection fails.

## v1.12.2 (17 Oct 2026): ready for Google OAuth verification
- **Public home page** at https://approval.arssteels.net/ for people who aren't signed in: what ARS Approvals is, who runs it, why it asks for Google Calendar access, and links to the policies. Signed-in people still go straight to their space.
- **Privacy policy** (`/privacy`) and **terms of use** (`/terms`), public. The privacy policy describes exactly what the calendar sync reads, stores and writes, and carries Google's "Limited Use" statement. The sign-in page links to both. **Owner: have them approved before filing.**
- **Narrower Google permission:** the calendar sync now asks for `calendar.events.owned` (calendars the person owns) instead of `calendar.events` (every calendar they can see). Every Calendar method the sync uses accepts it, and the calendar picker lists owned calendars only.
- **Logo for Google's Branding page:** `/brand/ars-logo-120.png` (120 × 120).
- **The filing guide** (a shared doc) gives the exact Branding values, the scope justifications to paste, domain verification in Cloudflare, the demo-video script and common rejection reasons.

## v1.12.1 (17 Oct 2026): analytics dropdowns, forced sign-out page, Google Calendar for every domain (owner)
- **Analytics:** the dashboard and "Whose numbers" are now two dropdowns instead of a scrolling row of tabs and chips. Choosing one opens it straight away; the period and comparison carry over.
- **Sign-out after 30 minutes without activity applies to everyone, the Super Admin included** (D-158).
  - When it happens, the page goes to a new **Signed out** page that says why and has **Sign in again** (back to the same space). The reasons it can show: inactivity, the 12-hour limit, signed out on this device, ended from another device or by IT, account switched off, account locked.
  - An ended session stays ended: coming back to the tab doesn't revive it.
- **Google Calendar for people in every ARS domain:** "Error 403: org_internal" is Google refusing accounts outside the project's own Workspace because the consent screen is **Internal**. Set it to **External** and publish it (Google Auth Platform → Audience). The steps are now on the Super Admin Google Calendar page and in DEPLOYMENT Part Q. No code change was needed for other domains: ARS doesn't restrict which Google account a person connects.

## v1.12.0 (16 Oct 2026): the Analytics Center
**One Analytics page, nine dashboards as tabs:**
- Executive overview
- Approval analytics (the existing approval dashboard)
- Task analytics
- Information analytics
- Employee analytics
- Department analytics
- SLA & performance
- Trends & forecasts
- Data quality

**How the boards work**
- **Shared filters:** whose numbers (own, team, department, organisation), the period and the comparison. Filters carry over between tabs.
- **New periods:** Today, Yesterday and Previous quarter.
- **Every board** shows "As of" and India time.

**Executive overview**
- Approvals, tasks and information side by side, each against the previous period.
- Approvals: raised, open, completed, completion rate, turnaround, overdue.
- Tasks: created, open, completed, completion rate, overdue.
- Information: published, awaiting acknowledgement, acknowledgement rate, opened in ARS.
- People: active contributors.
- **Also:** a 12-month activity chart, open and overdue work by module, departments' open work, and alerts. Each alert shows the fixed rule that raised it; there are no predictions.

**Task analytics**
- Status now; due today and in the next 7 days; no due date; reopened, postponed and reassigned.
- Completion and cancellation rates; time to complete (average, median, 90th percentile).
- Completed by the due date, and days late.
- Age buckets (configurable: **Super Admin → Settings → Analytics age buckets**), breakdowns, and the oldest open tasks.

**Information analytics**
- Lifecycle (drafts, scheduled, active, expired, archived).
- Acknowledgement rate over **eligible recipients**, and time to acknowledge.
- "Opened in ARS", kept separate from acknowledgement; email/WhatsApp delivery kept separate from both.
- Pending acknowledgements by age, rate by department, type and sender, and the lowest-rate records.

**Employee and department analytics**
- Each person's and each department's approval, task and information figures, in separate columns and never combined into one score.
- Employees: search, sort and pages.
- Departments: for heads of department and IT.

**SLA & performance:** approval response times by department and step, and task due-date performance by priority.

**Trends:** this period against the comparison period, and 12 months by module. A next-month estimate appears only once there are 12 months of history.

**Data quality:** 14 checks (for example open tasks without a due date, published information with no recipients, people without a department), each with where to fix it.

**Exports:** CSV of the employee, department and 24-month tables, with the same scope and period, and the scope, period and generation time at the top. Needs the Can export permission; audited.

**Not available, and said so on screen (no invented numbers):**
- overdue acknowledgements (information has no deadline field);
- total views (only the first opening is recorded);
- task effort and utilisation, dependencies and recurring tasks (not recorded or not supported).

**Documents:**
- the metric dictionary (`docs/ANALYTICS_METRIC_DICTIONARY.md`, also in the app) now has 76 metrics, each with its board, reliability and limits;
- `application-audit/ANALYTICS_IMPLEMENTATION_TRACKER.md`;
- `application-audit/ANALYTICS_TEST_REPORT.md`.

**Database:** no migration. One new setting (`analytics.aging_days`).

## v1.11.0 (16 Oct 2026): Google Calendar two-way sync, and one calendar for everything
**Super Admin → Integrations → Google Calendar** (new)
- Set up the Google OAuth client. The client secret is stored encrypted and never shown again.
- Set the policies: direction, privacy, event text, conflicts, deletions, reconcile interval, retries, which modules sync.
- **Test configuration** checks the database, encryption, the redirect URI, Google's acceptance of the client, and the job runner. **Enable** works only when every check passes.
- The page also shows health (last 24 h), connected people (with **Revoke** and **Full resync**), failed syncs (with **Retry** and **Retry all**), conflicts, the sync log and the audit history. There is a **Maintenance mode** that pauses syncing.

**Profile → Calendar** (new)
- Each person connects their own Google account. ARS asks only for calendar events, the calendar list and the account email.
- They can choose a calendar, press **Sync now**, review conflicts, reauthorise, and disconnect (optionally removing the events ARS added).

**What syncs**
- **To Google:** approvals waiting on you (by due time), your tasks (by due time), information of types marked **Show on calendars** (on the effective date), your requests' needed-by dates (off by default), and your personal entries.
- **Event text:** private, showing only the reference ("Approval due: PR-0042") and a link. No titles or amounts unless the Super Admin adds {title}.
- **From Google:** your own Google events become personal entries in ARS. Edits and deletions follow both ways.
- **A calendar change never approves, rejects, completes or acknowledges anything.**

**How it syncs**
- Incremental, using Google's sync tokens. Push notifications are renewed automatically, and every connection is reconciled every 15 minutes (configurable).
- A retried sync never makes a duplicate. ARS's own writes are recognised, so nothing loops.
- Failures are retried with backoff and then reported to the Super Admin.

**Calendar page**
- Month, week and day views; filters for Approvals, Tasks, Information, Needed by and Personal.
- Entries from Google are marked, and each entry shows its sync status.
- You can add, edit and delete personal entries.

**Admin → Information types:** a new **Show on calendars** option (off by default).

**Database:** one additive migration (7 new tables, no triggers). There are no new environment variables.

**Before people can use it**, the owner creates the Google OAuth client. See `application-audit/GOOGLE_CALENDAR_INTEGRATION_REPORT.md` §4 and DEPLOYMENT Part Q.

## v1.10.0 (16 Oct 2026): security hardening and website fixes
The owner's 39-point brief: 19 security checks and 20 website fixes. Full detail is in `application-audit/SECURITY_WEBSITE_FIX_TRACKER.md`.

**Security**
- **CSV user import (AUD-01):** an IT Admin can no longer change another IT Admin's email, WhatsApp number or sign-in method by import. This is the same rule as the user form.
- **Start-up seed (AUD-03):** a Super Admin role removed from `itadmin` now stays removed. The seed gives roles only to an account that has none.
- **Page access follows the action (G-3):**
  - Admin actions name their own page, so a Hidden or View-only rule holds wherever the action is posted from.
  - Super Admin addresses refuse everyone else.
  - "Out of office for someone else" needs Full access to Users & roles.
  - The admin Analytics pages check the Admin area themselves.
- **Sign-in & devices** can't be restricted by a page rule, so signing out a lost device always works.
- **Limits:** PDF summaries, quick search, the notification list, downloads, dashboard CSV and the WhatsApp webhook have per-person limits. Going over answers "429, try again in a minute".
- **Headers:**
  - signed-in pages and API answers are `Cache-Control: private, no-store`;
  - API preflights from other sites get no CORS permission;
  - a plain-HTTP visit (as reported by Cloudflare) is sent to HTTPS.
- **Audit log:** it now also records:
  - request submit, hold, resume, withdraw, reopen and resubmit;
  - pausing and resuming report schedules and alerts;
  - dashboard CSV downloads.
- **Approval-type export:** a failure no longer shows an internal error message.
- **New tests:**
  - an API-route and Server-Action inventory, which fails on any unguarded new route;
  - SQL-injection checks for list sorting and search;
  - a cross-user access check (requests, PDF, tasks, files, admin addresses).

**Website**
- **Page titles:** every page has its own browser title (for example "Waiting for me · ARS Approvals"). Record pages never show the record's content.
- **Favicon:** ICO and PNG fallbacks.
- **Logo:** clicking it goes to the space's first page.
- **Copyright:** the year updates itself.
- **Phone menu:**
  - focus moves into the menu, Tab stays inside it, and Escape returns focus to the button;
  - the list scrolls;
  - the bottom bar shows in My approvals only.
- **IT contact and user emails** are clickable (mailto).
- **Discard draft (Custom approval):** uses the app's own confirmation instead of the browser's.
- **Layout check:** an automated test confirms no page scrolls sideways at 360, 390, 768, 1366 or 1920 px across all spaces, every navigation link works, and the 404 page is correct.

**No database migration.** The only database-related change is the seed rule.

## v1.9.2 (16 Oct 2026): the user sidebar, regrouped (owner)
- **Order:** Overview; **My Approvals**; **Tasks**; **Information**; then Search, Calendar and Analytics.
- **Collapsible groups:** My Approvals, Tasks and Information open and close like a dropdown.
  - **My Approvals:** New request, Custom approval, Waiting for me, My requests, My approved requests, Approved by me, Collaborating.
  - **Tasks:** My tasks, Assigned by me, Team tasks, New task.
  - **Information:** Information inbox, Sent by me, New information.
- **Group behaviour:**
  - The group holding the page you're on opens by itself.
  - The groups you open or close stay that way in this browser.
  - A closed My Approvals shows the waiting count on its header.
  - The same groups appear in the phone menu.
  - Groups work with the keyboard (Enter or Space on the header).
- **Admin and Super Admin:** sidebars unchanged.

## v1.9.1 (16 Oct 2026): fix for the v1.9.0 deploy
- **Cause:** the GoDaddy preview stopped at start with "Process exited before becoming ready". The runtime log showed the migration stopping at statement 5 (`CREATE TRIGGER trg_task_events_no_update`): "You do not have the SUPER privilege and binary logging is enabled". The hosted database user may not create triggers.
- **Fix:** the four new triggers, which guard the task and information history against edits, are now optional.
  - If the database refuses them, the migration prints a warning and carries on.
  - The app only ever adds history rows, so it works the same without them.
  - To add them anyway, run `database/optional/v190_append_only_triggers.sql` once in cPanel → phpMyAdmin → SQL.
- **Safety:** the earlier triggers on the audit log, approval timeline and comments are unchanged, and a required trigger that is refused still stops the migration.
- **Deploying:** statements 1–4 of the v1.9.0 migration are already on the database. The next start carries on from statement 5, with the same 15 statements in the same order.

## v1.9.0 (16 Oct 2026): Tasks, Information, the notification bell, module set-up
**For everyone**
- **Tasks** (sidebar → Tasks): create a task of a type IT set up, assign it to someone, and follow it to completion.
  - **Steps:** start, mark blocked (if allowed), complete with a note or file when the type asks, reopen, cancel, reassign, edit, comment and attach files.
  - **Lists:** My tasks, Assigned by me and Team tasks (people who report to you), with quick tabs (open, overdue, due in 2 days, blocked, completed, cancelled), search, filters, sorting and paging.
  - **Reminders:** before a task is due, and once when it is overdue.
  - **Separate from approvals:** a task can point to an approval request, but completing it never approves the request.
- **Information** (sidebar → Information): send information of a type IT set up.
  - **Recipients:** people, departments, groups or (if allowed) everyone, fixed when it's published.
  - **Read and acknowledged are separate:** opening it marks it read; when acknowledgement is asked, recipients press **Acknowledge**. The sender sees who read and who acknowledged.
  - **Lifecycle:** drafts, publishing, withdrawing (recipients are told), archiving and expiry dates.
- **Notification bell:** opens a dropdown with your latest 10 notifications.
  - Filters: All / Approvals / Tasks / Information.
  - Opening one marks only that one read. **Mark all read** is a separate button.
  - **Read more** opens the Notifications page with the same filter, which now has All, Approvals, Tasks, Information and System views.
- **Sidebar:**
  - entries are grouped by module (Approvals, Tasks, Information);
  - it stays in place while the page scrolls;
  - it scrolls on its own only when its entries don't fit.
- **Approvals:**
  - **Changed values re-route a resubmitted request.** If changing a request's values on resubmit changes its route (an amount band or a condition), it restarts from the first level, so no level the new values need is skipped.
  - **One person, one vote per step:** one person can't decide two parts of the same step (for example as a delegate and as a named approver).
  - **Some approval types are limited** to certain departments or people.

**For IT (Admin)**
- **Task types** and **Information types**: the form (same builder as approval types), how they work, and who may create them.
  - **Lifecycle:** draft, check, preview, publish, version history, retire and reactivate.
  - **Versions:** a published version is never changed in place, and records keep the version they were made with.
  - **History:** every change is in the type's history and the audit log.
- **New field types** for every form, approvals included:
  - currency (₹, paise), date and time, multi-select, checkbox, radio buttons and web link (URL);
  - for task and information forms, each field can be shown in lists, matched by search, or changeable later.
- **Approval types: "Who may raise this type"** (everyone, chosen departments or chosen people). IT can always raise it.
- **Reports:** Task register, Task workload by assignee, Information register, Outstanding acknowledgements.

**For the Super Admin**
- **Feature switches:** Task Management and Information Management (Providers & security → Features).
- **Page access:** covers the new pages.
- **Automation:** a new step, "Task and information reminders".
- **Database:** one migration, additive only (`202610160900_v190.sql`). v1.8.0 still runs on it.
- **Fixed from the audit:**
  - AUD-02: resubmit routing.
  - AUD-05: one vote per step.
  - AUD-08: a queued message is no longer marked sent when it couldn't be recorded.

## v1.8.0 (15 Oct 2026): approved lists, custom approval set-up, page access, inactivity sign-out
**For everyone**
- **My approved requests** (sidebar): your requests that were approved.
  - Quick tabs: still valid, expiring, expired, no expiry, amended.
  - Filters: approved by, approved-on dates, type, files, raised and activity dates.
- **Approved by me** (sidebar): every request where you approved a step, yourself or for someone you cover, and what happened after.
  - Quick tabs: still in progress, fully approved, rejected later, withdrawn, for someone else.
  - Filters: step you approved, your approval dates, raised by, their department, and every list filter.
- **Custom approval:** the fields are now set by IT. **Who approves → Specific people** is a search-and-pick box, like Collaborators.
  - Work tasks and FYIs can name anyone in the organisation.
  - Approval steps still list only people who can approve.
  - Options IT has fixed are shown as "(set by IT)".
- **Inactivity sign-out:** you're signed out after 30 minutes with no activity (the Super Admin can change this). Two minutes before, a "Still there?" message offers **Stay signed in**. Typing, clicking or scrolling in the page counts as activity.

**For IT (Admin → Custom approval)**
- **Fields:** set the fields everyone fills in on a custom approval, with the same field builder as approval types (rules, formulas, line items, files).
- **Preview:** see the fields before saving.
- **Step options:** for **All of them must approve**, **Respond within** and **If nobody to approve**, choose the default and whether people may change it. A fixed option is applied by the server whatever is sent.
- **When it applies:** only to new custom approvals; requests already raised keep their own fields.
- **Builder:** the approval type builder also uses search-and-pick for Specific people.

**For the Super Admin**
- **Page access** (Super Admin → Page access): every page of My approvals and the Admin space.
  - Levels: **Full**, **View only** (can look, can't change anything) or **Hidden**.
  - Who: everyone, a department or one person. The person's rule beats the department's, which beats everyone's.
  - **Check what a person can open** shows the result for anyone.
  - The first page of each space can be view-only but not hidden.
  - Enforced on the server: a hidden page is "not found" and leaves the menus; a view-only page shows a note and refuses changes. Every change is in the audit log.
  - Page access never applies to the Super Admin.
- **Sign-out after no activity:** Providers & security → Authentication: 5 to 480 minutes, 30 by default.
  - Applies to users and IT admins, never to the Super Admin.
  - If you had saved a value before (the old default was 120), that value stays until you change it.
- **Database:** one migration, additive only (`202610150900_v180.sql`). v1.7.2 still runs on it.

## v1.7.2 (12 Oct 2026): Collaborating screen, and filters everywhere
- **Collaborating** (sidebar): every request someone added you to follow, on its own screen. "Shared with me" in My requests now opens it.
- **Filters for Collaborating and My requests:**
  - quick tabs with counts (All, Open, Waiting for approvers, Sent back, On hold, Approved, Rejected, Withdrawn, Overdue);
  - search (number, title, who raised it);
  - several statuses at once, approval type (or custom approvals);
  - who raised it, their department and who added you (Collaborating only);
  - the step it's waiting at, and who it's waiting with;
  - overdue, due within 1 to 30 days, with or without files, approval still valid / expiring / expired;
  - date ranges for raised, added to you (Collaborating), closed and last activity;
  - order (newest, oldest, latest activity, due soonest, request number, latest added) and 25, 50 or 100 per page.
  - Every filter in use shows as a chip you can remove. Save filters as a view; you can share it or make it your default.
- **Waiting for me:** the same idea. Besides Show, Approval type and Order, **More filters** has:
  - search, raised by, their department, step;
  - mine or covering for someone;
  - due within, files, raised and waiting-since dates, and per page.
  - Saved views work here too. Bulk approval appears when no filter is in use, as before.
- The filter choices only list people, types and steps from your own lists. A filter can only narrow what you can already see.

## v1.7.1 (10 Oct 2026): navigation tidy-up, reports for IT only
- **Analytics keeps your space:** opening Analytics from the Admin space now stays in the Admin space (`/admin/analytics`, starting at the whole organisation). In My approvals it's still `/users/analytics`. The drill-down lists and "How these are worked out" stay in the same space too.
- **Help and Profile have moved** from the sidebar to the account menu (your name, top right) in every space, next to Notifications and Sign-in & devices.
- **"My work" is now "Overview".**
- **Reports are for the IT team and the Super Admin only.** They are now in the Admin space (**Admin → Reports**), with downloads, scheduled reports, alerts and background exports. Everyone else gets "not found" on the pages and the download links, and Reports is no longer in their sidebar. Old `/users/reports` links take IT to the new place.
  - In the job runner, an existing schedule owned by someone who isn't IT is skipped, and their alert rules are switched off.
  - Analytics itself is unchanged for everyone.

## v1.7.0 (10 Oct 2026): expiry, calendar, deeper analytics, background exports
**For everyone**
- **Approval expiry:** for approval types with "Approval valid for (days)", an approved request shows **Valid until …** (amber in its last 7 days) or **Expired on …**. The requester is told 7 days before. The date is fixed when the request is approved.
- **Needed-by calendar** (menu: **Calendar**): requests by their "needed by" date, by month. Choose "Mine and waiting on me" or "All I can see".
- **Refresh from profile** on a new request puts your current department and designation back into the form.
- **Amendments keep a draft** while you type, like new requests, and appear under Your drafts.
- **Confidential fields:** values IT marks confidential are shown only to the requester, the approvers and IT. Collaborators and advisers see "Confidential", and so do the PDF summary and the change history.

**Analytics and reports**
- **Click a number to see the requests behind it.** KPI cards, bars, chart legends and heatmap cells open a list with the same filters.
- **More filters:** status now, approver, step, response-time state, and how long a request has been open.
- **New numbers:**
  - due today and in the next 7 days;
  - typical (median) time to decide;
  - approved first time;
  - rework rate;
  - withdrawal rate.
- **Compare with** the previous period (this month is compared with the same days of last month), or the **same period last year**. Team and department views show a **comparison with the whole organisation** (rates and times only).
- **New charts:**
  - what became of the requests raised;
  - backlog and overdue over time;
  - decisions and response times passed over time;
  - a **department × step heatmap** of where tasks wait.
- **Saved views:** share a view with everyone (each person still sees only their own numbers), and make one your **default**.
- **Scheduled reports:** change a schedule, and send it to **other people too**. Each person gets the report with their own permissions; anyone who can't see it is skipped.
- **Alerts:** choose a **severity**, **quiet hours** (critical alerts ignore them) and **app inbox only** or inbox and email.
- **Large exports in the background:** up to 50,000 rows for Excel and CSV. You're told in the app when the file is ready; download it from Reports → My exports within 7 days.

**For IT**
- **Form preview** in the workflow builder: try the form, with its rules and formulas, before saving.
- **Move pending tasks** (Workload → Move pending tasks): tick tasks from anyone, choose one person and give a reason. Every task gets its own result.
- **Re-check and fix** on Needs attention, for requests flagged "Workflow state doesn't add up". It makes the task records match the workflow (audited). It never changes the workflow itself and never deletes anything.
- **Duplicate checks** can count anyone's requests, the same person's, or the same department's. New: **must-be-unique fields** (an invoice or PO number can't repeat on an open or approved request).
- When an out-of-office cover ends, both people are told how many approvals are back with the person.

**For the Super Admin**
- **Scheduled jobs stopped** alert: if the 5-minute job run hasn't run for 2 hours, you're told (at most once a day). The check runs when the health check is called or an IT page is opened.
- **Optional download permission:** Providers & security → Feature switches → **Report downloads: ROLE** limits downloads, emailed schedules and background exports to people with the new **Can export** role (plus IT).
- **Backup check:** `npm run db:verify-backup -- <backup file> --into=<empty database>` restores a backup into a separate empty database and proves every table, row count and trigger came back. It refuses the live database. See BACKUP_RESTORE_AND_ROLLBACK.md.
- **Performance:** measured p95 timings and new indexes (docs/PERFORMANCE_ANALYTICS.md). Analytics pages and the readiness check are rate-limited per person.
- Database: one migration, additive only (`202610140900_v170.sql`). v1.6.2 still runs on it, so rollback is a republish.

## v1.6.2 (10 Oct 2026): backups on GoDaddy
- Backups now go to **Private Storage** (`/private/backups`) when `BACKUP_DIR` isn't set: the only folder the app can write to that is kept across publishes. A cPanel home folder (`/home/...`) isn't visible to the app and made backups fail.
- When a backup fails, **Back up now** and **Automation** now say why in plain words (folder not writable, folder can't be created, disk full, database permission), with the folder it tried.
- Deployment guide Part P corrected.

## v1.6.1 (10 Oct 2026): files in forms, and collaborators
**For IT**
- **Attachments as a form field:** in the workflow builder, add a field of type **Attachments (files)**. Make it required (at least one file) and choose up to 1–5 files. Requesters attach files right there, and the files show under that field on the request.

**For everyone**
- **Collaborators:** when you raise a request (standard or custom), add anyone in the organisation to follow it, as many as 20 people. They can see it, comment and add files, and they're told how it goes. They don't approve. Add or remove people later on the request page; a collaborator can stop following.
- **My requests → Shared with me** lists the requests people added you to.

## v1.6.0 (10 Oct 2026): clearer, safer, measurable
**For everyone**
- **A refreshed look:** dark mode, a command palette (Ctrl K), keyboard shortcuts in Waiting for me, clearer errors with a summary at the top, toasts with Undo, and a phone navigation bar.
- **Check before submitting:** see missing fields, missing files, possible duplicates and the budget position before you submit. Possible duplicates need a short reason.
- **Smarter forms:** fields that appear only when needed, worked-out amounts, and line items with GST.
- **Templates and "raise again":** save a request as a template, or start a new one from an earlier request. Your department fills in from your profile.
- **Amend an approved request** (where IT allows it): change the allowed fields with a reason. The approval steps run again; the original approval stays on record.
- **Recall** a request before anyone decides; **answer questions** from approvers; see **links and follow-ups**.
- **Analytics:** your requests, your approvals, your team or department; KPI cards compared with the previous period; charts with table views; aging and response-time status.
- **Reports:** ready-made reports in Excel, CSV or PDF; save filters; have a report emailed to you on a schedule; set alerts when a number crosses your line.

**For approvers**
- **Ask for information**, **ask a colleague for advice**, or **pass one approval** to an eligible colleague.

**For IT**
- **Needs attention:** blocked steps, inactive approvers, requests with no activity, unsent messages and workflow states that don't add up, each with what to do.
- **Submission checks per type:** duplicate fields, minimum files, budget check, amendable fields.
- **Budgets** per department and financial year.
- **Versions:** compare any two, restore an old one as a draft, and **move open requests** to the live version safely.
- **Import and export** approval types between the test and live sites (always as a draft).

**For the Super Admin**
- **Automation:** every background job, its health and history; run now; resend messages that weren't sent.
- **Retention & legal holds:** holds stop records being deleted; the retention dry run shows what a policy would affect (nothing is deleted).
- **Feature switches:** turn new features on, off, or on for the IT team only.

## v1.5.0 (9 Oct 2026): easier every day
**For everyone**
- **My work** (the first page) shows what needs you first: due soon and overdue, waiting for you, returned for changes, your drafts, your recent requests and what finished lately. New people see a short "five things to know" list until they hide it.
- **Drafts:** what you type in a new request or custom approval is saved as you go. Come back to it from My work, or discard it. Submitting removes the draft; drafts go after 30 days.
- **Where is it now?** A line above the level map says who it's waiting for, since when, what comes next, and how many steps are done.
- **Search** finds any request you're allowed to see, with filters; save a search as a view.
- **Phones:** lists become cards, and buttons are easier to tap.
- **Notification settings** (Profile → Notifications → Settings): switch off email or WhatsApp for updates, reminders, comments and FYIs. Approvals waiting for you and security messages always come.
- **@mentions:** type `@` and a User ID in a comment to tell someone who can already see the request.
- **Download PDF** on a request: details, levels, decisions and history in one file.
- **Out of office** explains what your delegate will see, and lists what is waiting for you now.
- **Help** (sidebar): how-tos, what each status means, and **Copy details for IT**.

**For approvers**
- **Approve several at once** on Waiting for me: tick, review the list, approve. Work tasks and requests on hold are done one by one.
- A **due soon** heads-up comes before the response time runs out.

**For IT**
- **Workload** (Admin): who has how much waiting, how old it is, what is overdue.
- **Hand over** suggests the people with the fewest approvals waiting.
- **Test mode** shows which way each choice went, why steps were skipped, and how the route differs from the live version; it also says which requests a publish would affect.

**For the Super Admin**
- An alert (once a day) if the scheduled jobs or the daily backup fail.
- Every page and error has a **reference** that matches the server log.

## v1.4.0 (9 Oct 2026): everything pending
**For everyone**
- **Work tasks:** after approval, a step can hand work to someone, often the requester (e.g. raise the PO). It shows as **To do**, and they press **Mark as done**.
- **FYI steps** tell people (e.g. Finance) that a request reached a point; nothing to do.
- **Waiting for me** and **Notifications** have pages; custom approvals take attachments.
- New messages: task for you, FYI, request resumed, changes made, request removed, request moving again.
- The app can be installed on a phone ("Add to Home screen").

**For IT**
- **Builder:**
  - step kinds (approval, work, FYI);
  - approvers by **designation** (optionally the requester's department);
  - rules with several conditions (**all** or **any**);
  - choices inside choices;
  - a warning before leaving with unsaved changes.
- **Stuck requests** show **Stuck: needs IT** on the request page: give the step to people, skip it, try again, or pick a path.
- **Approval types:** remove one that was never used, or archive it; choose where a resubmitted request restarts; make a good custom approval into an approval type.
- **Escalation** goes up the management chain (up to 3 levels).
- Dashboards count approvals only (not work tasks).

**For the Super Admin**
- **Backups:** daily, plus **Back up now**, with a tested restore (deployment guide Part P).
- **Audit log CSV download**, and **Sign-in history**.
- **WhatsApp delivery receipts** (with the webhook), and a **health check** for an uptime monitor.
- Optional **origin lock** to Cloudflare, and optional **Power BI views**.

**Fixes and hardening**
- **Deleting a request:**
  - closes it properly;
  - tells the people waiting.
- **Publishing:** two people publishing at once can't clash.
- **Handover:** the new approver gets the full response time.
- **Hold:** time on hold doesn't count against the response time.
- **Request numbers:** the year follows India time.
- **Updates:** a failed update can carry on where it stopped.
- **Sign-in:**
  - a locked account isn't revealed to guessers;
  - "This wasn't me" links work once.
- **Google sign-in** accepts Google identities only.
- **IT Admin accounts:** one IT Admin can't change another's contact details.
- **Settings and logs:** safer provider settings and log masking.

## v1.3.6 (9 Oct 2026): fixes from the application audit
- **Fixed:** on an admin's user page, **Deactivate user** and **Sign out everywhere** now ask for confirmation and then work. Before, they did nothing.
- **Idle sign-out:** you're signed out after **2 hours without activity** (Super Admin can set 15–720 minutes under Sign-in security). Sessions still end 12 hours after sign-in.
- **Safer sign-in links:** after signing in, the app only returns you to a page inside this site.
- **One-time codes:** the limit of wrong tries per code now holds even for simultaneous guesses.
- **Messages waiting for a retry** (which can contain set-password links) are stored encrypted and deleted once sent, or after 7 days.
- **Email sending** gives up after 15 seconds instead of waiting indefinitely, and is retried by the job runner.

## v1.3.5 (9 Oct 2026)
- **Profile page:** in My approvals, the sidebar now has one **Profile** entry. It shows your details (department, designation, reporting manager and more), with tabs for **Notifications**, **Out of office** and **Sign-in & devices**. Old links still work.
- The account menu (top right) has a Profile link.
- New: `docs/APPLICATION_CURRENT_STATE_AUDIT.md`, a full audit of what is built, verified, missing and at risk.

## v1.3.4 (9 Oct 2026)
- **Security updates:** Next.js 15.5.27 and firebase-admin 14.5.0. The production dependency audit is now clean (0 known vulnerabilities).
- **Sign-in protection:** the per-address sign-in limit now uses the visitor's real address from Cloudflare, so it can't be dodged by faking a header.
- **Email** is sent from `no_reply@approval.arssteels.net` by default (replies still go to IT).
- **Super Admin → Message deliveries** shows when the job runner last ran, and warns if the cron job isn't running.
- The deployment guide has a step-by-step cron job setup (Part I).

## v1.3.3 (9 Oct 2026)
- The "People" picker (custom approvals and workflow steps) now has an accessible name for screen readers.
- Live notification test: WhatsApp works for request events. Email is blocked by Resend (HTTP 403) until the sending domain is verified in the Resend account that owns the API key (see DEPLOYMENT.md G2).

## v1.3.2 (9 Oct 2026): fix from the live test
- **Live fix:** the Import data page and the Audit log raised a page error (React #418) on the live site. Cloudflare rewrote the email addresses they showed. Addresses are now shown so Cloudflare leaves them alone, here and in everything people type (request titles, comments, field values, timeline, notifications, out-of-office reasons).
- A new automated check fails the build if any page shows an address in a form Cloudflare would rewrite.

## v1.3.1 (9 Oct 2026): reliability fixes from the QA audits
- **Forms no longer crash the page.** When the server errors, the connection drops, an upload is cut off, or the session has ended, the form now says so ("You're offline…", "Couldn't reach the server…", "Your session has ended…") and keeps what you typed. Before, the page went blank with "Application error".
- **No endless spinners:** after 30 seconds a form stops waiting and says the action may still have gone through.
- **Loading feedback:** a spinner on the menu link you clicked, and on dashboard period and page links. Quick period changes now always show the period you clicked last.
- **Readable busy buttons** (contrast 4.72:1, was 1.42:1); buttons keep their size while busy; screen readers hear "Working…".
- A friendly error page instead of a blank one, if anything else goes wrong.
- Workflow builder: every field has an accessible name.
- Audits: `docs/qa/LOADER-QA-REPORT.md` (retest: 70/70 executed pass) and `docs/qa/E2E-QA-REPORT.md`.

## v1.3.0 (8 Oct 2026): the form field creator
- **Fixed after testing key by key:**
  - **Dropdowns:** options are now a list. Type one and press Enter or **Add option**, or paste several at once. Duplicates are refused. Before, the box dropped every comma, so only one option could be made.
  - **Field keys** follow the whole label (before, "Delivery Date" became `d`). Saved keys are locked.
  - **Number boxes** keep a decimal point or a minus sign while you type.
  - **Dates in conditions:** "skip when *Needed by* is before / after …" uses a date picker and now works. Every condition's value box matches its field: a dropdown for options and lists, people for a person, numbers for amounts.
- **New: Department and Designation fields from the database.** The requester picks from the live list of active departments or designations; conditions can use them, e.g. skip a level for one department.
- **Help text** under any field.
- **Test mode** keeps the valid sample values even when one is wrong.
- **The request page** shows a level as "Skipped: <reason>" as soon as its condition applies, not only when it is reached.
- Dates show as 01 Dec 2026.

## v1.2.0 (8 Oct 2026): approver designations, request deletion, dashboards
- **Approver designations:** Admin → Departments → Designations has an **Approver** tick. Tick Manager and above.
  - Only people whose designation is ticked can be chosen as approvers: named workflow and custom approval steps, approver group members, department HOD, reporting manager, out-of-office delegate, handover, and person fields that pick an approver.
  - Choices already saved stay valid until changed.
  - Every existing designation starts ticked; untick the junior ones. New designations start unticked.
  - Import has a new `approver` column for designations.
- **Super Admin → Requests:** every request, searchable, with **Delete** (a reason is required). Also on the request page.
  - A deleted request leaves every screen, queue, reminder and report, and its pending approvals are cancelled.
  - The **Deleted** tab and the audit log keep who, when and why. There is no undo.
- **Admin → Dashboards**, four pages, each with a date, type and department filter and a CSV download:
  - **Utilisation**: every approval type, used or not;
  - **Department-wise raised**;
  - **Approver-wise**: given, decided, waiting, overdue, average time, on-time %;
  - **Raiser-wise by department**: with department subtotals.
  - The default period is the financial year to date.

## v1.1.0 (8 Oct 2026): bulk import
- **Import data** in the Admin and Super Admin spaces, for **Users, Departments, Designations, Approver groups and Holidays**:
  - **Download template** (CSV with the header row) or **Download current data** (the same columns, filled in, to edit and re-upload);
  - **Upload → Check file**: a dry run that shows new, changed, unchanged and problem rows, every problem by row and column, and a downloadable problem list;
  - **Import**: all rows in one go, or none.
  - The same rules as the forms: only the Super Admin grants Super Admin; password sign-in needs WhatsApp; no reporting loops; emails and numbers stay unique.
  - Each change and each import is in the audit log, and people whose WhatsApp number or sign-in method changed get the usual alert.
- **Loaders:** spinners on Download, Check and Import; a "Checking… / Importing… please keep this page open" bar; the controls are locked while working; a skeleton while the page loads.
- An **Import** button on the Users, Departments, Approver groups and Working calendar pages.

## v1.0.6 (8 Oct 2026): UI polish
- **Spaces:** My approvals, Admin and Super Admin are now called *spaces*. Your name at the top right opens one menu with your space, **Switch space**, Notifications, Sign-in & devices and **Sign out**.
- **Phones:** a menu button opens the page list as a drawer. Before this there was no menu below tablet width.
- **My approvals:** "Welcome back", compact counters that open the matching list, the top 5 items waiting and recent; My requests has one bar for search, filter and New request.
- **Admin:** the overview shows every module as a live card with counts (no more "Being built").
- **Super Admin → WhatsApp templates:** a status panel (how many are live, last sync, Sync button), short message names with the description behind "?", and tidy Open/Create buttons.
- Clearer active menu item, hover on cards and rows, softer cards, and content centred on wide screens.

## v1.0.5 (8 Oct 2026)
- **The Super Admin signs in with Google as `itsupport@arsenergy.co.in`** (D-082). `itadmin@arssteels.co.in` is an alias of another mailbox, and Google always reports the primary address, so it never matched (`UNKNOWN_ACCOUNT`).
- A one-time migration moves the bootstrap account (User ID `itadmin`, all its roles) to the new email.
- The bootstrap seed no longer overwrites the account on every start, so later edits in Admin → Users stay.

## v1.0.4 (8 Oct 2026): first live fixes
- **Email addresses on pages no longer break the page.** GoDaddy's Cloudflare layer rewrote any address in the HTML (email obfuscation) and injected a script the CSP blocks, which caused React error #418. Addresses are now rendered so Cloudflare leaves them alone; they look the same.
- **Google sign-in:**
  - the Firebase private key is accepted with or without surrounding quotes, as literal `
`, real line breaks or CRLF;
  - when a Google token can't be verified, the reason is written to the runtime log (never the token).

## v1.0.3 (8 Oct 2026)
- **Build fix:** `npm run build` removes the old `.next` folder first. GoDaddy reuses the app folder between builds, which broke Next.js with `ENOENT rename …/export/500.html`.
- **Email sender** is now `approvals@arssteels.net`, the domain verified in Resend. A new **Reply-to** setting defaults to `itadmin@arssteels.co.in`, so replies reach IT. Both can be changed in Super Admin → Providers & security → Email.

## v1.0.2 (8 Oct 2026)
- `npm start` now applies the database migrations and seeds before starting, so the default start command on GoDaddy creates and updates the database by itself. GoDaddy's "Import SQL" answered "Unauthorized", and the importer drops existing tables. `npm run start:app` starts without migrating.
- Deployment guide Part B updated: automatic setup first; the SQL import only as an option, with its warnings.

## v1.0.1 (deployment helpers, 8 Oct 2026)
- `npm run start:production` applies the database migrations and seeds, then starts the app. GoDaddy's Node.js hosting may have no terminal, so the first start sets up the database by itself, and later releases migrate themselves. Both scripts skip what's already done.
- `npm run db:check` runs the MySQL privilege check (triggers).
- `docs/DEPLOYMENT.md` is rewritten as a complete step-by-step guide (Parts A–O) for the "Deploy your Node.js app" wizard, including Resend domain verification, a new CEOITBox key, the secrets-file import, cron and troubleshooting.
- No change to app behaviour.

## v1.0.0 — first production release (8 Oct 2026)
The ARS Approval Platform: **multi-level approvals in any custom manner**. It replaces the 104 Asana approval projects.
Deploy with `docs/DEPLOYMENT.md`.

### What's in it
- **Sign-in and security:**
  - Google sign-in;
  - User ID + password with a WhatsApp code;
  - new-device alerts and "This wasn't me";
  - lockout and rate limits;
  - 12-hour server-side sessions;
  - strict security headers and CSP;
  - append-only audit log;
  - break-glass account.
- **Role areas:** `/users` (everyone), `/admin` (IT team), `/superadmin` (itadmin@ only). Everyone else gets a plain 404.
- **Approval engine:**
  - any number of levels;
  - sequential or parallel steps, with all / any-one / any-N approvers;
  - choices (if / otherwise) and skip rules;
  - approvers from people, groups, roles, the requester's manager or HOD, a named department's HOD, or a person picked on the form;
  - the requester never approves their own request;
  - a level with nobody to approve is blocked and IT is told, never silently passed.
- **DoA per approval type:** a matrix of amount limits × levels, set when the approval type is created. The DoA view shows every type's bands.
- **Requests:**
  - raise, approve, reject (reason required), ask for changes, then resubmit on the same number;
  - hold and resume;
  - withdraw by the requester; reopen by the Super Admin;
  - comments and attachments (PDF, images, Office, CSV, text; checked and never deleted);
  - custom approvals, where anyone routes to anyone;
  - My requests with search, a status filter and paging.
- **Out-of-office delegation; handover** of a leaver's approvals.
- **Response times on a working calendar** (working days and holidays), with reminders and escalation.
- **Notifications:**
  - in-app, email (Resend) and WhatsApp (CEOITBox);
  - an outbox, so nothing is lost on a crash;
  - automatic retries and a delivery log.
- **WhatsApp template creator:** write, submit to Meta, sync the status (approved goes live by itself), and test-send, through the CEOITBox API. Synced daily.
- **Insights** for IT: what's waiting where, how long each level takes, what's overdue.
- **Demo data** for trying the system before the real staff list, with **Try as**.

### Quality
- **Automated checks:** 213 unit tests, 53 MySQL integration tests and 15 browser end-to-end tests; lint, typecheck and a production build in CI on Node 22.
- **QA suite:** `docs/qa/QA-TEST-SUITE.md`, 600 test cases with smoke, sanity, regression and critical suites.
- **Defects fixed before release (S8-06):**
  - a negative amount skipped DoA levels;
  - a retried submit made a duplicate request;
  - a request raised twice from two tabs;
  - notifications lost on a crash;
  - an attachment limit race and duplicate uploads;
  - long comments cut without warning;
  - a WhatsApp template deleted at CEOITBox stayed live;
  - no search in My requests;
  - line breaks in email subjects.
- **Fixed during release preparation:** on Node 22 (GoDaddy) an empty file box made every plain submit fail. CI caught it; now fixed.

### Decisions kept as they are (owner, 8 Oct 2026)
- One person may approve more than one level of a request, directly or as a delegate.
- Requests don't expire.
- Rejection is final; "ask for changes" is the route back.

### Needs the owner after deploy
- Firebase Admin values.
- A Resend key.
- A **new** CEOITBox key for this app.
- The cron job.
- The `UPLOAD_DIR` folder.
- Submitting the 19 remaining WhatsApp templates.
- The real staff list, or the demo data in the meantime.
- Q-015: break-glass sign-in without WhatsApp.
