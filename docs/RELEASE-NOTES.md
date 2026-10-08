# Release notes

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
