# Release notes

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
