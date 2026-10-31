# 15. Code quality audit (OPS)

| | |
|---|---|
| Target | ARS-CMS v1.39.0, commit `0473f2560398844f875a3bec49206e13078d06d7` (`main`, tag `v1.39.0`) |
| Auditor | OPS (code quality, DevOps, DR, documentation, public web) |
| Date | 31 Oct 2026 |
| Evidence | `audit/TEST_EVIDENCE/OPS/` (each file is cited below) |
| Source changes | None. Coverage output went to the git-ignored `coverage/` folder. `git status` shows only `audit/` as untracked. |

## 1. Method

1. Ran the project's own gates on the working copy at the target commit:
   - `npm run lint`, which runs `eslint .`;
   - `npx tsc --noEmit -p .`;
   - `npx vitest run` (unit config only: `vitest.config.ts` excludes `tests/integration`, `tests/e2e` and perf);
   - `npx vitest run --coverage`.
2. Ran Prettier as `npx --no-install prettier --check . --print-width 220`. It used Prettier 3.9.10 from the local npx cache (`--no-install`), so nothing was downloaded. Only counts are reported.
3. Measured the code with `wc -l`, `git grep` and a Node script that scans exports across every tracked `.ts/.tsx/.js/.mjs` file except `reference/`. The script was kept in the scratchpad; its output is in `dead-exports.txt`.
4. Checked dependency hygiene:
   - imports per dependency (`deps-usage.txt`);
   - `npm outdated` (report only);
   - `npm audit` and `npm audit --omit=dev`.
5. Code review of layering (`app/` → `server/` → `lib/db`) and error handling. Counts are in `layering.txt` and `error-handling.txt`.

**TypeScript note:** `tsconfig.json` includes `.next/types/**/*.ts`. The run produced **no output and exit 0**, so stale `.next` types caused no errors and nothing had to be ignored.

## 2. Results in brief

| Gate | Result | Evidence |
|---|---|---|
| ESLint (`eslint .`) | 0 problems, exit 0 | `lint.txt` |
| TypeScript | 0 errors, exit 0 | `tsc.txt` |
| Unit tests | 88 files, **767 passed**, 0 failed (10.1 s) | `vitest.txt` |
| Coverage (v8, unit only) | Statements 64.03% (7057/11020), branches 56.54%, functions 53.81%, lines 65.84%, over the **192 files the unit tests load** | `coverage.txt`, `coverage-summary.json`, `coverage-agg.txt` |
| Prettier (220 cols) | 703 files would be reformatted: 403 `.ts`, 194 `.tsx`, 89 `.md`, 6 `.json`, 4 `.js`, 4 `.html`, 1 `.yml`, 1 `.mjs`, 1 `.css`. The repo has **no Prettier config or dependency**. | `prettier-check-clean.txt` |
| `npm audit --omit=dev` | 0 vulnerabilities | `npm-audit-prod.txt` |
| `npm audit` (with dev) | 14 moderate (minimatch < 11.0.1, dev tooling) | `npm-audit-all.txt` |

## 3. Measurements

### 3.1 Largest files (source: app, server, lib, features, config, types, middleware)

The full list is in `file-sizes.txt`.
- The source is 85,948 lines in total, of which 40,216 are in `.tsx` files.
- 18 files are over 500 lines, and 6 are over 800.

| Lines | File |
|---|---|
| 1332 | `features/admin/WorkflowBuilder.tsx` (largest component) |
| 1103 | `lib/db/repositories/work.repository.ts` |
| 982 | `server/approvals/service.ts` |
| 890 | `server/work/service.ts` |
| 833 | `features/work/TaskCreator.tsx` |
| 806 | `server/engine/engine.ts` |
| 782 | `lib/db/repositories/approvals.repository.ts` |
| 750 | `lib/db/repositories/analytics-center.repository.ts` |
| 737 | `features/work/ProjectWorkspace.tsx` |
| 689 | `features/analytics/CenterScreen.tsx` |

### 3.2 Type escapes and markers (non-test source)

