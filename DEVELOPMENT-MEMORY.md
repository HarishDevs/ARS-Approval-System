# ARS Approval Platform — Development Memory

> **Mandatory living file.** Read it at the start of every work session and update it at the end.
> Never delete history. Add to the log newest-first; change a decision only by adding a new decision that supersedes it.
> Companion files, which must always be kept in step:
> - [PLAN-CHECKLIST.md](PLAN-CHECKLIST.md): every task, planned before it is done, ticked when complete
> - [FLOWS.md](FLOWS.md): every flow (reference Asana flows and new-platform flows)

---

## ★ North star (never lose this)

**The main purpose of the platform is multi-level approvals, configured in any custom manner.**
- Any number of levels, in any order or combination: sequential, parallel, any-one, any-N-of-M, conditional, and hybrids of these. The approver at each level can come from any source (a person, a role, the HOD, the reporting manager, a group, a form field). Levels can be skipped or added by conditions such as amount or type.
- Every design, build and review decision is judged first against this. If a feature makes flexible multi-level approval harder, it waits.
- The engine is the product; the workflow designer is only the screen for building workflows (base plan §44). Data model = nodes + connections + rules + actors, **never fixed "Level 1…Level 4" columns** (base plan §40).

---

## 1. Project snapshot

| Item | Value |
|---|---|
| Product | ARS Approval Platform: one configurable approval engine replacing the Asana approval projects |
| Company | ARS Steels & Alloy International Pvt Ltd |
| Build team | Project owner (ARS IT, itadmin@arssteels.co.in) + Claude (AI pair developer) |
| Admin Portal (Super Admin) login | `itadmin@arssteels.co.in`, operated by the developers |
| Current stage | **Planning complete (v3). No code written yet.** Stack and hosting decided (D-027/D-028). Remaining open questions in §4; Phase 0 setup can start |
| Address | **`approvals.arssteels.net`** (single app; role routes `/users`, `/admin`, `/superadmin`, D-034) |
| Repository | **https://github.com/HarishDevs/ARS-Approval-System** (private, `main`, D-035). Local root: `D:\Omniroute\ARS Approval System` |
| Last updated | 28 Sep 2026 |

## 2. Key files and links

| What | Where |
|---|---|
| Build plan (shareable page, v3) | https://claude.ai/artifact/9CWKEhnnDE1TTKowzgL4Ud (local copies: `reference/platform-plan-v1.html`, `-v2.html`, `-v3.html`) |
| Reference implementation (read-only) | `D:\PBI New` (ARS Power BI website). See §9 |
| Working rules for every session | `D:\Omniroute\CLAUDE.md` |
| Asana approval audit (shareable page) | https://claude.ai/artifact/CshLTbUecmdfgFkcG5re2g (local copy: `reference/asana-approval-audit.html`) |
| Asana rule notes (868 rules) | `reference/asana-rules-notes.md` |
| Earlier write-up (target-state vision; some facts out of date) | `reference/earlier-writeup-current-system.txt` |
| Base development plan (45 points, shared by owner 28 Sep) | Captured in PLAN-CHECKLIST.md §Coverage map; full text is in the plan page |
| Design assets (brand tokens, logos, icons, login screens) | `D:\Omniroute\assets` (tokens.json / tokens.css / tailwind.preset.js) |
| Figma reference file | `mfSBf0vugMktmwIJLYN6aD` (Starter plan, max 3 pages) |

## 3. Decisions register

