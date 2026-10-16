# 00 — Executive summary

**Application:** ARS Approval Platform, v1.8.0 (commit `168216a`), live at `approval.arssteels.net`.
**Audit:** 16 Oct 2026. Evidence-based and read-only: no source, configuration, database or deployed resource was changed.
**Method:** seven parallel domain audits, each cross-checked by the lead auditor, plus local runs of every test suite, five runtime probe tests and one read-only live health check.

## The application in one paragraph

The platform is the company's single web app for approvals. Anyone can raise a request on a predefined approval type, or build a custom approval with any number of levels. Levels can be sequential, parallel, any-one, any-N-of-M, conditional, DoA amount bands, work tasks or FYI steps. Approvers come from people, roles, groups, designations, managers, HODs or form fields. The platform tracks every request through approval, changes, delegation, escalation, expiry and amendment, with notifications by in-app message, email and WhatsApp.

It has three role spaces:
- **My approvals**, for everyone;
- **Admin**, for the IT team to build types, manage users and organisation, view analytics and reports;
- **Super Admin**, for providers, security, page access, automation, audit and backups.

It runs as one Next.js 15 / React 19 / MySQL 8 application on GoDaddy behind Cloudflare.

## Size and scope audited (derived counts)

| Item | Count |
|---|---:|
| Pages / API routes / Server Actions | 74 / 25 / 93 |
| Database tables / migrations | 64 / 30 |
| Functional modules in the feature matrix | 11 |
| Features assessed | 157 |
| Tests run (unit / integration / E2E / QA / origin) | 433 / 188 / 92 / 27 / 1, **all passing** |
| Findings | **P0: 0 · P1: 4 · P2: 25 · P3: 64** (plus UI refinements in `07`) |
| Recommendations | 42 (REC-01 to REC-42), in a 5-phase roadmap |

**Module coverage:** every page, API route, Server Action file, migration and repository was in scope. **Not audited at runtime:**
- production (only `/api/health` was read);
- live provider calls (CEOITBox, Resend, Firebase);
- the loader and perf suites, which are outside CI by decision.

---

## Answers to the ten questions

### 1. What has already been built?
- **The core platform is mature:**
  - the graph approval engine;
  - predefined types with a visual builder, versioning, compare, migrate and import/export;
  - custom approvals with IT-set fields and step options;
  - DoA matrices, budgets, validity and expiry, amendments, delegation and handover;
  - SLA reminders and three-level escalation;
  - collaborators, comments, consultation, attachments, drafts;
  - search and filterable lists, including the v1.8.0 Approved lists;
  - analytics with drill-down, reports, scheduled reports, alerts and background exports;
  - notifications with outbox and retry, WhatsApp template management;
  - page access per person or department, inactivity sign-out;
  - audit log, legal holds, backups, and an automation board.
- **Feature matrix:** 157 features. Only 4 are Not Implemented: Locations master, notification quiet hours, digests, and SMTP (not built by decision).

### 2. What is demonstrably working? (verified facts)
- **124 of 157 features are Implemented — Verified.** Their named tests passed in the 16 Oct 2026 local run, which covered lint, typecheck and every suite listed above (all green). CI was also green on the v1.8.0 commit.
- **Security controls are verified in code and tests:**
  - guards on all 25 API routes and all 93 Server Actions;
  - parameterised SQL with no injectable path found;
  - no raw-HTML sinks;
  - CSP with nonce; CSRF checks; hashed single-use OTPs and links;
  - scrypt passwords; encrypted provider keys;
  - 0 production dependency vulnerabilities.
- **Live:** `/api/health` reports `status ok, version 1.8.0, database ok, jobRunner OK`. The cron blocker still listed in the project's go-live documents is **resolved on live**.

### 3. What is implemented but not yet verified? (code-based assessment)
- **6 features are Code Verified only:** their code paths are consistent but no named test covers them.
  - Admin: designations, approver groups, deleting an approval type, promoting a custom approval.
  - Analytics: the Insights page.
  - Reports: confidential-field redaction in exports.
