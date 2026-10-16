# Security and Website Final Report (v1.10.0)

**Date:** 16 Oct 2026
**Release:** v1.10.0 (built on v1.9.2).
**Deployment:** not deployed. The owner publishes on GoDaddy. Everything below was verified locally and in CI only.

Related files:
- `SECURITY_AND_WEBSITE_AUDIT.md`: the starting state of all 39 items.
- `SECURITY_WEBSITE_FIX_TRACKER.md`: one row per item, with files changed and evidence.

## 1. Executive summary

**Outcome by status:**

| Status | Security (19) | Website (20) |
|---|---|---|
| Implemented | 16 | 18 |
| Partially Implemented | 2: SEC-08, SEC-15 | 0 |
| Not Applicable | 1: SEC-11 | 2: WEB-07, WEB-18 |
| Not Implemented | 0 | 0 |
| Blocked | 0 | 0 |

**Highest-risk issues fixed:**
- **AUD-01:** an IT Admin could take over another IT Admin's account through the CSV import.
- **AUD-03:** a removed Super Admin role came back on every restart.
- **G-1, G-2, G-3:** page-access rules could be sidestepped by posting an action from another address.

**Also fixed:**
- signed-in answers are no longer cacheable;
- other sites get no CORS permission;
- plain-HTTP visits are redirected to HTTPS;
- per-person limits on the costly routes;
- the gaps in the central audit log;
- 82 pages get their own browser title;
- favicon fallbacks, clickable logo, dynamic copyright year;
- the phone menu's focus handling;
- mailto links for the IT contact;
- one real overflow defect, on Analytics at 360 px.

**Still open:**
- **SEC-08 (owner):** confirm Cloudflare "Always Use HTTPS" is on, and set `ORIGIN_SECRET` with its Transform Rule.
- **SEC-15:** major upgrades of build tooling, planned as their own project.

## 2. Initial audit findings

See `SECURITY_AND_WEBSITE_AUDIT.md`.

- **High:** SEC-01/AUD-01 and SEC-17/AUD-03.
- **Medium:** SEC-02/G-3, SEC-12 audit gaps, WEB-03 mobile-menu focus.
- **Everything else:** Low or Informational. No Critical findings.

## 3. Security vulnerabilities fixed

| Item | Fix | Evidence |
|---|---|---|
| AUD-01 (SEC-01) | CSV import applies the P-04 contact rule | `tests/import/import-plan.test.ts` |
| AUD-03 (SEC-17) | Seed gives `itadmin` roles only when it has none | `tests/integration/v1100.int.test.ts` |
| G-3 (SEC-02) | Admin actions name their page; Super Admin addresses refuse others | `v1100.int.test.ts`, `route-inventory.test.ts` |
| G-2 (SEC-03) | Delegation for someone else needs Full on Users & roles | code review; `delegations.int` |
| G-1 (SEC-14) | Page-level admin guard on the analytics pages | `v1100-web` SEC-09 |
| SEC-17 audit item | "Sign-in & devices" can't be restricted | `v1100-security.test.ts` |
| SEC-04 | DB-backed per-person limits, 429 with Retry-After | code review |
| SEC-07 | API preflights get no CORS grant | `v1100-security`, `v1100-web` |
| SEC-08 | HTTPS redirect from CF-Visitor (production) | `v1100-security` |
| SEC-10 | Workflow export: generic error with a reference | code review |
| SEC-12 | Lifecycle, toggles and dashboard CSV audited | `v1100.int.test.ts` |
| SEC-18 | `Cache-Control: private, no-store` on all non-static answers | `v1100-security`, `v1100-web` |
| SEC-19 | Webhook rate limit; idempotency documented | `route-inventory` |

## 4. Website defects fixed

| Item | Fix |
|---|---|
| WEB-01, 16, 20 | Five-viewport check across all spaces; the Analytics overflow at 360 px fixed |
| WEB-02 | Navigation link crawl per space |
| WEB-03 | Phone menu: focus in, Tab kept inside, Escape returns focus, list scrolls, 44 px targets |
| WEB-04 | ICO and PNG favicon fallbacks |
| WEB-05 | 82 per-page titles, never showing record content |
| WEB-09 | Copyright year updates itself |
| WEB-10 | Logo intrinsic size |
| WEB-11 | ConfirmDialog instead of `window.confirm` |
| WEB-15 | Phone bar shown in My approvals only |
| WEB-17 | Clickable logo |
| WEB-19 | mailto for the IT contact (Cloudflare-safe) |