| ID | Date | Decision | Source |
|---|---|---|---|
| D-000 | 28 Sep 2026 | **North star: multi-level approvals in any custom manner.** Everything else serves this (see ★ above) | Owner |
| D-001 | 28 Sep 2026 | Build **one configurable approval engine**, not a copy of the 104 Asana projects. Approval definitions replace department × approver projects | Base plan §2 |
| D-002 | 28 Sep 2026 | The owner's 45-point development plan is the **foundation**. Changes are only those listed in this register | Owner |
| D-003 | 28 Sep 2026 | **Super Admin = the Admin Portal**, a separate app handled by the developers. Login `itadmin@arssteels.co.in`. Only this account can configure anything (approval types, forms, workflows, DoA, users, roles, data rights, notifications, providers, security, integrations) | Owner |
| D-004 | 28 Sep 2026 | **Only users created in the Admin Portal can sign in. Any email address/domain is allowed** (no domain restriction); no self sign-up | Owner (answer 1) |
| D-005 | 28 Sep 2026 | **Sign-in method is set per user**: Google, or User ID + password + OTP. Some staff use password + OTP only | Owner (answer 1) |
| D-006 | 28 Sep 2026 | **Google sign-in needs no OTP. User ID + password always needs an OTP**, sent to the user's **mobile (SMS) and WhatsApp** (see Q-003) | Owner (answer 2) |
| D-007 | 28 Sep 2026 | **New-login detection:** an unrecognised device or location triggers an alert to the user on email and WhatsApp, with a "This wasn't me" action | Owner |
| D-008 | 28 Sep 2026 | **Every notification goes on email and WhatsApp** (plus in-app). Each event is sent once, from a central notification hub | Owner |
| D-009 | 28 Sep 2026 | **WhatsApp provider: CEOITBox**, the same provider used for the ARS Power BI website | Owner (answer 3) |
| D-010 | 28 Sep 2026 | **Hosting: GoDaddy**, the same as the Power BI website. The stack must fit the GoDaddy plan in use (see Q-001) | Owner (answer 4) |
| D-011 | 28 Sep 2026 | **Break-glass admin account:** a sealed second admin account, disabled by default, that can only be enabled from the hosting console. Credentials are kept sealed (proposed holder: MD) | Owner accepted recommendation (answer 5) |
| D-012 | 28 Sep 2026 | **The audit log is append-only for everyone, including the Super Admin** (view and export only). Corrections create new versions and never overwrite | Owner accepted recommendation (answer 5) |
| D-013 | 28 Sep 2026 | **No Asana data import.** Asana approvals are used only as a flow reference. Removed: Asana import module and history migration | Owner (answer 7) |
| D-014 | 28 Sep 2026 | **Build team = the owner + Claude**, coding in this repository phase by phase | Owner (answer 8) |
| D-015 | 28 Sep 2026 | **Three mandatory living files:** DEVELOPMENT-MEMORY.md, PLAN-CHECKLIST.md and FLOWS.md. Never omit them; update them every session; cover every point | Owner (answer 8) |
| D-016 | 28 Sep 2026 | **No backend visibility for anyone but the Super Admin:** separate admin build, server-side permission checks, no public API docs, generic errors, no provider names shown, masked secrets, all provider accounts owned by itadmin@ | Owner |
| D-017 | 28 Sep 2026 | **One state model:** Draft → Submitted → Pending → Approved / Rejected / Changes Required → Resubmitted, plus **On Hold** (paused, stays open) and Reopened. One permanent Approval ID with versions | Base plan §12–15 + audit |
| D-018 | 28 Sep 2026 | **No shared accounts.** The MD gets an individual login; an assistant acts through delegation, recorded as "on behalf of" | Audit finding |
| D-019 | 28 Sep 2026 | **Approvals are never granted from inside a WhatsApp chat.** Messages carry a secure link, and the user signs in before acting. Off-system approvals are recorded with evidence | Audit + security |
| D-020 | 28 Sep 2026 | **Approver authorisation is checked on the server against the signed-in user**, never the assignee | Base plan §16 + audit defect |
| D-021 | 28 Sep 2026 | **First-release templates:** MD, ED, Finance, Valarmadhi, SCM (single approver). These cover ~94% of historical volume | Audit volumes |
| D-022 | 28 Sep 2026 | **Design system:** ARS asset pack tokens (primary #005398, accent red #ED1C25, Inter), 34-icon set, login screens reused | Existing assets |
| D-023 | 28 Sep 2026 | **Architecture:** modular monolith with two front-ends (user app, Admin Portal), one API, and background workers. The exact stack is fixed once Q-001 is answered | Base plan §38 |
| D-024 | 28 Sep 2026 | **The Admin Portal is one dedicated portal for the IT team, at `admin.arssteels.net`, used to create the predefined ("defined") approvals.** `itadmin@arssteels.co.in` is the Super Admin with every right. Other IT-team members get Admin Portal access only through roles the Super Admin assigns (see Q-011). *Refines D-003.* | Owner (answers 4, 5) |
| D-025 | 28 Sep 2026 | **OTP for User ID + password sign-in is sent on WhatsApp only** (no SMS, no email OTP). *Supersedes the channel part of D-006.* Google sign-in still needs no OTP | Owner (answer 3) |
| D-026 | 28 Sep 2026 | **Every user can create custom approvals whenever needed.** Built-in safety rules always apply: approvers must be active users, no self-approval, and the graph is validated before submission (see Q-012) | Owner (answer 4) |
| D-027 | 28 Sep 2026 | **Hosting: GoDaddy cPanel with Node.js available.** Target GoDaddy's "Node.JS Hosting" product (Node 22, deploy from GitHub or zip), as documented for the Power BI website, with cPanel MySQL and cPanel Cron Jobs. *Resolves Q-001.* | Owner (answer 1) + `D:\PBI New\Completed Documentation\Deployment\GODADDY_DEPLOYMENT_GUIDE.md` |
| D-028 | 28 Sep 2026 | **Stack mirrors the Power BI website (proven on the same GoDaddy account):** Next.js 15 (App Router) + React 19 + TypeScript + Tailwind 3 + zod; MySQL 8 via `mysql2` with SQL migration files; Firebase Auth for Google sign-in (server-verified ID token); custom HMAC-signed session cookie; AES-256-GCM encrypted settings table for provider credentials; Vitest + Playwright. **Two Next.js apps in one repo** (npm workspaces): `apps/web` (users) and `apps/admin` (Admin Portal), sharing `packages/core` (engine, data access, notifications), so admin code is never shipped to users (D-016). Background work (SLA timers, escalation, notification retries) runs through a DB-backed job table triggered by cPanel cron | Derived from D-027 + PBI reference |
| D-029 | 28 Sep 2026 | **CEOITBox integration follows the Power BI website's adapter:** API-key auth (`x-api-key`), `POST {baseUrl}/api/v1/whatsapp/sendMessage` with `{templateName, language, to, templateVariables}` → `{id, waMessageId}`; base URL `https://official.ceoitbox.com`; ARS's single connected number (+91 7305904440, Phone ID 1057554220785929). Only Meta-approved templates are sent. The OTP template uses Meta's Authentication category. Credentials are entered in the Admin Portal's encrypted settings and are **never** put in the repo or env files. *Resolves Q-002.* | `D:\PBI New\Completed Documentation\WhatsApp\CEOITBOX_ADAPTER.md`, `Authentication\WHATSAPP_OTP.md` |
| D-030 | 28 Sep 2026 | **Email sender: `itadmin@arssteels.co.in`** (transport: see Q-005) | Owner (answer 5) |
| D-031 | 28 Sep 2026 | **Admin Portal address: `admin.arssteels.net`** | Owner (answer 5) |
| D-032 | 28 Sep 2026 | **No step-up OTP for sensitive admin actions.** *Closes Q-008.* | Owner (answer 6) |
| D-034 | 28 Sep 2026 | **One app only (like the Power BI app), at one address: `approvals.arssteels.net`.** Areas are separated by role-based routes: `/users` (everyone: requests, custom approvals, my approvals), `/admin` (IT team: predefined approvals, forms, workflows, DoA, users, roles), `/superadmin` (Super Admin only: providers, security, integrations, system health, audit export, break-glass). *Supersedes the two-app part of D-028 and the address in D-031 (admin.arssteels.net dropped).* Protection is enforced on the server in middleware and in every route handler and server action. Admin pages are built mainly as server components. No secrets, config or provider data are ever sent to the browser (keeps D-016) | Owner |
| D-035 | 28 Sep 2026 | **GitHub repository `HarishDevs/ARS-Approval-System` (private, branch `main`) holds all project activity.** Repo root = `D:\Omniroute\ARS Approval System`. The living files, reference docs and code all live there. Commit and push after every work session. Never commit secrets (`.env*` is git-ignored) | Owner |
| D-036 | 28 Sep 2026 | **CEOITBox: same WhatsApp number and API key as the Power BI website.** The daily limit (Tier 100K) is shared. OTP reuses the Power BI site's approved Authentication template (`wa_login_otp_v1`; confirm). **The owner will provide the notification templates.** *Resolves Q-002.* | Owner (answer 2) |
| D-037 | 28 Sep 2026 | **Email is sent through Resend** (HTTP API, as on the Power BI website) from `itadmin@arssteels.co.in`. The domain must be verified in Resend. *Resolves Q-005.* | Owner (answer 3) |
| D-038 | 28 Sep 2026 | **Reuse the Power BI website's Firebase project** (`power-bi-dashboard-3b29f`) for Google sign-in. Add `approvals.arssteels.net` (and localhost for development) to its authorised domains. *Resolves Q-007.* | Owner (answer 4) |
| D-039 | 28 Sep 2026 | **IT-team admins (`/admin`) create predefined approvals. Provider keys, security settings, integrations, system health and audit export stay Super Admin only (`/superadmin`).** *Resolves Q-011.* | Owner (answer 5) |
| D-040 | 28 Sep 2026 | **Custom approvals: anyone can pick anyone as an approver**, including ED and MD, with no exclusion list. The engine's safety rules still apply: approvers must be active users, and nobody approves their own request. *Resolves Q-012.* | Owner (answer 6) |
| D-041 | 28 Sep 2026 | **Approval authority (DoA owner) = `itadmin@arssteels.co.in`**, who also holds the admin login and the break-glass account. *Resolves Q-009 and the owner part of Q-004.* Risk accepted: keep the break-glass recovery credentials sealed offline, separate from the daily login | Owner (answer 7) |
| D-033 | 28 Sep 2026 | **Staff data is provided by the admin. Roles are assigned per user, by the admin only. Users are added or made inactive in the Admin Portal** (never hard-deleted, so history and audit stay intact). *Resolves Q-010.* | Owner (answer 7) |

## 4. Open questions (must be answered before the phase shown)

| ID | Question | Blocks | Status |
|---|---|---|---|
| Q-001 | GoDaddy plan type | Phase 0 stack choice | **Resolved 28 Sep → D-027/D-028.** Still to check on first deploy: the Node.js Hosting product vs cPanel "Setup Node.js App", whether its MySQL is the existing cPanel one (17 of 25 DB slots used), whether the disk is persistent (attachments), and cron availability |
| Q-002 | CEOITBox API details and sharing | Phase 0 / Phase 1 | **Resolved 28 Sep → D-029, D-036** (same number and key; the owner provides the notification templates) |
| Q-003 | OTP channels | Phase 1 OTP | **Resolved 28 Sep → D-025 (WhatsApp only)** |
| Q-004 | **DoA matrix** (explained in PLAN-CHECKLIST §0.3) | Phase 3 amount routing | **Owner resolved → D-041 (itadmin@).** Open: the actual amount bands and approvers per request type, to be entered by itadmin@ before Phase 3 |
| Q-005 | Email sender | Phase 1 notifications | **Resolved 28 Sep → D-030, D-037 (Resend from itadmin@)** |
| Q-006 | App addresses | Phase 0 | **Resolved 28 Sep → D-034 (one address: approvals.arssteels.net; role routes /users, /admin, /superadmin)** |
| Q-007 | Google sign-in project | Phase 1 | **Resolved 28 Sep → D-038 (reuse power-bi-dashboard-3b29f)** |
| Q-008 | Admin Portal step-up | Phase 1 | **Closed 28 Sep → D-032 (not needed)** |
| Q-009 | Break-glass holder | Phase 1 go-live | **Resolved 28 Sep → D-041 (itadmin@)** |
| Q-010 | Staff master data | Phase 1 | **Resolved 28 Sep → D-033 (admin provides; roles per user by admin; add/inactivate in the Admin Portal)** |
| Q-011 | IT-team access to the Admin Portal | Phase 1 roles | **Resolved 28 Sep → D-039** |
| Q-012 | Custom approval limits | Phase 5 | **Resolved 28 Sep → D-040 (anyone can pick anyone; the no-self-approval safety rule stays)** |
| Q-013 | **Notification templates:** the owner will send the WhatsApp (and email) wording for the events N-06 to N-20; the Meta template names come after approval | Phase 1 notifications | Open, waiting on the owner |
| Q-014 | **OTP template:** confirm the Power BI site's approved `wa_login_otp_v1` Authentication template is reused for this app's login OTP | Phase 1 | Open (assumed yes) |

## 5. Work log (newest first)

### 28 Sep 2026 (third round)
- Owner answered: one app only at approvals.arssteels.net with /users, /admin, /superadmin; the GitHub repo HarishDevs/ARS-Approval-System for all activity; the same CEOITBox number and API (the owner provides notification templates); Resend; reuse the Firebase project; IT-team admin split confirmed; anyone can pick anyone; itadmin@ is the approval authority and the admin/break-glass login → D-034 to D-041.
- Initialised git in `D:\Omniroute\ARS Approval System`, added `.gitignore`, `README.md` and a repo-level `CLAUDE.md`, committed the planning files and pushed to `main`.

### 28 Sep 2026 (later)
- Owner answered the second round: GoDaddy cPanel + Node.js; CEOITBox as in `D:\PBI New`; OTP on WhatsApp only; the Admin Portal is for the IT team to create predefined approvals while everyone can create custom approvals; sender itadmin@arssteels.co.in; Admin Portal at admin.arssteels.net; no step-up OTP; the admin provides staff data, sets roles per user, and adds or inactivates users → D-024 to D-033.
- Read the Power BI website project (`D:\PBI New`, read-only; `.env.local` deliberately not opened because it holds live secrets). Took its proven GoDaddy deployment path, stack, CEOITBox adapter contract, WhatsApp OTP design, Google/Firebase login and encrypted settings pattern as the reference → D-027 to D-029. See §9.

### 28 Sep 2026
- Owner set the **north star: multi-level approvals in any custom manner** → D-000. Added it to all three living files, `D:\Omniroute\CLAUDE.md` and Claude memory.
- Plan page republished as **v2** (same URL): decisions, DoA explanation, GoDaddy stack options, CEOITBox, no import, engine supports every multi-level pattern from Phase 2. Copy saved as `reference/platform-plan-v2.html`.
- Rewrote `reference/asana-rules-notes.md` (the temporary copy had been cleared) and restored `reference/asana-approval-audit.html` from the published page.
- Owner answered the planning decisions → D-003 to D-015 recorded.
- Created the three living files and `reference/`. Copied the audit page, plan page, rule notes and earlier write-up into `reference/`.
- Published build plan v1 (Admin Portal / Control Center, sign-in, notifications, hidden backend, architecture, phases, risks, decisions).
- Checked the connected Supabase account: only one unrelated project (finance/subscription app). **Not to be used** for ARS.
- Gave an overview of the available planning inputs.

### 25 Sep 2026
- Read all Asana automation rules (868) through Customize → Automations, read-only. Found rule defects (MD Rejected → Approved Section; MD copies mark any completion Approved; assignee-based approval checks; Plant HOD check; Branding impossible routing; ED/HR copies watching an unused dropdown; Finance Internal L2 gap; routing gaps for CA/NBD). Updated the audit page to v2.

### 24 Sep 2026
- Audited every Asana approval project read-only (104 projects, 7 tiers, 11 internal): structure, fields, sections, task histories, flows, gaps. Published the audit page v1.

## 6. Feature catalogue (status: Planned / In progress / Done)

| Area | Feature | Status | Checklist ref |
|---|---|---|---|
| Access | Google sign-in (no OTP) | Planned | P1-AUTH |
| Access | User ID + password + OTP (WhatsApp only, D-025) | Planned | P1-AUTH |
| Admin Portal | IT-team access with roles assigned by the Super Admin (D-024, Q-011) | Planned | P1-ADM |
| Access | Per-user sign-in method; admin-created users only; any email | Planned | P1-USR |
| Access | New-login detection + alert + "This wasn't me" | Planned | P1-AUTH |
| Access | Lockout, sessions, trusted devices, forgot password | Planned | P1-AUTH |
| Admin Portal | Separate app; Super Admin only; audited changes | Planned | P1-ADM |
| Admin Portal | Organisation, users, hierarchy, roles, data scopes | Planned | P1-ADM |
| Admin Portal | Security, providers, notification templates, audit viewer | Planned | P1-ADM |
| Admin Portal | Approval Builder, form builder, workflow designer, validator, test mode | Planned | P3 |
| Admin Portal | DoA matrix, SLA/escalation, holiday calendar | Planned | P3/P4 |
| Admin Portal | Data rights: view, export, correct (versioned), archive, retention | Planned | P1-ADM / P7 |
| Messaging | Notification hub: email + WhatsApp (CEOITBox) + in-app, delivery log | Planned | P1-NOT |
| Engine | Requests, permanent ID, state machine, server-side approver check | Planned | P2 |
| Engine | Sequential / Parallel / Any-One / Any-N-of-M / Conditional / Hybrid | Planned | P2/P3 |
| Engine | Approver sources (user, role, HOD, manager, group, form field…) | Planned | P3 |
| Engine | Resubmission with versions, Reopen, On Hold, Changes Required | Planned | P4 |
| Engine | Delegation ("on behalf of"), SLA, reminders, escalation | Planned | P4 |
| Engine | Custom approvals open to every user, whenever needed (D-026) | Planned | P5 |
| Engine | Documents (versioned), comments, work assignment after approval | Planned | P6 |
| Portals | Employee, Approver, Management portals | Planned | P2/P7 |
| Insight | Analytics, SLA dashboards, Power BI views | Planned | P7 |
| Connect | ERP / Salesforce / webhooks, mobile web app | Planned | P8 |
| Security | Break-glass account; append-only audit log | Planned | P1-SEC |

## 7. Key facts from the Asana audit (reference for templates)

- **Volume:** about 4,800 requests since Dec 2025. MD 1,655 · ED 1,347 · Finance 849 · Valarmadhi 345 · SCM 316 · HR 62 · Admin 69 · Recruitment 67 · Finance Internal 69 · IT 11 · Price Realisation 17 · Sumit 5.
- **Approvers:**
  - MD: "MD" account, used by an assistant.
  - ED: Rajesh Bhatia.
  - Finance: Prabu. Valarmadhi tier: valarmadhi ARS Steel.
  - SCM: madhanagopal.
  - Sumit Bhatia (NBD).
  - HR / Admin: Srinivasa Raghavan K → Subashini. Recruitment: Gokulakrishnan Raghavan → Subashini.
  - Finance Internal: level 1 by Nature (Anbu, Thulasiram D, rishika.l, Anupriya Devaraj, Srivani M, christypricilla) → level 2 (Naveen Kumar G / Anbu) → HOD Valarmadhi.
  - IT: Babulal M.
  - Price Realisation: Ragu, G Chandra Mouli, Gopi K, Prabu → Rajesh Bhatia → MD.
- **Request fields:** Department, Nature, Priority, Amount, Subject/Party, Cheque/PO/Invoice No, Approval Information, Required/Due date, Mode of Approval, attachments. Value Category bands today: 0 / ≤1L / 1–3L / 3–5L / >5L.
- **Departments in use:** Branding, Purchase & SCM, Sales, MDO, EDO, HR & Admin, IT, Field Marketing & Technical, ASP, Steel Plant, Finance & Accounts, NBD, Corporate Affairs, Projects, Training & Development. The 27-value list needs cleaning.
- **Defects the new design must not repeat:** listed in PLAN-CHECKLIST §Guardrails (G-01 to G-16).

## 8. Environment and credentials register (names only, never secrets)

| Item | Owner account | Where stored | Status |
|---|---|---|---|
| GoDaddy hosting (Node.JS Hosting, Deluxe; cPanel MySQL; Cron Jobs) | itadmin@arssteels.co.in | GoDaddy | Existing (Power BI site uses it); new app to be created in Phase 0 |
| CEOITBox WhatsApp (1 number, Phone ID 1057554220785929) | itadmin@arssteels.co.in | CEOITBox, API key entered only in Admin Portal encrypted settings | Existing; sharing to confirm (Q-002) |
| Firebase project `power-bi-dashboard-3b29f` (Google sign-in) | itadmin@arssteels.co.in | Firebase console | Reused (D-038); add authorised domain approvals.arssteels.net |
| Resend (email from itadmin@arssteels.co.in) | itadmin@arssteels.co.in | Resend dashboard; API key in GoDaddy env vars only | Reused (D-037); domain verification to check |
| Domain: approvals.arssteels.net | itadmin@arssteels.co.in | GoDaddy DNS (assumed) | To bind to the GoDaddy Node.js app (D-034) |
| GitHub repo HarishDevs/ARS-Approval-System | HarishDevs (push via the proursolutions-source account) | GitHub | Active (D-035) |
| `SESSION_SECRET`, `ENCRYPTION_KEY` | – | GoDaddy app environment variables only; `ENCRYPTION_KEY` also backed up in a password manager | Generate fresh in Phase 0; never reuse the Power BI site's values |
| Break-glass admin | Sealed | Offline | Pending Q-009 |

## 9. Reference project: ARS Power BI website (`D:\PBI New`)

Built by the same owner and deployed on the same GoDaddy account. Used as the **pattern library**, read-only. Copy patterns, not secrets.

| Topic | Where in `D:\PBI New` | What we reuse |
|---|---|---|
| GoDaddy deployment | `Completed Documentation\Deployment\GODADDY_DEPLOYMENT_GUIDE.md` | Node.JS Hosting (Node 22, GitHub/zip deploy, env-var screen), MySQL paths A/B, migrate/seed scripts, post-deploy checklist, VPS fallback |
| CEOITBox adapter | `ars-steels-bi\server\integrations\whatsapp\ceoitbox\client.ts`, `Completed Documentation\WhatsApp\CEOITBOX_ADAPTER.md` | Request contract, `x-api-key` auth, error codes, "never send an unapproved template", delivery log that never rolls back the business action |
| WhatsApp OTP | `ars-steels-bi\server\auth\whatsapp-otp.ts`, `Authentication\WHATSAPP_OTP.md` | OTP request/verify with an anti-enumeration response, cooldown and attempt limits computed in SQL, Authentication-category template. Known bug to avoid: `login_logs.browser` must be ≥ VARCHAR(500) |
| Google login | `server\auth\google-login.ts`, `Authentication\GOOGLE_LOGIN.md` | Firebase ID token verified on the server; link `firebase_uid` on first login only to pre-created accounts; inactive → 403 |
| Sessions | `lib\session\session.ts` | HMAC-signed cookie (httpOnly, sameSite) |
| Encrypted settings | `features\settings\definitions.ts`, `server\settings\*-config.ts`, `Authorization\SETTINGS.md` | AES-256-GCM settings table for provider credentials, edited in the admin UI |
| Notifications / outbox | `server\notifications\*`, `WhatsApp\NOTIFICATIONS.md`, `OUTBOX_RETRY_AND_WEBHOOKS.md` | Dispatch + delivery table; add the retry outbox that the Power BI site lacked |
| Known limits carried over | `KNOWN_ISSUES.md`, guide §10 | No built-in scheduler (use cPanel cron); local-disk uploads may not persist (check, or use object storage); no key rotation |
| Project documentation discipline | `Completed Documentation\*` (DECISION_LOG, CHANGELOG, KNOWN_ISSUES, PROJECT_STATUS) | Same idea as our three living files |