- **Never exercised in this audit:**
  - real provider delivery (WhatsApp, email, Google sign-in);
  - behaviour on GoDaddy's MySQL and resource limits;
  - production-volume performance (only a 6,300-request local measurement exists).

### 4. What is incomplete or broken?
- **Broken: 5 features. Four of them were reproduced at runtime:**
  - **REQ-10 (resubmit):** raising the amount on resubmit keeps a skipped higher DoA level skipped. ₹5,000 → ₹50,00,000 was approved without the CFO.
  - **WF-06:** one delegate's two votes satisfy an "all must approve" step.
  - **WF-03:** a rejection in one branch ends the request under an "any one" join.
  - **AUTH-15:** the CSV import lets one IT Admin change another IT Admin's email.
- The fifth, **REQ-16 (FYI recipients and escalation managers get links that return 404)**, is confirmed by reading the code.
- **Partially implemented: 18 features.** The main ones:
  - custom approvals can finish "Approved" with no human decision;
  - files are lost when a request closes at submit;
  - approval expiry is not enforced;
  - the audit log misses several lifecycle actions;
  - retention is a dry run only;
  - the delivery log is capped at 200 rows;
  - one report silently truncates at 50,000 rows.

### 5. What critical risks exist?
- **There is no P0** (no confirmed critical exposure).
- **There are four P1 items:**
  - **AUD-02:** approval-limit (DoA) bypass on resubmit. Confirmed at runtime; any requester who is sent back can trigger it.
  - **AUD-01:** an IT Admin can take over another IT Admin's account through the CSV import. Confirmed at runtime; requires an insider.
  - **AUD-03:** the startup seed re-grants Super Admin to `itadmin` on every restart, so revoking it doesn't last. Confirmed.
  - **AUD-04 (potential):** the database time zone is never pinned. If production MySQL isn't on UTC, SLA, overdue flags and date filters shift by hours. A 5-minute check settles it.
- **Notable P2 risks:**
  - page access can be sidestepped through unconfigured or shared posting paths;
  - the origin lock is optional;
  - an IT Admin can impersonate any non-admin approver by design;
  - silent message loss in the outbox;
  - job failures reported as OK;
  - no retention;
  - stale operational documents.

### 6. The ten most important next development items
| # | Item | Why |
|---|---|---|
| 1 | **A1** Re-route on resubmit when amounts or conditions change, and re-run the readiness checks | Restores DoA integrity (P1, runtime-confirmed) |
| 2 | **A2** CSV import enforces the contact-change rule | Closes an account-takeover path (P1, 0.5 day) |
| 3 | **A3** Seed stops re-granting Super Admin | Revocations stick (P1, 0.5 day) |
| 4 | **A0 + A4** Check, then pin, the database time zone | Correct SLA and dates (P1 potential, under a day) |
| 5 | **A5** One person, one vote per step | Separation of duties (runtime-confirmed) |
| 6 | **A6** Honest outbox and job status | No silent message loss; failures alert |
| 7 | **A7** Page access bound to actions; fail closed | Makes v1.8.0 page restrictions trustworthy |
| 8 | **B2** FYI and escalation recipients can open what they're sent | Two north-star features currently 404 for recipients |
| 9 | **B4** Complete audit trail for lifecycle actions and exports | Audit completeness (register M4-09, BC-02) |
| 10 | **B3** Attachments saved with the request | No approved record without its documents |

### 7. Which improvements offer the highest business value?
1. **Routing integrity:** A1, A5, B6, plus the separation-of-duties options in C2. Every ARS approval number must mean the right people approved it.
2. **Working FYI and escalation (B2), then automatic timeout actions (C4).** Approvals stop stalling without IT intervention.
3. **Who may raise each type (C3).** Department-specific templates (Finance Internal, Price Realisation) can roll out safely.
4. **Correct and fast numbers (C1, D4)** before any new analytics.
5. **Reliability that tells the truth (A6, B7, B9, D3):** messages delivered or visibly failed.

