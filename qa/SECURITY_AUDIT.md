# Security audit (v1.43.0 QA pass, 1–2 Nov 2026)

Scope: the whole application at v1.42.1 → v1.43.0 (133 pages, 48 API routes, 173 server
actions; `qa/APPLICATION_ROUTE_INVENTORY.md`), against the test database only. No
production system was touched, no real message was sent, no secret was read or printed.

## How it was checked

| Method | What | Result |
|---|---|---|
| Route inventory (`scripts/qa/route-inventory.mjs`) | Every page, API route and server action and the guard it calls (helper chains followed) | Every non-public page and API has a guard; **0 server actions without an auth check** |
| QA-API-01 (automated) | Every non-public API, every method, signed out | All refused (after QA-TST-02: both health checks are public by design) |
| QA-API-02 | Every `/api/admin/*` and `/api/superadmin/*`, every method, as a plain employee | All refused |
| QA-API-03 | Every state-changing API from another origin (CSRF) | All refused |
| QA-API-04 | An employee on nothing tries ids 1–60 on request progress, PDFs, attachments, files, exports, AI chats, push devices, workflow export and the request page (IDOR, 540 calls) | None answered with data |
| QA-AUTH-01 to 04, QA-SEC-06 | Sign-out ends the server session; deactivation locks out at once; forged or tampered cookies refused; one generic wrong-password answer, lockout after 5, per-User-ID limit; the per-IP limit can't be dodged with `X-Forwarded-For` | Pass |
| QA-AZ-01 to 03 | Own requests only (URL and files); IT can't use Super Admin pages or grant that role; a replayed decision by a non-approver is refused | Pass |
| QA-SEC-01 to 05 (automated) | Stored XSS shown as text; SQL-injection text treated as text; security headers and no stack disclosure; cross-site Server Action refused; a disguised executable named `.pdf` refused | Pass |
| Code review (security and authorization) | Confidential fields, Try as, daily session, FYI access, work-step tasks, mobile pages | 5 defects, all fixed (below) |
| Mobile review | `docs/mobile/SECURITY_REVIEW_REPORT.md` | No exposure |
| `npm audit --omit=dev` (2 Nov 2026) | Known vulnerabilities in the production dependencies | 0 found |

## Defects

| ID | Severity | Finding | Fix | Status |
|---|---|---|---|---|
| QA-SEC-01 | P1 | Files of a confidential field downloadable by collaborators, consultees and FYI recipients; their names showed in the timeline | One rule `canSeeConfidential` for page, download (denials audited) and timeline | Fixed |
| QA-SEC-02 | P2 | A view-only Try-as session could connect Google Calendar and mark notices read | `/api/integrations/*` GETs count as writes; no read receipt in Try as | Fixed |
| QA-SEC-03 | P3 | The all-day session could be claimed by an admin with a browser hint | Never for IT, Super Admin or break-glass | Fixed |
| QA-SEC-04 | P3 | FYI recipients could comment, upload and link | Read-only rule `wasToldByFyi` / `canViewRequest` | Fixed |
| QA-SEC-05 | P3 | A work-step task could be added to a project (title leak to members) | Refused | Fixed |

No P0 was found. Nothing security-related is open.

## Not covered (stated)

- No external penetration test and no TLS or hosting configuration review (GoDaddy, owner's side). Development dependencies were not audited.
- Push delivery and installed-app behaviour on real devices (owner's UAT).
- Production secrets and key rotation (owner-only, PLAN V140-17).