| Measure | Count | Note |
|---|---|---|
| `any` (`: any`, `as any`, `<any>`, `any[]`) | **0 real uses** | The 3 grep hits are prose comments: `app/users/custom/page.tsx:18`, `server/ai/tools.ts:38`, `server/settings/definitions.ts:121`. |
| `as never` | **13 real casts** (19 grep hits, 6 of them in prose) | `app/superadmin/integrations/google-calendar/actions.ts:37-48` (6), `server/ai/tools.ts:192,210,239` (3), `app/users/ai/actions.ts:44`, `app/users/draft-actions.ts:31`, `server/calendar/entries.ts:43`, `server/calendar/sources.ts:56`. The calendar casts are re-validated by zod (`server/calendar/service.ts:68`), so they only silence the compiler. |
| `as unknown as` | 8 | `server/workflows/version-diff.ts` (2), `lib/db/client.ts`, `lib/logging/logger.ts`, 2 other repositories, `server/modules/settings.ts`, `server/approvals/view.ts` |
| `@ts-ignore` / `@ts-expect-error` / `@ts-nocheck` | 0 | |
| `eslint-disable` | 19 | 13 are `@next/next/no-img-element`, each with a reason; 6 are `react-hooks/exhaustive-deps` |
| TODO / FIXME / HACK / XXX | **0** in source, 0 in `tests/` and `scripts/` | |
| `console.*` outside `lib/logging` | 0 real (1 hit is a string inside an error message, `lib/security/encryption.ts:17`) | |
| Tests only | 26 `as never`, 71 `as unknown as`, 0 `any` | acceptable for test doubles |

All of the above is in `type-escapes.txt`.

### 3.3 Duplicated helpers (`duplicates.txt`)

Small FormData and ID parsers are re-declared locally instead of shared:

| Helper | Copies | Locations (examples) |
|---|---|---|
| `id` (string → positive int) | 10 | `app/users/calendar-actions.ts:25`, `report-actions.ts:38`, `template-actions.ts:25`, `work/actions.ts:36`, `server/approvals/queue-filters.ts:43`, `server/modules/task-lists.ts:35`, `server/records/filters.ts:37`, `server/search/filters.ts:24`, `server/work/rules.ts:133`, google-calendar `actions.ts:25` |
| `text` (FormData → trimmed string) | 6 | `app/users/actions.ts:369`, `information/actions.ts:29`, `report-actions.ts:39`, `tasks/actions.ts:29`, `work/actions.ts:37`, google-calendar `actions.ts:22` |
| `num` | 6 | `app/users/actions.ts:43`, `collab-actions.ts:33`, 3 repositories, `server/reports/catalogue.ts:41` |
| `initials` | 2 | `features/ui/Display.tsx:27` (exported) and `features/work/TaskCreator.tsx:51` (a local copy) |

The copies are not identical: for example, the regex limits are `\d{1,10}` in most and `\d{1,12}` in `server/records/filters.ts`. So input rules can drift between forms. This is a maintainability risk, not a defect.

### 3.4 Dead exports (`dead-exports.txt`)

- **Method:** 3,125 named exports were scanned. For each one, the scan looked for any word-boundary reference in another tracked file.
- **Results:**
  - **596** exports are not referenced by any other non-test file.
  - Most of these are types or helpers that are used only inside their own module (the `export` keyword is simply unnecessary).
  - **30** are referenced nowhere at all, not even in their own file beyond the declaration. Examples:
    - UI: `features/ui/Field.tsx` `Input`, `Textarea`, `SearchInput`; `features/ui/Button.tsx` `ButtonLink`; `features/ui/Display.tsx` `Tooltip`; `features/ai/ProposalDecision.tsx` `ProposalDecision`; `features/ai/AiParts.tsx` `NotConnectedYet`.
    - Data: `lib/db/repositories/collab.repository.ts` `markAllRead`; `ai.repository.ts` `listProposalsRequestedBy`; `users.repository.ts` `getOwnProfile`; `gcal.repository.ts` `deleteLink`; `attachments.repository.ts` `countAttachments`.
    - Constants: `server/authorization/policy.ts` `hasRole`; `server/ai/proposals.ts` `EXECUTION_ENABLED`; the 4 `DEFAULT_OTP_*` constants in `lib/security/otp.ts`.
  - **115** are used only by tests. Examples: `searchMyRequests`, `isSessionActive`, `inboxUnread`, `chainAbove`.