### 8. Which tasks should be completed first?
**Phase A (≈10–12 developer-days, no database migrations, so rollback is republishing v1.8.0):** A0 → A1 → A2 + A3 → A4, A5, A6 → A7 → A8, A9, A10.

**The recommended first development task is A1 (resubmit re-routing).** It is the only P1 that any requester can trigger, and it directly breaks the platform's north star: DoA-correct, multi-level approval. It was reproduced at runtime. The fix reuses the existing route simulator and readiness checks, and the engine already has 62 unit tests to lean on. Ship A2 and A3 (half a day each) in the same release as quick wins. Do the A0 owner checks, which need no code, first.

### 9. What dependencies or decisions could block development?
- **Now (Phase A):**
  - DR-09: where resubmit restarts when routing changes;
  - DR-13: the production DB time zone;
  - DR-07: whether to make the origin lock mandatory.
- **Phase B:**
  - DR-01: join rejection semantics;
  - DR-02: whether any request may be approved with no human decision;
  - DR-03: controls on IT changing approvers' contact details;
  - DR-05: what an expired approval means.
- **Phase D:**
  - DR-06: retention durations; purging is irreversible;
  - DR-08: off-site encrypted backups, which may carry an external cost;
  - DR-14: an error tracker, which may carry an external cost.
- **Business inputs still open:**
  - staff, department and request-type masters (P0-31..34);
  - template content (P3-40..43);
  - UAT (GL-01), pilot (GL-07);
  - key rotation before full roll-out (GL-05).

All are listed in `12_DECISION_REGISTER.md`.

### 10. What should explicitly NOT be built yet?
1. Approval by email or WhatsApp reply: excluded by decision D-019.
2. More analytics KPIs and charts before C1 and D4 make numbers correct and fast.
3. Major framework upgrades (Next 16, Tailwind 4, zod 4) during stabilisation.
4. ERP or finance-system integrations: marked not feasible, since there is no data source.
5. Horizontal scaling, object storage or a worker service: the single-node design fits the hosting and volume.
6. Purging business records before the owner signs off retention and legal-hold policy.
7. Custom roles while page access covers the need.

---

## How to read the rest

| Separation | Where |
|---|---|
| **Verified facts** (test runs, runtime probes, live health) | `03` (status column), `10` §1 |
| **Code-based assessments** (with `file:line`) | `04`, `05`, `06`, `07` |
| **Assumptions** | `12` §D |
| **Recommendations** | `08`, `09`, `11` |

| File | Content |
|---|---|
| `01_APPLICATION_ARCHITECTURE.md` | Stack, structure, CI, tests, dependencies, deployment |
| `02_MODULE_AND_PAGE_INVENTORY.md` | All 74 pages by space, with roles, actions, tables and states |
| `03_FEATURE_IMPLEMENTATION_MATRIX.md` | 157 features with status and evidence |
| `04_WORKFLOW_AND_API_AUDIT.md` | Ten workflow traces, defects, 25 APIs, integrations |
| `05_DATABASE_AUDIT.md` | Schema, ER diagram, migrations, indexes, retention |
| `06_SECURITY_AND_RELIABILITY_AUDIT.md` | Consolidated finding register AUD-01..29; controls; P3 list |
| `07_UI_UX_AND_PERFORMANCE_AUDIT.md` | Navigation, forms, accessibility, performance |
| `08_MISSING_FEATURES_AND_RECOMMENDATIONS.md` | REC-01..42, with acceptance criteria |
| `09_PRIORITIZED_DEVELOPMENT_ROADMAP.md` | Phases A–E with order, effort, testing and rollback |
| `10_TESTING_AND_VERIFICATION_PLAN.md` | What was run, gaps, regression tests, release checklist |
| `11_IMPLEMENTATION_TRACKER.md` | The tracker to update every cycle |
| `12_DECISION_REGISTER.md` | Decisions in force, owner decisions needed, assumptions |
