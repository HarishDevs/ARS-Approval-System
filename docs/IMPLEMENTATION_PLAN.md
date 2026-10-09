# Implementation plan: v1.6.0 (audit, UI modernisation, features, validation)

**Source:** the owner's master prompt "Complete audit, UI modernization, feature development and end-to-end validation", 9 Oct 2026.
**Earlier plans:**
- `docs/development/ENHANCEMENT_IMPLEMENTATION_PLAN.md` (v1.5.0);
- `docs/APPLICATION_CURRENT_STATE_AUDIT.md` (v1.3.5 audit, updated through v1.4.0).

**Companion files:**
- `FEATURE_ACCEPTANCE_CRITERIA.md`, `KNOWN_ISSUES.md`, `TEST_STRATEGY.md`;
- at the end: `IMPLEMENTATION_REPORT.md`, and the go-live checklist at `docs/development/GO_LIVE_CHECKLIST.md` (kept where it is, with no duplicate).

## 1. Baseline (Phase 0, 9 Oct 2026)
| Item | Finding |
|---|---|
| Repository | `D:\Omniroute\ARS Approval System`, branch `main` at `d3ba32d` (tag v1.5.0); working tree clean (no user changes to protect) |
| Stack (verified) | Next.js 15.5.27 (App Router, server components + Server Actions), React 19.1, TypeScript, Tailwind 3 with CSS-variable tokens, MySQL 8 via `mysql2`, Firebase Auth (Google), HMAC session cookie + `user_sessions`, Vitest 5, Playwright 1.63, GitHub Actions |
| Commands | `npm run build` / `lint` / `typecheck` / `test` / `test:integration` / `test:e2e`; `npx playwright test -c playwright.qa.config.ts` and `-c playwright.origin.config.ts`; `npm run db:migrate` (the start command also migrates) |
| Checks at 17:13 UTC | tsc clean; ESLint clean; unit **328/328**; `npm audit --omit=dev` **0**; full audit 7 high, dev-only (`braces`, no fix, D-105) |
| Same code, 16:30–16:50 UTC (v1.5.0 release run) | integration **97/97** ×3; E2E **47/47**; QA **27/27**; origin **1/1**; build OK; CI run 37962093633 **green** |
| Pre-existing failures | none |
| Live | v1.4.0 (owner publishes v1.5.0); `/api/health` jobRunner NEVER (cron secret, owner action) |

## 2. Architecture summary
```
Browser ─ Cloudflare ─ GoDaddy (next start)
  middleware.ts: origin lock, Sec-Fetch-Site, session-cookie gate, CSP nonce, x-request-id
  app/(public|users|admin|superadmin): server components; each layout calls requireArea()
  Server Actions (app/**/actions.ts) → server/* services → lib/db/repositories/* → MySQL
  server/engine: pure graph engine (START, APPROVAL [APPROVE|WORK], NOTIFY, SPLIT, JOIN, CONDITION, END)
  server/approvals/service.ts: lock + state_version, events, audit, outbox → notify() (inbox, Resend, CEOITBox)
  /api/jobs/run (cron): outbox, retries, SLA + due soon, template sync, housekeeping, delegation log, backup, alerts
```
- **Access:** three spaces, checked on the server. Record-level rule: requester, task holder or decider, active delegate, or IT (`loadRequestView`, `isParticipant`, search SQL).
- **Design language:**
  - tokens are CSS variables already (`styles/globals.css`, Tailwind `colors` map to them);
  - component classes `.btn-*`, `.card`, `.badge`, `.data-table`, `.field-*`;
  - shared React UI: `features/ui/{form,Spinner,PendingLink,SafeText,labels}`;
  - `lucide-react` 0.469.0 is installed but unused.

## 3. Functionality inventory (kept as is unless listed in §5)
- **Sign-in:** Google, or password with WhatsApp OTP. Includes idle and absolute session limits, "not me", break-glass.
- **Requests:**
  - raise and custom approvals; drafts; decide, hold, changes, resubmit, withdraw, reopen;
  - handover, out of office, comments and mentions, attachments, PDF, bulk approve, search and saved views.