- **Spot-check:** `git grep ButtonLink`, `listProposalsRequestedBy` and `markAllRead` each returned only the defining line.

### 3.5 Dependency hygiene (`deps-usage.txt`, `npm-outdated.txt`)

**Unused dependencies (production `dependencies`):**
- **`clsx`** and **`tailwind-merge`**: 0 imports anywhere.
- The other dependencies are used. `server-only` is imported as a side effect in 174 files. `typescript` must stay in `dependencies` for the GoDaddy build (DEPLOYMENT Part N).

**Dev dependencies:** all are used, either directly or as runner peers:
- `jsdom` through a `@vitest-environment` comment;
- `vite`, `autoprefixer`, `postcss` and `@vitest/coverage-v8` through config files.

**Outdated majors (report only, none flagged by the production audit):**

| Package | Current | Latest |
|---|---|---|
| next / eslint-config-next | 15.5.28 | 16.4.3 |
| eslint | 9.39.5 | 10.14.0 |
| tailwindcss | 3.4.17 | 4.3.3 |
| tailwind-merge | 2.6.0 | 3.7.0 |
| typescript | 5.7.3 | 7.0.2 |
| firebase | 11.1.0 | 13.1.0 |
| lucide-react | 0.469.0 | 1.66.0 |
| jsdom | 25.0.1 | 30.1.3 |
| vite | 7.3.7 | 8.3.5 |
| @vitejs/plugin-react | 5.2.0 | 6.1.2 |
| @types/node | 22.20.5 | 26.6.6 |

React 19.1.0 → 19.3.1 is a minor update. Patch updates are available for mysql2, vitest and postcss.

### 3.6 Coverage by area (`coverage-agg.txt`)

Coverage counts only the files that unit tests import (192 of about 700 source files). **No `app/` file is loaded at all.**

| Area | Files measured | Line coverage | Notes |
|---|---|---|---|
| `server/engine` | 6 | 92.9% | Core engine well covered |
| `server/forms`, `server/import`, `server/analytics`, `server/workflows`, `server/notifications` | 2–8 each | 94–99% | |
| `server/approvals` | 16 | 35.0% | `service.ts` 3.6%, `readiness.ts` 3.3% (exercised by integration tests instead) |
| `server/ops` | 3 | 11.8% | `backup.ts` 7.7% (exercised by `tests/integration/backup.int.test.ts`) |
| `lib/db` | 30 | 5.5% | SQL repositories, covered by MySQL integration tests |
| `features/admin` | 5 | 32.9% | `FormFieldsEditor.tsx` 4.7%, `FieldProperties.tsx` 3.0% |

There is no coverage threshold in `vitest.config.ts`, and CI does not collect coverage. Integration and e2e coverage were not measured, because the brief does not allow running them. The unit figure therefore understates real test coverage of `lib/db` and `server/approvals`.

## 4. Separation of concerns and error handling (code review)

The intended layering is **`app/` → `server/` → `lib/db`**. It is a convention and is **not enforced** (no ESLint import rules). Counts are in `layering.txt`.
- 125 of 246 `app/` files import `@/lib/db/...` directly, mostly repositories and `getDbPool`. Some contain raw SQL:
  - `app/users/preferences-actions.ts:52`;
  - `app/users/template-actions.ts:64`;
  - `app/superadmin/pages/actions.ts`.
