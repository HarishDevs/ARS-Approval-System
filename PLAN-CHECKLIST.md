# ARS Approval Platform — Plan & Checklist

> **Mandatory living file.** Every task is planned here *before* it is started and ticked here when it is done.
> Rules:
> 1. Never delete an item. When something no longer applies, mark it `[~]` with a reason and date.
> 2. Tick with the date: `[x] … (done 28 Sep 2026)`.
> 3. New work found mid-task gets a new checklist item first, then the work.
> 4. At the start of each session read ★, §Now, and the open questions in DEVELOPMENT-MEMORY.md §4.
> 5. At the end of each session update §Now, tick the items, and add a log entry in DEVELOPMENT-MEMORY.md §5. Record any new or changed flows in FLOWS.md.
> 6. The coverage map at the bottom must show every requirement mapped to at least one item. Nothing is left behind.

Legend: `[ ]` to do · `[>]` in progress · `[x]` done · `[~]` not applicable (with reason) · `[?]` blocked by an open question

---

## ★ North star
**Multi-level approvals in any custom manner.** The engine must support any number of levels in any combination: sequential, parallel, any-one, any-N-of-M, conditional and hybrid. Approvers can come from any source, and levels can be added or skipped by rules. Build the engine for this from the first engine phase (P2). The drag-and-drop designer (P3) is only the screen for building it. Check every task against this.