## 5. Critical and high-risk issues remaining

**None in the code.**

**Operational:** if `ORIGIN_SECRET` isn't set on GoDaddy, the origin can be reached directly with a forged `CF-Connecting-IP`, which weakens the per-IP limits (audit SEC-06). This is an owner check, tracked as Q-021.

## 6. Database or migration changes

- **No new migration in v1.10.0.**
- **Seed change:** `database/seeds/003_bootstrap_super_admin.sql` now grants roles only to a role-less account. It is safe to run on live: it adds nothing when `itadmin` already holds any role.

## 7. Dependency updates

- **None.**
- **`npm audit`:** 7 high, all in build and lint tooling: the `eslint-config-next` 14 chain, and `tailwindcss` 3 → `chokidar` / `braces` / `micromatch`.
- **`npm audit --omit=dev`:** 0.
- **Why no fix now:** the fixes are major upgrades.
- **Accepted risk:** this code runs only at build time on the developer's machine or in CI. It is never shipped.

## 8. Tests executed and actual results

| Suite | Result |
|---|---|
| Lint, typecheck | Clean |
| Unit (Vitest) | 545 passed (includes v1.11.0's tests; v1.10.0 alone: 524) |
| Integration (MySQL 8) | 224 passed (with v1.11.0); v1.10.0 alone: 206 passed |
| E2E (Playwright, production build) | First full run: 100 passed, 2 failed. Both failures were real (the Analytics overflow at 360 px; the axe target-size rule on the admin user table) and both were fixed. Final full run: **110 passed, 0 failed** (with v1.11.0) |
| QA config / origin config | 27 passed / 1 passed |
| `npm audit --omit=dev` | 0 vulnerabilities |

## 9. Routes and pages reviewed

- **API routes:** all 27 (now 30), inventoried by `tests/security/route-inventory.test.ts`.
- **Server Actions:** every `"use server"` file, checked by the same test.
- **Viewport check:** the main pages of all four spaces.
- **Authorisation, IDOR and SQL:** requests, tasks, information, attachments, files, PDF, exports, admin and Super Admin addresses.

## 10. Remaining blocked items

None blocked.

**Not Applicable, with reasons:**
- **SEC-11:** there are no anonymous forms.
- **WEB-07:** no approved legal pages exist.
- **WEB-18:** no phone number is displayed as text.

## 11. Deployment changes required

- **Deploy:** publish v1.10.0 the usual way. There is no migration; the seed runs at start.
- **Optional:** after deploy, confirm the response headers on a signed-in page: `Cache-Control: private, no-store`.

## 12. Environment and hosting settings for administrators

| Setting | Where | Why |
|---|---|---|
| `ORIGIN_SECRET` + Cloudflare Transform Rule | GoDaddy env, Cloudflare | Origin lock (SEC-06 / Q-021) |
| SSL/TLS "Full (strict)", "Always Use HTTPS" | Cloudflare | SEC-08 |
| `APP_BASE_URL=https://approval.arssteels.net` | GoDaddy env | Links, HTTPS checks, Google Calendar callback |

## 13. Production verification checklist

1. `/api/health` shows the new version.
2. Sign in, open DevTools → Network on any page. Check for:
   - `Cache-Control: private, no-store`;
   - the CSP with `frame-ancestors 'none'`;
   - `Strict-Transport-Security`.
3. `curl -I http://approval.arssteels.net` answers with a redirect to https.
4. As an IT Admin, a CSV import that changes another IT Admin's email shows "Only the Super Admin…".
5. Remove Super Admin from a test account, restart the app, and confirm it stays removed.
6. On a phone: open and close the menu with the keyboard; the logo goes home.

## 14. Recommended next security review

- **Who:** an external penetration test by a specialist. This review was AI-assisted and code-based; it doesn't replace that.
- **Focus areas:**
  - the authentication flows (OTP, Google, set-password);
  - Cloudflare and origin configuration;
  - the new Google Calendar OAuth flow (v1.11.0).
- **When:** after the Tailwind 4 / ESLint upgrade project, and in any case within 6 months.