- 26 files in `server/` and `app/` embed raw SQL outside `lib/db/repositories`. Examples are `server/approvals/service.ts`, `server/ops/backup.ts` and `server/reports/catalogue.ts`.
- 19 `features/` files (server components) import `@/lib/db`.
- 41 `"use client"` components import values from `@/server/...`. The top targets are `server/forms/fields` (8), `server/work/access` (6) and `server/attachments/files` (6). These are pure modules: the server-only ones carry `import "server-only"` (174 files), so the build would fail on a leak. The risk is therefore coupling, not exposure.
- Access checks stay on the server. This was confirmed for the backup action (`app/superadmin/actions.ts:12-18`) and the job route (`app/api/jobs/run/route.ts:15-24`).

Error handling (`error-handling.txt`):
- **Try/catch and logging:** there are 391 try/catch sites. `logError` is used 213 times and writes structured JSON with a request id (`lib/logging/logger.ts:22-28`). Provider bodies are redacted.
- **Error boundaries:** each space has its own boundary (`app/users|admin|superadmin/error.tsx`), plus `app/error.tsx`, `app/global-error.tsx` and a not-found page per space.
- **Server actions:** these return `{ ok, message }` and never throw raw errors to the client. `server/approvals/service.ts:63` defines a `Result<T>` type.
- **Silent fallbacks:** 75 `.catch(() => null)` / `catch {}` sites. Most are `request.json().catch(() => null)` followed by zod `safeParse` (13 API routes), which is correct. Several page-level fallbacks are marked D-233 ("a failure says so"), for example `app/users/(home)/page.tsx:54`.
- **Assessment:** consistent and deliberate. No swallowed errors were found on write paths in the sampled files.

## 5. Checks

| ID | Check | Method | Status | Evidence |
|---|---|---|---|---|
| CQ-01 | Lint passes | `npm run lint` | PASS | `lint.txt`: exit 0, no findings |
| CQ-02 | Typecheck passes | `npx tsc --noEmit -p .` | PASS | `tsc.txt`: exit 0, no output (no stale `.next` type errors to ignore) |
| CQ-03 | Prettier formatting | `npx --no-install prettier --check . --print-width 220` | NOT APPLICABLE | The project has no Prettier config or dependency, and CI does not check formatting. For information only: 703 files differ from Prettier defaults (`prettier-check-clean.txt`). |
| CQ-04 | Unit tests pass | `npx vitest run` | PASS | `vitest.txt`: 88 files, 767 tests passed |
| CQ-05 | Coverage measured and adequate | `npx vitest run --coverage` | PARTIAL | 64.03% statements over the 192 loaded files. `app/` is not measured, `lib/db` is at 5.5%, and there is no threshold (`coverage-agg.txt`). |
| CQ-06 | File and component size | `wc -l` | PARTIAL | 6 files over 800 lines; `WorkflowBuilder.tsx` has 1332 (`file-sizes.txt`) |
| CQ-07 | Duplicated helpers | `git grep` of declarations | PARTIAL | `id` ×10, `text` ×6, `num` ×6, `initials` ×2 (`duplicates.txt`) |
| CQ-08 | No dead exports | export scan script plus grep spot-check | FAIL | 30 exports unreferenced anywhere; 115 used only by tests (`dead-exports.txt`) → OPS-02 |
| CQ-09 | No `any` | grep | PASS | 0 real uses (`type-escapes.txt`) |
| CQ-10 | Few unsafe casts | grep `as never`, `as unknown as` | PARTIAL | 13 real `as never` and 8 `as unknown as` in source (`type-escapes.txt`) |
| CQ-11 | No TS suppressions | grep | PASS | 0 `@ts-ignore`, `@ts-expect-error` or `@ts-nocheck` |
| CQ-12 | No TODO/FIXME debt markers | grep | PASS | 0 in source, tests and scripts |
| CQ-13 | Lint suppressions justified | grep `eslint-disable` | PASS | 19, all `no-img-element` with reasons or `exhaustive-deps` |
| CQ-14 | No unused dependencies | `git grep` of imports per dependency | FAIL | `clsx` and `tailwind-merge`: 0 imports (`deps-usage.txt`) → OPS-01 |
| CQ-15 | Dependencies current | `npm outdated` | PARTIAL | 11 packages a major version behind, report only (`npm-outdated.txt`) |
| CQ-16 | Production dependencies free of known vulnerabilities | `npm audit --omit=dev` | PASS | `npm-audit-prod.txt`: 0 vulnerabilities |
| CQ-17 | Dev dependencies free of known vulnerabilities | `npm audit` | PARTIAL | 14 moderate (minimatch, dev only) (`npm-audit-all.txt`) |
| CQ-18 | Layering `app` → `server` → `lib/db` | `git grep` and code review | PARTIAL | 125 `app/` files import `lib/db`; raw SQL in 26 non-repository files (`layering.txt`) |
| CQ-19 | Error handling consistent | code review and grep | PASS (code review) | `lib/logging/logger.ts:22-28`; error boundaries per space; `error-handling.txt` |
| CQ-20 | No stray console logging | grep | PASS | 0 outside `lib/logging` (`type-escapes.txt`) |

