# 18. Documentation audit (OPS)

| | |
|---|---|
| Target | ARS-CMS v1.39.0, commit `0473f2560398844f875a3bec49206e13078d06d7` |
| Date | 31 Oct 2026 |
| Evidence | `audit/TEST_EVIDENCE/OPS/docs-inventory.txt` (every `docs/**.md`, with the date of its last commit and the highest version it mentions) |

## 1. Method

1. Inventoried `README.md`, the three living files, `docs/` (including `requirements/`, `qa/`, `register/`, `development/` and `ai-module/`) and `application-audit/`. For each file the inventory records its last commit (`git log -1 --format=%cs`) and the highest `v1.x.y` it mentions.
2. Mapped the documents onto the standard set: BRD, SRS, architecture, ERD, API, user guide, admin guide, install, deploy, test, security, backup, maintenance, release notes.
3. Spot-checked accuracy against the code:
   - `docs/USER-GUIDE.md` against `features/shell/users-nav.ts`;
   - `docs/AUTOMATION_INVENTORY_AND_RECOVERY.md` against `server/ops/automation.ts`;
   - `docs/DEPLOYMENT.md` against `package.json`, `database/migrations/` and the tags;
   - `README.md` against `package.json`;
   - `docs/KNOWN_ISSUES.md` against the `app/**/error.tsx` files.

## 2. Inventory (summary)

| Area | Files | Currency |
|---|---|---|
| Living files | `DEVELOPMENT-MEMORY.md` (1602 lines), `PLAN-CHECKLIST.md` (1343), `FLOWS.md` (1564) | **Current**: all three are in commit `0473f25`. D-241 and D-242 are recorded, and FLOWS has F-179 Home and F-180 Inbox. |
| Release notes | `docs/RELEASE-NOTES.md` (916 lines) | **Current**: the v1.39.0 entry is at the top |
| Project overview | `README.md` | **Outdated**: "Status: v1.4.0" (`README.md:9`) |
| Deployment | `docs/DEPLOYMENT.md` (582 lines, Parts A–T) | Last edited for v1.20.0 (25 Oct); the header still says v1.4.0 |
| Backup and DR | `docs/BACKUP_RESTORE_AND_ROLLBACK.md` (v1.6/1.7), `docs/AUTOMATION_INVENTORY_AND_RECOVERY.md` (v1.7) | Procedures valid; the inventory is outdated |
| User and admin guide | `docs/USER-GUIDE.md` (165 lines, titled v1.5.0, last edit 16 Oct) | **Outdated** (see §3) |
| Requirements | `docs/requirements/UNIFIED_MASTER_PROMPT.md` (10 Oct), `docs/FEATURE_ACCEPTANCE_CRITERIA.md` (v1.6.0), `reference/platform-plan-v1..v3.html` | A requirements prompt and acceptance criteria, not a formal BRD or SRS |
| Architecture and database | `application-audit/01_APPLICATION_ARCHITECTURE.md`, `05_DATABASE_AUDIT.md` (v1.8.0, 16 Oct); `docs/ADMIN_CONFIGURATION_STUDIO_ARCHITECTURE.md` (31 Oct); `docs/ai-module/architecture.md`; `docs/CHATBOT_ARCHITECTURE_AUDIT.md` | Partial and per-module; the core architecture is frozen at v1.8.0. **No ERD** for the 48 migrations. |
| API | `application-audit/04_WORKFLOW_AND_API_AUDIT.md` (v1.8.0; 32 `/api/` mentions) | There are 39 `app/api/**/route.ts` files, and no API reference with request and response shapes |
| Tests and QA | `docs/TEST_STRATEGY.md` (v1.4.0), `docs/qa/QA-TEST-SUITE.md` (8 Oct), `E2E-QA-REPORT.md` (v1.4.0), `LOADER-QA-REPORT.md`, `docs/ANALYTICS_TEST_MATRIX.md`, `docs/UX_LAWS_TEST_CASES.md`, `docs/ADMIN_CONFIGURATION_STUDIO_TEST_REPORT.md` (v1.39.0) | Mixed: the newest features have test reports; the strategy is v1.4.0 |
| Security | `docs/SECURITY_AND_AUTHORIZATION_REVIEW.md` (v1.6.0), `docs/CHATBOT_SECURITY_CHECKLIST.md`, `docs/ai-module/security-design.md`, `application-audit/SECURITY_AND_WEBSITE_*` (v1.10–v1.11) | Stops at v1.6 for the core app |
| Status registers | `docs/register/status.json` (1923 entries, last 10 Oct, v1.7), `docs/IMPLEMENTATION_STATUS_REGISTER.md` (v1.7.0), `docs/KNOWN_ISSUES.md` (v1.6.0) | **Outdated** |
| Earlier audit set | `application-audit/` (21 files, 16–17 Oct, v1.8.0 to v1.12.2) | A point-in-time snapshot; not maintained since |
| Feature reports | CHATBOT_*, ANALYTICS_*, UI_STATE_*, UX_LAWS_*, ADMIN_CONFIGURATION_STUDIO_* | Current for their own release |