## Now / Next
- **Now (10 Nov 2026, later):** v1.51.0: **Meeting Management** (D-301): schedule, points and MOM approved by the Meeting Owner, action items become tasks, follow-up register and follow-up meetings, dashboard, Admin → Meeting settings. One migration on start. **Owner:** publish; in Admin → Meeting settings add ED and MD to the Management group; review the meeting types. Next: legacy register import, MOM PDF, Task Management phases.
- **Before:** v1.50.3: follow-ups from New request; "You don't have access" screen. v1.50.2: no false failure messages (messages sent after the answer); Task Management audit in docs/task-management-audit (awaiting owner approval and decisions before development). v1.50.1: task email links open for the people on the task (no Task module needed); task priorities Critical / Most Important / Important / Normal (one additive migration on start). v1.50.0 go-live release: work task priority/due date, Work tasks card, linked-request search, PDF like the screen, security fixes, shorter wording. **Owner:** confirm ORIGIN_SECRET is set on GoDaddy (security review #2); publish. v1.49.6: welcome email on create and import (links 12 h), users bulk actions, Home tidy-up, Due date column. Next: Q2–Q5 (linked-request search, work-task priority/due date into Task Management, linked items on the request page, PDF like the screen) as v1.50.0. v1.49.5: My Approvals pages by designation (requesters see four), request highlights its own list, no Open card, no cards on My approved requests, Super Admin Delete selected. v1.49.4: notifications panel layout. v1.49.3: users list ⋮ actions and Department filter; see-through dropdowns fixed. v1.49.2: module access in the users import; v1.49.1: import with Excel templates and uploads (and tab CSV). **Owner:** publish; import ars-1-departments-no-hod.xlsx → ars-2-users-with-modules.xlsx (fill modules) → ars-3-departments-with-hod.xlsx (designations HOD, EXEC, DMGR, SEXE must exist).
- **Before (2 Nov 2026):** v1.49.0: the ARS GREEN STEEL CMS brand (D-287), New request / New task straight to the form, Classic tab bar fix (D-288). **Owner:** publish v1.49.0; rename the OAuth consent screen app to "ARS CMS" in Google Cloud (Q-027); reopen or reinstall the phone app for the new icon.
- **Now (2 Nov 2026):** v1.48.1: slimmer journey, hover details with the approver, the folded header road (D-285). Publish v1.48.1.
- **Now (2 Nov 2026):** v1.48.0: the new Approval Journey (computer and phone), the request page re-laid out, one colour per status (D-283, D-284). No migration of its own. **Owner:** publish v1.48.0 (contains everything since v1.46.0).
- **Now (2 Nov 2026):** v1.47.1: priority colours everywhere (D-282). Publish v1.47.1 (it contains v1.47.0 and v1.46.0).
- **Now (2 Nov 2026):** v1.47.0: request priority and coloured choices (D-281), on top of v1.46.0. No new migration (v1.46.0's one still runs on start). **Owner:** publish v1.47.0; in Admin → Custom approval give the Priority options their colours and save.
- **Now (2 Nov 2026):** v1.46.0: everything still buildable is built, and the owner's 16 decisions of today are in (D-276 to D-280). **One migration** runs on start (form rules converted; backup table kept). **Owner:** publish v1.46.0 (`npm ci`); then the steps in `docs/GO_LIVE_READINESS_CHECKLIST.md` (v1.46.0 section): `DB_POOL_SIZE`, `/api/health/deep` clock offset, `ORIGIN_SECRET` (tile), `BACKUP_ENCRYPTION_KEY` + Google Drive backup + Test, WhatsApp templates (tile), Google Calendar consent screen External and published (Q-024), phone UAT.
- **Now (2 Nov 2026):** v1.45.0: the phone app laid out like Asana (D-275), on top of v1.44.1. No migration. **Owner:** publish v1.45.0 (contains v1.44.1 and v1.44.0), then try it on a phone (V145-09).
- **Now (2 Nov 2026):** v1.44.1: phone fixes: the notifications panel fits the screen; a skeleton for each phone screen while it loads (D-274). No migration. **Owner:** publish v1.44.1 instead of v1.44.0 (it contains it), then the v1.44.0 steps below.
- **Now (2 Nov 2026):** v1.44.0 (includes v1.43.0): the approval journey (D-273), background work steps, the phone layout (D-272), tasks from approvals highlighted (D-270), the QA pass fixes (D-271). No migration. **Owner:**
  1. Publish v1.44.0 (`npm ci`).
  2. Set `DB_POOL_SIZE` in Secrets to your MySQL plan's limit (default 10; see DEPLOYMENT B2).
  3. Open `/api/health/deep` on live: `dbClockOffsetMinutes` should be 0 (QA-DB-02); tell IT if not.
  4. Approve (or not) the optional index script `database/optional/v1421_qa_indexes.sql`; IT runs it in phpMyAdmin.
  5. UAT on real phones (docs/mobile/PWA_VALIDATION_REPORT.md) and the journey (V144-08).
- **Now (1 Nov 2026):** v1.42.1: the Classic view's Create task as a Tally-style floating window and every Classic layout checked and fixed (D-267). Publish it with v1.42.0 (no migration).
- **Now (1 Nov 2026):** v1.42.0: the remaining screens, editable task tables, New request gating, the request page re-laid out, Home redesigned (Approval Overview / My Work, approvers start on Approvals), the ARS-CMS brand, loaders and animated outcomes (D-259 to D-266). No migration. **Owner:**
  1. Publish v1.42.0 (`npm ci` installs the new `lottie-web` package).
  2. On phones with the app installed, remove and install it again to get the new icon.
  3. IconScout (MCP connected): the free daily limit stopped 4 downloads (Cloud uploading, Document Search, Document Checklist, Document Download); fetch them next session (docs/brand/ANIMATION-REFERENCES.md).
- **Now (1 Nov 2026):** v1.41.0: installable app, phone and desktop notifications (Web Push), the daily session, the approval road, My requests and New request redesigned, tables and Analytics fit the window (D-250 to D-258). **Owner:**
  1. Publish v1.41.0; the migration runs on start.
  2. Super Admin → Settings → Phone & desktop notifications → **Generate keys**.
  3. Check the Daily session setting (default: phones, tablets and the app).
  4. On your phone: install, turn notifications on, Send a test.
  5. Admin → Notifications: send a test to yourself.
  6. Still to do (V141-14): Calendar, Kanban board, Draft task and the Analytics employee/department/SLA boards laid out like the reference.
- **Now (1 Nov 2026):** v1.40.0: every audit defect addressed (D-243 to D-247; `audit/MASTER_DEFECT_REGISTER.md` Remediation). **Owner:**
  1. Publish v1.40.0. Two additive migrations run on start.
  2. Set `BACKUP_ENCRYPTION_KEY` in cPanel and keep a copy off the server.
  3. Enter the off-site bucket in Super Admin → Settings → Off-site backup.
  4. Point the uptime monitor at `/api/health/deep`.
  5. Run the restore drill (OPS-07, checklist in `docs/RECOVERY_OBJECTIVES_AND_INCIDENT_RESPONSE.md`).
  6. Approve or adjust the draft RPO/RTO there (OPS-10).
  7. Switch on the weekly HOD report if wanted.
- **Now (31 Oct 2026):** independent audit of v1.39.0 done (`audit/FINAL_APPLICATION_AUDIT_REPORT.md`): 45 defects, 1 High. **Owner:** approve the fixes. First **SEC-02** (Super Admin pages need their own guard; a hotfix, as the site is live), then OPS-07 (restore test), DB-004/DB-005 (approval edge cases), and the rest by priority in `audit/MASTER_DEFECT_REGISTER.md`.
- **Now (31 Oct 2026):** v1.39.0: workflow working draft saved on the server as you edit (D-241, Q-026 answered; never publishes) and one condition builder for workflow and form rules (D-242). **Owner:** publish v1.39.0: the migration adds one column (`workflow_versions.draft_revision`, runs on start; rollback in docs/ADMIN_CONFIGURATION_STUDIO_DEPLOYMENT.md). The Configuration Studio brief is complete.
- **Now (31 Oct 2026):** v1.38.0: Workflow Designer (D-239: flow map, fold, drag, duplicate, remove with Undo, problems by level, browser copy of unsaved work, Test mode inputs) and the settings console (D-240: categories, search, one Save per category; AI one form). **Owner:** publish v1.38.0 (no migration); decide Q-026 (server-side workflow drafts). **Next:** the shared condition builder if wanted (changes saved JSON).
- **Now (31 Oct 2026):** v1.37.0: Form Designer (D-235: reorder, confirm-before-remove, undo; DoA dropped from custom approvals), Home = Overview + Task home (D-236), sidebar without Search, space named Central Management System, one Inbox with Notifications as a Profile page (D-237), Draft task toolbar like Asana (D-238). **Owner:** publish v1.37.0 (no migration); try Create → Task: / for the menu, @ to mention, paste a screenshot. **Next:** Workflow Designer and Settings console (D-235e/f; the autosave migration is additive and will be shown before it runs).
- **Now (31 Oct 2026):** v1.36.0: the 24 UX laws applied (D-234; docs/UX_*). **Owner:** publish v1.36.0 (no migration); decide whether Users & roles should move up the Admin menu (recorded in the UX audit).
- **Now (31 Oct 2026):** v1.35.0: every UI state audited and completed (D-233; docs/UI_STATE_*_REPORT.md). **Owner:** publish v1.35.0 (no migration beyond v1.34.0's); Super Admin → Settings → General → Maintenance notice to warn everyone of downtime.
- **Now (31 Oct 2026):** v1.34.0: Classic view like Tally on every screen (D-227); Asana's toolbar look on every list (D-228), collapsible sidebar (D-229), profile with photo (D-230), notification control centre (D-231), universal search (D-232). **Owner:** publish v1.34.0 (migration 202610311200 adds the photo, About me and the in-app choice; photos go in UPLOAD_DIR/profile-photos); switch to Classic (profile menu → View) and try New request: Enter moves field to field, Ctrl+A accepts.
- **Now (31 Oct 2026):** v1.33.0: Tasks & projects in the sidebar (D-223), Draft task for Myself or Others (D-224), My Tasks Overdue (D-225), the list toolbar everywhere (D-226). **Owner:** publish v1.33.0 (migration adds the Overdue section); try My requests → Filter / Sort / Group.
- **Now (30 Oct 2026):** v1.32.0: ticks everywhere, periodic and ad hoc tasks, Asana-style Tasks area (left bar, task pane, Home, Inbox), compact table with Filters/Sort/Groups/Options and saved tabs, Share for projects and tasks, Draft task, New project step by step (D-219, D-220), the sidebar + Create (D-221), periodic/ad hoc rules and Project permissions (D-222). **Owner:** publish v1.32.0 (migrations add saved tabs, task groups and project permissions); try Tasks → My tasks, a project's List, Share and New project.
- **Now (30 Oct 2026):** v1.31.0: repeating tasks, project fields, templates and copies, bulk actions, task inbox, morning summary, department holidays (D-218). **Owner:** publish v1.31.0 (migration runs on start); check Admin → Task set-up → Task settings (summary at 9:00 on working days, repeating tasks on); add department holidays there; email needs the Resend key already in Super Admin settings.
- **Now (30 Oct 2026):** v1.30.0: Task & Project Management (D-215: projects, sections, list/board/calendar/timeline, subtasks, dependencies, comments with mentions, followers, likes, My Tasks, Task home, task search), multi-level reporting hierarchy (D-216) and holidays for tasks (D-217). **Owner:** publish v1.30.0 (migration runs on start and adds the General task type); check Admin → Task set-up → Task holidays (default: warn); keep reporting managers correct in Admin → Users (the hierarchy follows them); add holidays in Working calendar or Task holidays.
- **Now (29 Oct 2026):** v1.29.0: custom loaders (sign-in, Classic) and complete Classic navigation (D-214). **Owner:** publish v1.29.0.
- **Now (29 Oct 2026):** v1.28.1: Classic view keyboard fixed (D-213). **Owner:** publish v1.28.1.
- **Now (28 Oct 2026):** v1.28.0: text size in the Classic view (D-211). **Owner:** publish v1.28.0; profile menu → View: Classic → Text size.
- **Now (28 Oct 2026):** v1.27.0: Classic (Tally-style) view per person (D-210) and Admin reminder/escalation rules on any field (D-209). **Owner:** publish v1.27.0 (migration runs on start); build rules in Admin → Reminders & escalations (Test first; records already past a stage get it on the next run); try Classic from the profile menu → View.
- **Now (28 Oct 2026):** v1.26.0: sign-in method "Both" (Google or User ID + password + WhatsApp code) per person (D-208). **Owner:** publish v1.26.0 (migration runs on start); set people to Both in Admin → Users → the person → How they sign in (they need a WhatsApp number), then Re-invite so they can set a password.
- **Now (28 Oct 2026):** v1.25.1: My Approvals menu order and "My pending requests" (D-207). **Owner:** publish v1.25.1.
- **Now (27 Oct 2026):** v1.25.0 (D-206): DoA / choice / skip on New request only when IT switches them on (Admin → Custom approval → What people may add; off by default); "Request templates" and "New request" names; Tasks order; Analytics per person; "Opening…" fix. **Owner:** publish v1.25.0; switch on any of the three options you want people to have.
- **Now (26 Oct 2026):** v1.24.0: Pico Bot's Salesforce guide (D-205) loads into Admin → AI Rules → Salesforce on publish (only if that page is empty). **Owner:** publish v1.24.0; open AI Rules → Salesforce chats to review or adjust it; refresh it when Salesforce changes (edit docs/AI-RULES-SALESFORCE.md or the page).
- **Now (26 Oct 2026):** v1.23.3: big requests (360 dashboards) work: Salesforce chat no longer refuses itself, longer answers, 8 lookup rounds, final-round fix for Claude, identity and bank fields hidden (D-204). **Owner:** publish v1.23.3; if "Longest answer" was saved as 1200 in AI settings, raise it to 4000; tell people the dealer code is the Customer Code; don't rely on Groq's free tier as the fallback for Salesforce dashboards.
- **Now (26 Oct 2026):** v1.23.2: the question leaves the box when sent and returns only on failure (D-203). **Owner:** publish v1.23.2 (includes v1.23.1).
- **Now (26 Oct 2026):** v1.23.1: Pico Bot reliability (D-202): everyday names in lookups, cut-off lists flagged, unanswered questions dropped from context, looser tool-call shapes, smarter retries, 5-minute wait on the assistant page. **Owner:** publish v1.23.1; keep Claude (or a larger NVIDIA model) for Salesforce chats; Pico Bot reads the UAT sandbox: reconnect to production when ready (PB-15).
- **Now (26 Oct 2026):** v1.23.0: Pico Bot accuracy (D-201): Salesforce dates, lookup names, labels, two-level breakdowns, invented figures blocked, secret fields never readable. **Owner:** publish v1.23.0; start a **new chat** (old chats still hold the invented answers); consider Claude or ChatGPT for Salesforce chats (NVIDIA Nemotron follows tool rules poorly).
- **Now (26 Oct 2026):** v1.22.4: split-screen home page back, with the content Google's review needs (D-200). Rollback to approval.arssteels.net verified live. **Owner:** publish v1.22.4; Google Branding links on approval; resubmit verification.
- **Now (26 Oct 2026):** v1.22.3: rolled back to approval.arssteels.net (owner, D-199). **Owner:** docs/DOMAIN-MIGRATION.md → Rollback: DNS A record `approval`, GoDaddy domain, APP_BASE_URL, LEGACY_HOSTS=arssteels.net,www.arssteels.net, publish v1.22.3, cron and CEOITBox URLs, Google Branding links, resubmit verification.
- **Now (26 Oct 2026):** v1.22.2: the home page is a public page about ARS-CMS (D-198) for Google's review. **Owner, urgent:** the cron job and CEOITBox webhook must call https://arssteels.net (job runner LATE; the old address returns 404); reconnect approval.arssteels.net to the GoDaddy app as an extra domain so old links redirect. Then publish v1.22.2 and resubmit Google verification.
- **Now (26 Oct 2026):** v1.22.1: Google's OAuth review failed because arssteels.net still shows GoDaddy "Coming Soon"; home page now states its purpose (D-197); DOMAIN-MIGRATION.md corrected for GoDaddy DNS and has a Google verification section. **Owner:** publish v1.22.1, do the move (Steps 1 and 4), verify arssteels.net in Search Console, set Branding name ARS-CMS and the ARS logo, wait 24 h, resubmit.
- **Now (25 Oct 2026):** v1.22.0: ARS-CMS name, ready for arssteels.net (docs/DOMAIN-MIGRATION.md), Pico Bot, AI Analytics, New chat fix (Bug 1), automated site audit, phone layout fix (owner). **Owner:** publish v1.22.0 first (on the current address), then follow docs/DOMAIN-MIGRATION.md.
- **Now (25 Oct 2026):** v1.21.0: Admin → Records (approval requests, tasks, information) with filters, sorting and CSV (owner). **Owner:** publish; check the Records pages with real data.
- **Now (25 Oct 2026):** v1.20.0: app-wide clean-up (instructions as hover hints in Admin, Super Admin, requests, modules, user pages, analytics) and the new public landing page "ARS Internal Workspace" (owner). **Owner:** publish; in Google Cloud, update the OAuth consent screen's app name and home page details to match "ARS Internal Workspace" (see D-188).
- **Now (25 Oct 2026):** v1.19.0: Pic bot as a business analyst (ChatGPT-style, Markdown, metric cards, charts), AI Assistant chat list in the sidebar (search, pin, rename, delete), AI Rules (Admin), Try as for every person (private window, view-only), Salesforce Settings and AI Details for the Super Admin, provider-wise AI settings, hover hints and dropdowns/switches, themed scrollbars (owner). **Owner:** publish (migrations run on start); write the AI Rules; remove the test provider keys; rotate the Salesforce UAT secret.
- **Now (24 Oct 2026):** v1.18.0: Salesforce "*" (all objects) and an unrestricted Super Admin in Pic bot (owner); Salesforce chat verified on the UAT sandbox (90 accounts). **Owner:** publish; for production consider a paid Groq tier or another provider (free tier is 8,000 tokens a minute); remove the test keys afterwards.
- **Now (24 Oct 2026):** v1.17.0: Groq, Gemini and NVIDIA (Nemotron) providers (owner). Groq test key works locally (active, Test passed). **Owner:** decide "may see business data" for the provider you trial (local test data), then test Pic bot chats; remove the Groq test key afterwards (it was pasted in chat); publish.
- **Now (24 Oct 2026):** v1.16.1: AI settings save no longer blocked by unused providers' empty model boxes; fixed-choice settings are dropdowns (owner). DeepSeek key saved locally; its account returned HTTP 402 (no balance). **Owner:** top up the provider (or add another key), then test Pic bot; publish v1.16.1.
- **Now (24 Oct 2026):** `main` = v1.16.0 (CI green), deployment ready. Salesforce UAT sandbox connected and Test connection passed (PB-13). **Owner:** publish v1.16.0; then PB-15 (allowed objects, integration user, production app, rotate the UAT secret).
- **Now (24 Oct 2026):** v1.16.0 Pic bot - ai (owner's master prompt; owner authorised building it into ARS Approvals): floating launcher with the supplied logo and chat panel; chat modes (General / Approval / Task / Information / Salesforce / Combined) per person and per module; Salesforce OAuth with PKCE and live allowlisted read-only queries; limits and concurrency; 10-client tests; CHATBOT_* documents. **Owner:** publish; then CHATBOT_DEPLOYMENT_GUIDE §3; Salesforce sandbox Connected App when approved.
- **Now (24 Oct 2026):** v1.15.0 = the AI module (all phases) and per-person module access, merged into `main` at the owner's request ("create this as a main production ready application… publish it in GoDaddy"). **Owner:** publish, then DEPLOYMENT Part R (provider key, Test, business-data decision, tick AI for a few people).
- **Now (24 Oct 2026), branch `feature/ai-module` (worktree `D:\Omniroute\ars-ai-module`, not on `main`):** the AI module (owner brief "Independent AI Module Upgrade", re-scoped by the owner's answers: API-based models, one application, same repository, Claude / ChatGPT / Grok / DeepSeek switchable). Phase 3 first: per-user module access.
- **Now (23 Oct 2026):** v1.14.0: onboarding tour for users (Approvals, Tasks, Calendar); Re-invite and Reset password back on the user page only (owner).
- **Now (23 Oct 2026):** v1.13.0: invite user and reset password from User management, by email (owner). The WhatsApp code on set-password stays (owner choice).
- **Now (23 Oct 2026):** v1.12.7: Next.js 15.5.28 security update (critical advisory). **Owner: publish v1.12.7** (it includes v1.12.5 and v1.12.6).
- **Now (23 Oct 2026):** v1.12.6: after Google's consent screen, people were sent to `localhost:20011` (the connection itself had worked). Redirects are now relative. **Owner:** publish, then press Connect Google Account again (or just open Profile → Calendar: it may already show Connected).
- **Now (20 Oct 2026):** v1.12.5: submit and delete failing with "Couldn't reach the server" on pages opened before a publish now say "ARS was updated, reload", with a Reload page banner; server errors show a reference. **Owner:** after publishing, reload open tabs once.
- **Earlier (20 Oct 2026):** v1.12.4: upload failures explained. **Owner:** check Super Admin → Overview → File storage after publishing; set UPLOAD_DIR if it is red.
- **Earlier (17 Oct 2026):** v1.12.2: ready for Google OAuth verification. The public home, privacy and terms pages and the narrower calendar scope are built; the owner files using the filing guide (Q-025).
- **Earlier (17 Oct 2026):** v1.12.1: analytics dropdowns; sign-out after 30 minutes for everyone with a signed-out page; Google consent screen must be External (owner: Google Auth Platform → Audience → Make external → Publish).
- **Earlier (16 Oct 2026):** v1.12.0: the Analytics Center (nine boards on the Analytics page). Owner choices pending: acknowledgement deadlines for information, and task effort fields, which would make the "not available" metrics possible.
- **Earlier (16 Oct 2026):** v1.11.0: Google Calendar two-way sync (needs the owner's Google OAuth client, Q-024, DEPLOYMENT Part Q). Next: v1.12.0 Analytics Center.
- **Earlier (16 Oct 2026):** v1.10.0: security hardening and website fixes (39-item brief; see `application-audit/SECURITY_WEBSITE_FIX_TRACKER.md`). Owner items: Cloudflare "Always Use HTTPS" and `ORIGIN_SECRET` (Q-021).
- **Earlier (16 Oct 2026):** v1.9.2: the user sidebar regrouped (collapsible My Approvals, Tasks, Information). Publish after v1.9.1's preview succeeds (or straight to v1.9.2).
- **Earlier (16 Oct 2026):** v1.9.1 fixes the v1.9.0 deploy (hosted MySQL refused the new history triggers; now optional). Retry the preview build / publish v1.9.1.
- **Earlier (16 Oct 2026):** v1.9.0 (Tasks, Information, module set-up, notification bell, sidebar; audit AUD-02, AUD-05, AUD-08 fixed) is tagged, not deployed. After publishing: back up first; create and publish the first Task and Information types in Admin; optionally add WhatsApp templates for WORK_TASK_ASSIGNED and INFO_PUBLISHED.
- **Now (16 Oct 2026):** a full read-only application audit is done and its reports are in `application-audit/` (00 to 12).
  - **Live:** `/api/health` shows v1.8.0, database ok and jobRunner OK. The cron item below (A-OPS) is done on live.
  - **Findings:** P0 none; P1 four (AUD-01 to AUD-04); P2 25.
  - **Next:** Phase A of `application-audit/09_PRIORITIZED_DEVELOPMENT_ROADMAP.md`; the AUD1 checklist below holds the tasks.
- **Next, the owner (no code):**
  - run `SELECT @@global.time_zone, @@session.time_zone, NOW(), UTC_TIMESTAMP();` on the live database (Q-020);
  - confirm `ORIGIN_SECRET` is set on GoDaddy (Q-021);
  - answer Q-022: where resubmit restarts when the amount or conditions change.
- **Now (15 Oct 2026):** v1.8.0 (approved lists, custom approval set-up, page access, inactivity sign-out) is tagged, not deployed. After publishing: check Super Admin → Providers & security → sign-out after no activity (30 by default; an older saved value stays).
- **Earlier (12 Oct 2026):** v1.7.2 (Collaborating screen; full filters on Collaborating, My requests and Waiting for me) is tagged, not deployed.
- **Earlier (10 Oct 2026):** v1.7.1 (owner: Analytics keeps the Admin space; Help and Profile in the account menu; Overview; Reports IT only) is tagged, not deployed.
- **Earlier (10 Oct 2026):** v1.7.0 (lists A, B and C, V170-*) is built, tested and tagged; it is **not deployed**. Register: 1,326 Implemented, 465 Yet to do, 66 Not feasible.
- **Next, the owner:** back up, then publish v1.7.0 (one additive migration). Afterwards: optionally set Report downloads = ROLE and give people "Can export"; run `npm run db:verify-backup` against a downloaded backup into an empty database.
- **Next, development:** remaining register themes (delegated/reassigned analytics, SLA due-date calendar, aging heatmap, scheduled-report status states, restore-verification history in the app).
- **Now (10 Oct 2026):** v1.6.1, owner request: attachment fields in the form builder, and collaborators on requests. Pushed; not deployed.
- **Now (10 Oct 2026):** v1.6.0 is tagged and pushed; it is **not deployed**.
  - **Scope:** the master prompt plus the unified master prompt.
  - **Register:** 1,287 Implemented, 504 Yet to do, 66 Not feasible (`docs/IMPLEMENTATION_STATUS_REGISTER.md`).
  - **Local checks:** unit 389, integration 146 (x3), E2E 73, QA 27, origin 1.
  - **Report:** `docs/IMPLEMENTATION_REPORT.md`.
- **Next, the owner:** `docs/GO_LIVE_READINESS_CHECKLIST.md`.
  1. Fix the cron secret.
  2. Back up, then publish v1.6.0.
  3. Choose the first feature-switch settings.
  4. Run the smoke test.
- **Next, development (v1.7.0):** U-09, then the register's Yet to do themes:
  - analytics chart breadth, filters and drill-down;
  - missed-cron alert; recovery of inconsistent states;
  - field-level masking.
- **Now (9 Oct 2026):** v1.5.0 is pushed and tagged. The owner's development spec, all 14 features:
  - My work, tracker, drafts, search and saved views, phone cards;
  - notification choices, bulk approval, out of office, @mentions, PDF summary;
  - test mode against the live version; workload, due soon and handover suggestions;
  - help; request ids and Super Admin alerts.
  - Local checks: unit 328, integration 97 (×3), E2E 47, QA 27, origin 1, production audit 0.
  - Reports: `docs/development/`.
- **Next, the owner:** `docs/development/GO_LIVE_CHECKLIST.md`.
  1. Fix the cron secret (live shows jobRunner NEVER).
  2. Back up, then Publish v1.5.0.
  3. Run the 15-minute smoke test.
- **Earlier (v1.4.0):** every code item done.
  - Work and FYI steps; designation and requester sources; and/or rules and nested choices; IT recovery for stuck steps.
  - Multi-level escalation; delete through the engine; the integrity fixes; the security fixes and the origin lock.
  - Health endpoint; daily backups with a restore drill; WhatsApp receipts; audit CSV and sign-in history; custom approval attachments.
  - Custom approval → approval type; Power BI views; installable app; user guide.
  - CI also runs the QA suite, the origin check and the production audit.
- **Next, the owner (in order):**
  1. GoDaddy: add `BACKUP_DIR` (DEPLOYMENT P1), then **Publish v1.4.0**.
  2. Finish the cron job with the real secret (Part I). Check: Message deliveries shows a green "Job runner"; Super Admin → Backups shows today; `/api/health` says ok.
  3. Optional: origin lock (E2), WhatsApp receipts (G6), uptime monitor (G7), Power BI views (K2).
  4. Restore drill on GoDaddy (Part P2, GL-04); download a backup off the server weekly.
  5. Load the masters and build the approval types (P0-31..34, P3-40..43); submit the 6 new WhatsApp templates (26 in all).
  6. UAT (GL-01), pilot (GL-07), key rotation (GL-05/P1-38), switch off Asana (P8-04).
- **Still open:** Q-015.

---

## Session log — v1.51.0 (10 Nov 2026): Meeting Management
Owner: "start building the module and complete all pending items in one go"; meeting decisions: Owner can be anyone; Management group = ED, MD; agenda/MOM deadlines are submission deadlines for the Coordinator; action items are General tasks with the meeting recorded on the task (like projects); the Meeting Owner or Coordinator confirms an action is done; points not approved at meeting time: the Owner's choice; register: Copy of Meeting Dashboard 2026.xlsx.
- [x] V1510-01 (10 Nov 2026) Migration 202611110900_meetings (types seeded, management group, meetings, departments, participants, points, decisions, actions, open points, events; tasks.meeting_id; MEETING module for everyone)
- [x] V1510-02 (10 Nov 2026) MEETING module (types/auth, modules.ts), page keys users.meetings / meeting_new / meeting (partyOpen) / meeting_dashboard, admin.meetings
- [x] V1510-03 (10 Nov 2026) server/meetings/rules.ts (roles, state machine, visibility, compliance, duration band, follow-up state) + unit tests
- [x] V1510-04 (10 Nov 2026) meetings.repository + server/meetings/service (schedule/edit/follow-up with carry-forward, points and MOM approval, self-approval, start/end/record as held, attendance, tasks on MOM approval, confirm/send back/note, open points, close rule, reminders once per deadline)
- [x] V1510-05 (10 Nov 2026) Screens: Meetings list (tabs, search, filters, pages), Schedule/Edit/Follow-up, meeting page, Follow-ups register, Dashboard; Admin → Meeting settings; task page meeting link
- [x] V1510-06 (10 Nov 2026) Navigation (sidebar, Classic module, command palette, More, icons), notification events and preference group "Meeting updates"
- [x] V1510-07 (10 Nov 2026) Tests: unit meeting-rules; integration meetings (13 steps end to end); e2e v1510-meetings (5); module tests updated for the new default module
- [x] V1510-08 (10 Nov 2026) General pages: privacy and terms (effective 11 Nov 2026), User Guide, Help (Meetings group), tour step, first-use checklist, release notes, FLOWS F-212
- [ ] V1510-09 Legacy import of the 288 register rows (Excel) — next, after go-live data check with the owner
- [ ] V1510-10 Meeting PDF (MOM) download — next
- [ ] Task Management roadmap (acknowledgement, delegation, DWR, department queues) — phased after go-live; owner to confirm who acknowledges

## Session log — v1.50.3 (10 Nov 2026): follow-ups, no-access screen
Owner: "if I don't have access to any screens create error handling screens for that as well, and raise a followup is not working why".
- [x] V1503-01 (10 Nov 2026) Follow-up of a custom request opens /users/custom?followUp=<id> (title + matching fields copied, banner, own draft untouched); submitCustomAction links FOLLOW_UP (+ expired reason); template requests unchanged; templates page "New request" keeps the follow-up
- [x] V1503-02 (10 Nov 2026) requireArea: a page refused by page access or modules (users/admin) redirects to /<area>/no-access?page=&why= (features/shell/NoAccess.tsx); records and Super Admin keep the plain 404 (D-016); no-access addresses are open paths
- [x] V1503-03 (10 Nov 2026) e2e v1503-follow-up-no-access; ai-modules and v180 expect the no-access screen
- [x] V1503-04 (10 Nov 2026) Owner: "custom request also needs follow-up management from the linked tasks" (chose: Follow-ups panel + follow-up tasks): Follow-ups card (status, who has it via pendingWithFor, Raise a follow-up); Work tasks card "Add a follow-up task" (requestTaskAction → quickAddTask with relatedRequestId, visibility checked, Task module required; marker __requestFollowUp listed by the journey)

## Session log — v1.50.2 (10 Nov 2026): false failure messages; Task Management audit
Owner: "when creating a user it first shows a failure message but creating the user. Check that and check all the issues like that"; full Task Management gap analysis (audit only, 145-point checklist, 11 reports).
- [x] V1502-01 (10 Nov 2026) lib/http/after-response.ts: messages sent after the answer (inline outside a request); used by approval announce, collaborators, request delete, information, tasks, work service, on-complete, comments
- [x] V1502-02 (10 Nov 2026) Add user: invitation after the answer, redirect created=1&invite=queued ("A welcome email is on its way"); bulk Re-invite / set-password link in the background
- [x] V1502-03 (10 Nov 2026) Scan: no redirect() inside try/catch in any action (the other way a success can look failed)
- [x] V1502-04 (10 Nov 2026) docs/task-management-audit/01–11 (audit only; no code or database changes for it)
- [x] V1502-05 (10 Nov 2026) Owner decisions (D-299): priorities unchanged; ack 3 working days; Team Leader = direct reports; DWR 11:59 PM mandatory; delegation without approval
- [x] V1502-07 (10 Nov 2026) Meeting Management master plan (plan only, no code): docs/meeting-management/MEETING_MANAGEMENT_PLAN.md (coordinator-driven, MOM → existing CMS tasks, follow-up carry-forward, 5 dashboards, phases M0–M5)
- [ ] V1502-08 Owner: confirm Meeting decisions D1–D9 and open questions (section 18) before M0
- [ ] V1502-06 Owner: confirm who acknowledges (provisional assigner → manager → HOD → IT) and give the go-ahead for Phase 1

## Session log — v1.50.1 (10 Nov 2026): task links, task priorities
Owner: the "Task for you" email link opened "This page isn't available"; "Change the Priority to Critical, Most Important, Important, Normal in create task".
- [x] V1501-01 (10 Nov 2026) users.task page partyOpen: opens without the Task module; loadTaskFor and task actions then allow only tasks the person is on (outsideModule); integration test v1501-task-without-module
- [x] V1501-02 (10 Nov 2026) Task priorities Critical (URGENT), Most Important (HIGH), Important (new IMPORTANT), Normal (NORMAL); LOW kept for older tasks, not offered; migration 202611101200 adds IMPORTANT to tasks.priority; every list, pill, sort and filter updated

## Queued (owner, 4 Nov 2026) — next release, planned before building
- [x] Q1 (4 Nov 2026, v1.49.6) New and imported users get a welcome email with a set-password link valid 12 hours
- [x] Q2 (5 Nov 2026, v1.50.0) Linked requests: search by number or title among requests the person may see, then link
- [x] Q3 (5 Nov 2026, v1.50.0) Work task steps: Task priority and Task due date; the task carries them into the assignee's Task Management when the step starts
- [x] Q4 (5 Nov 2026, v1.50.0) The request page shows a Work tasks card beside Linked requests
- [x] Q5 (5 Nov 2026, v1.50.0) PDF download in the same layout as the request screen
- [x] Q10 (5 Nov 2026, v1.50.0) Security review fixes: lock doesn't end open sessions, count resets after a lock, no all-digit User IDs, rate key per mobile number, Try-as link from APP_BASE_URL
- [x] Q11 (5 Nov 2026, v1.50.0) Copy audit: long explanations shortened; admin "Approval types" naming
- [x] Q12 (5 Nov 2026) Go-live: full local end-to-end run and visual sweep (Compact, Classic, phone)
- [x] Q6 (4 Nov 2026, v1.49.6) Admin → Users & roles: tick several users and act on them together (multi-select + bulk actions)
- [x] Q7 (4 Nov 2026, v1.49.6) Home: drop Recently viewed and Finished in the last 30 days
- [x] Q8 (4 Nov 2026, v1.49.6) Home: My recent requests 8 per page with pagination
- [x] Q9 (4 Nov 2026, v1.49.6) Waiting for me: column "Due date"; "No due date" when the step has no response time

## Session log — v1.49.5 (4 Nov 2026): approvals pages by role, highlighted list, Delete selected
Owner: "the opened approval is from Waiting for me but it highlights My pending requests, correct it and check all the visual issues for both Compact and Classic view"; "based on the designation approver or not show only New Request, My pending request, My approved request, Collaborating for all the requestors; approvers get all the screens"; "remove the Open card"; "drop all the cards from My approved request screen"; "add select and Delete option in this Super admin" (Requests).
- [x] V1495-01 (4 Nov 2026) navAccess hides Waiting for me, Approved by me, Request templates (APPROVER_PAGES) unless the designation is Approver or something is waiting for the person; navigation only (pages still open by address)
- [x] V1495-02 (4 Nov 2026) NavOwner: the request page names its list (queue / requests / approved / approved-by-me / collaborating / search); SideNav and ClassicBar light it; breadcrumb and Back follow (view.approvedByMe added)
- [x] V1495-03 (4 Nov 2026) Open card hidden (card: false; tab=open still parses); My approved requests without status cards; Classic module box Waiting for me only for approvers
- [x] V1495-04 (4 Nov 2026) Visual check, Compact and Classic, requester and approver (local): no page overflow; decision buttons auto-fit (labels one line); phone bar New → New request
- [x] V1495-05 (4 Nov 2026) Super Admin → Requests: row tick boxes, select-all, Delete selected (deleteRequestsAction, ≤100, one reason, each through deleteRequest)
- [x] V1495-06 (4 Nov 2026) e2e v1495-nav-roles; unit 1034 pass; lint, typecheck
- [x] V1495-07 (4 Nov 2026) Owner: "user id can be their mobile number or email id or the user id for login, but it should verify the password and OTP": findUserForSignIn (User ID, then email, then WhatsApp number; 10 digits → 91 prefix) in password sign-in and forgot password; labels "User ID, mobile number or email"; integration test sign-in-identifier
- [x] V1495-08 (4 Nov 2026) First-use checklist: first step links New request; Waiting for me and Out of office steps only for approvers

## Session log — v1.49.4 (3 Nov 2026): notifications panel
Owner: notification panel screenshot, "layout issue, correct it".
- [x] V1494-01 (3 Nov 2026) Header, filter row and footer shrink-0 (only the list scrolls); filter row overflow-y hidden, no visible scrollbar (.no-scrollbar); wider tabs. Measured in the browser: desktop row 36 px tall, nothing to scroll; phone 56 px, nothing to scroll

## Session log — v1.49.3 (3 Nov 2026): users list actions, department filter, dropdown backgrounds
Owner: "actions in a 3-dot dropdown: Re-invite, Send set-password link, Deactivate / Activate user in the last column"; "department filter in the table"; "it overlaps; clear this kind of issue in all the dropdowns" (people search list).
- [x] V1493-01 (3 Nov 2026) UserRowMenu (features/admin): userCommandAction with a confirmation and a toast; canEdit = checkCanEdit and not yourself; list query has has_password
- [x] V1493-02 (3 Nov 2026) Department filter (dept=id or none) on the list and its paging links
- [x] V1493-03 (3 Nov 2026) Dropdown fix: PeoplePicker bg-surface-raised (no such class) → bg-raised; tailwind tokens as functions so opacity modifiers work (27 classes were producing no CSS); missing shades primary-200/info-200 and text-heading replaced; scan of every tsx against the built CSS is clean
- [x] V1493-04 (3 Nov 2026) e2e v149-user-row-menu (filter, deactivate, activate, own row), user-commands, axe (v160-ui), picker background checked

## Session log — v1.49.2 (3 Nov 2026): module access in the users import
Owner: "I should be able to give module access while uploading users itself".
- [x] V1492-01 (3 Nov 2026) Optional `modules` column (kinds optional flag; header may omit it); planner parses ALL / list / empty (new → default, existing → keep), unknown refused, checkModuleChange for changes; ops carry modules; service writes setUserModules and audits; current-data export includes modules
- [x] V1492-02 (3 Nov 2026) Unit tests (create/keep/change/own/unknown), integration (module_access saved), User Guide, release notes; owner's file Downloads/ars-2-users-with-modules.xlsx

## Session log — v1.49.1 (3 Nov 2026): import with Excel files
Owner: departments and users files from Excel came out tab-separated ("Missing columns … Unknown column: login_id name email …").
- [x] V1491-01 (3 Nov 2026) detectDelimiter reads a tab too; unit test; import help text and User Guide; roles help lists EXPORTER
- [x] V1491-02 (3 Nov 2026) Owner: "instead of CSV give an Excel file, any format accepted, template in Excel": xlsx writer (server/import/xlsx.ts, stored zip, Text columns, How to fill sheet) for template/current data/problem list; xlsx reader (server/import/xlsx-read.ts: shared/inline strings, numbers as typed, date styles, booleans) for uploads; .xls refused with a hint; unit tests; session10 e2e uses the xlsx template and an xlsx upload; opened and re-saved with real Excel and read back
- [x] V1491-03 (3 Nov 2026) Owner's files as Excel in Downloads: ars-1-departments-no-hod.xlsx, ars-2-users.xlsx, ars-3-departments-with-hod.xlsx (import in that order)

## Session log — v1.49.0 (2 Nov 2026): branding and shortcuts, planned before starting
Owner: "ARS CMS – Complete Application Branding Replacement" brief with the approved logo (Downloads/ARS Green Steel CMS Logo.png) and the brand sheet; "if I click add in the mobile app to create an approval request it navigates to templates; I want the custom approval form"; "in compact mode Add task / New task navigate to templates; drop this task-from-templates part"; "the header navigation is missing" (Classic, /users/tasks).
- [x] V149-01 (2 Nov 2026) Central branding config (lib/branding.ts), assets in public/branding/ generated only from the master (resize, background crop/extension; no redraw)
- [x] V149-02 (2 Nov 2026) Every brand location: headers, sidebar, phone top bar, sign-in pages, public pages, loaders, journey, install card, offline page, PDF, manifest, favicon, Apple/maskable icons, OG image, service worker cache bump; name ARS CMS in UI and server text (WhatsApp template wording unchanged)
- [x] V149-02b (2 Nov 2026) Owner's phone references: sign-in skyline background, splash loader on the logo's blue, ring / dotted-ring / bar loaders (features/ui/BrandBackdrops.tsx, Loaders.tsx, BrandLoader.tsx); the sign-in brand panel now shows the approved logo (live site's white ARS mark was missing)
- [x] V149-02c (2 Nov 2026) Owner: logo without background (sign-in panel horizontal, splash, phone sign-in light/dark); ARS lettering in the round loaders; default profile picture by role (blue approver, white user)
- [x] V149-03 (2 Nov 2026) Phone + and Home New request → custom approval form
- [x] V149-04 (2 Nov 2026) New task / Add task → Create task window (/users/tasks/new redirects; type forms by link only); picker entries removed
- [x] V149-05 (2 Nov 2026) Classic: Tasks Management tab bar on /users/tasks pages
- [x] V149-06 (2 Nov 2026) Tests and docs; checked in the browser (sign-in, Home, Classic, phone; icons and manifest served)
- [ ] V149-07 Owner: Google OAuth consent screen app name "ARS CMS" (Q-027); reinstall the phone app if the old icon stays

## Session log — v1.48.1 (2 Nov 2026): slimmer journey, planned before starting
Owner: "remove these (Request Status, Approval Levels (Detailed), the level details panel) and reduce the animation size"; "add approver name"; "instead of showing details directly show when hover"; "I need the journey shown here (the folded header)"; "realign the progress bar to the marked extent"; "within this space can we bring the van and road concept"; "those options (refresh, share, fold) bring there (top right) on mobile".
- [x] V1481-01 (2 Nov 2026) Side column and details panel removed; road and van smaller
- [x] V1481-02 (2 Nov 2026) Hover/focus tooltip per level with name, status, time and approver; a level scrolls to the Approval levels card
- [x] V1481-03 (2 Nov 2026) Folded header: a small road with the dots, the van and the flag across the free space; the percentage always in the header
- [x] V1481-04 (2 Nov 2026) Phone: header buttons in the top-right corner
- [x] V1481-05 (2 Nov 2026) Tests (unit; affected e2e) and docs; checked in the browser (1440 light, 375 dark)
- [x] V1481-06 (2 Nov 2026) Fix: Work task / FYI could not be chosen (onInput reset controlled selects) (D-286); reproduced in the browser with a real key, fixed, e2e added
- [x] V1481-07 (2 Nov 2026) On hold: Resume first for the approver; phone Resume bar (D-286); e2e added

## Session log — v1.48.0 (2 Nov 2026): Approval Journey redesign, request page layout, status colours, planned before starting
Owner: the "Approval Journey" image and reference folder (Downloads/ars-approval-journey) "redesign the Approval Journey based on this image"; "also apply the same journey design on the phone layout"; "change the layout for the Request as like the above" (screenshot); "Timeline should show last 3 in desc order; show more shows the rest with a scroll bar"; earlier "make the status colours match across all lists".
- [x] V148-01 (2 Nov 2026) Journey: header (mark, number, title, status, route, refresh, share), scenic road, milestone labels, Request Status card, detailed levels, outcome banners, status guide; compact variant; phone layout
- [x] V148-02 (2 Nov 2026) Journey data: title, requester, submitted, valid until, request status, expired
- [x] V148-03 (2 Nov 2026) One colour per status (features/ui/status-tones.ts), AA in both themes; StatusPill and every status display
- [x] V148-04 (2 Nov 2026) Request page: Request details (icon rows), Approval levels (banner, tiles, level cards), side cards, bottom row, footer; phone one column
- [x] V148-05 (2 Nov 2026) Timeline: latest 3 newest first; Show more opens the rest in a scroll box
- [x] V148-06 (2 Nov 2026) Tests and docs; checked in the browser (1440 light, 375 dark)
- [ ] V148-07 Owner: try the journey and request page on live, computer and phone

## Session log — v1.47.1 (2 Nov 2026): priority colours everywhere, planned before starting
Owner: "the colors should be reflected wherever the Priority is shown in tables or sub headings any where available".
- [x] V1471-01 (2 Nov 2026) Inventory of every place a priority shows; each now uses the coloured pill (task page, task pane, My Work, information list and page, task grid and project list (read-only and editable), Analytics oldest tasks, Admin notifications, phone task and information rows)
- [x] V1471-02 (2 Nov 2026) Built-in colours for every priority (Normal blue, Important yellow); uncoloured request priority options coloured by name
- [x] V1471-03 (2 Nov 2026) Tests and docs

## Session log — v1.47.0 (2 Nov 2026): priority and coloured choices, planned before starting
Owner: "add priority here (request page header), add a colour selector in the dropdown so that dropdowns can be highlighted in the tables, and add priority in all possible tables"; "custom approvals will have priority" (a Dropdown keyed priority); then the request lists and the Home widgets.
- [x] V147-01 (2 Nov 2026) Option colours in the Form Designer (9 colours + none), schema `optionColors`, ChoicePill (AA in both themes)
- [x] V147-02 (2 Nov 2026) Request priority = the choice field keyed priority; request page header, PDF
- [x] V147-03 (2 Nov 2026) Priority column (after Status), sort and group in option order: My requests, Collaborating, My approved requests, Approved by me, Waiting for me; search; Super Admin requests; Admin Records + CSV
- [x] V147-04 (2 Nov 2026) Home widgets (My recent requests, Waiting for me, Due soon, Returned, Finished, Recently viewed) and phone cards
- [x] V147-05 (2 Nov 2026) Task priority pill in every task list, board and table
- [x] V147-06 (2 Nov 2026) Tests (unit; e2e full run) and docs
- [ ] V147-07 Owner: colour the Priority options in Custom approval; check the lists on live

## Session log — v1.46.0 (2 Nov 2026): all pending build and the owner's decisions, planned before starting
Owner: "Asana keeps a comment box fixed at the bottom of a task; implement this and complete all the pending build and changes in one go"; then "what are all decision blocked, ask and we will decide now" (16 answers, D-277); then the calendar Show dropdown, the compact New request on a phone, and Pico Bot at 75% with a grow/shrink animation.
- [x] V146-01 (2 Nov 2026) Comment box fixed at the bottom of a task on a phone (CommentThread `docked`)
- [x] V146-02 (2 Nov 2026) V143-16: Information phone list; Analytics filters folded; New request steps and buttons slim; AI chat and forms checked at 375 px (no change needed); calendar Show dropdown; Pico Bot 75% with grow/shrink
- [x] V146-03 (2 Nov 2026) V181-A7 page access fails closed on unknown pages for restricted people; V181-A8 confirmations and the demo guard
- [x] V146-04 (2 Nov 2026) Owner decisions, security and ops: break-glass without code in its window (Q-015); origin lock tile (Q-021); security records 90 days (DR-06); Google Drive backup (DR-08); template reminder (Q-013); Records amount (PB-34)
- [x] V146-05 (2 Nov 2026) Owner decisions, engine: earliest affected step on re-route (Q-022/DR-09); join onReject (DR-01); no approval by nobody unless ticked (DR-02); Expired everywhere (DR-05)
- [x] V146-06 (2 Nov 2026) One rule editor and the converting migration (shared condition builder)
- [x] V146-07 (2 Nov 2026) Docs: V181-A9 (KNOWN_ISSUES, security review, go-live checklist, DEPLOYMENT), automation inventory, data model, API reference, recovery objectives; privacy and terms (approved by the head of IT); User Guide; Help; release notes
- [x] V146-08 (2 Nov 2026) Tests: unit, integration, full e2e (results in the work log)
- [ ] V146-09 Owner: publish and the go-live checklist steps above; check `dbClockOffsetMinutes` (decides V181-A4)

## Session log — v1.45.0 (2 Nov 2026): the phone app, Asana pattern, planned before starting
Owner: 15 screenshots of the Asana phone app ("This is asana app, use this also as reference and build my mobile app"): My tasks, Choose view and Manage view sheets, Inbox, Search, Account, task page and its … sheet.
- [x] V145-01 (2 Nov 2026) Shared parts: bottom sheet, sheet button, choices, floating view switcher with Manage view and +, big title with …, Compact mode switch (`features/mobile/BottomSheet.tsx`, `dock.ts`)
- [x] V145-02 (2 Nov 2026) Tab bar: pill on the open tab, its name shown; "My tasks"
- [x] V145-03 (2 Nov 2026) My tasks: flat rows with the tick circle, projects, priority dot, date chip; Choose view; Manage view (compact, sort, group by due/project); groups fold; … menu
- [x] V145-04 (2 Nov 2026) Task page on a phone: top bar (back, Mark complete, copy link, … sheet with the actions), big title, Assigned to / Due date
- [x] V145-05 (2 Nov 2026) Inbox: day groups, cards with See more, bookmark/archive; Choose view (All activity, Bookmarks, Archived); Manage view (filters, unread only, sort)
- [x] V145-06 (2 Nov 2026) Approvals: Choose view, + New request, Compact mode; Search landing; More as Asana's Account (tiles, settings, support, version)
- [x] V145-07 (2 Nov 2026) Skeletons follow the new screens; Pico Bot clears the switcher and hides under a sheet
- [x] V145-08 (2 Nov 2026) Tests and docs: e2e specs moved to Choose view / Manage view; D-275, F-201; guide, Help, privacy (compact cookie), release notes, mobile screen inventory
- [ ] V145-09 Owner: try the phone screens on a real phone (Android and iPhone)

## Session log — v1.44.1 (2 Nov 2026): phone fixes, planned before starting
Owner: a phone screenshot (the bell's panel cut off on the left) "Check the Mobile app layout and Fix it"; then "add skeleton based loaders for each screens in Mobile application".
- [x] V1441-01 (2 Nov 2026) Bell panel: fixed across the screen under the top bar below 640 px, above the bottom bar; filter row scrolls; computer unchanged (checked at 375 and 1280 px)
- [x] V1441-02 (2 Nov 2026) Skeletons shaped like each phone screen (`features/mobile/MobileSkeletons.tsx`): Home, Approvals, Tasks, Inbox, More, request (with the journey road), task, general
- [x] V1441-03 (2 Nov 2026) Shown by NavigationProgress on a page change (phones only), not by new route loading.tsx files (V6-D06: they break the 404 and the refresh after an action); Help, Profile and New keep their reviewed loaders, now with the phone version
- [x] V1441-04 (2 Nov 2026) Tests: `tests/mobile/skeletons.test.ts`; unit 894/894, typecheck and lint clean; checked in the local browser (phone, dark)
- [x] V1441-05 (2 Nov 2026) Docs: D-274, F-198, release notes, User Guide, Help
- [ ] V1441-06 Owner: on a real phone, open the bell and move between screens

## Session log — v1.44.0 (2 Nov 2026): the approval journey, planned before starting
Owner: the "Approval Progress Tracker – Animation Storyboard" and the "Complete Approval Journey Animation Engine" brief ("build everything in one go"; event-driven, one engine for approvals, work tasks, FYI and many requests; never the source of truth).
- [x] V144-01 (2 Nov 2026) Inspect: road model (D-253), progress API, approval_events, work mirror, FYI (NOTIFY) and notification deliveries; no WebSocket/SSE (polling)
- [x] V144-02 (2 Nov 2026) Background work steps: builder `holdsUp`, engine `background` + WORK_ASSIGNED, validation, step map, road leaves them out, messages, timeline, linked tasks (`__approvalLink`), backfill, read access for holders, highlight and pane text
- [x] V144-03 (2 Nov 2026) Journey model and API (`server/journey`), progress API returns it
- [x] V144-04 (2 Nov 2026) Event controller (pure) and the `ARSApprovalJourney` component: van, door, wheels, envelope, document, stamp, flag, road, checkpoints, details, activities, live polling with back-off, reduced motion, hidden tab, scroll to the van
- [x] V144-05 (2 Nov 2026) Placement: request page (full, collapsible, sealing after submit), task page (compact), list rows and mobile cards (small road); old road drawing removed
- [x] V144-06 (2 Nov 2026) Tests: `tests/journey/journey.test.ts` (13), `tests/integration/journey.int.test.ts`, `tests/e2e/v144-journey.spec.ts` (3); scene screenshots checked (seal, drive, unload, stamp, reload, finish, phone)
- [x] V144-07 (2 Nov 2026) Docs and general pages (D-273, F-199, F-200, `docs/journey/ARS_APPROVAL_JOURNEY.md`, guide, Help, tour, privacy, API reference, data model, release notes)
- [ ] V144-08 Owner: try a request with a background work step and an FYI; watch the journey on a phone and a computer

---

## Session log — v1.43.0 (1 Nov 2026): QA pass, tasks from approvals, phone layout, planned before starting
Owner: the QA master brief (22 phases, reports in `qa/`); "task created from approval should be highlighted and mapped with approval unique number"; "Fix all the problems in one Go and then … rebuild the Mobile application PWA" (desktop unchanged, one backend, no fake features, no schema change without approval, no deploy).
- [x] V143-01 (1 Nov 2026) QA pass: route inventory (`scripts/qa/route-inventory.mjs`), security, workflow and database reviews; fixes QA-SEC-01 to 05, QA-WF-01 to 09, QA-DB-01 and 04 to 08 (QA-DB-03 unused; D-271; `qa/BUG_REGISTER.md`)
- [x] V143-02 (1 Nov 2026) QA-DB-08 indexes moved out of the migrations into `database/optional/v1421_qa_indexes.sql` (no schema change without the owner's approval)
- [x] V143-03 (1 Nov 2026) Tasks from approvals highlighted with the request number in every task list, board, table, Home and the pane (D-270, F-197)
- [x] V143-04 (1 Nov 2026) Phone layout architecture: server-picked layout (`ars_layout` cookie, phone user agent), desktop path untouched (D-272; docs/mobile/MOBILE_REDESIGN_ARCHITECTURE.md)
- [x] V143-05 (1 Nov 2026) Mobile shell: top bar, five bottom tabs with counts, More menu with Sign out confirmation, tokens and `mob-` classes
- [x] V143-06 (1 Nov 2026) Mobile Home (attention line, counts, quick actions, waiting approvals, today's tasks, open requests)
- [x] V143-07 (1 Nov 2026) Approvals hub `/users/approvals` (four tabs, cards with department, amount, approver, submitted, waited, Overdue/Due soon, status)
- [x] V143-08 (1 Nov 2026) Request page on phones: decision bar Approve / Return / Hold / Reject above the tabs (48 px); Pico Bot clears it
- [x] V143-09 (1 Nov 2026) Tasks tabs and cards with the + button (the one Create task window)
- [x] V143-10 (1 Nov 2026) Inbox tabs with Mentions; More inbox views below
- [x] V143-11 (1 Nov 2026) Manifest: splash colour, shortcuts (Approvals, Tasks, Inbox)
- [x] V143-12 (1 Nov 2026) Tests: `tests/e2e/v143-mobile.spec.ts`, phone tests of session9 and WEB-03 rewritten for the new layout, `tests/mobile/layout.test.ts`
- [x] V143-13 (1 Nov 2026) General pages: privacy (layout cookie), User Guide and Help ("On your phone"), tour step 1 target; terms, checklist, landing and menu checked (no change: no new rule, nothing they describe changed)
- [x] V143-14 (1 Nov 2026) Mobile docs in `docs/mobile/` (architecture, inventory, design system, progress, test reports, desktop regression, PWA validation, security review, release notes)
- [ ] V143-15 Owner UAT on real phones (iOS Safari installed app, Android Chrome): steps in docs/mobile/PWA_VALIDATION_REPORT.md
- [x] V143-16 Later phases (not in v1.43.0): dedicated phone screens for the task page, Information, Calendar, Analytics, AI chat and forms (they run in the mobile shell with their existing responsive layout) (2 Nov 2026: done in v1.45.0 and v1.46.0: task page, Information, Analytics, New request; Calendar and AI chat already fit (checked at 375 px))

---

## Session log — v1.42.0 (1 Nov 2026): the remaining reference screens, planned before starting
Owner: "finish the remaining screens: calendar, kanban, draft task, analytics boards" (V141-14's rest; Compact only, Classic stays Tally, light and dark).
- [x] V142-01 (1 Nov 2026) Calendar (D-259): toolbar card (← title →, Today, Month / Week / Day / Agenda segmented), category chips filled when shown with a tick and their count, month cells with today's circle and coloured event pills with a left accent, week columns and the list with the same accents; Agenda = the period's list on every screen size
- [x] V142-02 (1 Nov 2026) Kanban (D-259): My Tasks and project boards: columns with a coloured top accent and a count pill, cards with the assignee's initials, due date with its tone, priority pill, project and badges; same drag, keys and add-task
- [x] V142-03 (1 Nov 2026) Draft task (D-259): two-column panel on wide screens (Task details: name, Myself/Others, project, description; Task settings: due date, repeat, collaborators, task type), same fields and actions; one column on phones
- [x] V142-04 (1 Nov 2026) Analytics boards (D-259): People: ranking with completion bars; Departments: comparison bars over the table; SLA / Data quality / Trends as headline cards plus bar lists; the same figures, no new calculations
- [x] V142-06 (1 Nov 2026) Editable task tables (D-260, owner: "only task is typable"): in the project and My Tasks tables, Assignee, Due date, Priority, Collaborators and Tags are changed in the cell (the same actions and permissions as the task pane); keyboard reachable
- [x] V142-07 (1 Nov 2026) Owner's report: project status from the header's Set status didn't select it in the form (the form kept its first state); the open list of some dropdowns was unreadable in the dark theme (pale options on white). Fix both everywhere
- [x] V142-08 (1 Nov 2026) Analytics "My tasks" (D-262, owner): a Whose numbers choice for the tasks given to you (anyone with tasks); with it, the Overview (its Tasks part) and the Tasks dashboard only, approvals and information not shown as zeros
- [x] V142-09 (1 Nov 2026) New request: the action bar at the top (under the steps), Submit's icon and words on one line (owner)
- [x] V142-10 (1 Nov 2026) New request (D-263, owner): Next only when every required field is filled (the missing ones are named beside the field, the first is focused); the workflow can't be changed until Next; a red star on every required field; Submit on Review & submit only
- [x] V142-11 (1 Nov 2026) Road (D-263, owner): while a level waits the van stands halfway to it; it drives onto the person's name only once they approve
- [x] V142-12 (1 Nov 2026) Request page (D-263, owner): the road at the top, centred and smaller; Request details below it with the requester's details (name, User ID, department, designation, email, reporting manager, request no., type, raised on); the level map after; on the right, the action box (smaller) first, then Attachments, then Collaborators, then the rest
- [x] V142-13 (1 Nov 2026) Owner's report: Admin → Custom approval asked "Leave without saving?" after Save. The form never heard it was saved (no form reference); fixed in the shared form hook for every form
- [x] V142-14 (1 Nov 2026) Home (D-264, owner): a selector at the top, Approvals / Task Management; Approvals shows the approval overview (tiles, waiting, drafts, recent requests), Task Management shows My work. /users/work and task links open Task Management
- [x] V142-15 (1 Nov 2026) Request page (owner): the requester's name and department lead the Request details box
- [x] V142-16 (1 Nov 2026) Approval Overview (D-265, owner's brief): heading + New request; four KPI cards with icon and meaning (same counts and links as before); Waiting for me first with an illustrated empty state; Due soon, Returned, My recent requests, Finished on the left; Your drafts (open, delete with confirmation, View all), Recently viewed and Quick insights (This week / month / 30 / 90 days: raised, approved, average approval time, N/A when none) on the right; quiet refresh every minute
- [x] V142-17 (1 Nov 2026) My Work overview (D-265, owner's brief): header with name, designation and department; period (Today / This week / This month / Last 30 days / Custom); KPI cards Total (open + done in period), Upcoming, Overdue (as My Tasks), Completed (period, vs previous); My Tasks table with tabs and counts, Create task, View all, actions, pages, cards on phones; Projects with progress; Latest status updates from task events and project status posts; My weekly workload (assigned_at and completed_at by day); quick actions; Tasks I've assigned and My team kept below
- [x] V142-18 (1 Nov 2026) Home default (owner): approvers (designation ticked Approver, or something waiting for them) open on Approvals, everyone else on Task Management; switch at the top
- [x] V142-19 (1 Nov 2026) New request (owner): each column scrolls on its own on a computer (the page stays put); fixed step options aren't spelled out ("set by IT" lines removed; the server still applies them); levels show as small summary cards on top, one level open below, a new level opens itself
- [x] V142-20 (1 Nov 2026) Brand (D-266, owner's brand sheet): the ARS-CMS mark (screen and gear on a hexagon over stacked layers) and lockup (ARS Green Steel | mark ARS-CMS, Central Management System) in the sidebar, top bar, phone menu, sign-in and public pages; app icon, favicon (16/32/48), PWA icons 64/96/192/512, maskable and Apple icon from one SVG; ARS Blue #0053A0 and Accent #0A84FF; sidebar icons in brand blue (Compact only)
- [x] V142-21 (1 Nov 2026) Loaders (D-266, owner's loading sheet): full-screen loader (lockup, bar, wave), logo spinner, dots, button spinner, upload bar, circular progress, step loader, Loading data state; shimmering skeletons (tiles with icons, lists, tables, chart) [Home's own loading.tsx withdrawn: V6-D06, a route loading.tsx can drop the refresh after an action and Home has actions]; animated outcomes (success tick, task tick, failed cross, warning) on every form's result, the submitted and decision banners, and a task's checkbox
- [x] V142-24 (1 Nov 2026) Work and FYI steps (D-269, owner): work steps create linked tasks in Task Management (both ways in step), FYI recipients can open the request, kind labels and readiness wording; e2e from submission to approved
- [x] V142-23 (1 Nov 2026) Request page from the owner's sketch (D-268): road band beside the title at the top; Request details then Approval levels on the left; Needs your action (grid of decision buttons) then Attachments on the right
- [x] V142-22 (1 Nov 2026) Classic view (D-267, owner): Create task as a centred Tally-style floating window; every Classic layout checked on a computer and a phone and the problems found fixed (Label : value rows wrap instead of squeezing; Analytics page bar on phones; sidebar logo on one line); v1.42.1
- [x] V142-05 (1 Nov 2026) General pages (STRICT rule), tests, living files, v1.42.0, commit, push, CI

## Session log — v1.41.0 (1 Nov 2026): installable app, push, daily sessions, road tracker, responsive sweep, planned before starting
Owner's brief (sections 1–21): PWA install and Web Push (VAPID), the daily session ending at midnight India time, every page responsive, and the TMT road approval tracker with the ARS van.
- [x] V141-01 Audit: stack, routes, auth and sessions, DB, notifications, hosting, manifest; design written in docs/PWA_PUSH_SESSION_DESIGN.md — done 1 Nov 2026
- [x] V141-02 Daily session (D-250): the session of a phone, tablet or installed app lasts until the next midnight IST with no idle sign-out; the server enforces it on every request; Super Admin chooses the scope (phones and the app / everyone / off); the signed-out page says "Your daily session has expired"; push never depends on the session — done 1 Nov 2026
- [x] V141-03 PWA (D-251): service worker (static assets only, versioned cache, old caches removed, offline page, no private data cached), manifest additions, the first-visit invitation (Android/desktop native prompt, iPhone/iPad Share → Add to Home Screen steps, never in the installed app, "Maybe later" remembered on the device and on the account), Profile → App & devices — done 1 Nov 2026
- [x] V141-04 Web Push (D-252): `web-push` (VAPID), keys generated and kept encrypted in Super Admin settings; push_subscriptions (several devices per person, one row per endpoint, keys encrypted, status); a PUSH channel in the preferences (mandatory groups stay on); notify() queues one PUSH delivery per device; a queue drain right after the action and on every job run, with backoff, 404/410 marks the device expired; lock-screen detail setting; the service worker shows it and opens the record (through sign-in when needed) — done 1 Nov 2026
- [x] V141-05 Push APIs: subscribe / list / remove / status / key, resubscribe from the service worker (pushsubscriptionchange) proven by the old endpoint; per-person ownership; rate limits; route inventory — done 1 Nov 2026
- [x] V141-06 Admin → Notifications (D-252): overview cards, send (title, message, category, audience: people / departments / roles / HODs and managers / everyone; priority; page to open; now), history with delivery counts, devices (endpoint shown masked); audited; broadcast only for IT Admin and Super Admin — done 1 Nov 2026
- [x] V141-07 Road tracker (D-253): ApprovalRoad on the request page: the road, green done / grey to come, checkpoints from the real stages (parallel = one checkpoint, choice = the path taken, FYI left out), the red ARS van at the current checkpoint, the finish flag and tick when fully approved, red cross for rejected, amber for changes asked / on hold / stuck; tap a checkpoint for its people, times and comments; horizontal scroll inside the road on phones; updates by itself (polling) and only moves forward on new data; reduced motion respected — done 1 Nov 2026
- [x] V141-08 Responsive sweep (D-254): every route for each role at 320, 375, 768, 1024, 1440 wide: no page-wide sideways scroll, no clipped controls; results in docs/RESPONSIVE_ROUTE_MATRIX.md; fix what fails — done 1 Nov 2026
- [x] V141-09 General pages (STRICT rule): privacy (devices and push subscriptions, daily session), terms, User Guide, Help, tour, first-use checklist, release notes, DEPLOYMENT (VAPID, push, session policy), API_REFERENCE, DATA_MODEL, AUTOMATION_INVENTORY — done 1 Nov 2026
- [x] V141-10 Tests: unit (midnight, road model, push payload/targeting), integration (subscriptions, queue, 410 cleanup, targeting, session policy), e2e (install invitation, App & devices, admin send, road), load (push queue for 250 people × 2 devices against a local push endpoint); visual check in the in-app browser — done 1 Nov 2026
- [x] V141-12 New request (/users/custom) redesign (D-255, owner mock-up): three steps (Request details, Approval workflow, Review & submit) on one form, so nothing is lost between steps; request fields grouped (basic, details, collaboration) with counts, Indian amounts, file list; level cards with numbers, reorder, remove, parallel group; approver picker with name, ID, designation, department, initials; live summary (sticky on desktop, folded on phones); action bar (Save draft, Reset with confirm, Back, Next, Submit); same fields, same draft and submit actions, same rules — done 1 Nov 2026
- [x] V141-13 My Requests dashboard (D-256, owner mock-up): one page with Raised by me / Shared with me tabs and counts; status cards (All, Open, Waiting for approvers, Sent back, On hold, Approved, Rejected, Withdrawn, Overdue; Overdue overlaps Waiting and is labelled so); search (title, number, type, approver, reference) debounced; filter chips, sort, group, columns (saved per person), server-side paging; table with Waiting on, dates, the compact road progress (same calculation as the request page) and a row menu by permission; cards on phones; empty, no-match, loading and error states — done 1 Nov 2026
- [>] V141-14 12-screen look (D-257, owner's reference): one design language (navy/charcoal dark theme, ARS blue, page header with icon, summary cards, toolbar, tables) applied to Home, My Tasks (list/board/calendar), Draft task, Calendar, Inbox, Information, Analytics (overview, employees, departments, SLA/quality/trends tabs) and the Approvals lists, keeping every feature, route and permission; real data only; responsive. Owner (1 Nov 2026): Compact view only; Classic stays on the Tally reference; every change in both the light and dark themes (theme tokens, never fixed colours) — 1 Nov 2026: done for My requests (all four request lists), New request, the request road, My Tasks (summary cards), and the page-header icons on Home's main screens, Inbox, Information, Tasks, Calendar, Analytics, Profile pages; still to do: re-laying out the Calendar, the Kanban board, the Draft task and the Analytics employee/department/SLA boards to the reference's arrangement (their features already exist)
- [x] V141-15 Tables and Analytics fit the window (D-258, owner): every table scrolls inside its own box (header stays) and is paged; each Analytics view fits one window, split into pages (tabs) where it would run long — done 1 Nov 2026
- [x] V141-11 Living files, version 1.41.0, commit, push, CI — done 1 Nov 2026

## Session log — v1.40.0 (1 Nov 2026): audit remediation, planned before starting
- [x] SEC-02 page guards + guard test; OPS-20 middleware session check (D-244) — 1 Nov 2026
- [x] DB-004, DB-005 approval integrity; readiness warning (D-245) — 1 Nov 2026
- [x] DB-008 to DB-014 messaging (D-243, helper agent) — 1 Nov 2026
- [x] DB-001, DB-002, DB-003, DB-006, DB-007, SEC-01, FI-D02, FI-D03, FI-D06, UI-D01 to UI-D04, PF-R01 (D-246) — 1 Nov 2026
- [x] OPS-01, OPS-02, OPS-03, OPS-04, OPS-05, OPS-06, OPS-09, OPS-11, OPS-18, OPS-19 (D-246) — 1 Nov 2026
- [x] OPS-08 off-site copy built (S3-compatible, encrypted only) — 1 Nov 2026; [ ] owner enters the bucket and key
- [x] FI-D01 weekly HOD report (D-247) — 1 Nov 2026
- [x] OPS-12 to OPS-17, FI-D04, FI-D05 docs (helper agent) — 1 Nov 2026
- [~] OPS-07 restore drill: tools ready (`npm run db:verify-backup`, checklist); needs the owner's production backup (1 Nov 2026)
- [x] OPS-10 RPO/RTO and incident response: drafted; needs the owner's approval (1 Nov 2026) (2 Nov 2026: owner approved: RPO 24 h, RTO 4 h, encrypted copy to Google Drive, key with the owner (D-277))
- [x] V181-A1 (resubmit skips readiness checks, AUD-11) and V181-A6 (failed template sync recorded OK, AUD-17): done 1 Nov 2026 (D-248)
- [x] General pages brought up to date with every module (privacy, terms, User Guide, Help, tour, first-use checklist, landing page) and the STRICT general-pages rule added to CLAUDE.md: done 1 Nov 2026 (D-249)

## Session log — v1.37.0 (31 Oct 2026), planned before starting
- [x] Form Designer: library, canvas, property tabs, reorder (drag, buttons, Alt+arrows), duplicate, remove asks first and can be undone, Undo/Redo, type change asks first (D-235) — 31 Oct 2026
- [x] DoA dropped from custom approvals (D-235a) — 31 Oct 2026
- [x] CI fix: "Next waiting for you" survives the form leaving the page (useActionForm successHref) — 31 Oct 2026
- [x] Sidebar: drop Search and Search tasks (D-236) — 31 Oct 2026
- [x] Space name "Central Management System" (D-236) — 31 Oct 2026
- [x] Overview + Task home → Home; /users/work redirects (D-236) — 31 Oct 2026
- [x] One Inbox at /users/inbox; old addresses redirect; bookmark/archive any notice; notification settings as Profile → Notifications (D-237) — 31 Oct 2026
- [x] Tests: e2e session9, v128, v130, v131, v132, v160-ui, v171, v190, v1100 and profile updated; integration inbox (3) — 31 Oct 2026
- [x] Draft task toolbar (Asana: +, Formatting, Emoji, @mention, Attach/paste, ✨ Pico Bot, due date, repeat, collaborators, / menu) and a taller, narrower panel that steps up with the screen (D-238) — 31 Oct 2026
- [x] Workflow Designer: map + structured list, fold, drag, duplicate, remove with Undo, Undo/Redo, problems by level, browser copy of unsaved work, Test mode inputs (D-239) — 31 Oct 2026
- [~] Server-side working-draft autosave: needs an additive column and changes version numbering; put to the owner as Q-026 (31 Oct 2026)
- [x] Server-side working draft (Q-026 answered: go ahead): migration, saveWorkingDraft with revision guard, editor autosave, Save draft (D-241) — 31 Oct 2026
- [x] Shared condition builder: the two rule editors store different shapes; merging changes saved JSON; waits for a decision (31 Oct 2026) (2 Nov 2026: owner: merge and convert; done in v1.46.0, D-280)
- [x] Shared condition builder without changing saved JSON: one ConditionRow for both editors (D-242) — 31 Oct 2026
- [x] Settings console: categories, search, unsaved marks, leave guard, one Save per category; AI one form (D-240) — 31 Oct 2026
- [x] Studio docs: IMPLEMENTATION_LOG, ARCHITECTURE, TEST_REPORT, DEPLOYMENT — 31 Oct 2026

## Session log — build session 1 (28 Sep 2026): planned before starting
- [x] S1-01 Record the owner's confirmation of both assumptions (D-042, Q-014) and the build choices (D-043) (done 28 Sep 2026)
- [x] S1-02 Scaffold the single Next.js app at the repo root (P0-40a, P0-41): package.json (versions pinned as on the Power BI site), tsconfig, next.config (COOP header, Firebase public config), Tailwind with the ARS tokens, ESLint, PostCSS, Vitest, the folder structure (done 28 Sep 2026)
- [x] S1-03 Environment schema (P0-43), `.env.example`, DB pool + transaction helper, migrate/seed scripts, docker-compose for MySQL on port 3307 (P0-42) (done 28 Sep 2026)
- [x] S1-04 Foundation migrations: departments, designations, users, roles + user_roles, otp_challenges, user_devices, user_sessions, login_logs, audit_logs (append-only triggers, P1-37), system_settings + history, whatsapp templates/variables/rate limit, notifications + deliveries, jobs; seeds for roles, the OTP template (reusing `wa_login_otp_v1`) and a bootstrap Super Admin (itadmin@) (done 28 Sep 2026)
- [x] S1-05 Security libraries: AES-256-GCM encryption, OTP generate/hash/verify, scrypt password hashing, session token signing, device cookie (done 28 Sep 2026)
- [x] S1-06 Settings (definitions, encrypted resolution, masking) and the CEOITBox + Resend adapters (P1-41, P1-42) (done 28 Sep 2026)
- [x] S1-07 Auth services with injectable dependencies: Google sign-in (P1-10), User ID + password → WhatsApp OTP (P1-11, P1-12), lockout (P1-15), DB-backed sessions + logout + sign out everywhere (P1-16), device check + new-login alert on email + WhatsApp (P1-17, P1-18), login logs with a wide user-agent column (P1-23) (done 28 Sep 2026)
- [x] S1-08 Authorisation: pure policy + guards for `/users`, `/admin`, `/superadmin`; middleware layer 1 (P1-30a, P1-31) (done 28 Sep 2026)
- [x] S1-09 UI: login page (Google, then User ID + password → OTP), area shells for /users, /admin, /superadmin using the ARS brand, generic 404 (P1-70, P1-71, P1-50) (done 28 Sep 2026)
- [x] S1-10 **Multi-level engine core (north star, P2-ENG):** graph model, validator (P3-04 rules incl. G-08/G-09/G-10), start/advance with sequential, parallel+join, any-one, any-N-of-M, conditions, skip + no-self-approval, reject / changes / hold / resume, simulation (P3-05 core) (done 28 Sep 2026)
- [x] S1-11 Unit tests for security, auth, policies and the engine; lint, typecheck, test and build all pass (done 28 Sep 2026)
- [x] S1-12 Start local MySQL, run migrations and seeds, smoke-test sign-in API paths (done 28 Sep 2026)
- [x] S1-13 Update the three living files; commit and push to GitHub (done 28 Sep 2026)

Found and fixed during session 1 (each covered by a test or smoke check):
- [x] S1-F1 Lockout locked one attempt early and skipped the lock alert: MySQL applies `SET` assignments left to right (D-044) (done 28 Sep 2026)
- [x] S1-F2 A blank optional env value (`FIREBASE_*=`) crashed every request; blanks now mean "not set" (D-045) (done 28 Sep 2026)
- [x] S1-F3 Tailwind resolved its config and content from the working directory, so pages were unstyled when started from another folder (as cPanel may do); both are now resolved from the project (D-046) (done 28 Sep 2026)
- [x] S1-F4 A whitespace-only form value didn't count as empty in conditions (done 28 Sep 2026)

## Session log — build session 2 (planned)
- [x] S2-01 `/superadmin` settings editor: grouped settings, encrypted secrets shown only as Configured / Not configured, save with validation, before/after audit, change history (P1-35, P1-54, P1-55, P1-60) (done 30 Sep 2026)
- [x] S2-02 Provider test-send buttons (CEOITBox, Resend) for the Super Admin only; results in the delivery log (P1-55) (done 30 Sep 2026)
- [x] S2-03 Admin user management in `/admin`: list, create, edit, set sign-in method, WhatsApp number, manager/HOD, roles (admin only), make inactive / reactivate (ends sessions), unlock, force sign-out (P1-04 to P1-06, P1-52) (done 30 Sep 2026)
- [x] S2-03a Organisation basics in `/admin` so user records can point at them: departments (code, name, HOD) and designations; add, edit, make inactive (P1-01, P1-51) (done 30 Sep 2026)
- [x] S2-03b Rules for managing users (D-047): only the Super Admin grants SUPER_ADMIN or edits Super Admin / break-glass accounts; no self-deactivation; the last Super Admin is protected; unit-tested (done 30 Sep 2026)
- [x] S2-04 Set password / first sign-in for password users and forgot password via WhatsApp OTP (P1-13, P1-14) (done 30 Sep 2026)
- [x] S2-05 Content-Security-Policy with a per-request nonce that still allows the Firebase Google popup (P1-34a) (done 30 Sep 2026)
- [x] S2-06 Engine persistence: workflow definitions and published versions, requests, instances (state JSON + tasks table), actions, timeline (P2-02, P2-06, P2-07, P2-20, P2-31) (done 30 Sep 2026)
- [x] S2-06a Approver groups (tables + directory) so the GROUP approver source works from the database (P2-05) (done 30 Sep 2026)
- [x] S2-06b Integration tests against a real MySQL test database: migrations, request numbering, start → decide → approve, concurrent decisions, append-only timeline (done 30 Sep 2026)
- [x] S2-07 Break-glass enable/disable script for the hosting console (P1-36) (done 30 Sep 2026)
- [x] S2-08 GitHub Actions CI: lint, typecheck, unit tests, build (P0-45) (done 30 Sep 2026)
- [x] S2-09 Update the three living files; commit and push (done 30 Sep 2026)

Found and fixed during session 2:
- [x] S2-F1 `last_value` is a reserved word in MySQL 8. The integration run caught it before it reached any database; the column is renamed `current_value` (done 30 Sep 2026)
- [x] S2-F2 React 19 clears a `<form action>` after every submit, which wiped the admin's typing on a validation error. Forms now submit through `useActionForm`, and only clear after a successful save where that's wanted (D-048) (done 30 Sep 2026)
- [x] S2-F3 A notification that was sent but failed to be recorded was marked FAILED and would be retried: a double send. Sending and recording now fail separately (D-052) (done 30 Sep 2026)
- [x] S2-F4 Setting limits showed the raw validation text ("Number must be greater than or equal to 5"). Now plain: "Use 5 or more." (done 30 Sep 2026)
- [x] S2-F5 A duplicate department code showed its message twice (done 30 Sep 2026)

## Session log — build session 3 (planned)
- [x] S3-01 `/users` home: My approvals queue (pending tasks) and My requests, with status pills (P2-41, P2-42) (done 30 Sep 2026)
- [x] S3-01a Form fields per workflow version (D-055): text, long text, number, date, choice, person; required; validated on the server; conditions and the person-from-field approver source use them (done 30 Sep 2026)
- [x] S3-02 Raise a request from a published approval type: title + form fields (a simple key/value form until the form builder, P3-03), submit (P2-40) (done 30 Sep 2026)
- [x] S3-03 Request page: details, the full level map (every step and branch, who approved or is pending), timeline, and approve / reject / request changes / hold / resume with reasons; record-level access (P1-30a layer 3, P2-43) (done 30 Sep 2026)
- [x] S3-04 Resubmit after changes required, from the request page (F-26) (done 30 Sep 2026)
- [x] S3-05 `/admin/workflows`: list, create and edit a workflow as structured steps (sequential levels, parallel groups, any-one / any-N, conditions), validate, test mode (simulate), publish, and version history (P3-01 first cut, P3-04, P3-05, P3-06) (done 30 Sep 2026)
- [x] S3-05a Pure builder → graph compiler with unit tests (sequential, parallel + join rules, any-one / any-N, skip conditions, every approver source) (done 30 Sep 2026)
- [x] S3-05b Step map for the request page: every level and branch with its status and people (pure, unit-tested) (done 30 Sep 2026)
- [x] S3-06 Approver groups screen in `/admin` (S2-06a data) (done 30 Sep 2026)
- [x] S3-07 Retry runner: signed `/api/jobs/run` for cPanel cron; retries FAILED deliveries with backoff (P1-48) (done 30 Sep 2026)
- [x] S3-08 Rate limiting on sign-in, OTP start and forgot password, per IP and per User ID (P1-21) (done 30 Sep 2026)
- [x] S3-09 Update the three living files; commit and push (done 30 Sep 2026)

Found and fixed during session 3 (in the browser run):
- [x] S3-F1 After a resubmission, a level finished in round 1 showed no approver; the map now shows each step's latest round (done 30 Sep 2026)
- [x] S3-F2 The request title was checked before the fields, so a bad amount only showed up on the second try; all errors now come back together (done 30 Sep 2026)
- [x] S3-F3 Avatar initials used punctuation ("Meena (MD)" → "M("); now letters only (done 30 Sep 2026)
- [x] S3-F4 "Asked for changes" appeared twice in the timeline (done 30 Sep 2026)
- [x] S3-F5 A race test expected one winner when a rejection and an approval hit an any-one step together; both are valid there. The test now uses two approvals, and the behaviour is recorded in FLOWS F-13 (done 30 Sep 2026)

## Session log — build session 4 (planned)
- [x] S4-01 Custom approvals for every user (P5, D-026, D-040): build a one-off route from the same levels builder (pick anyone, any mix of levels) and submit it at once; it belongs to that user (done 1 Oct 2026)
- [x] S4-02 Comments on a request, visible to everyone who can open it, and on the timeline (P2-08; attachments wait for the GoDaddy disk check, Q-001) (done 1 Oct 2026)
- [x] S4-03 Delegation / out of office (D-018, P4): a delegate for a date range; the engine's canActFor uses it; actor + on-behalf-of recorded (done 1 Oct 2026)
- [x] S4-04 SLA per step: reminders and escalation through the job runner (P4, F-31) (done 1 Oct 2026)
- [x] S4-05 Hand over pending steps when a user is deactivated (P1-05) (done 1 Oct 2026)
- [x] S4-06 In-app notification bell with unread count (P1-44) (done 1 Oct 2026)
- [x] S4-07 GoDaddy deployment dry run: build output, env var list, cPanel Node app settings, cron line, MySQL privileges (TRIGGER), a go-live checklist (P0-46, P0-17a) (done 1 Oct 2026)
- [x] S4-08 DoA matrix structure (P3-30), ready for the owner's values (Q-004) (done 1 Oct 2026)
- [x] S4-09 Update the three living files; commit and push (done 1 Oct 2026)

Notes from session 4:
- [x] S4-N1 The levels editor is now one shared component (`LevelsEditor`), used by the IT team's builder and by staff custom approvals, so the two can't drift apart (done 1 Oct 2026)
- [x] S4-N2 Delegation dates use India's date, whatever the database server's timezone (`INDIA_TODAY_SQL`), so an out-of-office starts and ends on the right day on GoDaddy (done 1 Oct 2026)
- [x] S4-N3 `check-privileges.js` added for go-live: CREATE TRIGGER must be allowed or the append-only guarantees are lost (done 1 Oct 2026)

## Session log — build session 5 (planned)
- [x] S5-01 (done 7 Oct 2026 on demo staff, S6-03; real people swap in through groups and HODs) First real approval types (P2-50 to P2-55: MD, ED, Finance, Purchase & SCM) set up in the builder from the owner's staff list (D-033) and the Asana reference flows (FLOWS F-60 onward)
- [x] S5-02 Withdraw / cancel by the requester while still open, and reopen of an approved request by the Super Admin with a reason (F-29) (done 1 Oct 2026)
- [x] S5-03 Management dashboard: open requests by type and step, average time per level, overdue list, approvals per person (P7-01) (done 1 Oct 2026)
- [x] S5-04 Working days and a holiday calendar for SLA timing (F-31) (done 1 Oct 2026)
- [x] S5-05 Playwright end-to-end tests for sign-in guard, raise → approve → resubmit, delegation (P0-44) (done 1 Oct 2026)
- [x] S5-06 Branching paths (CONDITION) in the builder: "if amount > X go to these levels, otherwise those" (P3-01 step toward the canvas) (done 1 Oct 2026)
- [x] S5-07 (done 7 Oct 2026, S6-05; owner confirmed GoDaddy keeps files) Attachments on requests, once the GoDaddy disk check (Q-001) says local storage is persistent; otherwise S3-compatible storage
- [x] S5-06a Step map and DoA view understand choices; the request page shows the path taken (done 1 Oct 2026)
- [x] S5-04a Due and escalation times on the working calendar (escalate_at column); holiday screen in /admin/calendar (done 1 Oct 2026)
- [x] S5-08 Update the three living files; commit and push (done 1 Oct 2026)

Found and fixed during session 5:
- [x] S5-F1 Editing a saved workflow reused step ids (the builder counted from s1001 on every page load), so the save was refused with "id used twice". New steps now get random ids (done 1 Oct 2026)
- [x] S5-F2 Insights showed "0 min" for very quick decisions; it now says "under 1 min" (done 1 Oct 2026)
- [x] S5-N1 The SLA integration test now also moves `escalate_at` when it fakes elapsed time, since tasks now carry the calendar-based escalation time (done 1 Oct 2026)

## Session log — build session 6 (7 Oct 2026)
Owner's answers (7 Oct 2026):
1. Use dummy data for now, in place of the staff list.
2. Yes, GoDaddy keeps uploaded files (Q-001 disk), so attachments can go ahead.
3. Asked for every template format, to create the templates.
4. Asked for a DoA example.

The deployment go-ahead is still pending.

- [x] S6-01 Go-live on GoDaddy following docs/DEPLOYMENT.md (with the owner): privilege check, migrate, seed, env vars, cron, Firebase domain, provider keys, break-glass, go-live checks (waiting for the go-ahead) (done 9 Oct 2026: live since 8 Oct 2026; the owner publishes each release)
- [~] S6-02 Load the owner's staff list. Replaced by S6-02a for now (owner answer 1). The real list still comes later, through the user screens or a bulk import (P1-04)
- [x] S6-02a **Demo data** (D-071), loaded with one button in /superadmin/demo: (done 7 Oct 2026)
  - demo departments, designations and about 20 demo people, with managers, HODs and approver groups;
  - every demo person is marked "(demo)", has a `demo.` User ID, an itadmin+demo… email and no WhatsApp number;
  - safe to load twice; "Retire demo staff" makes them inactive (never deleted)
- [x] S6-03 **First approval types** F-60 to F-70 (P2-50 to P2-55): (done 7 Oct 2026)
  - built with the levels builder on the demo staff;
  - approvers come from groups and department HODs, so the real people can be swapped in later without editing workflows;
  - published, and each one passes its test-mode run
- [x] S6-03a **DoA example** (Q-004) built into Purchase & SCM. The amount bands add levels, and the DoA view shows the matrix. docs/DOA-EXAMPLE.md explains how to fill in the real values (done 7 Oct 2026)
- [x] S6-04 **WhatsApp templates** (Q-013, P0-14, P1-46): (done 7 Oct 2026)
  - one catalogue in code (`server/notifications/templates.ts`) with every event's wording, {{n}} variables in order, and sample values;
  - docs/NOTIFICATION-TEMPLATES.md for creating them in CEOITBox;
  - a /superadmin/templates screen to record the approved Meta name and switch each one on;
  - a test keeps the code, catalogue and document in step
- [x] S6-04a Escalation and "request blocked" messages also go on WhatsApp (they were email only) (done 7 Oct 2026)
- [x] S6-05 **Attachments** (D-072, F-18): (done 7 Oct 2026)
  - files on a request (raise, resubmit, or later while open), stored on disk outside the web root;
  - allowed types, size limits, file-type sniffing;
  - download only through a signed-in, permission-checked route;
  - shown in the timeline; never deleted
- [~] S6-06 Audit export (CSV) and login history for the Super Admin (P1-57). Moved to session 7 if time runs out (7 Oct 2026: moved to S7-03)
- [x] S6-07 Fix the duplicate flow number: F-70 was both "Price Realisation" and "Management dashboard". The dashboard becomes F-56 (done 7 Oct 2026)
- [x] S6-08 Tests (unit, integration, e2e) and the browser check; update the three living files; commit and push (done 7 Oct 2026)

Found and fixed during session 6:
- [x] S6-F1 An empty file box reached the server as a 0-byte file named "blob" and was refused as a wrong type, which blocked every plain submit. Empty entries are now ignored, with a regression test; the e2e suite caught it (done 7 Oct 2026)
- [x] S6-F2 The DoA view listed parallel reviewers as if they ran one after another; it now shows "A + B (together)" (done 7 Oct 2026)
- [x] S6-F3 Flow number F-70 was used twice; the dashboard is now F-56 (done 7 Oct 2026)

## Session log — build session 7 (8 Oct 2026)
Owner's instructions (8 Oct 2026):
- "When creating an approval I will create the DoA based on each approval; design the system based on that."
- "For all WhatsApp notification templates, create the WhatsApp notification template creator in the Super Admin. Use this as the master document for API services": CEOITBOX_API_Integration_Guide.docx and CEOITBOX_API_Master_Documentation.docx.

DoA per approval type (D-075, F-58):
- [x] S7-01 **DoA matrix** as part of each approval type: a new "DoA" level in the builder. (done 8 Oct 2026)
  - Holds: the amount field; the band limits (e.g. ₹1L / ₹10L / ₹25L / above); the approval levels (any approver source, rule, response time); and a tick grid of which levels each band needs.
  - Bands may be cumulative or not.
  - One per approval type. It can sit between ordinary levels (e.g. manager first, DoA, then accounts).
- [x] S7-02 The engine side: each DoA level compiles to an approval step that is skipped (AND/OR condition) in the bands where it isn't ticked. The checks: (done 8 Oct 2026)
  - every band needs a level;
  - the limits must rise;
  - the amount field must exist, be a number, and be required.
- [x] S7-03 New approval types start with an "Amount (₹)" field and a DoA matrix ready to fill in. The DoA view, request map, test mode and demo Purchase & SCM all use it (done 8 Oct 2026)
- [x] S7-04 Tests: compile/validate, routing at every band edge, DoA view, form checks (done 8 Oct 2026)

WhatsApp template creator (D-076, F-42), per the CEOITBox master document:
- [x] S7-05 CEOITBox client additions: (done 8 Oct 2026)
  - create a template (POST /api/v1/messageTemplate/create: name, language, category, components BODY/FOOTER with example.body_text);
  - sync from Meta (GET /api/v1/whatsapp/syncTemplatesFromMeta);
  - list templates (POST /api/v1/messageTemplate/getTemplates, paginated);
  - every send carries a userMessageId;
  - a 200 reply that carries an error object counts as a failure
- [x] S7-06 Registry storage per version: wording, footer, category, variable map, Meta status, rejection reason, last sync, submitted by/at (done 8 Oct 2026)
- [x] S7-07 /superadmin/templates becomes a creator. For each event: (done 8 Oct 2026)
  - write the wording with named placeholders ({{request_no}}…), which the app turns into {{1}}, {{2}} in order of use;
  - see a live preview, and submit it to CEOITBox for Meta approval;
  - "Sync status" pulls Meta's verdict: an approved template switches on by itself; a rejected one shows the reason;
  - "Send test to me" sends to the Super Admin's own number;
  - editing an approved template makes a new version (name _v2…); the old one keeps sending until the new one is approved
- [x] S7-08 docs/CEOITBOX-API.md: the endpoints and rules the app uses, from the master document. No keys, ever (done 8 Oct 2026)
- [x] S7-09 Tests: placeholder conversion, the create payload shape, a 200-with-error reply, sync status mapping, version rules (done 8 Oct 2026)

Carried over:
- [x] S7-10 Go-live on GoDaddy (S6-01) when the owner gives the go-ahead (still waiting for the go-ahead) (done 9 Oct 2026: live since 8 Oct 2026)
- [~] S7-11 Audit export (CSV) and login history (P1-57), attachments on custom approvals, work hand-off (F-32): to session 8 if time runs out (8 Oct 2026: moved to session 8, S8-02)
- [x] S7-12 Update the three living files; commit and push (done 8 Oct 2026)

Found and fixed during session 7:
- [x] S7-F1 Rejected (400), blocked (200 with an error) and bad-key (401) CEOITBox replies were all mapped to a retryable error, so they would have been retried. The guide says never retry 400 or 401, so only network and 5xx errors are retried now (done 8 Oct 2026)
- [x] S7-F2 On narrow screens the form-fields row of the builder made the whole page scroll sideways. It now wraps until large screens (done 8 Oct 2026)
- [x] S7-N1 Levels further down a request map show "Not needed at this amount (DoA)" straight away, instead of "Waiting", when the amount's band doesn't tick them (done 8 Oct 2026)

- [x] S7-F3 "Submit to Meta" did nothing in the browser pane: confirmations used window.confirm, which some browsers block silently (counted as Cancel), so nothing reached CEOITBox. All 8 confirmations are now an in-page "Yes, continue / Cancel" bar. Verified live: ars_approval_needed_v1 was submitted to CEOITBox and the sync shows it waiting for Meta (done 8 Oct 2026)
- [x] S7-L1 Live check with the owner's CEOITBox test key, entered by the owner in /superadmin: sync and list worked; the first template (ars_approval_needed_v1) was submitted (done 8 Oct 2026)

## Session log — build session 8 (planned)
- [x] S8-01 Go-live on GoDaddy (docs/DEPLOYMENT.md) when the owner gives the go-ahead. Then enter the new CEOITBox key, submit the 20 templates, sync and test-send each (done 9 Oct 2026: live since 8 Oct 2026; templates: 11 live, rest with Meta)
- [x] S8-02 Audit export (CSV) and login history (P1-57); attachments on custom approvals; work hand-off after approval (F-32) (done 9 Oct 2026: v1.4.0: audit CSV, sign-in history, custom attachments; hand-off = work steps)
- [x] S8-03 CEOITBox webhook for delivery and read receipts (HTTPS, secret header), shown in Message deliveries (done 9 Oct 2026: v1.4.0: /api/webhooks/ceoitbox; payload to confirm with CEOITBox (DEPLOYMENT G6))
- [x] S8-05 QA test-case suite for the whole platform (owner's master QA prompt, 8 Oct 2026): docs/qa/QA-TEST-SUITE.md, specific to this app (real statuses, roles, DoA, CEOITBox, attachments). It includes a traceability matrix, defect risks found by reading the code, and the smoke, sanity, regression and critical suites (done 8 Oct 2026: 600 cases; P0 160, P1 201, P2 150, P3 89; smoke 24, sanity 18, regression 361, critical 144; generated from docs/qa/source)
- [x] S8-06 Fix the QA defects (owner: "fix all the defects", 8 Oct 2026):
  - [x] S8-06a D-QA-04: amounts in a DoA field (and amount fields generally) can't be negative. NUMBER fields gain a minimum; the DoA field is enforced at ≥ ₹0 on the server (done 8 Oct 2026)
  - [x] S8-06b D-QA-01: idempotent submit. A one-time submission key on each form, stored unique per requester; a repeat returns the first request (done 8 Oct 2026)
  - [x] S8-06c D-QA-02: same requester, type and title within 10 minutes → "looks like a duplicate", with a tick to raise it anyway (done 8 Oct 2026)
  - [x] S8-06d D-QA-03: attachments are counted under the request lock; the same file (sha256) isn't stored twice on a request (done 8 Oct 2026)
  - [x] S8-06e D-QA-05: over-long comments and reasons are refused with the limit shown, instead of cut silently (done 8 Oct 2026)
  - [x] S8-06f D-QA-06: notification outbox. Messages are written in the same transaction as the decision, sent after the commit, and any left unsent are sent by the job runner (done 8 Oct 2026)
  - [x] S8-06g D-QA-09: the job runner syncs WhatsApp template status from Meta once a day (done 8 Oct 2026)
  - [x] S8-06h D-QA-11: My requests gets search (number or title), a status filter and paging (done 8 Oct 2026)
  - [x] S8-06i D-QA-15: line breaks stripped from email subjects (done 8 Oct 2026)
  - [x] S8-06j D-QA-07 and D-QA-13 checked: already handled (deactivation with pending approvals is refused; reminders skip held requests). Correct the QA document (done 8 Oct 2026)
  - [x] S8-06k D-QA-08, D-QA-10, D-QA-14: the owner chose to keep them as they are (D-078) (done 8 Oct 2026)
Found during S8-06:
- [x] S8-F1 The new duplicate check ran before field validation, so a negative amount on a repeated title showed the duplicate message instead of the amount error. It now runs inside the transaction, after the form is valid; the e2e test caught it (done 8 Oct 2026)
- [x] S8-07 Prepare the production release v1.0.0 (owner, 8 Oct 2026):
  - Found and fixed S8-F2: CI's e2e job had failed since session 6, because on Node 22 an empty file box arrives as a 0-byte "undefined" file and blocked every plain submit;
  - updated DEPLOYMENT.md (migration list, new CEOITBox key, templates, cron jobs, UPLOAD_DIR, demo option, extra go-live checks, known limits);
  - RELEASE-NOTES.md; version 1.0.0; .nvmrc 22;
  - tag v1.0.0 once CI is green (done 8 Oct 2026)
- [x] S8-08 Owner asked for a complete step-by-step deployment guide and an env file to upload (done 8 Oct 2026):
  - the production env file is generated outside the repo (`D:\Omniroute\deploy-secrets`), with fresh secrets never shown in chat;
  - `start:production` (migrate + seed + start) and `db:check`;
  - DEPLOYMENT.md rewritten as Parts A–O;
  - v1.0.1
- [x] S8-09 Domain is approval.arssteels.net (D-079): code fallback, docs, samples and tests updated; APP_BASE_URL in the env file updated (done 8 Oct 2026)
- [x] S8-10 First GoDaddy deploy: the live app started (DB set up by the start command). Fixed the preview build failure (stale .next, v1.0.3). Sender changed to approvals@arssteels.net with reply-to IT (D-080) (done 8 Oct 2026)
- [x] S8-11 First live run at approval.arssteels.net (done 8 Oct 2026):
  - Cloudflare email obfuscation broke hydration (React #418) → addresses are now rendered split (SafeText);
  - Google sign-in 401 → the Firebase key is accepted in any paste format, and verification failures are logged;
  - v1.0.4
- [x] S8-12 Google sign-in reached UNKNOWN_ACCOUNT: itadmin@ is an alias. The Super Admin now signs in as itsupport@arsenergy.co.in (D-082, migration + non-overwriting seed, v1.0.5) (done 8 Oct 2026)
- [x] S8-01b Go-live on GoDaddy with the owner, following docs/DEPLOYMENT.md (the owner is at the wizard's "Add secrets" step) (done 9 Oct 2026: live since 8 Oct 2026)
- [x] S8-04 Update the three living files; commit and push (done 8 Oct 2026)

## Session log — v1.16.0 Pic bot - ai (branch feature/pic-bot, 24 Oct 2026), planned before starting
Plan: `docs/CHATBOT_IMPLEMENTATION_PLAN.md`; audit: `docs/CHATBOT_ARCHITECTURE_AUDIT.md`, `docs/CHATBOT_CURRENT_STATE_AUDIT.md`.
- [x] PB-01 Audit and plan documents (done 24 Oct 2026)
- [x] PB-02 Per-person chat modes and Salesforce scope (migration, user form, rules, audit) (done 24 Oct 2026)
- [x] PB-03 Conversation mode, idempotency key (answered / failed / pending), owner delete (done 24 Oct 2026)
- [x] PB-04 Mode enforcement: effective modes (administrator wins), tools per mode, instructions per mode, revocation per request, emergency stop (done 24 Oct 2026)
- [x] PB-05 Limits: per minute (MySQL), per person and global concurrency (bounded queue), Retry-After retry with jitter, Stop (abort) (done 24 Oct 2026)
- [x] PB-06 JSON API `/api/ai/chat`, `/api/ai/conversations[/id]` mapped to the AI page rule (done 24 Oct 2026)
- [x] PB-07 Floating launcher (supplied logo) and chat panel (history, new chat, delete, copy, retry, stop, scope label, keyboard, phone) (done 24 Oct 2026)
- [x] PB-08 Salesforce OAuth (web server + PKCE, encrypted tokens, refresh, reconnect, revoke, test) and live allowlisted queries (USER_MODE, OWN scope by email); hourly copy moved to the same connection (done 24 Oct 2026)
- [x] PB-09 Super Admin: switches, limits, Salesforce card, usage by person, failures, events, live counts, cost estimate from entered prices (done 24 Oct 2026)
- [x] PB-10 Tests: unit (`tests/ai/picbot.test.ts`), integration (`ai-assistant`, `ai-concurrency`), e2e (`picbot.spec.ts` incl. 10 HTTP clients with a mock provider) (done 24 Oct 2026)
- [x] PB-11 Documents: deployment guide, security checklist, concurrency report, implementation report, feature verification; `.env.example` (done 24 Oct 2026)
- [ ] PB-12 Owner: publish; provider key + Test; decide business data per provider; tick AI and chat modes for a trial group
- [~] PB-13 Owner: Salesforce sandbox Connected App (callback URL from AI settings, PKCE) + integration user; then Connect and Test (24 Oct 2026: UAT sandbox External Client App connected, Test connection passed; still open: a read-only integration user instead of a person's account, see PB-15)
- [x] PB-14 Deployment guide: troubleshooting for the connect errors met in the UAT trial (redirect_uri_mismatch, invalid_scope with an MCP-only app, callback server not running, MCP URL in My Domain) (done 24 Oct 2026)
- [x] PB-16 Settings save: an optional value left empty stays unset instead of failing validation (unused provider models); plain wording for string length errors; unit test (done 24 Oct 2026, v1.16.1)
- [x] PB-17 Fixed-choice settings shown as dropdowns with plain names (options from the enum schema), labels without the raw values; dropdown keeps the saved choice after a save (done 24 Oct 2026, v1.16.1)
- [x] PB-18 Providers Groq, Gemini (Google AI Studio) and NVIDIA Nemotron: OpenAI-style addresses, settings (key, model, business data), enum choices, model names with "/", tool calls without an id, reasoning-model room in Test and a clear "ran out of room" message; unit tests (done 24 Oct 2026, v1.17.0)
- [x] PB-19 NVIDIA default model nvidia/nemotron-3.5-bolt-e4b (owner's NVIDIA reference); local Test passed with the owner's test key (done 24 Oct 2026, v1.17.1)
- [x] PB-20 Salesforce "*" = every object the connected user can query (describe-validated names, USER_MODE, 50 rows); salesforce_fields tool; hourly copy needs a list; tests (done 24 Oct 2026, v1.18.0)
- [x] PB-21 Super Admin unrestricted in Pic bot: every mode, Salesforce scope ALL; emergency stop still applies; user page explains; tests (done 24 Oct 2026, v1.18.0)
- [x] PB-22 Reliability: 6 rounds, retry malformed tool calls (Groq), final-round instruction, compact Salesforce lists; e2e fixed for seven providers (done 24 Oct 2026, v1.18.0)
- [x] PB-23 Analyst answers: persona and format rules, Markdown renderer (headings, lists, tables), metric cards and bar/line charts, figure check ignores dates, friendly errors, salesforce_group breakdowns (done 25 Oct 2026, v1.19.0)
- [x] PB-24 ChatGPT-style assistant page per the owner's sketch: strip (new chat, AI limit, connection), avatars, composer; sidebar AI Assistant group with chat search, pin, rename, delete (migration 202610251200) (done 25 Oct 2026, v1.19.0)
- [x] PB-25 Old AI pages redirect to the assistant; Data Sources, AI Reports, AI Activity History under Super Admin → AI Details; Salesforce Settings page; AI settings by General / provider / Common (done 25 Oct 2026, v1.19.0)
- [x] PB-26 Hover hints (page headers, field hints, setting labels), ON/OFF switches and checkbox lists in settings, themed thin scrollbars (done 25 Oct 2026, v1.19.0)
- [x] PB-27 Try as for every person (IT Admin and Super Admin): one-time link, private window, view-only session enforced centrally, banner, audit (migration 202610251300) (done 25 Oct 2026, v1.19.0)
- [x] PB-28 AI Rules page (Admin): per chat or all chats, formatted editor saved as Markdown, sent to every provider after the safety rules, audited (migration 202610251400) (done 25 Oct 2026, v1.19.0)
- [x] PB-29 Declutter sweep: instructions as hover hints across Admin (forms, workflow builder, user form, module types, imports, dashboards), Super Admin, requests, modules, user pages, analytics and shared components; status, data, warnings and confirm text kept visible; 6 e2e tests moved to the hints (done 25 Oct 2026, v1.20.0)
- [x] PB-30 Public landing page "ARS Internal Workspace" per the owner's spec: header, hero, footer; /login reused; title, description, manifest and title template renamed (done 25 Oct 2026, v1.20.0)
- [x] PB-32 Home page on the sign-in split layout with a smooth welcome → sign-in transition; AuthLayout full height (done 25 Oct 2026, v1.20.1)
- [x] PB-33 Admin → Records: three registers, filters, sorting, paging, CSV download; page access, nav; unit, integration and e2e tests (done 25 Oct 2026, v1.21.0)
- [x] PB-35 Bug 1: New chat after an answer returned to the old chat; fixed and covered by e2e (done 25 Oct 2026, v1.22.0)
- [x] PB-36 Rename the assistant to Pico Bot (Progress Insight Companion Bot) (done 25 Oct 2026, v1.22.0)
- [x] PB-37 Admin → AI Analytics with unit, integration and e2e tests (done 25 Oct 2026, v1.22.0)
- [x] PB-38 Automated site audit (all roles, desktop and touch phone) in the e2e suite; static internal-link check; npm audit 0 (done 25 Oct 2026, v1.22.0)
- [x] PB-39 Rename to ARS-CMS (Central Management System) without touching Meta-approved WhatsApp wording (done 25 Oct 2026, v1.22.0)
- [x] PB-40 Domain move prepared in code: single base-URL helper, LEGACY_HOSTS redirect (machine callers and OAuth callbacks exempt), unit tests, docs/DOMAIN-MIGRATION.md (done 25 Oct 2026, v1.22.0)
- [x] PB-41 Phone layout: six pages scrolled sideways (sr-only label in wide tables); fixed globally (done 25 Oct 2026, v1.22.0)
- [x] PB-48 Rollback to approval.arssteels.net in the app (default address, policies, samples, runbook) (26 Oct 2026, D-199)
- [x] PB-71 Task & Project Management data model, General task type, one visibility rule (30 Oct 2026, D-215)
- [x] PB-72 Projects: privacy, members and roles, sections, List, Board, Calendar, Timeline, Overview and status updates, archive/delete/restore (30 Oct 2026, D-215)
- [x] PB-73 Tasks and subtasks, dependencies, milestones, tags; collaboration: comments, replies, mentions, followers, likes (30 Oct 2026, D-215)
- [x] PB-74 My Tasks and Task home; task search, saved searches, Ctrl+K tasks and projects, keyboard, deleted tasks (30 Oct 2026, D-215)
- [x] PB-75 Multi-level reporting hierarchy for task and project visibility, Team tasks, My team (30 Oct 2026, D-216)
- [x] PB-76 Holidays for tasks: warn/block/off, prompt, calendars, reminders held, Admin → Task holidays with move/tell (30 Oct 2026, D-217)
- [x] PB-77 Repeating tasks, project templates and copies, project fields, task inbox with morning summary, bulk actions, department holidays (30 Oct 2026, D-218)
- [x] PB-79 Ticks on every task list and Mark complete; periodic and ad hoc tasks; the Asana skeleton (left bar, task pane, headers, Home, Inbox) per the screen catalog (30 Oct 2026, D-219)
- [x] PB-80 Compact table with Filters, Sort, Groups, Options and saved tabs; Share for projects and tasks; Draft task; New project step by step; Save as template from the menu (30 Oct 2026, D-220)
- [x] PB-82 Compact sidebar in the Tasks bar style with + Create (Approval, Task, Project, Information) (30 Oct 2026, D-221)
- [x] PB-83 Periodic and Ad hoc tasks: ad hoc for several people, creator-only details; Project permissions (fields, sharing tasks) (30 Oct 2026, D-222)
- [x] PB-84 Tasks & projects sidebar group; the Tasks area's bar removed (31 Oct 2026, D-223)
- [x] PB-85 Draft task: Myself (default) or Others, people found by typing (31 Oct 2026, D-224)
- [x] PB-86 My Tasks Overdue section (31 Oct 2026, D-225)
- [x] PB-87 The task table's toolbar (Filter, Sort, Group, Options, Search) on the request, queue, information and typed-task lists (31 Oct 2026, D-226)
- [x] PB-94 UI states audit and completion (offline/slow/no results/unsaved/429/view-only/maintenance/copy) (31 Oct 2026, D-233)
- [x] PB-95 The 24 UX laws: audit, implement, four reports (31 Oct 2026, D-234)
- [x] PB-90 Collapsible sidebar (Asana's rail) in every space (31 Oct 2026, D-229)
- [x] PB-91 Profile with all user-master details, photo upload, About me, colleagues' cards (31 Oct 2026, D-230)
- [x] PB-92 Notification control centre: app/email/WhatsApp per kind, summaries, Do not disturb (31 Oct 2026, D-231)
- [x] PB-93 Universal search like Asana: chips, recents, saved searches, people, Filters (31 Oct 2026, D-232)
- [x] PB-89 Asana's toolbar look (pills with ×, Search icon, line before Options) on every list incl. Admin → Records (31 Oct 2026, D-228)
- [x] PB-88 Classic view like Tally for every form, entry screen and report (31 Oct 2026, D-227)
- [~] PB-81 (toolbar done in PB-87; the numbered, editable table stays for tasks) Same table and toolbar for the Approval and Information lists, if the owner wants the whole app in this style (2 Nov 2026: owner: keep the current Approval and Information lists; closed)
- [ ] PB-78 Not planned unless asked (Asana spec §5): portfolios, goals, workload, rules builder, forms, guests, integrations, saved view tabs
- [x] PB-69 Custom loaders: sign-in to main page, every Classic page change (29 Oct 2026, D-214)
- [x] PB-70 Classic navigation in and out for every role: Overview back, page titles, Esc out of text boxes, spaces and Quit (29 Oct 2026, D-214)
- [x] PB-68 Classic keyboard works with closed confirmations on the page (29 Oct 2026, D-213)
- [x] PB-67 Classic view as the sketch's three separate screens (28 Oct 2026, D-212)
- [x] PB-66 Classic view text size, five steps, saved per person (28 Oct 2026, D-211)
- [x] PB-64 Reminder and escalation rules, Admin-configurable on any field (28 Oct 2026, D-209)
- [x] PB-65 Classic (Tally-style) and Compact views, switch and save per person (28 Oct 2026, D-210)
- [x] PB-63 Sign-in method Both (28 Oct 2026, D-208)
- [x] PB-62 My Approvals menu: new order, "My pending requests" (28 Oct 2026, D-207)
- [x] PB-58 Custom approval options configurable (DoA, choice, skip; off by default; server-enforced) (27 Oct 2026, D-206)
- [x] PB-59 Renames: Request templates / New request (27 Oct 2026, D-206)
- [x] PB-60 Tasks order: New task, My tasks, Assigned by me, Team tasks (27 Oct 2026, D-206)
- [x] PB-61 Analytics per person by module and role; Opening… fix (27 Oct 2026, D-206)
- [x] PB-57 Salesforce guide for Pico Bot in AI Rules (survey of 47 objects, recipes, data traps), loaded by migration if empty; Combined chats get each source's rules; DOB/KYC hidden (26 Oct 2026, D-205)
- [x] PB-56 360-degree requests: scope list fix, partial answers, longer answers with one retry, 8 rounds, tool_choice none on the last round, identity/bank fields hidden (26 Oct 2026, D-204)
- [x] PB-55 Question leaves the box when sent; back only on failure (26 Oct 2026, D-203)
- [x] PB-53 Pico Bot reliability: everyday names, cut-off lists, unanswered questions, tool-call shapes, retries, longer wait (26 Oct 2026, D-202)
- [ ] PB-54 Owner: decide the provider for Salesforce chats (Claude worked; NVIDIA bolt-e4b too small); reconnect Salesforce to production for real figures
- [x] PB-51 Pico Bot accuracy: Salesforce date-times, lookup names, object labels, two-level breakdowns, invented figures blocked, secret fields hidden (26 Oct 2026, D-201)
- [ ] PB-52 Owner: publish v1.23.0; retest the secondary-order and executive-login questions in a new Salesforce chat
- [x] PB-50 Split-screen home page back, Google-safe (26 Oct 2026, D-200)
- [x] PB-49 (26 Oct 2026: done by the owner, checked live) Owner: rollback steps in docs/DOMAIN-MIGRATION.md → Rollback
- [~] PB-42 (26 Oct 2026: superseded by the rollback, D-199) Owner: move to arssteels.net following docs/DOMAIN-MIGRATION.md (Steps 1–7)
- [x] PB-44 Home page states its purpose in visible text; migration guide uses GoDaddy DNS; Google verification findings mapped to fixes (26 Oct 2026, D-197)
- [x] PB-46 Home page rebuilt as a public page about the app: name, purpose, features, Google data use, policy links (26 Oct 2026, D-198)
- [ ] PB-47 Owner: cron URL and CEOITBox webhook to arssteels.net; reconnect approval.arssteels.net to the app (LEGACY_HOSTS redirect)
- [ ] PB-45 Owner: Google OAuth verification resubmit (Search Console TXT for arssteels.net, Branding name ARS-CMS, logo, links) after the move
- [ ] PB-43 Owner, optional: resubmit WhatsApp templates with "ARS-CMS"; verify arssteels.net in Resend and switch the From address
- [x] PB-34 Owner choice: show the request amount in Records (needs a rule for confidential amount fields) (2 Nov 2026: owner: show it, hide confidential; done in v1.46.0, D-278)
- [ ] PB-31 Owner: Google OAuth consent screen app name and home page to match "ARS Internal Workspace"; re-check verification status (Q-025)
- [ ] PB-15 Owner: allowed Salesforce objects and fields; then a Salesforce chat test (V-12); production Connected App with the production callback; rotate the UAT consumer secret (it was shared in chat)

## Session log — AI module (branch feature/ai-module, 24 Oct 2026), planned before starting
Design: `docs/ai-module/architecture.md` (decisions §1), `discovery-report.md`, `risk-register.md`.
- [x] AI-01 Phase 1 discovery: existing architecture, user schema, roles, guards, page access, sidebar, hosting, risks (done 24 Oct 2026)
- [x] AI-02 Owner decisions recorded: API-based models only, one application, same repository (branch + worktree), four switchable providers (done 24 Oct 2026)
- [x] AI-03 Phase 3 module access: `users.module_access` SET column, default Approval + Task + Information (existing people and every way of creating one keep today's access; AI for nobody). A column default instead of a grants table, so no creation path can be missed (done 24 Oct 2026)
- [x] AI-04 Pages name their module; page access refuses a missing module (pages, Server Actions, APIs); sidebar, Ctrl K, bottom bar and tour follow; Overview and Calendar follow; Super Admin exempt (done 24 Oct 2026)
- [x] AI-04b Shared pages, the rest: Analytics boards (Tasks / Information / mixed) and Google Calendar sync should leave out modules the person lacks (2 Nov 2026: found done in v1.40.0 (D-246): Analytics boards by module (D-206) and Google Calendar sync by module (calendarKindAllowed))
- [x] AI-05 Add user / Edit user "Module access" check boxes; saved only when sent and changed; rules (no self-change; another IT Admin's: Super Admin only); audited before/after (done 24 Oct 2026)
- [x] AI-06 Users list shows modules and filters by module; user page shows them; import keeps the default (done 24 Oct 2026)
- [x] AI-07 Tests: `tests/modules/module-access.test.ts`, `tests/integration/ai-modules.int.test.ts`, `tests/e2e/ai-modules.spec.ts` (done 24 Oct 2026)
- [x] AI-08 Phase 4 AI module shell: "AI" sidebar group (own icon, collapsible) under Information; seven AI pages (`/users/ai/...`) with honest "not connected" states; AI settings (`/superadmin/ai`); "ai" feature switch (on by default: the module grant is the gate, nobody has it until ticked) (done 24 Oct 2026)
- [x] AI-09 Phase 5 providers: Claude, ChatGPT, Grok, DeepSeek adapters (`server/ai/providers.ts`, tool calling in both API shapes); Super Admin AI settings (keys encrypted, model, "may see business data" per provider, active + fallback, Test button); routing (`routeFor`); daily limit, size, timeout; usage per provider (done 24 Oct 2026)
- [x] AI-10 Phase 5 assistant: tool registry (`server/ai/tools.ts`: approvals, requests, tasks, information, Salesforce datasets, propose_action; module-checked at run time), tool loop (4 rounds), figure check (`validate.ts`), evidence panel, conversations owned in SQL, Activity History, AI Dashboard with live figures by code (done 24 Oct 2026)
- [x] AI-11 Phase 6 connector framework (`ai_sync_runs`, `ai_source_records`, checkpoints from the last good run, freshness, Data Sources page) + ARS data tools + Salesforce read-only client (client credentials, paging, incremental, no duplicates; hourly via the AI upkeep job; Sync now). Tested with a fake Salesforce only (done 24 Oct 2026)
- [ ] AI-11b Owner: Salesforce sandbox integration user + connected app; Oracle reporting views, account and a relay host (GoDaddy can't reach Oracle); Power BI datasets (Q-AI-05)
- [x] AI-12 Phase 7 proposals: `propose_action` → `ai_proposals`; approver = reporting manager (else IT Admin), never the requester or the AI; version + content hash; 7-day expiry (job + at decision); reason to reject; audited with `executed: false`; execution switched off (done 24 Oct 2026)
- [x] AI-13 Phase 8 docs (`docs/ai-module/`: security-design, ai-model-routing, approval-workflow, integrations-and-data, release-and-rollback, README), tour step for AI, tests (done 24 Oct 2026)
- [x] AI-13b Full local run on the branch (no dev server in the same folder); owner asked to make it the main production application: merged into `main` as v1.15.0 and pushed (done 24 Oct 2026)
- [ ] AI-13c Owner: enter a provider key in AI settings, Test, try the assistant; decide "may see business data" per provider (DeepSeek and Grok after an information-security review)

## Session log — v1.14.0: onboarding tour; invite buttons on the user page only (23 Oct 2026), planned before starting
- [x] V1140-01 Owner: remove Re-invite / Reset password from the users list (keep them on the user page) (done 23 Oct 2026)
- [x] V1140-02 Tour steps (pure list): welcome, Overview, New request, Custom approval, Waiting for me, My requests, My tasks, New task, Information, Calendar, Google Calendar, notifications, Go to, Out of office, finish (done 23 Oct 2026)
- [x] V1140-03 Tour overlay: opens each step's page, highlights the part, Back / Next / Skip, step count and progress, keyboard (←, →, Esc), focus kept in the card, phone layout, steps for hidden pages skipped (done 23 Oct 2026)
- [x] V1140-04 Opens once by itself on Overview; saved per person (TOUR_DONE flag) when finished or skipped; "Take the tour" in Help, the account menu and the first-use card (done 23 Oct 2026)
- [x] V1140-05 Tests: unit (steps), E2E (auto-open once, walk through, restart from Help, phone); test users marked done so other tests aren't covered (done 23 Oct 2026)
- [x] V1140-06 Living files; full local run; push; CI (done 23 Oct 2026)
- [ ] V1140-07 Owner: after publishing, every user sees the tour once on Overview; try it yourself from the account menu → Take the tour

## Session log — v1.13.0: invite user and reset password by email (23 Oct 2026), planned before starting
- [x] V1130-01 Owner decision recorded: the WhatsApp code on set-password/reset stays (D-025 unchanged); messages by email only (done 23 Oct 2026)
- [x] V1130-02 Invitation email: Google users (sign in with Google as …) and password users (User ID + set-password link); audit USER_INVITED (done 23 Oct 2026)
- [x] V1130-03 Reset password email (separate wording, PASSWORD_RESET_LINK event and audit); button named by state (Reset password / Send set-password link) (done 23 Oct 2026)
- [x] V1130-04 Add user: "Email an invitation now" (default on); the created banner says whether it went (done 23 Oct 2026)
- [x] V1130-05 User page: Send invitation and Reset password buttons; same edit rules (done 23 Oct 2026)
- [x] V1130-05b Owner (mid-task): Re-invite and Reset password also on each row of the users list; results as a notice so the row keeps its width (done 23 Oct 2026)
- [x] V1130-06 Tests: unit (invite, reset, rules), E2E `v1130-invite.spec.ts` (Add user, user page, users list, phone width); living files; push; CI (done 23 Oct 2026)
- [ ] V1130-07 Owner: check email (Resend) is set up in Super Admin; then try Re-invite on yourself or a test user

## Session log — v1.12.7: Next.js security update (23 Oct 2026), planned before starting
- [x] V1127-01 CI audit failed on aad9fb2: next 15.5.27 critical (GHSA-2464-fhr4-w9xw, GHSA-p3m5-59mp-jv5r); upgrade next and eslint-config-next to 15.5.28; audit clean (done 23 Oct 2026)
- [x] V1127-02 Full local run (lint, typecheck, unit, integration, E2E, QA, origin); push; CI (done 23 Oct 2026)
- [ ] V1127-03 Owner: publish v1.12.7

## Session log — v1.12.6: Google Calendar sends people to localhost (23 Oct 2026), planned before starting
- [x] V1126-01 Cause: connect and callback built their redirect from `request.url`, which is `http://localhost:20011` behind the host's proxy (done 23 Oct 2026)
- [x] V1126-02 `lib/http/redirect.ts` `redirectToPage` (relative 303, own paths only); both routes use it; unit + E2E checks (done 23 Oct 2026)
- [ ] V1126-03 Owner: publish; Profile → Calendar should show Connected (else press Connect again)

## Session log — v1.12.5: "Couldn't reach the server" on submit and delete (20 Oct 2026), planned before starting
- [x] V1125-01 Diagnose on live (read-only): health ok, one build, origin check passes; a page from an older build gets "Server action not found" and the form showed "Couldn't reach the server" (done 20 Oct 2026)
- [x] V1125-02 `actionErrorMessage`: UnrecognizedActionError → "ARS was updated, reload"; digest → server error with reference; unexpected answer named; session check kept first (done 20 Oct 2026)
- [x] V1125-03 Update banner with Reload page; `/api/auth/status` returns the build; the minute check compares it with the page's (done 20 Oct 2026)
- [x] V1125-04 Discard draft, draft autosave and theme use the same messages; unit + E2E tests (`v1125-stale-page.spec.ts`) (done 20 Oct 2026)
- [ ] V1125-05 Owner: publish v1.12.5, reload open tabs; if a submit still fails, send the message (it now names the cause or a reference)

## Session log — v1.12.4: upload failures (20 Oct 2026), planned before starting
- [x] V1124-01 Find the cause: the upload folder isn't writable; the task form threw outside its try (done 20 Oct 2026)
- [x] V1124-02 Storage check, plain messages, Super Admin panel and alert, health field, DEPLOYMENT row, test (done 20 Oct 2026)
- [ ] V1124-03 Owner: after publishing, Super Admin → Overview → File storage must be green; else set UPLOAD_DIR (Part C)

## Session log — v1.12.3: Google connect errors (17 Oct 2026), planned before starting
- [x] V1123-01 Clear SCOPE / NO_REFRESH messages; accept broader calendar grants; audit granted scope names; test (done 17 Oct 2026)

## Session log — v1.12.2: Google OAuth verification readiness (17 Oct 2026), planned before starting
- [x] V1122-01 Public home page, privacy policy (Limited Use) and terms; links from sign-in (done 17 Oct 2026)
- [x] V1122-02 Narrow the calendar scope to calendar.events.owned; owner-only calendar list (done 17 Oct 2026)
- [x] V1122-03 120 px logo; the filing guide (shared doc) (done 17 Oct 2026)
- [x] V1122-04 Tests, v1.12.2, push, CI (done 17 Oct 2026)

## Session log — v1.12.1: owner follow-ups (17 Oct 2026), planned before starting
- [x] V1121-01 Analytics: dashboard and scope as dropdowns (done 17 Oct 2026)
- [x] V1121-02 Inactivity sign-out for everyone after 30 minutes; signed-out page with the reason and Sign in again (done 17 Oct 2026)
- [x] V1121-03 Google Calendar for other domains: diagnose org_internal; consent screen External; guidance in the app and docs (done 17 Oct 2026)
- [x] V1121-04 Tests, v1.12.1, push, CI (done 17 Oct 2026)

## Session log — v1.12.0: Analytics Center (16 Oct 2026), planned before starting
Owner brief: a complete Analytics Center with Approval, Task and Information analytics on one page.
- [x] V1120-01 Audit the current state and data gaps (`APPLICATION_CURRENT_STATE_AUDIT.md` Part B) (done 16 Oct 2026)
- [x] V1120-02 Board tabs on the Analytics page; shared filters that carry over; new periods (done 16 Oct 2026)
- [x] V1120-03 Executive overview with comparisons and explainable alerts (done 16 Oct 2026)
- [x] V1120-04 Task analytics; Information analytics (eligible-recipient denominator; opened, delivered and acknowledged kept apart) (done 16 Oct 2026)
- [x] V1120-05 Employee and Department analytics (separate modules, scoped); SLA & performance; Trends & forecasts; Data quality (done 16 Oct 2026)
- [x] V1120-06 Metric dictionary: board, reliability, limits for every metric; CSV exports (scoped, audited) (done 16 Oct 2026)
- [x] V1120-07 Tests (unit, integration, E2E), tracker, test report, v1.12.0, push, CI (done 16 Oct 2026)

## Session log — v1.11.0: Google Calendar two-way sync (16 Oct 2026), planned before starting
Owner brief: Super Admin-controlled Google Calendar integration with true two-way sync.
- [x] V1110-01 Audit the current state (`application-audit/APPLICATION_CURRENT_STATE_AUDIT.md`, Part A) (done 16 Oct 2026)
- [x] V1110-02 Migration: settings, connections, personal entries, links, jobs, conflicts, OAuth states (done 16 Oct 2026)
- [x] V1110-03 Super Admin Integrations → Google Calendar: configure, test, enable/disable, maintenance, health, logs, failed + retry, connected + revoke, conflicts, audit (done 16 Oct 2026)
- [x] V1110-04 OAuth connect/callback (state + nonce, encrypted tokens), Profile → Calendar tab (done 16 Oct 2026)
- [x] V1110-05 Sync engine: incremental pull, 410 recovery, push with fixed ids, loops, deletions, conflicts; webhook; channel renewal; jobs step with backoff and dead-letter (done 16 Oct 2026)
- [x] V1110-06 Modules: approval due, task due, needed-by, information "Show on calendars", personal entries (done 16 Oct 2026)
- [x] V1110-07 Calendar month/week/day views, filters, source and sync indicators, personal entries (done 16 Oct 2026)
- [x] V1110-08 Tests (unit, integration with fake Google, E2E), docs, final report, v1.11.0, push, CI (done 16 Oct 2026)

## Session log — v1.10.0: security hardening and website fixes (16 Oct 2026), planned before starting
Owner brief: 19 security checks and 20 website fixes, with an audit, a tracker and a final report.
- [x] V1100-01 Audit the 39 items; write `application-audit/SECURITY_AND_WEBSITE_AUDIT.md` (done 16 Oct 2026)
- [x] V1100-02 AUD-01: contact rule in the CSV import (done 16 Oct 2026)
- [x] V1100-03 AUD-03: the seed gives roles only when none exist (done 16 Oct 2026)
- [x] V1100-04 G-1/G-2/G-3: page rules bound to the action; Super Admin addresses; security page not restrictable (done 16 Oct 2026)
- [x] V1100-05 Rate limits (PDF, quick, notifications, downloads, dashboard CSV, webhook) (done 16 Oct 2026)
- [x] V1100-06 Headers: Cache-Control, CORS preflight, HTTPS redirect (done 16 Oct 2026)
- [x] V1100-07 Audit gaps: lifecycle, schedule/alert toggles, dashboard CSV; generic export error (done 16 Oct 2026)
- [x] V1100-08 Website: titles, favicon, logo link, copyright, phone menu, bottom bar, mailto, ConfirmDialog (done 16 Oct 2026)
- [x] V1100-09 Tests: route inventory, SQL, middleware, integration, five-viewport E2E, link crawl, IDOR (done 16 Oct 2026)
- [x] V1100-10 Tracker and final report; v1.10.0; push; CI (done 16 Oct 2026)

## Session log — v1.9.2: user sidebar regrouped (16 Oct 2026), planned before starting
Owner: Overview; My Approvals, Tasks and Information as collapsible groups (pages in the given order); Search; Calendar; Analytics.
- [x] V192-01 Collapsible groups in the sidebar (users space and phone menu), the owner's order, remembered choice, auto-open of the current group (done 16 Oct 2026)
- [x] V192-02 Tests updated and a new sidebar E2E; docs; v1.9.2; push; CI (done 16 Oct 2026)

## Session log — v1.9.1: deploy fix (16 Oct 2026), planned before starting
Owner: the v1.9.0 preview build on GoDaddy failed at start.
- [x] V191-01 Read the GoDaddy runtime log: migration CREATE TRIGGER refused (no SUPER, binary logging on) (done 16 Oct 2026)
- [x] V191-02 Optional trigger blocks in migrate.js; mark the v1.9.0 history triggers optional; phpMyAdmin file; DEPLOYMENT row; integration test reproducing the refusal (done 16 Oct 2026)
- [x] V191-03 Checks, v1.9.1, push, CI (done 16 Oct 2026)

## Session log — v1.9.0: Approval, Task and Information modules (16 Oct 2026), planned before starting
Owner brief: three independent business modules (Approval, Task, Information) configured by IT in the Admin space and operated by users, a notification bell dropdown (latest 10) with Approval / Task / Information views, and a sidebar that scrolls on its own. Reuse the engine, form builder, outbox, audit and page access; no second approval engine.
- [x] V190-01 Inventory of what exists vs what is missing (`application-audit/13_MODULES_IMPLEMENTATION_REGISTER.md`), filled from the code (done 16 Oct 2026)
- [x] V190-02 Shared form fields: currency, date and time, multi-select, checkbox, radio, URL; per-field "show in lists", "searchable", "can be edited later"; the same builder for all three modules (done 16 Oct 2026)
- [x] V190-03 Module set-up (Admin): Task types and Information types with versioned forms (draft, check, preview, publish, retire, reactivate, version history, audit), who may create (everyone / departments / people), module on/off switches (Super Admin) (done 16 Oct 2026)
- [x] V190-04 Task Management: independent tasks (number, type version, assignee, priority, due date, related request), lifecycle Open → In progress → (Blocked) → Completed / Cancelled, reopen and reassign by policy, comments, files, completion note or evidence, history, my / assigned by me / team lists with filters, due-soon and overdue reminders (done 16 Oct 2026)
- [x] V190-05 Information Management: independent information (number, type version, recipients by person / department / group / everyone resolved at publishing), draft, publish, withdraw, archive, expiry, read and acknowledgement tracked separately, inbox / sent / details with recipient list, acknowledgement reminders (done 16 Oct 2026)
- [x] V190-06 Approval module: who may raise each approval type (everyone / departments / people), enforced on the server; resubmit re-routes from the start when the changed values change the route (audit AUD-02); one person, one vote per step (AUD-05) (done 16 Oct 2026)
- [x] V190-07 Notifications: a category (Approval / Task / Information / System) and the related record on each notification; the bell opens a dropdown of the latest 10 with type filters and Read more; the Notifications page has All / Approvals / Tasks / Information views; opening never marks everything read (done 16 Oct 2026)
- [x] V190-08 Navigation: Tasks and Information in the sidebar (grouped by module), the sidebar stays put and scrolls only when its own entries don't fit; the page scrolls on its own (done 16 Oct 2026)
- [x] V190-09 Page access for the new pages; server checks on every page, action and API; audit of every change (done 16 Oct 2026)
- [x] V190-10 Reports: task and information reports in the Reports catalogue (IT) (done 16 Oct 2026)
- [x] V190-11 Tests (unit, integration, e2e), docs, register, living files, v1.9.0, CI (done 16 Oct 2026)

## Session log — application audit (16 Oct 2026), planned before starting
Owner: a read-only, evidence-based audit of the whole application, then a roadmap. No feature development; reports go in `application-audit/`.
- [x] AUD1-01 Discovery and domain audits (architecture/CI/tests, auth/security, engine and request lifecycle, Admin/Super Admin, analytics/notifications/jobs/integrations, database, UI/UX/performance) (done 16 Oct 2026)
- [x] AUD1-02 Run every suite locally (lint, typecheck, unit 433, integration 188, E2E 92, QA 27, origin 1: all pass); npm audit (0); read-only live health check (done 16 Oct 2026)
- [x] AUD1-03 Runtime probes (scratch tests, not in the repo) confirming D-01 resubmit DoA bypass, D-04 delegate double vote, D-03 branch rejection under an ANY join, SEC-01 import contact-change gap (done 16 Oct 2026)
- [x] AUD1-04 Reports 00 to 12 in `application-audit/` (matrix of 157 features, finding register AUD-01..29, REC-01..42, roadmap A–E, tracker, decision register) (done 16 Oct 2026)
- [x] AUD1-05 Living files, commit and push (done 16 Oct 2026)

Phase A of the roadmap, planned here and not started (details in `application-audit/09` and `11`):
- [x] V181-A1 Re-route on resubmit when routing values change; readiness checks on resubmit (AUD-02, AUD-11; needs Q-022) (checked 31 Oct 2026 against v1.39.0: the re-route half (AUD-02) was done in v1.9.0 under V190-06 / D-147, `resubmitRequest` restarts from the beginning when `routeChanged`; the readiness half (AUD-11) was then open; done 1 Nov 2026 under D-248: resubmit runs the duplicate, unique and budget checks inside the transaction and re-syncs the budget there)
- [x] V181-A2 CSV import enforces the contact-change rule (AUD-01) (done 16 Oct 2026 as V1100-02, v1.10.0: `checkContactChange` in `server/import/plan.ts`; ticked 31 Oct 2026)
- [x] V181-A3 Bootstrap seed stops re-granting Super Admin (AUD-03) (done 16 Oct 2026 as V1100-03, v1.10.0: `database/seeds/003_bootstrap_super_admin.sql` grants roles only when the user has none; ticked 31 Oct 2026)
- [ ] V181-A4 Pin the DB session time zone to UTC; health reports it (AUD-04; after Q-020)
- [x] V181-A5 One person, one vote per step (AUD-05) (done 16 Oct 2026 as V190-06, v1.9.0, D-147: `server/engine/engine.ts`; ticked 31 Oct 2026)
- [x] V181-A6 Outbox honours notify's result; job steps report soft failures (AUD-08, AUD-17) (checked 31 Oct 2026 against v1.39.0: the outbox half (AUD-08) was done in v1.9.0, `deliverOutbox` retries when nothing was recorded; the job-step half (AUD-17) is still open: `runAutomations` treats only a backup "FAILED" value as a failure, so a template sync that returns "failed: …" was recorded OK; done 1 Nov 2026 under D-248: `softFailure` records any FAILED / "failed…" step value as an error)
- [x] V181-A7 Page access bound to actions; fail closed on unknown pages; security page exempt (AUD-14) (2 Nov 2026: done in v1.46.0, D-278)
- [x] V181-A8 Confirmations on high-impact admin actions; demo-data guard (AUD-25) (2 Nov 2026: done in v1.46.0, D-278)
- [x] V181-A9 Bring KNOWN_ISSUES, SECURITY review, GO_LIVE checklist and DEPLOYMENT up to date (AUD-29) (2 Nov 2026: done in v1.46.0)
- [ ] V181-A10 Origin lock required in production (AUD-15; after Q-021)

## Session log — v1.8.0: approved lists, configurable custom approvals, page access, session timeout (15 Oct 2026), planned before starting
Owner: two pages "My approved requests" and "Approved by me" with all filters; custom approval fields configurable from Admin; page visibility and rights per page by user and department (Super Admin only); 30-minute inactivity sign-out configurable by the Super Admin (users and IT admins, not the Super Admin); "Specific people" as search-and-select; work and FYI steps may pick anyone; "If nobody to approve", "Respond within", "All of them must approve" configurable in Admin with the custom approval fields. Custom fields changed apply to new custom approvals only (owner: OK).
- [x] V180-01 My approved requests (/users/approved): my requests that were approved, with the list filters plus approved-on dates, approved by, validity and amended tabs (done 15 Oct 2026)
- [x] V180-02 Approved by me (/users/approved-by-me): requests where I approved a step (myself or for someone), with the list filters plus my decision dates, my step, on behalf of, and the request's outcome (done 15 Oct 2026)
- [x] V180-03 Session inactivity: default 30 minutes, Super Admin setting 5–480 minutes; users and IT admins only (never the Super Admin); the status check no longer keeps a session alive; warning 2 minutes before with "Stay signed in"; activity in the page counts (done 15 Oct 2026)
- [x] V180-04 Admin → Custom approval: the fields (form builder) and step options ("If nobody to approve", "Respond within", "All of them must approve": default and whether people may change it); applied on the server; requests already raised keep theirs (done 15 Oct 2026)
- [x] V180-05 Step editor: "Specific people" is a search-and-select picker; work and FYI steps list anyone active (approval steps only approvers); the server allows non-approvers on work and FYI steps (done 15 Oct 2026)
- [x] V180-06 Page access (Super Admin): every page of My approvals and Admin; Hidden / View / Full for everyone, a department or a person (person over department over everyone); enforced on the server (404 when hidden, no changes when view-only, also API calls); sidebar hides hidden pages; signed page address from the middleware; never applies to the Super Admin; audited (done 15 Oct 2026)
- [x] V180-07 Tests (unit, integration, e2e), docs, living files, v1.8.0, CI (done 15 Oct 2026)

## Session log — v1.7.2: Collaborating screen (12 Oct 2026), planned before starting
Owner: "a separate screen for all the approvals in which I am a collaborator, with a complete possible custom filter".
- [x] V172-01 /users/collaborating in the sidebar: every request I'm a collaborator on (not removed, not deleted), with quick tabs and counts (done 12 Oct 2026)
- [x] V172-02 Filters: text; several statuses; open/finished; type; raised by; requester's department; added by; current step; waiting with; overdue; due within N days; has files; approval valid/expired; raised, added, closed and last-activity date ranges; sort; rows per page; saved views (own, shareable, default) (done 12 Oct 2026)
- [x] V172-03 Choices come only from my own collaborations (no names or types I couldn't already see); every value validated on the server (done 12 Oct 2026)
- [x] V172-04 My requests → "Shared with me" goes to the new screen (done 12 Oct 2026)
- [x] V172-06 Owner follow-up ("filters in For me, My Requests also"): the same filter engine on My requests; Waiting for me gains search, raised by, department, step, mine/covering, due within, files, raised and waiting-since dates, per page and saved views (done 12 Oct 2026)
- [x] V172-05 Tests (unit filters, integration query, e2e), docs, living files, v1.7.2, CI (done 12 Oct 2026)

## Session log — v1.7.1: navigation and reports access (10 Oct 2026), planned before starting
Owner: "when I am in Admin portal and click on Analytics it switches the spaces to My Approvals; remove Help and Profile from the sidebar and add them in the top-right space panel for all; change My Work to Overview; restrict reports to admin only and remove them from side navigation".
- [x] V171-01 Analytics in the Admin space: /admin/analytics (+ list, metrics) share the screens with /users/analytics; the Admin sidebar links there (done 10 Oct 2026)
- [x] V171-02 Help and Profile out of the sidebar, into the account menu (Help added; Profile was there) for every space (done 10 Oct 2026)
- [x] V171-03 "My work" renamed "Overview" (sidebar, palette, phone bar, breadcrumbs, not-found pages, help, user guide) (done 10 Oct 2026)
- [x] V171-04 Reports IT/Super Admin only: canUseReports on pages, /api/reports, /api/exports, report actions, background exports, schedules and alerts in the job runner; pages moved to /admin/reports; old links redirect IT, 404 for others; removed from the user sidebar, added to the Admin sidebar (done 10 Oct 2026)
- [x] V171-05 Tests: e2e v171-nav.spec.ts; integration and e2e updated for IT-only reports; full regression (done 10 Oct 2026)

## Session log — v1.7.0: lists A, B and C (10 Oct 2026), planned before starting
Owner: "Work on A, B and C in one Go" (the non-completed points list of 10 Oct 2026). No deploy; the owner publishes.
- [x] V170-A01 Approval expiry: enforce the workflow's validity days; "Valid until" and an Expired badge on the request; a pre-expiry notice (7 days before) from the job runner (done 10 Oct 2026)
- [x] V170-A02 Needed-by calendar: a month calendar of open requests by their needed-by date (my requests and my approvals) (done 10 Oct 2026)
- [x] V170-A03 Bulk reassignment of pending tasks (IT), with a per-item result list (done 10 Oct 2026)
- [x] V170-A04 Form preview in the builder (renders the saved fields read-only, with rules) (done 10 Oct 2026)
- [x] V170-A05 Super Admin alert when the scheduled jobs stop (no job run for 2 hours) (done 10 Oct 2026)
- [x] V170-A06 Safe "re-check and fix" for requests flagged INCONSISTENT (recomputes status from the tasks; audit; never deletes) (done 10 Oct 2026)
- [x] V170-A07 Delegation end: tasks given to a delegate are listed back to the original approver and both are told (done 10 Oct 2026)
- [x] V170-A08 Confidential form fields: masked in view, reports and exports for anyone but the requester, the approvers and IT (done 10 Oct 2026)
- [x] V170-A09 Optional separate export permission (switch: exports need the role "Can export") (done 10 Oct 2026)
- [x] V170-A10 Duplicate check scope (any requester / same requester / same department) and must-be-unique identifier fields (done 10 Oct 2026)
- [x] V170-A11 "Refresh from profile" on the new-request form; amendment drafts (done 10 Oct 2026)
- [x] V170-B01 Dashboard drill-down: KPI cards and chart bars open the matching filtered list (done 10 Oct 2026)
- [x] V170-B02 More filters: status, approver, step, SLA status, aging bucket (done 10 Oct 2026)
- [x] V170-B03 KPIs: due today, due in 7 days, median completion, first-pass approval, rework and withdrawal rates (done 10 Oct 2026)
- [x] V170-B04 Comparisons: this month vs last month, vs the same month last year, department vs organisation (done 10 Oct 2026)
- [x] V170-B05 Charts: status breakdown, overdue trend, SLA breaches over time, backlog trend, decision trend, department × step heatmap (done 10 Oct 2026)
- [x] V170-B06 Report schedules: edit, several recipients (done 10 Oct 2026)
- [x] V170-B07 Saved views: shared and default views (done 10 Oct 2026)
- [x] V170-B08 Alerts: severity, quiet hours, channel choice (done 10 Oct 2026)
- [x] V170-C01 Performance: p95 timings for the analytics queries, index review migration (done 10 Oct 2026)
- [x] V170-C02 Large exports in the background with a download link (done 10 Oct 2026)
- [x] V170-C03 Scripted backup-restore check (done 10 Oct 2026)
- [x] V170-C04 Rate limits on the readiness check and the analytics pages (done 10 Oct 2026)
- [x] V170-T Tests (unit, integration, e2e), full regression, register, living files, v1.7.0 tag, CI green (done 10 Oct 2026: unit 417, integration 175, E2E 82, QA 27, origin 1, perf 3 local)

## Session log — v1.6.1: attachment fields and collaborators (10 Oct 2026), planned before starting
Owner: "attachments in the approval flow creation as add field and datatype; for each approval the requester can add anyone in the organisation as collaborator, multiple collaborators".
- [x] V161-01 Form builder: field type "Attachments (files)" with required and up to 1–5 files; files checked and counted on the server; stored against the field; shown under it; counted on resubmit; never copied by templates, raise again or follow-ups; not amendable or a duplicate key (done 10 Oct 2026)
- [x] V161-02 Collaborators: a people picker (search, chips) on new requests and custom approvals; Collaborators card on the request page (add, remove, stop following); up to 20; requester or IT manage; visibility, search, mentions; told when added and when the request is approved, rejected, sent back, resubmitted or withdrawn; never approvers; timeline and audit (done 10 Oct 2026)
- [x] V161-03 My requests → "Shared with me" (done 10 Oct 2026)
- [x] V161-04 Tests: unit attachment-field.test.ts; integration collaborators.int.test.ts; e2e v161-attachments-collaborators.spec.ts; full regression green (done 10 Oct 2026)
- Note: collaborators also cover the "watchers" part of U-09.

## Session log — v1.6.0: unified master prompt (10 Oct 2026), planned before starting
Prompt: `docs/requirements/UNIFIED_MASTER_PROMPT.md`. Status register: `docs/IMPLEMENTATION_STATUS_REGISTER.md` (generated from `docs/register/status.json` by `node scripts/docs/build-register.mjs`). Build order: `docs/IMPLEMENTATION_PLAN.md` (unified section).
- [x] U-00 Register of every atomic requirement (1,857 rows), Not feasible table with blockers (done 10 Oct 2026, 53b96fd)
- [x] U-01 Smart forms: show/required-if rules, safe formulas (CALC), line items in paise, sections (done 10 Oct 2026, 491a012)
- [x] U-02 FN1 readiness checker, FN3 duplicate detection, EN-09 budgets, FN4 autofill and templates (done 10 Oct 2026, 8809552)
- [x] U-03 FN2 stuck detection, FN11 automation inventory + job-run history + safe resend, FN8 retry rules (done 10 Oct 2026, 4c0f635, f53c599)
- [x] U-04 FN5 amendments after approval, workflow version diff and restore, FN7 migration assistant (done 10 Oct 2026, 98b9cd7, e3fb158)
- [x] U-05 Analytics foundation: classification, aging, periods, metric dictionary in code (done 10 Oct 2026, 8d9d7dc)
- [x] U-06 Role dashboards, KPI cards, SVG charts, FN6 department scorecards (done 10 Oct 2026, 8d9d7dc, 2ebac42; more chart types remain in the register)
- [x] U-07 Reports catalogue, exports (CSV formula-safe, XLSX, PDF), analytics saved views, scheduled reports, alert rules (done 10 Oct 2026, c2bdc5d)
- [x] U-08 FN9 config promotion, FN10 retention and legal hold (dry run), feature flags (done 10 Oct 2026, 2ebac42)
- [x] U-09 Remaining v1.6.0: watchers, calendar (neededBy), builder sections/preview, approval expiry (validityDays), bulk reassignment (not started; carried to v1.7.0, register Yet to do) (done in v1.6.1–v1.7.0 under other items, checked 31 Oct 2026: watchers = collaborators (v1.6.1); calendar with `neededBy` (`server/approvals/calendar-rules.ts`); SECTION fields and field preview; `validityDays` with the `expiry` job; bulk reassignment in Admin → Workload (`bulkReassign`))
- [x] U-10 Verification, required docs, living files, version bump, tag, push; final report (§6.1) (done 10 Oct 2026, v1.6.0)

## Session log — v1.6.0: master prompt (audit, UI modernisation, features, validation), 9 Oct 2026, planned before starting
Plan: `docs/IMPLEMENTATION_PLAN.md`. Acceptance criteria: `docs/FEATURE_ACCEPTANCE_CRITERIA.md`.
- [x] V160-00 Phase 0: audit re-read, repository inspected, baseline recorded, plan and the 4 docs (done 9 Oct 2026)
- [x] V160-01 Phase 1: tokens, dark mode (user_settings), UI kit, icons, DataTable (done 10 Oct 2026, 934d8a9)
- [x] V160-02 Phase 2: skeletons, per-space errors, toasts and undo, session-expired dialog, offline banner, error summary, 404/403 (done 10 Oct 2026, 934d8a9)
- [x] V160-03 Phase 3: bottom navigation with counts, sticky actions with a drawer, skip link, axe in E2E (done 10 Oct 2026, 934d8a9)
- [x] V160-04 Phase 4: queue filters, shortcuts, command palette, recently viewed, breadcrumbs, instant read state (done 10 Oct 2026, 78715cb)
- [x] V160-05 Phase 5: timeline, file preview, resubmission diff (request_revisions) (done 10 Oct 2026, 324ef40)
- [x] V160-06 Phase 6 (recall, ask for info, consultation, delegation, links done 076a3bc; smart forms 491a012; budgets 8809552; expiry still open): conditional and calculated fields, line items, recall, ask for info, consultation, request delegation, links and follow-ups, budgets, expiry (2 Nov 2026: checked: expiry with a 7-day notice is built (job step expiry); nothing left)
- [x] V160-07 Phase 7 (templates done 8809552; watchers, calendar, builder sections and preview open): templates, watchers, calendar, builder sections and preview (2 Nov 2026: checked: needed-by calendar, form sections (SECTION fields) and preview built; watchers not needed (P6-04, FYI steps))
- [x] V160-08 Phase 8: version diff and restore, analytics, weekly HOD report (off), bulk reassignment (checked 31 Oct 2026: version diff and restore done under U-04, analytics under U-05/U-06 and v1.12.0, bulk reassignment under U-09; the weekly HOD report was never built: no job step, setting or template, audit FI-D01) (2 Nov 2026: checked: bulk move of pending tasks built; nothing left)
- [x] V160-09 Phases 9–12: standardise routes, performance, security review, full tests, IMPLEMENTATION_REPORT, go-live checklist, living files, push (2 Nov 2026: covered by the QA pass (qa/), the go-live checklist and the v1.46.0 docs)

## Session log — v1.5.0: owner's development spec (9 Oct 2026), planned before starting
Plan and feature map: `docs/development/ENHANCEMENT_IMPLEMENTATION_PLAN.md`.
- [x] V150-00 Phase 0: baseline (v1.4.0 live, CI green, local suites green), feature map, plan (done 9 Oct 2026)
- [x] V150-01 Migration: request_drafts, saved_views, notification_preferences, user_flags, DUE_SOON (done 9 Oct 2026)
- [x] V150-02 #14 correlation ids (x-request-id) and Super Admin alerts on job/backup failure; GO_LIVE_CHECKLIST (done 9 Oct 2026)
- [x] V150-03 #1 My Work sections (due soon/overdue, returned, drafts, recently completed) (done 9 Oct 2026)
- [x] V150-04 #2 tracker summary (waiting for, since, next step, progress) and text status labels (done 9 Oct 2026)
- [x] V150-05 #3 drafts with autosave, recovery, discard, version check, expiry (predefined and custom) (done 9 Oct 2026)
- [x] V150-06 #4 global search with access in SQL, filters, paging; saved views (done 9 Oct 2026)
- [x] V150-07 #5 phone layouts (cards), action bar first, touch targets; phone E2E (done 9 Oct 2026)
- [x] V150-08 #6 notification preferences (mandatory groups locked), SKIPPED/USER_PREFERENCE (done 9 Oct 2026)
- [x] V150-09 #7 bulk approve via decideTask, per-item results, max 25 (done 9 Oct 2026)
- [x] V150-10 #8 out of office: Upcoming/Active/Ended, preview, policy text (done 9 Oct 2026)
- [x] V150-11 #9 @mentions of people who can see the request, notified once (done 9 Oct 2026)
- [x] V150-12 #10 approval summary PDF (access-checked, audited) (done 9 Oct 2026)
- [x] V150-13 #11 test mode detail + version comparison (done 9 Oct 2026)
- [x] V150-14 #12 workload page, DUE_SOON reminder, handover suggestions (done 9 Oct 2026)
- [x] V150-15 #13 help page, first-use checklist, copy details for IT (done 9 Oct 2026)
- [x] V150-16 Regression, docs (CHANGELOG, TEST_AND_RELEASE_REPORT, GO_LIVE_CHECKLIST, USER-GUIDE, DEPLOYMENT, RELEASE-NOTES), living files, push (done 9 Oct 2026)

## Session log — v1.4.0: every pending item (9 Oct 2026), planned before starting
Owner: "fix every pending items in one go and then ill publish".
- [x] V140-01 Engine: work steps (approval step in WORK mode: "Mark as done", may be the requester, no reject), NOTIFY steps (FYI, moves on), DESIGNATION and REQUESTER approver sources (done 9 Oct 2026: v1.4.0)
- [x] V140-02 Engine + UI: BLOCKED-step recovery by IT (assign people / skip / try again / pick a path), audited (done 9 Oct 2026: v1.4.0)
- [x] V140-03 Builder: and/or conditions (several comparisons, all or any) for choices and skip rules; choices inside choices (up to 3 deep); step types and the new sources (done 9 Oct 2026: v1.4.0)
- [x] V140-04 Notifications: work task assigned, FYI, resumed, resubmitted, blocked step resolved; templates in the catalogue; NODE_SKIPPED stays on the timeline only (done 9 Oct 2026: v1.4.0)
- [x] V140-05 Decisions also written to the audit log; hold time extends due times; handover restarts the response clock and reminders (done 9 Oct 2026: v1.4.0)
- [x] V140-06 Integrity: R-04 soft delete through the engine state, R-05 publish lock, R-06 custom approval in one transaction, R-08 SLA scan, R-09 IST year, R-10 migration failure reporting, delegation overlap lock, outbox skips deleted requests (done 9 Oct 2026: v1.4.0)
- [x] V140-07 Security: S-06 locked-account message, S-07 single-use "not me" link, P-01 Cloudflare origin secret, P-03 Google provider check, P-04 IT Admin contact edits by Super Admin only, P-05 https-only provider URL, P-06 log redaction, P-07 Origin check on API posts; P-02/P-08/P-09 decided and documented (done 9 Oct 2026: v1.4.0)
- [x] V140-08 Health endpoint `/api/health`; database + attachments backup script with rotation, restore script, restore drill run locally (done 9 Oct 2026: v1.4.0)
- [x] V140-09 Multi-level escalation (manager, then manager's manager), configurable (done 9 Oct 2026: v1.4.0)
- [x] V140-10 S8-02: audit log CSV export, login history (Super Admin and own), attachments on custom approvals; work hand-off after approval = work steps (V140-01) (done 9 Oct 2026: v1.4.0)
- [x] V140-11 S8-03: CEOITBox delivery/read webhook (secret header) shown on Message deliveries (done 9 Oct 2026: v1.4.0)
- [x] V140-12 Workflows: delete unused, archive, unsaved-changes warning; resubmit restart policy per approval type; custom approvals in dashboard filters (done 9 Oct 2026: v1.4.0)
- [x] V140-13 Lists: Waiting-for-me paging; notifications history paging (done 9 Oct 2026: v1.4.0)
- [x] V140-14 UI loose ends (D-02) and duplicates (D-03); admin home query into a repository; one time format (done 9 Oct 2026: v1.4.0)
- [x] V140-15 Tooling: dev dependency advisories (D-01); CI runs the QA suite and `npm audit`; local load test script and run (done 9 Oct 2026: v1.4.0)
- [x] V140-16 Docs: README, E2E report, DEPLOYMENT Part O/known limits, user guide (GL-06), living files (done 9 Oct 2026: v1.4.0)
- [x] V140-18 P5-04 custom approval → approval type; P7-04 Power BI views; P8-02 installable app (done 9 Oct 2026)
- [x] V140-19 Regression: types, lint; unit 301; integration 81; e2e 38; QA 27/27; origin lock; load test; production build (done 9 Oct 2026)
- [~] V140-17 Owner-only (not code): publish, cron secret, masters, Meta template approvals, key rotation, UAT/pilot sign-off (9 Oct 2026: owner-only, not code: see Now / Next)

## Session log — v1.3.5: Profile page and application audit (9 Oct 2026)
- [x] V135-01 Profile page: details tab + Notifications, Out of office, Sign-in & devices as tabs; sidebar and account menu updated (D-095, F-77) (done 9 Oct 2026)
- [x] V135-02 e2e `profile.spec.ts`; `/users/profile` added to the Cloudflare address check; e2e 28/28 (done 9 Oct 2026)
- [x] V135-03 Read-only application audit → `docs/APPLICATION_CURRENT_STATE_AUDIT.md` (done 9 Oct 2026)
- [x] AUD-01 Fix B-01: confirm bar missing on admin "Deactivate user" / "Sign out everywhere" (P1) (done 9 Oct 2026, v1.3.6)
- [x] AUD-02 Fix S-01: no plain-text set-password links in `notification_deliveries.payload_json` (P1) (done 9 Oct 2026, v1.3.6)
- [x] AUD-03 Fix S-02..S-05: login redirect, OTP attempt race, Resend timeout, idle timeout (P2) (done 9 Oct 2026, v1.3.6)
- [x] AUD-04 Backups + restore drill (P0-21, GL-04) and a health endpoint (done 9 Oct 2026: v1.4.0: D-103 health, D-104 backups + drill)
- [x] AUD-05 BLOCKED-step recovery; builder AND/OR; designation approver source (core completion) (done 9 Oct 2026: v1.4.0: D-097..D-099)

## Session log — v1.3.4: cron guide, Q-017, Q-018, default sender (9 Oct 2026)
Owner: a step-by-step cron guide; "Yes" to Q-017 and Q-018; "Yes, go ahead" to the new default From address.
- [x] V134-01 Q-017: upgrade Next 15.5.27, firebase-admin 14.5.0, `npm audit fix`, overrides (postcss, grpc-js) → production audit 0 (D-093) (done 9 Oct 2026)
- [x] V134-02 Q-018: client IP from CF-Connecting-IP (`lib/http/client-ip.ts` + unit test); QA-SEC-06 models Cloudflare and passes (D-092) (done 9 Oct 2026)
- [x] V134-03 Default From address `no_reply@approval.arssteels.net` in code, tests and docs (D-091) (done 9 Oct 2026)
- [x] V134-04 Job runner heartbeat on Message deliveries + integration test (D-094, F-41 updated) (done 9 Oct 2026)
- [x] V134-05 DEPLOYMENT Part I rewritten step by step (I1–I8) (done 9 Oct 2026)
- [x] V134-06 Regression: types, lint, 262 unit, 65 integration, 27 e2e (new: job runner status), QA 27/27, build (done 9 Oct 2026)
- [~] V134-07 Owner: GoDaddy Publish v1.3.4, then set up the cron job (Part I) and check the green "Job runner" line (9 Oct 2026: superseded: publish v1.4.0 instead)

## Session log — QA session 15: live test on approval.arssteels.net (9 Oct 2026)
Owner: "I have opened Google Chrome, test it live", then, signed in as IT Admin, "test every left-out thing here".
Rules on production: view only, plus client-side checks where nothing reaches the server. Anything that writes data, or messages real people, waits for the owner's go-ahead.
- [x] L15-01 Find the right browser: 3 Chrome profiles connected; Browser 2 = Harish Kumar (plain user), Browser 1 = IT Admin (done 9 Oct 2026)
- [x] L15-02 Version: v1.3.1 live (`/api/auth/status` 200); behind Cloudflare (`server: cloudflare`, `cf-ray`) (done 9 Oct 2026)
- [x] L15-03 Access: a plain user gets 404 on all 23 Admin/Super Admin URLs; IT Admin gets 200 on all 33 pages, each ≤ 0.71 s; unknown page 404; downloads (CSV templates, dashboard CSV) 200 (done 9 Oct 2026)
- [x] L15-04 Live state: Resend and CEOITBox keys configured; WhatsApp templates 11/20 live; 2 users; 0 departments, designations, groups and approval types (done 9 Oct 2026)
- [x] L15-05 v1.3.1 fixes live:
  - a failed submit shows a message and keeps the input (the POST was stopped in the browser; nothing sent);
  - builder: key follows the label, dropdown list editor refuses duplicates, 8 field types, date picker in conditions;
  - busy button #53769E; 0 unnamed controls (done 9 Oct 2026)
- [x] L15-06 **Live defect L-01:** React #418 on /admin/import and /superadmin/audit. Cloudflare rewrote email addresses shown as plain text: the import guide's example and the audit details. The same risk applies to any user-written text. **Fixed:** SafeText on the import guide, audit details, request titles, comments, field values, timeline, step comments, notifications, delegation reasons, page titles; CI test `tests/e2e/cloudflare-safe.spec.ts` (fails without the fix, passes with it) (done 9 Oct 2026)
- [x] L15-07 Regression: 259 unit, 64 integration, 26 e2e; QA suite 26/27 (QA-SEC-06 still waiting on Q-018) (done 9 Oct 2026)
- [x] L15-08 (done 9 Oct 2026 for mail/WhatsApp; the owner approved: "test the mail and WhatsApp in live… create some data… afterwards we can delete it") **Waiting for the owner's go-ahead (writes live data / sends real messages):**
  - raise → approve → reject on live with labelled test records;
  - import the real masters;
  - Super Admin delete;
  - test-send of email and WhatsApp to the owner's own address and number;
  - the live sign-in rate-limit probe (Q-018)
- [x] L15-10 **Live notification test** (done 9 Oct 2026):
  - provider test: WhatsApp SENT; email FAILED with Resend HTTP 403;
  - test data: designation QA_TEST (approver) given to IT Admin; Harish raised custom CUS-2026-000002; IT Admin commented and approved;
  - deliveries: APPROVAL_NEEDED, REQUEST_COMMENT and REQUEST_APPROVED were WhatsApp SENT and email FAILED (403);
  - cleanup: request soft-deleted (reason recorded); IT Admin designation back to Not set; QA_TEST made inactive, not an approver
- [x] L15-11 **Email root cause:** Resend refuses with 403. The Resend team "arsenergy" open in the owner's Chrome has no domains and no API keys, so the key in the app belongs to another Resend account where `arssteels.net` (the From domain) is not verified. **Owner action:** verify a sending domain in the Resend account that owns the key, or verify it in "arsenergy" and create a new key there. Then paste the key in Super Admin → Providers & security, and Send test email (done 9 Oct 2026: diagnosed)
- [x] L15-12 **Retries never ran:** every failed email shows 1 try with a "Next try" time long past, so the cron job (`/api/jobs/run`) is not set up on GoDaddy (DEPLOYMENT Part I). Also outstanding: 9 security WhatsApp templates (8 waiting for Meta, break-glass rejected) (done 9 Oct 2026: diagnosed)
- [x] L15-13 Found live: the "People" picker on Custom approval / builder steps had no accessible name. Fixed (`aria-label`); QA-A11Y-01 now covers /users/custom (done 9 Oct 2026)
- [x] L15-14 Email fixed on live: arssteels.net verified in the Resend team "arssteels"; the test email was sent (done 9 Oct 2026)
- [x] L15-15 **Live approval email test** (owner: "test with one approval for email"; From address now `no_reply@approval.arssteels.net`, set by the owner in Super Admin):
  - Harish Kumar raised custom CUS-2026-000003 → APPROVAL_NEEDED to IT Admin: email SENT, WhatsApp SENT;
  - IT Admin approved → REQUEST_APPROVED to Harish: email SENT, WhatsApp SENT;
  - cleanup: CUS-2026-000003 soft-deleted (reason recorded); IT Admin designation back to Not set; QA_TEST inactive and not an approver (done 9 Oct 2026)
- [ ] L15-09 After the v1.3.2/1.3.3 Publish: re-check /admin/import and /superadmin/audit for #418

## Session log — QA session 14: end-to-end master prompt + fixing the loader defects (9 Oct 2026)
Owner: "Test these now (Claude_End_to_End_Application_Testing_Master_Prompt.docx) and, along with that, complete the failed tests from the previous test if it is possible to integrate." Taken as the go-ahead for Q-016 (fix the loader defects).
Boundaries from the prompt: smallest safe fixes, only for reproduced defects; no schema changes; no new dependencies; no secrets; passing code left alone; re-run the failed test, then regression.
- [x] Q14-01 Scope inventory and applicability matrix (feature → existing suites → new tests; N/A with reasons) (done 9 Oct 2026)
- [x] Q14-02 Baseline: build, lint, typecheck, unit, integration, e2e, loader audit, `npm audit`, migrate twice (idempotent); record exit codes and totals (done 9 Oct 2026)
- [x] Q14-03 New executable suite `tests/qa-e2e/`, for areas not yet covered: (done 9 Oct 2026)
  - session (logout, deactivated user, tampered cookie, revoked session);
  - authorization (record access, the jobs endpoint, a replayed decision by another user, role-limited UI);
  - business rules (DoA routing, withdraw, hold/resume, no self-approval, reopen);
  - security (stored XSS in title/comment/import, SQL injection in search, headers, CSRF origin check, safe errors, disguised file types);
  - integrations (notification outbox; delivery itself blocked: no provider keys); jobs; files/CSV accuracy;
  - performance (page timings, 20 parallel users); accessibility (names, lang, h1, focus); mobile layout
- [x] Q14-04 Fix the confirmed loader defects with minimal changes: (done 9 Oct 2026)
  - DEF-02/07: the `useActionForm` wrapper catches failures; the session-ended message comes from a tiny `/api/auth/status`; `error.tsx` + `global-error.tsx`;
  - DEF-03: a 30 s time limit with an "it may still go through" message;
  - DEF-06: readable disabled primary button;
  - DEF-01/04/09: a `loading.tsx` per space; period and paging links become plain links with a pending state (the last click wins; work before hydration);
  - DEF-05/08: a live region and a fixed-width busy label in SubmitButton
- [x] Q14-05 Re-run: the loader audit (all 85), the new suite, then the full regression (unit, integration, e2e, build); fix any new defects with the same loop (done 9 Oct 2026)
- [x] Q14-07 **Owner decisions:** DEF-E1 (dependency upgrades: Next 15.5.27 patch now; firebase-admin 14.5.0; firebase client major later) and DEF-E2 (the rate-limit IP source: is all traffic through Cloudflare?) (Q-017, Q-018) (done 9 Oct 2026: answered 9 Oct 2026 (Q-017, Q-018) → v1.3.4)
- [x] Q14-06 Report `docs/qa/E2E-QA-REPORT.md` (inventory, register with fix/retest columns, defect + change log, summary); update the loader report; living files; commit, push, CI, tag (done 9 Oct 2026)

## Session log — QA session 13: loader and loading-state audit (9 Oct 2026)
Owner: "Master prompt: complete web application loader testing and QA audit" (TC-001 to TC-085). Testing only; defects are reported, and fixes wait for the owner's go-ahead.
- [x] Q13-01 Reconnaissance: loader inventory (loading.tsx, SubmitButton "Working…", Spinner, import/delete/download loaders, auth buttons), error boundaries, existing tests (done 9 Oct 2026)
- [x] Q13-02 Executable audit suite `tests/qa-loaders/` with its own config (`playwright.loaders.config.ts`; not part of CI, because it asserts the target behaviour and will fail where there are defects). It uses network interception of server actions and fetches: delay, 500, abort, offline, malformed, replay (done 9 Oct 2026)
- [x] Q13-03 Run it against a production build with the e2e test database; collect measurements (done 9 Oct 2026)
- [x] Q13-04 Report `docs/qa/LOADER-QA-REPORT.md`: inventory, register TC-001..085, defects, summary, management summary, remediation plan (done 9 Oct 2026)
- [x] Q13-06 (done 9 Oct 2026 in QA session 14: all 9 fixed and retested) **Waiting for the owner's go-ahead:** fix DEF-02 (High), DEF-03 and DEF-06 before the next Publish; then DEF-01/04; then DEF-05/07/08/09. The regression tests are already in `tests/qa-loaders/`
- [x] Q13-05 Living files; commit and push (tests + report only; no app changes) (done 9 Oct 2026)

## Session log — build session 12: the form field creator, tested and fixed (8 Oct 2026)
Owner: "Test the Flow creation form entirely; add a field creation option with database values like departments as a dropdown; the Dropdown Creator is not working properly; the date selector is not working as a date; check all the field creator's data types; create an end-to-end test case and run it."

**Found by typing key by key in the browser** (the automation's "paste" hid the first two bugs):
- [x] S12-01 ❌ **Dropdown creator:** the Choices box drops every comma the moment it is typed, so "Capex, Opex" becomes "CapexOpex". Only one option can ever be made → replace it with a list editor (type → Add or Enter; paste many at once; remove; no duplicates) (done 8 Oct 2026)
- [x] S12-02 ❌ **Field key** is taken from the first letter only ("Delivery Date" → `d`), because the key is filled once and never follows the label → follow the label until IT edits the key; saved keys never change (done 8 Oct 2026)
- [x] S12-03 ❌ **Smallest value** drops a decimal point or a leading minus as it is typed ("1.5" → 15). The condition value boxes have the same flaw → keep what is typed, use it once it is a number (done 8 Oct 2026)
- [x] S12-04 ❌ **Date in conditions:** the skip/choice condition is a plain text box for every field type; the engine and validator only compare numbers, so "date is before …" can never work → a value box per field type (a date picker for Date, the options list for Choice/master, people for Person, numbers for Number) and engine/validator support for date order (YYYY-MM-DD) (done 8 Oct 2026)
- [x] S12-05 ⚠️ The operators offered don't depend on the field type ("is more than" on a text field) → per-type operators, with "is before/after" for dates (done 8 Oct 2026)
- [x] S12-06 ❌ **New: fields filled from database values.** "Department (from the list)" and "Designation (from the list)": the requester picks from the live active list; the code is stored and the name shown; the server checks the code; conditions pick from the same list (done 8 Oct 2026)
- [x] S12-07 ⚠️ Help text exists in the schema but can't be set in the builder → add it; the Required checkbox gets a proper accessible name (done 8 Oct 2026)
- [x] S12-08 Dates display as 08 Oct 2026 on the request page (stored as YYYY-MM-DD) (done 8 Oct 2026)
- [x] S12-09 Tests: (done 8 Oct 2026)
  - unit: every field type parses and refuses bad input; date order in conditions; lookup checks; form definition checks;
  - e2e: the full builder, with every field type, the dropdown creator, a department field, a date condition that skips a step, publish, raise, then check the route and the values shown
- [x] S12-11 Found while testing: test mode dropped every valid sample value when one was invalid; now it keeps the valid ones. The request page now shows a level as "Skipped: <condition>" before it is reached, like DoA levels (done 8 Oct 2026)
- [x] S12-10 Living files; release v1.3.0; CI green; tag (done 8 Oct 2026)

## Session log — build session 11: approver designations, request deletion, dashboards (8 Oct 2026)
Owner:
- "Approver should be the designations with any manager and above. In the designation level add one more field to record whether to show as the approver or not, so that I can customise the approvers";
- "need approval deletion option for Super Admin";
- "utilisation for approvals, Departmentwise raised Dashboard, Approver wise Dashboard, Raiser wise Department Dashboard as a separate page in Admin portal".

Owner's choices (asked 8 Oct 2026): **all approver pickers** follow the flag; delete = **requests, soft delete**.

**A. Approver designations (F-72, D-085):**
- [x] S11-01 Migration `designations.is_approver`. Existing designations are ticked; new ones start unticked (done 8 Oct 2026)
- [x] S11-02 Designation form and list: an **Approver** checkbox and badge; the import column `approver` (Yes/No); the export includes it (done 8 Oct 2026)
- [x] S11-03 One eligibility rule (pure): active, not break-glass, designation is an approver. A repository for the eligible-people list (done 8 Oct 2026)
- [x] S11-04 Pickers show eligible people only, keeping a current value that is no longer eligible: (done 8 Oct 2026)
  - builder and custom approval people;
  - group members, HOD, reporting manager, delegate
- [x] S11-05 Server checks on save: (done 8 Oct 2026)
  - workflow create, version save and publish (PEOPLE steps);
  - custom submit; group member add; department HOD; user manager; delegation;
  - import (users manager, departments HOD, groups members), with "unchanged is fine"
- [x] S11-06 Demo data: demo designations get the right flag (manager and above), so demo publishing still works (done 8 Oct 2026)

**B. Request deletion (F-73, D-086):**
- [x] S11-07 Migration: `approval_requests.deleted_at / deleted_by / delete_reason` + an index (done 8 Oct 2026)
- [x] S11-08 Service `deleteRequest`: Super Admin only, reason required; cancels pending tasks; audit (done 8 Oct 2026)
- [x] S11-09 Every read excludes deleted requests: (done 8 Oct 2026)
  - queue, my requests, request page (404), participants;
  - reminders and escalation, insights, admin counts, dashboards
- [x] S11-10 Super Admin → **Requests**: all requests, search, status filter, paging, Delete with reason and confirm; a **Deleted** tab (read-only list with who, when, why). A Delete button on the request page for the Super Admin (done 8 Oct 2026)

**C. Dashboards (F-74, D-087):**
- [x] S11-11 Repository: utilisation, department-wise raised, approver-wise, raiser-wise by department; filters for dates, approval type and department (done 8 Oct 2026)
- [x] S11-12 `/admin/dashboards/*`: four tabs as separate pages, a filter bar, KPI tiles, tables with inline bars, CSV download per dashboard, loading skeleton; nav item **Dashboards** (done 8 Oct 2026)

**D. Close:**
- [x] S11-13 Tests: (done 8 Oct 2026)
  - unit: eligibility, dashboard maths;
  - integration: flag enforcement, delete hides everywhere, dashboard numbers;
  - e2e: tick a designation; Super Admin deletes; dashboards render
- [x] S11-14 Docs (DEPLOYMENT Part K: tick approver designations; release notes); living files; v1.2.0; CI green; tag (done 8 Oct 2026)

## Session log — build session 10: bulk import with templates and loaders (8 Oct 2026)
Owner: "import options with a download-template option and an upload option, for Admin and Super Admin, for Users, Designations, Departments and that kind of master; add loaders".
Read as: every master the admin keeps by hand. **Users, Departments, Designations, Approver groups, Holidays.** Approval types are excluded: they are built and tested in the workflow builder (F-59, D-084).
- [x] S10-01 CSV engine (pure, unit-tested): parse with quotes, commas or semicolons, CRLF and a UTF-8 BOM (Excel); write with a BOM, with formula cells guarded (done 8 Oct 2026)
- [x] S10-02 Column specs per kind (required, format, example) and the pure row checks (done 8 Oct 2026)
- [x] S10-03 Import service: (done 8 Oct 2026)
  - **Check** = a dry run that lists every problem by row;
  - **Import** = re-check, then all rows in one transaction, or none;
  - audit per record + a summary; alerts after the commit;
  - the same user rules as the forms
- [x] S10-04 Downloads: the template (header row) and the current data, per kind; admin space only; plain 404 otherwise (done 8 Oct 2026)
- [x] S10-05 Import page in **both** the Admin and the Super Admin spaces (nav item); an "Import" link on the Users, Departments, Approver groups and Working calendar pages (done 8 Oct 2026)
- [x] S10-06 Loaders: (done 8 Oct 2026)
  - a Spinner component; spinners on Check and Import;
  - a progress message while working; the controls locked while busy;
  - `loading.tsx` skeletons for the import pages
- [x] S10-07 Tests: unit (CSV, row checks), integration (check + import per kind, rules, all-or-nothing), e2e (download the template, upload, check, import) (done 8 Oct 2026)
- [x] S10-08 Docs: the import guide in DEPLOYMENT.md (initial data load) and release notes; living files; release v1.1.0, CI green, tag (done 8 Oct 2026)

## Session log — build session 9: UI polish from the owner's three design reviews (8 Oct 2026)
Owner: "add all these and check whether done or not in each Area, then build them, and instead of 'Area' change the name as 'Space'".

Each item shows its status **before** this session: ✅ done, ⚠️ partly done, ❌ not done, N/A not applicable.

**All spaces (shell):**
- [x] S9-01 ❌ One profile menu at the top right holds the name, email, avatar, the current space badge, **Switch space** links, Sign-in & devices, and Sign out (reviews 1, 2, 3) (done 8 Oct 2026)
- [x] S9-02 ❌ The isolated space pill leaves the top-left; it becomes a badge next to the profile name (reviews 1, 2, 3) (done 8 Oct 2026)
- [x] S9-03 ❌ "Switch area" → **"Switch space"**: moved out of the sidebar bottom into the profile menu. Everywhere the UI says "area" now says "space" (owner) (done 8 Oct 2026)
- [x] S9-04 N/A No top sub-navigation bar exists; the sidebar is the only nav (reviews 2, 3). Found instead: ❌ below 768 px there was **no menu at all** → add a mobile menu button with a slide-in sidebar (done 8 Oct 2026)
- [x] S9-05 ⚠️ Sidebar active item: darker text (primary-700) with a left accent, for contrast (review 3) (done 8 Oct 2026)
- [x] S9-06 ⚠️ Hover states on table rows and clickable cards; cards get a soft shadow (reviews 1, 3) (done 8 Oct 2026)
- [x] S9-07 ⚠️ Page header: more whitespace, consistent h1/h2 scale; primary actions in the same header bar as page controls (reviews 1, 3) (done 8 Oct 2026)
- [x] S9-08 ⚠️ Compact empty states with an icon (review 1) (done 8 Oct 2026)
- [x] S9-09 ⚠️ Content width capped and centred on wide screens (review 3) (done 8 Oct 2026)
- [x] S9-10 ✅ Body text contrast: #475569 is 7.6:1, already above AA (review 1). No change needed (checked 8 Oct 2026)

**My approvals space:**
- [x] S9-11 ❌ Overview: "Welcome back, <first name>" (it was "Hello, IT"); compact KPI tiles; no duplicate navigation in the content (review 1) (done 8 Oct 2026)
- [x] S9-12 ⚠️ My requests: search, filter and "New request" in one action bar (review 1) (done 8 Oct 2026)

**Admin space:**
- [x] S9-13 ❌ Overview cards said "Being built" although all four features are live. They become real, equal-height cards linking to the pages, with live counts and hover; 3 columns on wide screens (review 3) (done 8 Oct 2026)

**Super Admin space:**
- [x] S9-14 ❌ WhatsApp templates: one status panel with the "N of 20 live" summary, last sync and the Sync button side by side (review 2) (done 8 Oct 2026)
- [x] S9-15 ❌ Templates table: a short message name as the row title, the event code under it, the long description behind a "?" tooltip; badges standardised (Live green, Waiting amber, Not created gray); action buttons a uniform width and right-aligned (review 2) (done 8 Oct 2026)

**Found while building:**
- [x] S9-17 Admin sidebar: removed the stale "Approval types · soon" item; approval types live under **Approval types & workflows** (done 8 Oct 2026)
- [x] S9-18 Status badges never wrap ("Not created" broke onto two lines) (done 8 Oct 2026)
- [x] S9-19 Tailwind opacity modifiers (`/40`) don't work on the CSS-variable colour tokens: `@apply` fails the build, and in markup they silently do nothing. New S9 classes use solid tokens. The older silent uses (warning borders, notification row tint) are left as they render acceptably (done 8 Oct 2026)

- [x] S9-16 Tests (e2e selectors for the moved menu), a browser check with screenshots, docs ("space"), living files; release v1.0.6 (done 8 Oct 2026)

## Phase 0 — Setup and decisions

### 0.1 Planning files and records
- [x] P0-01 Create DEVELOPMENT-MEMORY.md, PLAN-CHECKLIST.md, FLOWS.md (done 28 Sep 2026)
- [x] P0-02 Move reference material into `reference/` (audit page, plan page, rule notes, earlier write-up) (done 28 Sep 2026)
- [x] P0-03 Record the north star (D-000) in all three files, CLAUDE.md and Claude memory (done 28 Sep 2026)
- [x] P0-04 Record the owner's answers as decisions D-003 to D-015 (done 28 Sep 2026)
- [x] P0-05 Update the plan page to v2 with the decisions and the DoA explanation, and republish (same URL). Copy saved as `reference/platform-plan-v2.html` (done 28 Sep 2026)
- [x] P0-08 Record the second-round answers (D-024 to D-033) and the Power BI reference (DEVELOPMENT-MEMORY §9) in all living files; republish the plan page as v3 (done 28 Sep 2026)
- [x] P0-07 Write CLAUDE.md (project root) and Claude memory entries enforcing the north star and the three living files (done 28 Sep 2026)
- [~] P0-06 Owner reviews the plan v2 and this checklist (9 Oct 2026: superseded: the owner steers from Now / Next each session)

### 0.2 Infrastructure (all owned by itadmin@arssteels.co.in)
- [x] P0-10 Confirm the GoDaddy plan type: cPanel with Node.js; Node.JS Hosting product as used by the Power BI website (D-027) (done 28 Sep 2026)
- [x] P0-11 Choose the final stack: mirror the Power BI website stack (D-028) (done 28 Sep 2026)
- [x] P0-12 Review the Power BI website's CEOITBox integration, WhatsApp OTP, Google login, sessions, settings and GoDaddy deploy guide (D-029, DEVELOPMENT-MEMORY §9) (done 28 Sep 2026)
- [x] P0-12a CEOITBox: same number and API key as the Power BI website (D-036) (done 28 Sep 2026)
- [~] P0-13 SMS channel for OTP: not needed, OTP is WhatsApp only (D-025, 28 Sep 2026)
- [x] P0-14 Notification templates: the owner provides the wording (Q-013) → register them in CEOITBox (Utility category) → Meta approval → record the template names and variable order in the app's template registry. OTP reuses `wa_login_otp_v1` (Q-014) (7 Oct 2026: all 20 formats in docs/NOTIFICATION-TEMPLATES.md and /superadmin/templates; the owner creates them in CEOITBox)
- [x] P0-15 Email through Resend from itadmin@arssteels.co.in (D-037): check the domain is verified in Resend (SPF/DKIM); API key in GoDaddy env vars only (done 9 Oct 2026: arssteels.net / approval.arssteels.net verified; key in Super Admin settings (D-091))
- [x] P0-16 Reuse Firebase project `power-bi-dashboard-3b29f` (D-038): add `approvals.arssteels.net` and `localhost` to its authorised domains (done 9 Oct 2026: Google sign-in works on live)
- [x] P0-17 DNS + SSL: bind `approvals.arssteels.net` to the GoDaddy Node.js app (D-034) (done 9 Oct 2026: live with SSL (Cloudflare + GoDaddy))
- [>] P0-17a On the first GoDaddy app: check that the disk is persistent (attachments), which MySQL host is reachable, and whether cron is available (Q-001 remainder) (7 Oct 2026: owner confirmed the disk is persistent; MySQL host and cron still to check on the first deploy)
- [x] P0-18 Git repository `HarishDevs/ARS-Approval-System` (D-035): `git init` in the project folder, `.gitignore` (node_modules, .next, .env*, backups, storage), README, repo-level CLAUDE.md, first commit pushed to `main` (done 28 Sep 2026)
- [x] P0-18a Working rule: commit with clear messages; push at the end of every session; feature branches + pull requests once coding starts (done 9 Oct 2026: practised every session; CI on main)
- [~] P0-19 Create the environments: local dev, staging (GoDaddy), production (GoDaddy) (9 Oct 2026: decided: local + CI + production; no separate staging)
- [x] P0-20 Set up a secrets store on the server (environment files outside the web root, locked permissions); never in the repo (done 9 Oct 2026: GoDaddy env secrets + AES-GCM settings)
- [x] P0-21 Set up database backups: daily, off-server copy, tested restore (done 9 Oct 2026: v1.4.0, D-104: daily, attachments too, restore drill in CI; off-server copy: DEPLOYMENT P1 step 4)

### 0.2b Code scaffold (D-028)
- [~] P0-40 Monorepo with two apps: replaced by a single app (D-034, 28 Sep 2026)
- [x] P0-40a **Single Next.js app** (like the Power BI app) in the repo root, with route groups `/users`, `/admin`, `/superadmin`, `/login` and `/api`. Layers: `app/` (routes), `features/` (UI by domain), `server/` (engine, auth, business rules, server-only), `lib/` (db, integrations), `config/`, `database/` (migrations, seeds), `tests/` (done 28 Sep 2026)
- [x] P0-41 Next.js 15 + React 19 + TypeScript strict + Tailwind 3 with the ARS preset from `D:\Omniroute\assets\tokens`; icons from the asset sprite (done 28 Sep 2026)
- [x] P0-42 MySQL 8 via `mysql2`; SQL migration folder + migrate/seed scripts (same pattern as the Power BI site); `docker-compose.yml` for local MySQL (done 28 Sep 2026; Docker MySQL on port 3307)
- [x] P0-43 Environment schema validated at startup with zod (fail fast with a clear message) (done 28 Sep 2026; blank optional values count as unset (D-045))
- [x] P0-44 Vitest unit tests + Playwright end-to-end; lint and typecheck scripts (28 Sep 2026: Vitest in place with 80 tests; Playwright still to do) (done 1 Oct 2026; Vitest + Playwright e2e in CI)
- [x] P0-45 CI on GitHub Actions (lint, typecheck, unit tests, build) (done 30 Sep 2026; lint, typecheck, unit tests, build + MySQL integration job)
- [>] P0-46 GoDaddy deploy: one Node.js app from GitHub `HarishDevs/ARS-Approval-System` → `approvals.arssteels.net`, env vars entered in GoDaddy only, cPanel cron calling a signed job-runner endpoint (1 Oct 2026: docs/DEPLOYMENT.md + check-privileges.js; deployment waits for the owner's go-ahead)

### 0.3 Business inputs
- [>] P0-30 **DoA matrix.** The approval authority is itadmin@ (D-041); fill in the bands and approvers per request type before Phase 3 (Q-004) (7 Oct 2026: example in docs/DOA-EXAMPLE.md and the demo Purchase & SCM; real values still to come (Q-004)) (8 Oct 2026: owner decided: DoA set per approval type when creating it (D-075); the editor is built)
- [ ] P0-31 Staff master, provided by the admin (D-033): name, email, WhatsApp number, department, designation, reporting manager, HOD, sign-in method, role(s). Prepare an import template (Excel) for it
- [ ] P0-32 Clean department list (replaces Asana's 27 values)
- [ ] P0-33 Clean request-type (Nature) list per approval type (merged from the ~60 Asana values)
- [ ] P0-34 Confirm the first-release templates and their approvers: MD, ED, Finance, Valarmadhi, SCM
- [x] P0-35 Break-glass holder = itadmin@ (D-041); keep the recovery credentials sealed offline (done 28 Sep 2026)

#### What a DoA matrix is
A **Delegation of Authority (DoA) matrix** is one table, signed off by management. For each kind of request and each amount range, it says **who must approve, and in what order**. The engine reads this table to choose the approval levels automatically. Today there is none: one approver clears everything from ₹3,890 to ₹5 Cr.

The example below uses today's approvers. **The amounts and names are placeholders for management to fill in.**

| Request type | Up to ₹1 L | ₹1 L – ₹5 L | ₹5 L – ₹25 L | Above ₹25 L |
|---|---|---|---|---|
| Purchase Order / Work Order | SCM Head | SCM Head → Finance | SCM Head → Finance → ED | SCM Head → Finance → ED → MD |
| Bill / payment / funds transfer | Finance checker → Finance HOD | + Finance Head | + ED | + MD |
| HR payments (salary, statutory, F&F) | HR Manager → HR HOD | HR Manager → HR HOD | + Finance → ED | + MD |
| IT purchase / licence / budget | IT Head | IT Head → Finance | + ED | + MD |
| Price realisation / discounts | Dept HOD(s) → ED | Dept HOD(s) → ED | Dept HOD(s) → ED → MD | Dept HOD(s) → ED → MD |
| Policy / special / investment | ED | ED → MD | ED → MD | ED → MD |

Management decides four things:
1. The amount bands.
2. The approver roles for each cell.
3. Whether a department's own HOD always comes first.
4. Who may approve on someone's behalf (delegation).

The Super Admin then enters the table in the Admin Portal (P3-30). Every request is routed from it, and changes are versioned with effective dates.

---

## Phase 1 — Foundation: sign-in, people, Admin Portal core, notifications

### P1-USR Users and organisation
- [>] P1-01 Data model: companies/units, locations, departments, designations, cost centres (28 Sep 2026: departments (with HOD) and designations; units, locations and cost centres still to do)
- [x] P1-02 Data model: users. Fields: login ID, email (any domain), WhatsApp number, sign-in method (Google / password), firebase_uid, password hash, status (active / inactive), locked-until, is_super_admin, is_break_glass (done 28 Sep 2026; Super Admin is a role (D-043), not a flag)
- [x] P1-03 Reporting hierarchy: reporting manager and HOD per user; manager-of-manager lookup (done 9 Oct 2026: reporting manager, HOD, manager's manager sources)
- [>] P1-04 Users can only be created in the Admin Portal (no self sign-up); bulk import with validation (30 Sep 2026: admin-only creation done; bulk import still to do)
- [x] P1-05 Make a user inactive (never hard-delete, D-033) → end their sessions, block sign-in, hand their pending approval steps to a chosen person; reactivate later if needed (30 Sep 2026: deactivate ends sessions and blocks sign-in, reactivate done; handing over pending steps comes with S3) (done 1 Oct 2026; handover required before deactivation (F-16))
- [x] P1-06 Roles assigned per user, by the admin only (D-033): a user can hold several roles; no self-service role changes (done 30 Sep 2026; D-047 rules)

### P1-AUTH Sign-in and security
- [>] P1-10 Google sign-in via Firebase Auth, ID token verified on the server: the email must match an existing active user whose method is Google; link firebase_uid on the first sign-in only; **no OTP** (D-006) (28 Sep 2026: built and unit-tested; a live test needs the Firebase Admin service-account values)
- [>] P1-11 User ID + password sign-in: Argon2id hashing, leaked-password check, minimum length (configurable) (28 Sep 2026: scrypt instead of Argon2id (D-043), policy checks; leaked-password check still to do)
- [>] P1-12 OTP after password sign-in: 6 digits, 5 min, single use, 5 wrong tries, resend after 30 s, max 5 per hour, stored hashed, anti-enumeration response; sent on **WhatsApp only** (D-025) with the Authentication-category template (28 Sep 2026: built, unit-tested and smoke-tested to the send step; a live send needs the CEOITBox key entered in /superadmin (S2-01))
- [x] P1-13 First sign-in for password users: set password (reuse the asset-pack create-password screens), verify the WhatsApp number by OTP (done 30 Sep 2026; single-use link + WhatsApp code (D-049))
- [x] P1-14 Forgot password: OTP on WhatsApp → new password → all sessions ended → alert sent (done 30 Sep 2026; uniform answers, code sent after the response)
- [x] P1-15 Lockout after 5 failed passwords (15 min, configurable) + alert (done 28 Sep 2026; verified on MySQL (5th wrong password locks, alert recorded))
- [>] P1-16 Sessions: secure HTTP-only cookie, idle and absolute timeouts (configurable), sign out everywhere (28 Sep 2026: DB-backed sessions, logout, sign out everywhere; idle timeout still to do)
- [>] P1-17 Device recognition: signed device cookie + browser/OS + IP / approximate location; trusted-device period (28 Sep 2026: signed device cookie, user agent, IP, trusted period; approximate location still to do)
- [>] P1-18 **New-login alert** on email + WhatsApp: time, device, browser, approximate location, IP, and a "This wasn't me" link (28 Sep 2026: built and tested; the WhatsApp copy waits for the owner's template (Q-013))
- [x] P1-19 "This wasn't me": end all sessions, lock the account, notify the Super Admin (28 Sep 2026: ends sessions, locks the account, alerts the user and the Super Admin; admin unlock arrives with S2-03; unlock done 30 Sep 2026)
- [>] P1-20 Security alerts for password changed, mobile/WhatsApp changed, account locked, repeated failures; every Super Admin sign-in alerts the Super Admin (28 Sep 2026: account locked + Super Admin/break-glass sign-in alerts; password/mobile-changed alerts come with S2-03/S2-04; added 30 Sep 2026, email now, WhatsApp after Q-013)
- [x] P1-21 Rate limiting on sign-in, OTP and password reset (done 30 Sep 2026; D-059)
- [~] P1-22 Step-up OTP for sensitive Admin Portal actions: not needed (D-032, 28 Sep 2026)
- [x] P1-23 `login_logs` browser/user-agent column ≥ VARCHAR(500) (bug found on the Power BI site) (done 28 Sep 2026; VARCHAR(500))

### P1-SEC Backend visibility and platform security (D-016)
- [~] P1-30 Separate admin build and address: replaced by role routes in one app (D-034, 28 Sep 2026)
- [x] P1-30a Route protection in 3 layers (the Power BI site's pattern): (1) middleware blocks `/admin` and `/superadmin` without the right role; (2) every page, route handler and server action re-checks the role and permission on the server; (3) record-level data-scope checks. Admin UI built mainly as server components, with no config or secrets in client bundles. Unknown or forbidden admin routes return a generic 404 (28 Sep 2026: layers 1 (middleware) and 2 (every layout and page, plus API guards; forbidden admin areas return 404) done; layer 3 comes with requests) (done 30 Sep 2026; layer 3: request pages open only for requester, participants and IT/Super Admin (D-057))
- [>] P1-31 Every API call needs a signed-in session; permissions checked on the server per record; admin routes accept only Admin Portal roles (D-024); Super-Admin-only areas (providers, security, integrations, health, audit export) enforced on the server (28 Sep 2026: area guards for API routes; per-record checks come with requests)
- [>] P1-32 No public API docs; no source maps in production; no config or keys sent to the browser; feature flags decided on the server (28 Sep 2026: no production source maps, no x-powered-by, public config only for Firebase)
- [>] P1-33 Generic error messages with a reference code; server/framework headers stripped; no provider names in the UI, emails or WhatsApp (28 Sep 2026: generic errors with a REQ- reference code)
- [>] P1-34 CORS limited to ARS addresses; security headers (CSP, HSTS, frame-ancestors) (28 Sep 2026: HSTS, X-Frame-Options DENY, nosniff, Referrer-Policy and Permissions-Policy set; CSP is S2-05 (P1-34a); CSP done 30 Sep 2026)
- [x] P1-34a Content-Security-Policy with a per-request nonce, compatible with the Firebase popup (S2-05, added 28 Sep 2026) (done 30 Sep 2026; D-051)
- [>] P1-35 Secrets encrypted at rest, shown masked in the Admin Portal, with rotation dates (30 Sep 2026: encrypted, shown only as Configured/Not configured, history by fingerprint; rotation dates still to do)
- [>] P1-36 **Break-glass account** (D-011): disabled by default; enabled only by a server-side script run from the hosting console; each use alerts (28 Sep 2026: schema plus the sign-in window rule and alert; the enabling script is S2-07; script done 30 Sep 2026, see Q-015)
- [x] P1-37 **Append-only audit log** (D-012): no update or delete for anyone; the Super Admin can view and export (done 28 Sep 2026; MySQL triggers reject UPDATE/DELETE (verified))
- [ ] P1-38 At go-live: rotate every key and password; remove developer access that is no longer needed

### P1-NOT Notification hub
- [>] P1-40 Event-driven hub: each event is recorded once, then fanned out to channels (28 Sep 2026: hub built (in-app + email + WhatsApp, never throws); the retry runner is P1-48)
- [>] P1-41 Email channel (Q-005), using ARS header/footer branding (28 Sep 2026: Resend adapter built; key entry is S2-01)
- [>] P1-42 WhatsApp channel through CEOITBox (D-009), with approved templates (28 Sep 2026: CEOITBox adapter with rate limit built; key entry is S2-01)
- [~] P1-43 SMS channel for OTP: not needed (D-025, 28 Sep 2026)
- [x] P1-48 Retry outbox for failed sends, driven by the cron job runner (the Power BI site lacked this); respect the CEOITBox rate limit (done 30 Sep 2026; /api/jobs/run with lease and backoff (D-058))
- [x] P1-44 In-app notifications (bell icon from the asset pack) (done 1 Oct 2026; bell with unread count + inbox)
- [x] P1-45 Delivery log per channel with status, retries and failures; the Super Admin can resend (30 Sep 2026: Super Admin delivery log; resend button with the retry runner (S3-07)) (done 30 Sep 2026; Retry now + automatic retries)
- [x] P1-46 Template per event and channel, versioned, with preview (7 Oct 2026: catalogue with preview, registry screen, versioned rows)
- [~] P1-47 WhatsApp numbers verified by OTP; opt-in recorded (9 Oct 2026: WhatsApp is verified by the code at set-password and forgot-password; opt-in records not needed for staff)

### P1-ADM Admin Portal (Super Admin) core
- [>] P1-50 Admin area shells at `approvals.arssteels.net/admin` and `/superadmin` (D-034): navigation, ARS branding (28 Sep 2026: shells for /admin and /superadmin)
- [>] P1-50a Roles (D-024, D-039): **Super Admin** = itadmin@ (everything; `/superadmin`); **IT Admin** (`/admin`: approval types, forms, workflows, templates, DoA, users and roles as granted); **User** (`/users`). Provider keys, security, integrations, system health and audit export are `/superadmin` only (28 Sep 2026: SUPER_ADMIN / IT_ADMIN / USER roles and area policy)
- [>] P1-51 Organisation module (P1-01) (30 Sep 2026: departments (with HOD) and designations; units, locations, cost centres still to do)
- [>] P1-52 Users and hierarchy module (P1-02 to P1-05): create, import, edit, deactivate, force sign-out, reset password, unlock, change sign-in method (30 Sep 2026: create, edit, deactivate, reactivate, unlock, force sign-out, set-password link, change sign-in method; import still to do)
- [~] P1-53 Roles and data rights: role builder, permission matrix, data scopes (own / team / department / list / all), field-level hiding (9 Oct 2026: superseded by D-047: three fixed roles plus record-level checks)
- [>] P1-54 Security settings: password policy, OTP values, lockout, sessions, trusted-device period, alert rules, optional IP allowlist for the Admin Portal (30 Sep 2026: password length, OTP, lockout, trusted-device values in /superadmin; session timeouts and IP allowlist still to do)
- [>] P1-55 Providers and integrations: Google OAuth, email, CEOITBox, SMS. Masked keys, test-send button (30 Sep 2026: Resend + CEOITBox keys and test-send; Google (Firebase Admin) stays an env value)
- [x] P1-56 Notification center: templates, channels, delivery log (done 9 Oct 2026: template board, channels, Message deliveries)
- [>] P1-57 Audit viewer: search, filter and export the audit log; login history; security events (30 Sep 2026: viewer with action filter and paging; export and login-history view still to do)
- [x] P1-58 System health: job queue, notification failures, error summary (admin only) (done 9 Oct 2026: job runner status, /api/health, Message deliveries, audit log)
- [~] P1-59 Branding: logo, colours, email header, login message (9 Oct 2026: superseded: fixed ARS branding)
- [x] P1-60 Every admin change is written to the audit log with before and after values (done 30 Sep 2026 for settings, users, roles, departments, designations, workflows)

### P1-UI User app foundation
- [>] P1-70 App shell with the ARS tokens and icons (asset pack): sidebar, top bar, profile (28 Sep 2026: sidebar shell with ARS branding)
- [x] P1-71 Login screens: Google button, User ID + password, OTP screen, forgot password, create password (28 Sep 2026: Google + User ID/password + OTP screens; forgot/create password in S2-04; forgot + set password screens done 30 Sep 2026)
- [x] P1-72 Profile: my details, my devices and sessions (sign out a device), notification preferences where the Super Admin allows them (done 9 Oct 2026: Profile page v1.3.5 (details, sign-ins, sign out everywhere); notification preferences not offered: both channels by decision)

---

## Phase 2 — Multi-level approval engine (the core of the product)

### P2-DM Data model (node graph, never fixed levels)
- [x] P2-01 ApprovalTypes, ApprovalTemplates (versioned), FormDefinitions (versioned), FormFields (reusable field types) (done 9 Oct 2026: workflow_definitions / versioned versions with form and builder)
- [x] P2-02 WorkflowDefinitions → WorkflowVersions → WorkflowNodes + WorkflowEdges + WorkflowConditions (done 30 Sep 2026; nodes/edges stored as the version's JSON graph, one published version at a time)
- [x] P2-03 Node kinds: START, APPROVAL, PARALLEL-SPLIT, JOIN, CONDITION, WORK-ASSIGNMENT, NOTIFY, END (done 9 Oct 2026: all eight, WORK and NOTIFY in v1.4.0 (D-097))
- [~] P2-04 Completion rules on a group: ALL, ANY_ONE, ANY_N_OF_M (N configurable), with optional weighted or mandatory members (9 Oct 2026: ALL / ANY_ONE / ANY_N built; a mandatory member = a parallel step joined with ALL)
- [x] P2-05 Approver sources per node: specific user, role, requester's HOD, department HOD, reporting manager, manager's manager, department, approval group, requester-selected (within governance), user from a form field (30 Sep 2026: all 8 sources resolve from MySQL; approver groups have tables (screen in S3-06)) (done 30 Sep 2026; approver groups screen added)
- [>] P2-06 ApprovalRequests (permanent ID, e.g. PUR-2026-000421), ApprovalVersions, ApprovalInstances, ApprovalSteps, ApprovalActions (30 Sep 2026: requests with permanent numbers, state, tasks and timeline; form versions come with the form builder)
- [x] P2-07 Step record: step ID, request, node, assigned approver(s), eligible approvers, **actual actor**, on-behalf-of, decision, time, comment, version (done 30 Sep 2026; actual actor + on-behalf-of per task)
- [>] P2-08 Comments, Attachments (versioned), Watchers (1 Oct 2026: comments done (append-only); attachments and watchers later) (7 Oct 2026: comments and attachments done (attachments never deleted; a newer file is added); watchers later)
- [x] P2-09 Numbering scheme per approval type (code prefix + year + sequence) (done 30 Sep 2026; PREFIX-YYYY-000001 from a locked sequence row)

### P2-ENG Engine behaviour (all patterns from day one)
- [x] P2-20 Instantiate a request against the **published workflow version** (running requests never change underneath) (done 30 Sep 2026; tested with a new version published mid-flight)
- [x] P2-21 Sequential levels (any number) (engine core done 28 Sep 2026; stored with S2-06)
- [x] P2-22 Parallel levels with a join (ALL) (engine core done 28 Sep 2026 (joins: ALL, ANY_ONE, ANY_N))
- [x] P2-23 Any-one and any-N-of-M groups (engine core done 28 Sep 2026)
- [x] P2-24 Conditional branches (amount, department, type, priority, any form field; AND/OR) (engine core done 28 Sep 2026 (AND/OR groups, default path))
- [x] P2-25 Hybrid graphs: combinations of all the above, nested (engine core done 28 Sep 2026)
- [x] P2-26 Skip rules (e.g. skip a level if the requester is that approver; no self-approval) (engine core done 28 Sep 2026 (skipIf, no self-approval, BLOCK/SKIP when no approver))
- [x] P2-27 Resolve approvers when a step starts (so hierarchy changes are picked up); record who was resolved (done 30 Sep 2026; resolved from a fresh directory snapshot when each step starts)
- [x] P2-28 **Server-side actor authorisation** on every action (D-020): the signed-in user must be an eligible approver or a valid delegate for this step (28 Sep 2026: the engine enforces approver-or-delegate; the server wiring comes with S2-06; wired and tested on MySQL 30 Sep 2026)
- [~] P2-29 Canonical state machine (D-017): Draft, Submitted, Pending, In Progress, On Hold, Changes Required, Resubmitted, Approved, Rejected, Reopened, Closed (9 Oct 2026: D-078: no drafts; reopen = new round; closed = approved / rejected / withdrawn)
- [x] P2-30 Actions: Approve, Reject (reason required), Request Changes (reason required), Put On Hold / Resume, Comment (engine core done 28 Sep 2026)
- [x] P2-31 Timeline / audit entry for every transition (done 30 Sep 2026; append-only approval_events)
- [>] P2-32 Notification events emitted for every transition (to P1-NOT) (30 Sep 2026: approval needed / approved / rejected / changes / hold / blocked on email + in-app; WhatsApp waits for Q-013)
- [>] P2-33 Engine test suite covering every pattern, including edge cases (an approver leaves mid-flow, an empty approver group, a condition with no matching branch) (28 Sep 2026: 38 engine tests; 'an approver leaves mid-flow' still to do)

### P2-UI Employee and approver portals (first cut)
- [>] P2-40 Employee: create request from a template, dynamic form, attachments, submit, save draft (30 Sep 2026: pick a type, fill the form (text, long text, number, date, choice, person), submit; attachments and drafts still to do)
- [x] P2-41 Employee: My Requests, with a status pill and a visual step tracker showing every level and branch (done 30 Sep 2026)
- [x] P2-42 Approver: My Queue (ID, requester, department, type, amount, current step, age, SLA) with actions (30 Sep 2026: queue with request, requester, step and age; SLA column with S4-04) (done 1 Oct 2026; due time and Overdue in the queue)
- [>] P2-43 Request detail: form data, documents, timeline, comments, the full level map (30 Sep 2026: form data, full level map, timeline; documents and comments in S4)
- [x] P2-44 Secure deep links from email/WhatsApp that open the request after sign-in (D-019) (done 30 Sep 2026; links open /users/requests/id after sign-in)

### P2-TPL First-release templates (D-021), built by configuration only
- [x] P2-50 MD Approval (7 Oct 2026 on demo staff)
- [x] P2-51 ED Approval (7 Oct 2026 on demo staff)
- [x] P2-52 Finance Approval (Prabu) (7 Oct 2026 as Finance (controller), via a group)
- [x] P2-53 Finance Approval (Valarmadhi) (7 Oct 2026 as Finance (head), via the department HOD)
- [x] P2-54 Purchase & SCM Approval (7 Oct 2026 with the DoA bands)
- [x] P2-55 Each template is checked against the reference flows in FLOWS.md Part A, with the known defects not reproduced (7 Oct 2026: shapes as FLOWS F-60 to F-71, people by group/HOD (G-01..G-15 not reproduced))

---

## Phase 3 — Workflow designer, DoA, validator, test mode
- [>] P3-01 Visual drag-and-drop designer: START, APPROVAL, PARALLEL, ANY-ONE, ANY-N, CONDITION, WORK, END (30 Sep 2026: structured levels builder (D-056); drag-and-drop canvas later) (1 Oct 2026: levels builder now has choices (CONDITION); drag-and-drop canvas still later) (8 Oct 2026: DoA matrix editor per approval type added)
- [>] P3-02 Node settings panel: approver source, completion rule, SLA, allowed actions, notifications (30 Sep 2026: approver source, completion rule, skip condition, no-approver policy; SLA and notifications per step later)
- [>] P3-03 Form builder: drag, add, remove and reorder fields; field types; required; validation; conditional visibility (30 Sep 2026: fields with type, required and choices in the builder; conditional visibility later)
- [>] P3-04 **Workflow validator** before publish: start/end exist, all nodes connected, no dead ends, no unintended loops, every approval node has an approver source, no self-approval, valid completion rules, logically valid conditions with no conflicts, rejection path exists, resubmission/reopen policy set, valid escalation (base plan §34) (28 Sep 2026: core rules incl. G-08/G-09, cycles, dead ends; rejection-path and escalation checks still to do) (1 Oct 2026: conditions on choices validated too; rejection-path and escalation checks still to do)
- [x] P3-05 **Test mode / simulation:** enter sample values and see the exact levels and approvers, without creating a real request (28 Sep 2026: simulate() core with stages, skips, blocks and branches; UI with P3) (done 30 Sep 2026; test mode with real names)
- [>] P3-06 Draft / publish / archive for templates, with version history and a diff (30 Sep 2026: versions, publish and archive in the service; screens in S3-05) (30 Sep 2026: draft/publish/archive with version history; diff still to do)
- [>] P3-30 **DoA matrix module:** amount bands per type and department, approver roles per band, effective dates, versioned; used by condition nodes (1 Oct 2026: DoA expressed as amount skip conditions; /admin/doa matrix view; owner's values pending Q-004)
- [ ] P3-40 Templates: HR Approvals, Admin, Recruitment (Manager → HOD)
- [ ] P3-41 Template: Finance Internal (level 1 chosen by Nature → optional level 2 → HOD), including the reject/hold paths at level 2 that are missing in Asana
- [ ] P3-42 Template: Price Realisation (parallel HOD sign-offs → ED → MD), with a decision on approve vs acknowledge
- [ ] P3-43 Templates: IT Internal, Plant, ASP, Branding, Training, Sumit (in the corrected form)

## Phase 4 — Lifecycle
- [x] P4-01 Changes Required → requester edits → Resubmitted as a new version under the **same ID** (base plan §14) (done 9 Oct 2026: same request number, round N)
- [~] P4-02 Resubmission restarts from a policy-defined point (beginning / the level that asked / a specific level) (9 Oct 2026: D-101: from the step that asked, or from the beginning, per approval type)
- [~] P4-03 Reopen after approval: reason required; restart from beginning / a chosen level / current level; audited (base plan §15) (9 Oct 2026: reopen restarts from the beginning, reason required, audited)
- [x] P4-04 On Hold: paused, stays open, counts as pending; resume (done 9 Oct 2026: hold time extends due times (v1.4.0))
- [x] P4-05 Delegation: date range, delegate, scope; "on behalf of" recorded (D-018); the Super Admin can view and end any delegation (done 9 Oct 2026: out of office, on behalf recorded)
- [x] P4-06 SLA per node, reminders, escalation chains (base plan §19) (done 9 Oct 2026: reminder + escalation up to 3 levels (v1.4.0, D-100))
- [x] P4-07 Holiday / working-day calendar used by SLA and due dates (done 9 Oct 2026: working calendar)
- [~] P4-08 Recording approvals given outside the system (phone/meeting): approver records it with evidence (D-019) (9 Oct 2026: recorded as an approval with a comment and the evidence attached)

## Phase 5 — Employee custom approvals
- [x] P5-01 "Create custom approval", open to **every user whenever needed** (D-026): choose approvers and pattern (sequential / parallel / any-one / any-N / mixed), documents, submit (done 9 Oct 2026: Custom approval page)
- [x] P5-02 Anyone can pick anyone as an approver (D-040). Always-on safety rules: active users only, no self-approval, graph validated. No exclusion list (done 9 Oct 2026: approver-eligible people (D-085), no self-approval)
- [x] P5-03 Custom flows are validated by the same validator (P3-04) (done 9 Oct 2026: same validator)
- [x] P5-04 Super Admin can turn a useful custom flow into a predefined template (done 9 Oct 2026: v1.4.0: "Make it an approval type" on a custom request (IT))

## Phase 6 — Documents, discussion, work assignment
- [x] P6-01 Documents: PDF, Excel, Word, images; versions kept; never overwritten silently (done 9 Oct 2026: attachments never overwritten; per round)
- [~] P6-02 Comments and @mentions on each request (9 Oct 2026: comments built; no @mentions (a mention would need its own access rule; participants are already told))
- [x] P6-03 Work assignment after approval: assignee or department, work tasks, completion, close (the IT pattern) (done 9 Oct 2026: work steps (v1.4.0, D-097))
- [~] P6-04 Watchers / followers (9 Oct 2026: no watchers: FYI steps tell people who aren't approvers)

## Phase 7 — Management portal and analytics
- [x] P7-01 Management control center: raised, pending, approved, rejected, changes required, on hold, overdue (today / period) (done 1 Oct 2026; /admin/insights (D-069))
- [x] P7-02 Views by department, approval type, approver, amount band, age, SLA (done 9 Oct 2026: four dashboards with filters)
- [x] P7-03 Approver workload and response times (done 9 Oct 2026: approver dashboard)
- [x] P7-04 Reporting views for Power BI (read-only DB views or API) (done 9 Oct 2026: v1.4.0: database/optional/reporting_views.sql (DEPLOYMENT K2))
- [~] P7-05 Data rights tools for the Super Admin: export (Excel/CSV), scheduled exports, corrections with a reason (versioned), archive, retention rules, legal hold (9 Oct 2026: CSV exports built (audit, dashboards, import data); scheduled exports, retention and legal hold not needed yet)

## Phase 8 — Integrations and mobile
- [~] P8-01 ERP / Salesforce / other apps via API and webhooks (Super Admin configures) (9 Oct 2026: no consumer yet; revisit when an ERP needs it)
- [x] P8-02 Installable mobile web app (PWA) for approvers (done 9 Oct 2026: v1.4.0: installable (manifest + icons))
- [~] P8-03 Import of Asana history. Not needed: D-013 (28 Sep 2026)
- [ ] P8-04 Switch off the Asana approval forms after go-live and tell users

## Go-live
- [ ] GL-01 User acceptance testing, per template, with the real approvers
- [x] GL-02 Security review: auth, permissions, admin isolation, headers, secrets (done 9 Oct 2026: docs/APPLICATION_CURRENT_STATE_AUDIT.md + fixes in v1.3.6/v1.4.0)
- [x] GL-03 Load test with typical volume (~500+ requests/month, multi-step) (done 9 Oct 2026: local load test, 50 people at once: 2,400 requests, 0 errors, p95 586 ms (tests/perf))
- [ ] GL-04 Backup/restore drill
- [ ] GL-05 Key rotation and access clean-up (P1-38)
- [x] GL-06 User guides: employee, approver, management; admin runbook (done 9 Oct 2026: docs/USER-GUIDE.md; admin runbook = DEPLOYMENT.md)
- [ ] GL-07 Pilot with one department, then roll out by template

---

## Stack (decided 28 Sep 2026, D-028)
| Layer | Choice | Proven on the Power BI site? |
|---|---|---|
| Hosting | GoDaddy Node.JS Hosting (Node 22), **one app** at approvals.arssteels.net; deploy from GitHub `HarishDevs/ARS-Approval-System` | Yes |
| Areas | Role routes `/users`, `/admin`, `/superadmin` (D-034) | Yes (the Power BI site has `/admin`, `/super-admin`, `/app`) |
| Framework | Next.js 15 App Router, React 19, TypeScript | Yes |
| UI | Tailwind 3 + ARS token preset + asset-pack icons | Yes (own brand theme) |
| Database | MySQL 8 (`mysql2`), SQL migrations + seeds | Yes |
| Google sign-in | Firebase Auth, server-side ID-token check | Yes |
| Sessions | HMAC-signed httpOnly cookie | Yes |
| Secrets in settings | AES-256-GCM encrypted settings table | Yes |
| WhatsApp | CEOITBox adapter (`x-api-key`) | Yes (live) |
| Email | Resend from itadmin@ (D-037) | Yes |
| Jobs / timers | DB job table + cPanel cron → signed job-runner endpoint | New (the Power BI site had no scheduler) |
| Tests | Vitest + Playwright | Yes |
| Superseded | NestJS / PostgreSQL / Redis from the base plan §38 | [~] Replaced to fit GoDaddy (28 Sep 2026) |

---

## Guardrails: Asana defects never to repeat
| ID | Rule |
|---|---|
| G-01 | The approver is the authenticated actor, checked on the server; never "assignee = approver" |
| G-02 | Rejected can never be shown as Approved; one state machine drives every view |
| G-03 | On Hold / Changes Required never mark a request complete |
| G-04 | Resubmission keeps the same ID (versions), no new request |
| G-05 | One record per request; department views are filters, never copies |
| G-06 | One notification per event per channel (no duplicates); placeholders validated at template save |
| G-07 | Amount routing comes from the DoA matrix; no single approver for every amount unless configured deliberately |
| G-08 | The validator blocks impossible conditions (e.g. "Nature is A AND Nature is B") |
| G-09 | The validator blocks approver sources that can never match (the Plant HOD bug) |
| G-10 | Every branch has reject / hold / changes handling (the Finance Internal level-2 gap) |
| G-11 | Every department value is routed or explicitly excluded (the Corporate Affairs / NBD gaps) |
| G-12 | No shared accounts; delegation instead |
| G-13 | No "let AI decide the number of approvers"; approver counts are deterministic |
| G-14 | Fields standardised through reusable field types; no per-project copies |
| G-15 | Only published templates are visible; no empty, unused structures |
| G-16 | Hard-coded "Level 1–4" columns are forbidden; use the node graph (north star) |

---

## Notification events (every one on email + WhatsApp + in-app, except OTP)
| ID | Event | Recipients | Checklist |
|---|---|---|---|
| N-01 | OTP code | User (WhatsApp only, D-025) | P1-12 |
| N-02 | New sign-in detected | User | P1-18 |
| N-03 | Password changed / mobile changed / account locked / repeated failures | User; Super Admin for locks | P1-20 |
| N-04 | Super Admin signed in | Super Admin | P1-20 |
| N-05 | Break-glass account enabled or used | Super Admin + holder | P1-36 |
| N-06 | Request submitted (receipt with ID) | Requester | P2-32 |
| N-07 | Action needed | Current approver(s) / delegate | P2-32 |
| N-08 | Approved at a level | Requester, next approver(s), watchers | P2-32 |
| N-09 | Fully approved | Requester, watchers, work assignee | P2-32 |
| N-10 | Rejected (with reason) | Requester, watchers | P2-32 |
| N-11 | Changes required (with reason) | Requester | P4-01 |
| N-12 | Resubmitted | Approver(s) at the restart level | P4-01 |
| N-13 | Put on hold / resumed | Requester | P4-04 |
| N-14 | Reopened | Requester, affected approvers | P4-03 |
| N-15 | SLA reminder | Approver | P4-06 |
| N-16 | Escalated | Escalation contact, approver | P4-06 |
| N-17 | Delegation started / ended | Delegator, delegate | P4-05 |
| N-18 | Work assigned / work completed | Assignee / requester | P6-03 |
| N-19 | Comment / @mention | Mentioned users, requester, current approver | P6-02 |
| N-20 | Delivery failures / provider problems | Super Admin | P1-45 |

---

## Coverage map (every requirement → checklist items)

### Base development plan (45 points, 28 Sep 2026)
| § | Topic | Items |
|---|---|---|
| 1 | Three-layer platform (users, builder, engine) | P1-USR, P3, P2-ENG |
| 2 | No recreation of the 104 projects | P2-TPL, G-05, G-15 |
| 3 | Approval Builder basic info | P2-01, P3-06 |
| 4 | Form builder | P3-03, P2-01 |
| 5 | Workflow types | P2-21 to P2-25 |
| 6 | Visual designer | P3-01, P3-02 |
| 7 | Approver selection engine | P2-05, P2-27 |
| 8 | Amount-based routing | P3-30, P2-24, G-07 |
| 9 | Conditional engine | P2-24 |
| 10–11 | Employee custom approvals + governance | P5-01 to P5-04 |
| 12–13 | Lifecycle; Reject vs Changes Required | P2-29, P2-30, P4-01 |
| 14 | Same ID on resubmission | P4-01, G-04 |
| 15 | Reopen | P4-03 |
| 16–17 | Actor security, step record | P2-28, P2-07, G-01 |
| 18 | Delegation | P4-05 |
| 19 | SLA and escalation | P4-06, P4-07 |
| 20 | Work assignment | P6-03 |
| 21 | Employee portal | P2-40, P2-41 |
| 22 | Approver portal | P2-42 |
| 23 | Management portal | P7-01, P7-02 |
| 24 | Universal timeline | P2-31, P2-43 |
| 25 | Documents with versions | P6-01 |
| 26 | Comments | P6-02 |
| 27 | Central notifications | P1-NOT |
| 28 | Audit trail | P1-37, P2-31 |
| 29–30 | Workflow and template versioning | P2-02, P2-20, P3-06 |
| 31 | Department architecture | P1-01, P1-03, G-05 |
| 32 | Visibility rules | P1-53 |
| 33 | Asana bug list → solutions | Guardrails G-01 to G-16 |
| 34 | Workflow validator | P3-04 |
| 35 | Test mode | P3-05 |
| 36 | Analytics | P7-01 to P7-03 |
| 37 | Power BI | P7-04 |
| 38 | Technical architecture | P0-11, Stack options |
| 39–40 | Core entities; node + connection + rule + actor | P2-DM, G-16 |
| 41 | Development phases | Phases 0–8 |
| 42 | Migration strategy (catalogue) | P2-TPL, P3-40 to P3-43 (flow reference only, D-013) |
| 43 | Preserve historical data | [~] Not needed, D-013 |
| 44 | Build order (engine before designer) | Phase 2 before Phase 3 |
| 45 | Target architecture | All phases |

### Owner requirements (28 Sep 2026)
| ID | Requirement | Items |
|---|---|---|
| R-01 | Multi-level approvals in any custom manner (**north star**) | P2-ENG, P2-DM, P3, P5, G-16 |
| R-02 | Admin Portal = Super Admin, handled by developers, itadmin@arssteels.co.in | P1-ADM, P1-30, D-003 |
| R-03 | All configuration only by the Super Admin | P1-31, P1-ADM, P3, P5-02 |
| R-04 | Full customisation rights and data rights for the Super Admin | P1-53, P1-ADM, P7-05 |
| R-05 | Only Admin-Portal-created users; any email | P1-04, P1-10, D-004 |
| R-06 | Google sign-in, no OTP | P1-10 |
| R-07 | User ID + password + OTP (mobile + WhatsApp); some staff password-only | P1-11, P1-12, P1-02 |
| R-08 | New-login detection notifies the user | P1-17 to P1-19 |
| R-09 | All notifications on WhatsApp and email | P1-NOT, N-01 to N-20 |
| R-10 | Nobody but the Super Admin sees backend, API, config or providers | P1-SEC |
| R-11 | WhatsApp via CEOITBox | P0-12, P0-14, P1-42 |
| R-12 | Hosting on GoDaddy | P0-10, P0-11, P0-19 |
| R-13 | Break-glass account + append-only audit | P1-36, P1-37 |
| R-14 | DoA clarity | §0.3 explanation, P0-30, P3-30 |
| R-15 | No Asana import; flow reference only | P8-03 [~], FLOWS.md Part A |
| R-16 | Maintain memory, plan checklist and flow files every session | Rules at top of all three files, CLAUDE.md, P0-01 |
| R-17 | GoDaddy cPanel + Node.js hosting | P0-10, P0-17a, P0-46, D-027 |
| R-18 | CEOITBox as in `D:\PBI New` | P0-12, P0-12a, P0-14, P1-42, D-029 |
| R-19 | OTP on WhatsApp only | P1-12 to P1-14, N-01, D-025 |
| R-20 | Dedicated Admin Portal for the IT team to create predefined approvals; everyone can create custom approvals | P1-50, P1-50a, P3, P5-01, D-024, D-026 |
| R-21 | Sender itadmin@arssteels.co.in; admin at admin.arssteels.net | P0-15, P0-17, P1-41, P1-50, D-030, D-031 |
| R-22 | No step-up OTP | P1-22 [~], D-032 |
| R-23 | Admin provides staff data; roles per user by admin only; add/inactivate users in the Admin Portal | P0-31, P1-04 to P1-06, P1-52, D-033 |
| R-24 | One app only at approvals.arssteels.net with /users, /admin, /superadmin | P0-40a, P1-30a, P1-50, P1-50a, D-034 |
| R-25 | GitHub repo HarishDevs/ARS-Approval-System for all activity | P0-18, P0-18a, P0-45, P0-46, D-035 |
| R-26 | Same WhatsApp number + API; owner provides notification templates | P0-12a, P0-14, D-036 |
| R-27 | Resend for email | P0-15, P1-41, D-037 |
| R-28 | Reuse the Firebase project | P0-16, P1-10, D-038 |
| R-29 | IT admins build approvals; providers/security Super Admin only | P1-50a, P1-31, D-039 |
| R-30 | Anyone can pick anyone in custom approvals | P5-02, D-040 |
| R-31 | itadmin@ = approval authority, admin login, break-glass | P0-30, P0-35, D-041 |