- **Engine:** sources USER, ROLE, MANAGER(S), HOD, GROUP, FORM_FIELD_USER, DESIGNATION, REQUESTER; rules ALL, ANY_ONE, ANY_N; conditions; DoA; blocked-step recovery.
- **Admin:**
  - users, organisation, groups, the workflow builder, form fields, DoA, calendar, import/export;
  - insights, four dashboards, workload, test mode with comparison against the live version.
- **Super Admin:** providers, security, templates, deliveries, audit and sign-in logs, requests (soft delete), demo, backups, alerts.

## 4. Verified defects (Phase 0)
The audit register (B-01, S-01..S-07, R-04..R-10, P-01..P-09, D-01..D-04) is closed or decided, with tests (v1.3.6–v1.4.0). The v1.5.0 testing defects were fixed in v1.5.0.

Re-checked in the repository today:

| ID | Severity | Defect (verified) | Evidence |
|---|---|---|---|
| V6-D01 | P3 | Most pages show a blank screen while loading: 3 of 48 routes have `loading.tsx` | `find app -name loading.tsx` |
| V6-D02 | P3 | Only one root `error.tsx`, so a failing page loses its whole space shell | `app/error.tsx` only |
| V6-D03 | P3 | `MarkAllReadButton` does a full page refresh and has no undo or optimistic update | `features/shell/MarkAllReadButton.tsx` |
| V6-D04 | P3 | Hard-coded hex values bypass the tokens (`disabled:bg-[#53769e]`; auth screens) | `styles/globals.css`, `features/auth/*` |

None is P0, P1 or P2. Any further defect found during the work is added to `KNOWN_ISSUES.md` with its severity.

## 5. Work by phase (dependency order)

**Phase 1: design system**
- **Tokens:** the full token set (surfaces, text, borders, focus, status, elevation, motion, z-index) as CSS variables, with a dark set under `[data-theme=dark]` and `prefers-color-scheme`.
- **Theme preference:** stored server-side in a new `user_settings` table, with a cookie fallback for the first paint. No flash: a nonce'd inline script sets the theme before paint.
- **UI kit in `features/ui/`:**
  - form parts: Button, Field (label, hint, error), Input, Select, Textarea, Checkbox, Switch, RadioGroup, SearchInput, ErrorSummary;
  - display parts: Badge, Avatar, Card, EmptyState, ErrorState, Skeleton, Tabs, Tooltip, Breadcrumbs, Progress, Timeline, DataTable;
  - overlays: Dialog, ConfirmDialog, Drawer, Menu, Toasts, CommandPalette;
  - icons: lucide.

**Phase 2: loading, errors and feedback**
- `loading.tsx` skeletons for every space and its main pages.
- Per-space `error.tsx` (inside the shell), a section error boundary on the request page, and better not-found pages (a 403 looks the same as a 404).
- A toast system with undo (mark as read, saved view removal); busy buttons keep their width.
- A session-expired dialog that keeps the form (drafts already autosave); an offline banner.
- A form error summary linked to each field, with focus moved to the first error.

**Phase 3: responsive and accessible**
- Bottom navigation on phones, with server-side counts.
- A sticky action bar on the request page for people who can act, with a drawer for the comment.
- A skip link and the heading order.
- `@axe-core/playwright` scans in E2E, as a dev dependency (MPL-2.0; no runtime impact).

**Phase 4: workspace**
- Queue filters and sort.
- Keyboard shortcuts J/K/A/C (never while typing; A and C open the confirm step); `?` shows the shortcut list.
- Command palette (Ctrl+K): pages, plus request search through the existing access-checked search.
- Recently viewed (server-side, per account); breadcrumbs.
- Notification read state updates instantly, with rollback on failure.

**Phase 5: request detail**
- The timeline from real events: icons, actors, day groups, relative time with the full time on hover.
- File preview: images and PDFs inline, served with `Content-Disposition: inline` plus a sandboxing CSP, only for allow-listed types, with the same access check.
- Resubmission diff: a new `request_revisions` snapshot at each submit and resubmit. Older requests say "earlier version not recorded".