**Totals:** 20 checks: 10 PASS, 7 PARTIAL, 2 FAIL, 1 NOT APPLICABLE, 0 NOT TESTED, 0 BLOCKED.

## 6. Risks and recommendations (not defects)

- **R-CQ-1, split the largest UI files.** `WorkflowBuilder.tsx` (1332 lines) and `TaskCreator.tsx` (833) are hard to review. Split them by panel.
- **R-CQ-2, one shared module for FormData and ID parsing.** For example `lib/http/form.ts`, so the ID limits match everywhere.
- **R-CQ-3, enforce the layering.** Add an ESLint `no-restricted-imports` rule (for example, no `@/lib/db` in `"use client"` files, and SQL only in `lib/db`), or accept and document the current mixed layering.
- **R-CQ-4, define coverage scope and a floor.** Add `coverage.include` so `app/` and unloaded files count, and set a floor. Collect integration-test coverage, since `lib/db` is tested there.
- **R-CQ-5, replace `as never` casts.** Use typed parsers (`z.enum(...).parse`) at the boundary, for example in the google-calendar actions and `server/ai/tools.ts`.
- **R-CQ-6, decide on a formatter.** Either adopt Prettier with a config (a one-time reformat of about 700 files) or record that it is not used.
- **R-CQ-7, plan the major upgrades.** Next 16, Tailwind 4, ESLint 10 and TypeScript 7 each need their own branch with the full suite. None is urgent: the production audit is clean.

## 7. Defects

| Defect ID | Module | Feature | Category | Description | Expected | Actual | Severity | Priority | Reproduction | Evidence | Root cause | Recommendation | Status |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| OPS-01 | Build / dependencies | package.json | Dependency hygiene | Two production dependencies are never imported. | Every declared dependency is used. | `clsx@2.1.1` and `tailwind-merge@2.6.0` have 0 imports in any tracked file. | Low | P3 | `git grep -E "from ['\"](clsx\|tailwind-merge)"` returns nothing | `audit/TEST_EVIDENCE/OPS/deps-usage.txt` | Leftover from the initial scaffold | Remove both from `dependencies` (smaller install, less supply-chain surface). | Open |
| OPS-02 | Code base | Shared UI, repositories, constants | Dead code | Exported functions, components and constants that nothing uses. | Unused exports are removed, or are kept with a reason. | 30 exports have no reference anywhere, e.g. `features/ui/Field.tsx` `Input`/`Textarea`/`SearchInput`, `features/ui/Button.tsx` `ButtonLink`, `lib/db/repositories/collab.repository.ts` `markAllRead`, `ai.repository.ts` `listProposalsRequestedBy`, `server/authorization/policy.ts` `hasRole`. A further 115 are used only by tests. | Low | P3 | Run the export scan (the method in §3.4), or `git grep ButtonLink` | `audit/TEST_EVIDENCE/OPS/dead-exports.txt` | Features replaced over time (v1.30 to v1.39 UI changes) without pruning | Delete the 30. Review the 115 test-only exports (keep any that are intentional test seams). Consider adding `knip` or `ts-prune` to CI. | Open |
