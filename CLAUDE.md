# ARS Approval Platform — working rules

**North star: multi-level approvals in any custom manner.** Any number of levels, combined freely (sequential, parallel, any-one, any-N-of-M, conditional, hybrid), with approvers from any source. Judge every decision against this. Build the engine as a node graph, never fixed "Level 1–4" columns.

## Mandatory living files: never omit, never skip
| File | Purpose |
|---|---|
| `DEVELOPMENT-MEMORY.md` | What is done, features, details, decisions (D-xxx), open questions (Q-xxx), work log, reference project notes |
| `PLAN-CHECKLIST.md` | Every task planned as a checklist *before* doing it; tick with date; coverage map so nothing is left behind |
| `FLOWS.md` | Every flow (Asana reference flows + new platform flows) |

Every session:
1. **Start:** read the ★ north star, PLAN-CHECKLIST "Now / Next", and the DEVELOPMENT-MEMORY open questions.
2. **Before any task:** add or confirm its checklist item. If it adds or changes a flow, update FLOWS.md first.
3. **End:** tick the items (with the date), update "Now / Next", add a work-log entry, and record new decisions and questions. **Then commit and push to GitHub.**
4. Never delete history. Supersede decisions with a new D-number, and mark items `[~]` with a reason.

## Repository
- GitHub: `HarishDevs/ARS-Approval-System` (private), branch `main`. Every activity goes here (D-035).
- **Never commit secrets.** `.env*` stays git-ignored. Provider keys are entered only in `/superadmin` encrypted settings; server secrets go only in GoDaddy env vars.

## Fixed decisions (full list and reasons in DEVELOPMENT-MEMORY.md)
- **One app, ARS-CMS (Central Management System),** at `arssteels.net` (moved from `approval.arssteels.net`, D-195/D-196; the old address redirects with `LEGACY_HOSTS`), like the Power BI app. Role routes: `/users` (everyone), `/admin` (IT team: predefined approvals, forms, workflows, DoA, users/roles), `/superadmin` (itadmin@ only: providers, security, integrations, health, audit export, break-glass). Every protection check runs on the server.
- `itadmin@arssteels.co.in` = Super Admin, approval (DoA) authority, and break-glass holder. **It signs in with Google as `itsupport@arsenergy.co.in`** (User ID `itadmin`; itadmin@ is only a mail alias, D-082). **Every user can create custom approvals** and pick any **approver-eligible** person (D-085: active, and their designation is ticked "Approver", Manager and above). Nobody approves their own request. The same rule applies to group members, HODs, reporting managers and delegates; choices already saved stay valid.
- Only admin-created users sign in (any email). Roles are set per user by the admin only. Users are made inactive, never deleted.
- Google sign-in (reusing the Power BI site's Firebase project `power-bi-dashboard-3b29f`) has no OTP. User ID + password needs an OTP on **WhatsApp only**. No step-up OTP.
- New-login alerts and all notifications go on email (Resend, from no_reply@approval.arssteels.net, reply-to itadmin@arssteels.co.in, D-080 → D-091) + WhatsApp (CEOITBox, the same number and API as the Power BI site). The owner supplies the notification templates.
- Hosting: GoDaddy Node.js Hosting (cPanel). Stack: Next.js 15, React 19, TypeScript, Tailwind (ARS tokens from `D:\Omniroute\assets`), MySQL 8 (`mysql2`), Firebase Auth, HMAC sessions, AES-GCM encrypted settings, cron job runner, Vitest + Playwright.
- **Reference implementation: `D:\PBI New`** (read-only). Reuse its patterns. **Never open or copy its `.env.local` or any real secret.**
- Break-glass admin account; append-only audit log. No Asana import (Asana is a flow reference only, see `reference/`).