## 3. Accuracy spot-checks

### 3.1 `docs/USER-GUIDE.md` against the current sidebar (`features/shell/users-nav.ts:12-50`)

The current sidebar is:
- **Home** and **Inbox**;
- **My Approvals:** New request, My pending requests, My approved requests, Waiting for me, Approved by me, Collaborating, Request templates;
- **Tasks:** New task, My tasks, Assigned by me, Team tasks, Projects, Task search, Periodic tasks;
- **Information:** Information inbox, Sent by me, New information;
- AI Assistant, Calendar, Analytics.

There is **no Search** entry (D-236) and no Profile entry.

| Guide says | Line | Code says | Result |
|---|---|---|---|
| "### Overview … The first page" | `USER-GUIDE.md:11` | First item is **Home** (`users-nav.ts:13`, D-236) | Wrong |
| "Overview at the top … Search, Calendar and Analytics are below" | `:31` | Home, then **Inbox**; there is no Search (`users-nav.ts:46` comment "no Search in the sidebar") | Wrong |
| "open it again from **Overview → Your drafts**" | `:56` | The page is Home | Wrong |
| "**Custom approval** → title …" | `:60-61` | The sidebar item is **New request** (`/users/custom`) | Wrong label |
| "**Search** in the sidebar finds requests …" | `:77` | Search is in the header bar only (RELEASE-NOTES v1.37.0) | Wrong |
| "**Profile** in the sidebar (or the menu at the top right)" | `:89` | There is no Profile item in the sidebar | Wrong |
| "**Notifications:** everything sent to you" (as a Profile tab) | `:91` | Notifications live in **Inbox** (`/users/inbox`); Profile → Notifications holds the settings (v1.37.0) | Outdated |
| "My requests" (filters section) | `:14`, `:23` | "My pending requests" (`users-nav.ts:18`) | Outdated label |
| The notification bell | `:48-49` | Still present (`features/shell/AppShell.tsx` uses `NotificationBell`) | OK |
| Inbox, Tasks/Projects (v1.30+), Periodic tasks, Request templates, AI Assistant, Classic view, Configuration Studio (Form/Workflow Designer) | — | All in the product | **Missing** from the guide |

Result: the guide is v1.5.0 era and misleads users on at least six navigation instructions → **OPS-12**.

### 3.2 Other spot-checks

