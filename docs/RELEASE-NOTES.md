# Release notes

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
