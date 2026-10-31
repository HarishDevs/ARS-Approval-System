# Audit brief (shared by every auditor)

The target is ARS-CMS **v1.39.0**, commit `0473f2560398844f875a3bec49206e13078d06d7`, in `D:\Omniroute\ARS Approval System`. The audit was started on 31 Oct 2026 at the owner's request ("MASTER PROMPT: Independent end-to-end application audit").

## Rules (mandatory)

1. **No source changes.** Do not modify, fix or refactor any application, test or config file. Write only under `audit/`.
2. **No real secrets.** Never open `.env.local`, `.env*` or `D:\PBI New`, and never print a secret. Record environment variable names only, never values.
3. **No production systems.**
   - Only `http://localhost:3100`. It serves the v1.39.0 production build against the throw-away `ars_approvals_test` MySQL database on 127.0.0.1:3307.
   - Nothing real is sent from it: email and WhatsApp keys are not configured there.
4. **Do not stop, rebuild or restart the server.**
   - Do not run `next build`, `npm run test:e2e`, `npm run test:integration` or Playwright suites. The lead auditor runs those.
   - You may run `npm run lint`, `npx tsc --noEmit -p .`, `npx vitest run` (unit only), `npm audit` and read-only `git` commands.
5. **Test sessions (test-only, like the e2e suite):**

   ```
   node "C:/Users/shrin/AppData/Local/Temp/claude/D--Omniroute/3b8bc7b2-2bdc-4a7f-b241-8dd30ea7ac02/scratchpad/audit-tools/session.mjs" <LOGIN_ID>
   ```

   - The script prints `ars_session=…`. Send it as a `Cookie:` header with curl.
   - Seeded users:

     | Login ID | Name | Roles |
     |---|---|---|
     | `E2E_SUPER` | Sam Super | Super Admin + IT Admin |
     | `E2E_ADMIN` | Elena Admin | IT Admin |
     | `E2E_MGR` | Manoj Manager | User; the requester's manager; approver |
     | `E2E_REQ` | Ravi Requester | User |
     | `E2E_HOD` | Harini HOD | User |
     | `E2E_STAFF` | Sita Staff | User |

   - Read-only SQL against `ars_approvals_test` is allowed for verification. Writes are allowed only through the application (HTTP or server actions), never by hand.
6. **Statuses, exactly:** PASS, FAIL, PARTIAL, NOT TESTED, BLOCKED, NOT APPLICABLE.
   - PASS needs evidence you produced: command output, an HTTP status and a body excerpt, or file:line.
   - Never turn NOT TESTED into PASS. If you only read code, say so ("code review").
7. **Defects** go in a table at the end of your report with these columns: Defect ID, Module, Feature, Category, Description, Expected, Actual, Severity (Critical/High/Medium/Low), Priority (P0–P3), Reproduction, Evidence, Root cause, Recommendation, Status (Open).
   - Use your own ID prefix (given in your task).
   - Separate actual defects from risks and recommendations. Do not inflate severity.
8. **Evidence:** save long outputs under `audit/TEST_EVIDENCE/<your prefix>/` and cite the file.

## Context

- **Stack:** Next.js 15.5 App Router, React 19, TypeScript, MySQL 8 (mysql2, no ORM), zod.
- **Code layout:**
  - server actions in `app/**/actions.ts`;
  - API routes in `app/api/**/route.ts`;
  - guards in `server/authorization/*`;
  - the engine in `server/engine/*`;
  - migrations in `database/migrations/`.
- **Rules:** the project rules are in `CLAUDE.md`, and decisions are in `DEVELOPMENT-MEMORY.md`.
- **Roles:** USER (`/users`), IT_ADMIN (`/admin`), SUPER_ADMIN (`/superadmin`).
- **Sign-in:** Google, or User ID + password + WhatsApp OTP.
- **Earlier audits:** `application-audit/` and `docs/SECURITY_AND_AUTHORIZATION_REVIEW.md`. Verify their claims; don't copy them.