| Document | Claim | Code or fact | Result |
|---|---|---|---|
| `README.md:9` | "Status: v1.4.0, live on GoDaddy" | `package.json` 1.39.0 | Outdated → OPS-13 |
| `docs/DEPLOYMENT.md:5` | "App: ARS Approval Platform **v1.4.0**" | 1.39.0 | Outdated → OPS-14 |
| `docs/DEPLOYMENT.md:39` | "The release tags (`v1.0.0`, `v1.0.1`) mark what was released." | 76 tags up to v1.39.0 | Outdated |
| `docs/DEPLOYMENT.md:150-153` | Build log: "15 files on the first start", "Next.js 15.5.25" | 48 migrations; next 15.5.28 | Outdated |
| `docs/DEPLOYMENT.md:14-31` | Contents list ends at Part Q | Parts R, S, T exist (`:527`, `:557`, `:567`) | Incomplete |
| `docs/DEPLOYMENT.md:454` | "Known limits (v1.5.0)" | — | Outdated |
| `docs/AUTOMATION_INVENTORY_AND_RECOVERY.md` inventory | 10 automations; "Gaps: … Scheduled reports, once they are built" (`:56`) | `server/ops/automation.ts` registers **16**: outbox, deliveries, sla, templates, housekeeping, delegations, backup, **reports**, **alerts**, expiry, **rules**, **modules**, **calendar**, **ai**, exports, stuck. Scheduled reports exist (`key: "reports"`, `automation.ts:124`). | Outdated → OPS-15 |
| `docs/KNOWN_ISSUES.md:9` | V6-D02 "single root `error.tsx`", Open | `app/users/error.tsx`, `app/admin/error.tsx` and `app/superadmin/error.tsx` exist | Stale → OPS-16 |
| `docs/BACKUP_RESTORE_AND_ROLLBACK.md` §2 | CI runs the restore drill and `verify-backup` on every build | `ci-integration-v1.38.0.log`: `backup.int.test.ts` and `v170-bc.int.test.ts` pass | Accurate |
| `docs/DEPLOYMENT.md` Part M "Migrations only ever add" | — | No DROP or RENAME; ENUM widenings and backfills exist (`migrations.txt`) | Accurate in substance |
| README "Run it locally" | `npm ci`, `db:up`, `db:migrate`, `db:seed`, `dev` | All scripts exist in `package.json` | Accurate |
| `RELEASE-NOTES.md:36` | v1.34.0 entry | No `v1.34.0` tag (see OPS-05 in 16) | Minor inconsistency |

## 4. Checks

| ID | Check | Method | Status | Evidence |
|---|---|---|---|---|
| DOC-01 | BRD (business requirements) | inventory | PARTIAL | `docs/requirements/UNIFIED_MASTER_PROMPT.md`, `reference/platform-plan-v*.html`, DEVELOPMENT-MEMORY decisions; no consolidated BRD |
| DOC-02 | SRS (functional specification) | inventory | PARTIAL | `docs/FEATURE_ACCEPTANCE_CRITERIA.md` (v1.6.0), `FLOWS.md` (current) |
| DOC-03 | Architecture | inventory and dates | PARTIAL | Core architecture at v1.8.0 (`application-audit/01_*`); module docs current |
| DOC-04 | ERD and data model | inventory | PARTIAL | `application-audit/05_DATABASE_AUDIT.md` (v1.8.0); no ERD; 48 migrations since |
| DOC-05 | API reference | inventory vs `app/api` | PARTIAL | 39 route files; only an audit narrative at v1.8.0 → OPS-17 |
| DOC-06 | User guide current and accurate | §3.1 spot-check | FAIL | 6+ wrong navigation instructions; v1.5.0 → OPS-12 |
| DOC-07 | Admin and Super Admin guide | read USER-GUIDE §3–4 | PARTIAL | v1.5.0 coverage; no Configuration Studio, Task set-up, AI settings or Settings console |
| DOC-08 | Install / local set-up | README vs `package.json` | PASS | `README.md` "Run it locally": the scripts exist |
| DOC-09 | Deployment guide | read and spot-check | PARTIAL | Thorough procedure; stale header, examples and contents → OPS-14 |
| DOC-10 | Test documentation | inventory | PARTIAL | `TEST_STRATEGY.md` v1.4.0; current per-feature test reports |
| DOC-11 | Security documentation | inventory | PARTIAL | `SECURITY_AND_AUTHORIZATION_REVIEW.md` v1.6.0; module security docs |
| DOC-12 | Backup and restore documentation | read | PASS | `BACKUP_RESTORE_AND_ROLLBACK.md`, DEPLOYMENT Part P; claims match code and CI |
| DOC-13 | Maintenance and ops runbook | read | PARTIAL | DEPLOYMENT Part N is good; the automation inventory is outdated |
| DOC-14 | Release notes current | read | PASS | `RELEASE-NOTES.md:3` v1.39.0 (31 Oct 2026) |
| DOC-15 | Living files maintained (CLAUDE.md rule) | `git log -1` for each file; grep D-242 | PASS | All three in `0473f25`; D-242 present in DEVELOPMENT-MEMORY and PLAN-CHECKLIST |
| DOC-16 | README accurate | compare with `package.json` | FAIL | "Status: v1.4.0" → OPS-13 |
| DOC-17 | Known-issues list current | compare with code | FAIL | Frozen at v1.6.0; V6-D02 is stale → OPS-16 |
| DOC-18 | Status register current | inventory | PARTIAL | `docs/register/status.json` last 10 Oct (v1.7) |
| DOC-19 | `application-audit/` current | inventory | PARTIAL | 16–17 Oct, v1.8–v1.12; a snapshot, not maintained → OPS-17 |
| DOC-20 | `docs/qa` current | inventory | PARTIAL | `QA-TEST-SUITE.md` 8 Oct; still run in CI (`playwright.qa.config.ts`) |
| DOC-21 | Automation inventory matches code | `automation.ts` vs doc | FAIL | 16 vs 10 → OPS-15 |