**Phase 6: engine**
- **Conditional fields** (show and require rules) and **calculated fields**. These use a small expression tree, never `eval`, and are recomputed on the server.
- **Line items:** amounts in paise, integer arithmetic. The total is server-derived and feeds the DoA.
- **Recall** by the requester.
- **Ask for information:** a typed hold that the requester answers.
- **Consultation**, without approval rights.
- **Request-level delegation:** the approver hands their own task to an eligible colleague.
- **Linked and follow-up requests.**
- **Budget checks:** warn only by default; a snapshot is stored.
- **Approval expiry:** optional per type.
- **Approval by reply:** deferred and not built (§7).

**Phase 7: requester productivity**
- **Templates:** personal ones, and "raise again like this".
- **Watchers:** add no access.
- **Calendar:** by a DATE field marked "needed by".
- **Builder:** sections, defaults, mobile and desktop preview.

**Phase 8: admin**
- Workflow version diff and "restore as new draft".
- Approval-type analytics.
- Weekly HOD summary, off by default.
- Bulk reassignment with a preview.
- Audit of every new admin action.

**Phases 9–12:** standardise every route; performance (measure first); a security and concurrency review of the new actions; tests; docs; final review.

## 6. Database and API changes (planned)
- **One additive migration**, `202610110900_v160.sql`, with these tables:
  - `user_settings`
  - `recent_views`
  - `request_revisions`
  - `request_links`
  - `request_watchers`
  - `request_templates`
  - `consultations`
  - `budgets`, `budget_snapshots`
  - `report_runs`
- **New columns** on `approval_requests`:
  - `valid_until`;
  - `needed_by` (derived);
  - `total_paise` (derived).
- **New API routes:**
  - `GET /api/attachments/[id]?inline=1` (same handler; a variant of an existing route);
  - `GET /api/me/counts` (navigation badges).

No existing contract changes. Old requests stay readable.

## 7. Business and security decisions (safe default implemented; owner to confirm)
| ID | Decision | Default built | Why |
|---|---|---|---|
| BD-1 | Recall | Requester only, while In progress. Pending tasks close. Earlier decisions stay in history. It goes to "Changes required" (their own), and resubmitting follows the type's restart rule | Reuses tested resubmit semantics; erases nothing |
| BD-2 | Ask for information | An approver puts the request on hold with type "information". The response time pauses, as on hold, and others wait. The requester's answer resumes it | Reuses hold (SLA pause, audit); there is no new parallel-state model |
| BD-3 | Budget | **Warn only.** A Super Admin setting can switch to "block". Missing budget data shows "no budget loaded", never unlimited. Committed = in progress + approved amounts in the financial year (April–March, IST) | The financial policy isn't known |
| BD-4 | Approval expiry | Off. IT can set validity days per type. It shows an "Expired" badge and reminders; the status stays Approved | No policy given |
| BD-5 | Weekly HOD report | Built, **off** until the Super Admin switches it on | It sends real email |
| BD-6 | Several working calendars | **Deferred.** Which calendar governs SLA (requester's or approver's plant) is a business rule | A decision is needed |
| BD-7 | Approval by email or WhatsApp | **Deferred, not built.** Design notes only | Security approval is needed |
| BD-8 | Comment edit and delete | Unchanged: append-only (D-061) | Existing policy |
| BD-9 | Consultee access | Read-only access to that request from the invitation onward | Needed in order to advise |
| BD-10 | Request-level delegation | Immediate, with no accept step. The colleague must be active, approver-eligible, not the requester and not already on that step | Same checks as handover and D-085 |

## 8. Risks
| Risk | Mitigation |
|---|---|
| UI kit changes break existing E2E selectors | Keep labels and roles; run E2E after each part |
| Engine changes (recall, info hold) | Pure-engine unit tests plus integration for each; existing engine tests must stay green |
| Money maths | Integer paise; server recomputes; client totals are only shown |
| Inline file preview (XSS through a crafted PDF or SVG) | Allow-list (PNG, JPEG, GIF, WebP, PDF; **no SVG or HTML**); `Content-Security-Policy: sandbox` on inline responses; `nosniff` |
| Scope size | Delivered in parts, each committed after targeted tests; anything partial is reported as partial |

## 9. Acceptance
- **Per phase:** see `FEATURE_ACCEPTANCE_CRITERIA.md`.
- **Release gate:**
  - types, lint, unit, integration ×3, build, E2E (with axe), QA, origin and production audit all green;
  - docs updated;
  - pushed to GitHub;
  - no deploy.
