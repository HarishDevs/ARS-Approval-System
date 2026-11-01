# API test results (v1.44.0 QA pass)

48 API routes (`qa/APPLICATION_ROUTE_INVENTORY.md`, generated from the code). All
runs against the local production build and the test database.

## Sweeps (`tests/qa-e2e/api-authz.spec.ts`)

| Test | What | Result |
|---|---|---|
| QA-API-01 | Every non-public route, every method it exports, called signed out | All refused (3xx/4xx). Public by design: sign-in steps, both health checks (D-246), push re-subscribe, webhooks, the job runner (own secret) |
| QA-API-02 | Every `/api/admin/*` and `/api/superadmin/*` route as a plain employee | All refused |
| QA-API-03 | Every state-changing route from another origin | All refused (CSRF) |
| QA-API-04 | ids 1–60 on progress, PDFs, attachments, files, exports, AI chats, push devices, workflow export and the request page, as an employee on nothing | Nothing opened (IDOR) |

Result: 4/4 (after QA-TST-02, the deep health check added to the public list).

## Per-route checks (e2e and QA suites)

| Route | Checked by | Result |
|---|---|---|
| `GET /api/requests/{id}/progress` (road + journey) | v141 road test (shape = page), v144 journey (journey, tasks, FYI, cursor), integration `journey.int` (outsider gets nothing), load test | Pass |
| `GET /api/requests/{id}/summary.pdf` | v1100 SEC-09 (others' PDF 404), QA-API-04 | Pass |
| `GET /api/attachments/{id}`, `/api/files/{id}` | QA-AZ-01, QA-SEC-05 (disguised executable refused), QA-FILE-01 (name and type kept) | Pass. The confidential-file rule (QA-SEC-01) was checked by reading the code path; no test downloads a confidential file yet |
| `GET /api/me/notifications` | v190 bell tests, QA-API-01, load test | Pass |
| `POST /api/jobs/run` | QA-OPS-01 (refused without the secret, runs with it), job-runner e2e | Pass |
| `GET /api/health`, `/api/health/deep` | QA-SMOKE-01, PWA validation (body includes `dbClockOffsetMinutes`) | Pass |
| Sign-in APIs | QA-AUTH-01 to 04, QA-SEC-06 (rate limits, lockout, forged cookies) | Pass |
| Security headers | QA-SEC-03 (no-store, frame-ancestors, no stack in errors), SEC-07/18 (no CORS grant) | Pass |

## Observations

- **QA-PERF-OBS-01:** the progress and notifications APIs answer any failure (even an
  overloaded database) with 404. Kept: it never reveals whether a record exists.
  Monitoring should use `/api/health/deep`, not these routes.
- No API was added for the phone layout or the journey; the progress API's answer
  gained the `journey` field (backwards compatible: `road` and `updatedAt` unchanged).