**Totals:** 21 checks: 4 PASS, 13 PARTIAL, 4 FAIL, 0 NOT TESTED, 0 BLOCKED, 0 NOT APPLICABLE.

## 5. Outdated documents (list)

| Document | Last edit / version | Why it is outdated |
|---|---|---|
| `README.md` | v1.4.0 | Status line |
| `docs/USER-GUIDE.md` | 16 Oct / v1.5.0 title | Navigation and modules (§3.1) |
| `docs/DEPLOYMENT.md` | 25 Oct / v1.20.0 | Header, examples, contents, Known limits |
| `docs/AUTOMATION_INVENTORY_AND_RECOVERY.md` | 10 Oct / v1.7.0 | 6 automations missing |
| `docs/KNOWN_ISSUES.md` | 9 Oct / v1.6.0 | Status of issues |
| `docs/TEST_STRATEGY.md` | 9 Oct / v1.4.0 | Missing the Task, AI, Calendar and Studio layers |
| `docs/SECURITY_AND_AUTHORIZATION_REVIEW.md` | 10 Oct / v1.6.0 | Missing AI, Salesforce, Try-as, Calendar OAuth, Work management |
| `docs/IMPLEMENTATION_STATUS_REGISTER.md`, `docs/register/status.json` | 10 Oct / v1.7.0 | Not updated since |
| `docs/APPLICATION_CURRENT_STATE_AUDIT.md`, `application-audit/*` | 9–17 Oct / v1.4–v1.12 | Snapshots |
| `docs/development/*` | 9 Oct / v1.5.0 | Historical |

## 6. Recommendations (not defects)

- **R-DOC-1, mark snapshots as historical.** Add a banner such as "Historical snapshot (v1.x); superseded by …" to `application-audit/*`, `docs/development/*` and the v1.6-era reports. That way nobody follows them as current.
- **R-DOC-2, one maintained architecture page.** Add a single `docs/ARCHITECTURE.md` with a generated ERD (e.g. from `information_schema`) and a generated API route table (from `app/api/**/route.ts`), refreshed each release.
- **R-DOC-3, extend the release checklist.** Add "USER-GUIDE / README / AUTOMATION_INVENTORY touched?" to the release steps, next to the living files.

## 7. Defects

| Defect ID | Module | Feature | Category | Description | Expected | Actual | Severity | Priority | Reproduction | Evidence | Root cause | Recommendation | Status |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| OPS-12 | Documentation | User guide | Documentation accuracy | The user guide describes the v1.5 navigation. | The guide matches the current sidebar and modules. | `docs/USER-GUIDE.md` says "Overview" (`:11`, `:31`, `:56`), "Search in the sidebar" (`:31`, `:77`), "Custom approval" (`:60`), "Profile in the sidebar" (`:89`) and "Notifications" as a Profile tab (`:91`). The sidebar has Home, Inbox, New request and no Search or Profile entry (`features/shell/users-nav.ts:13-48`). Tasks, Projects, AI Assistant and Classic view are missing. | Medium | P2 | Compare `docs/USER-GUIDE.md` with `features/shell/users-nav.ts` | `docs/USER-GUIDE.md`; `features/shell/users-nav.ts` | The guide was not updated after v1.12 (last commit 16 Oct) | Rewrite the navigation and add the Tasks, Inbox, AI and Classic sections; regenerate it per release. | Open |
| OPS-13 | Documentation | README | Documentation accuracy | The README states a stale status and version. | The current version, or no version at all. | `README.md:9` "Status: v1.4.0, live on GoDaddy" while `package.json` is 1.39.0. | Low | P3 | Open `README.md` | `README.md:9` | Not part of the release steps | Point to `docs/RELEASE-NOTES.md` instead of a version number. | Open |
| OPS-14 | Documentation | Deployment guide | Documentation accuracy | The deployment guide's header, examples and contents are stale. | They match the current release. | `docs/DEPLOYMENT.md:5` "v1.4.0"; `:39` tags "v1.0.0, v1.0.1"; `:150-153` "15 files", "Next.js 15.5.25"; contents (`:14-31`) stop at Part Q while Parts R–T exist; `:454` "Known limits (v1.5.0)". | Low | P3 | Read the lines cited | `docs/DEPLOYMENT.md` | Parts are appended per release; the header is never refreshed | Refresh the header and contents; make the example logs version-neutral. | Open |
| OPS-15 | Documentation | Automation inventory | Documentation accuracy | The recovery document leaves out 6 of the 16 background jobs. | Every automation is listed with its retry and recovery. | The doc lists 10. Missing: `reports`, `alerts`, `rules`, `modules`, `calendar`, `ai` (`server/ops/automation.ts:124-207`). `:56` still says scheduled reports are not built. | Low | P3 | Compare the doc table with `AUTOMATIONS` keys | `docs/AUTOMATION_INVENTORY_AND_RECOVERY.md`; `server/ops/automation.ts` | Doc frozen at v1.7.0 | Regenerate the table from `AUTOMATIONS` (the app already renders it at `/superadmin/automation`). | Open |
| OPS-16 | Documentation | Known issues | Documentation accuracy | The known-issues list is frozen at v1.6.0. | Open issues reflect the current release. | `docs/KNOWN_ISSUES.md` is headed "(v1.6.0 work)". V6-D02 (single root `error.tsx`) is still "Open", although per-space `error.tsx` files exist. | Low | P3 | Read `docs/KNOWN_ISSUES.md:9`; `ls app/*/error.tsx` | `docs/KNOWN_ISSUES.md` | Not maintained since 9 Oct | Update or retire it in favour of PLAN-CHECKLIST. | Open |
| OPS-17 | Documentation | Architecture, ERD, API | Documentation completeness | There is no current architecture, ERD or API reference. | A current architecture overview, data model or ERD, and an API route list. | Core architecture and database docs are at v1.8.0 (`application-audit/01_*`, `05_*`, 16 Oct). No ERD covers the 48 migrations. 39 API routes have no reference. | Low | P3 | Inventory (`docs-inventory.txt`) | `application-audit/`; `app/api/**/route.ts` | Docs written as audit snapshots, not maintained references | See R-DOC-2. | Open |
