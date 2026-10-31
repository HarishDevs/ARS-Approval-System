# 16. DevOps and deployment audit (OPS)

| | |
|---|---|
| Target | ARS-CMS v1.39.0, commit `0473f2560398844f875a3bec49206e13078d06d7` |
| Repository | `HarishDevs/ARS-Approval-System` (private), branch `main` |
| Date | 31 Oct 2026 |
| Evidence | `audit/TEST_EVIDENCE/OPS/` |

## 1. Method

- **Git (read-only):**
  - `git branch -a`, `git remote -v`, `git tag`, `git describe`, `git rev-list`;
  - a check that every tag from v1.0.0 to v1.39.0 exists (`git.txt`).
- **GitHub (read-only `gh`):**
  - `gh run list --limit 10`, `gh run view <latest>`, plus job lists for the two failed runs and their failing test lines (`gh-runs.txt`, `gh-failed-runs.txt`);
  - e2e job durations from each run's job start and end times (`ci-e2e-durations.txt`);
  - `gh api …/branches/main/protection` and `gh release list` (`gh-repo.txt`).
- **Code and document review:**
  - `.github/workflows/ci.yml`, the `package.json` scripts, `scripts/database/*.js` and `database/migrations/` (`migrations.txt`);
  - `docs/DEPLOYMENT.md`, `config/environment.ts`, `.env.example` (variable names only), `.gitignore`.
- **Secret spot-check:** `git log -p --all -G <pattern>` over the full history for 11 key-like patterns. Only counts and file names were recorded; every value was masked (`secret-scan.txt`). `.env.local` was **not** opened.
- **Production:** exactly one read-only `curl -sI -v https://approval.arssteels.net/login` (`curl-prod-login-headers.txt`). There was no sign-in and no other request. Hosting, DNS and the GoDaddy console are out of reach and are marked BLOCKED.

### Observation O-1 (audit environment, not an application defect)

The audit server at `http://localhost:3100` reports **`"version":"1.38.0"`** from `/api/health` (`curl-health-jobs.txt`).
- `.next/BUILD_ID` is dated 22:25:49 +0530, but the `v1.39.0` commit is dated 22:43:47 +0530.
- `.next/server/app/api/health/route.js` embeds `1.38.0`.

So the running build was compiled **before** the v1.39.0 version bump. It may not contain every v1.39.0 change. The lead auditor should confirm which build is served before relying on HTTP results as v1.39.0 evidence.

## 2. Findings in brief

### Git
- The working copy is on `main`, level with `origin/main` (0 ahead, 0 behind).
- HEAD is tagged `v1.39.0`, and `package.json` says `1.39.0`.
- History has 140 commits and 76 tags.
- **`v1.34.0` has no tag.** Its content shipped inside the `v1.35.0` commit `b764c41`, yet `docs/RELEASE-NOTES.md:36` lists v1.34.0 as a release.
- There are no GitHub Releases.
- Other branches: `feature/ai-module` and `feature/pic-bot` (the latter is checked out in another worktree).

### CI (`ci.yml`)
Runs on every push or pull request to `main`, with `contents: read`. A newer push to the same ref cancels an older run.

| Job | Steps | Timeout |
|---|---|---|
| checks | `npm ci`, `npm audit --omit=dev --audit-level=moderate`, lint, typecheck, unit tests, build | 20 min |
| integration | MySQL 8 service, `npm run test:integration` (includes the backup and restore drill) | 20 min |
| e2e | Playwright e2e, then the QA suite, then the origin-lock suite | 30 min |

Neither formatting nor coverage is checked.

### The last 10 runs on `main` (`gh-runs.txt`)
5 success, 2 failure, 2 cancelled (superseded by a newer push), plus the current run still in progress.
- Both failures were single e2e tests:
  - `tests/e2e/v137-ux-laws.spec.ts:53` (192 passed, 1 failed);
  - `tests/e2e/v131-work-more.spec.ts:56` (190 passed, 1 failed).
- The second one is on the **`v1.36.0` release commit**, which was tagged anyway.
- A follow-up commit, "test: v131 repeating task … (CI race)", shows the flake was being treated as a race.

**The latest run (v1.39.0, 41223507740)** was last checked at about 17:25 UTC:
- checks: success;
- integration: success;
- e2e: **still in progress**, with no conclusion yet.

**E2E job duration:** 23, 27, 29, 27, 29, 26 and 25 minutes over the last seven completed runs, against a **30-minute timeout**. The v1.38.0 run used 29 of the 30 minutes.

**GitHub annotations** on the latest run:
- `actions/checkout@v4` and `actions/setup-node@v4` target the deprecated Node 20 runtime and are being forced onto Node 24;
- `ubuntu-latest` is migrating to Ubuntu 26.

### Build and start
- `npm run build` deletes `.next` first, then runs `next build`. This fixes the GoDaddy reused-`.next` failure noted in DEPLOYMENT Part N.
- `npm start` runs `migrate.js`, then `seed.js`, then `next start`. The seeds are idempotent (`INSERT IGNORE` / `ON DUPLICATE KEY`).
- `engines` requires `node >=20`. CI and DEPLOYMENT D3 use Node 22.

### Migration process (`scripts/database/migrate.js`)
- Each file runs once, in file-name order, and is recorded in `schema_migrations`.
- Progress is saved after every statement (`schema_migration_progress`), so a failed file resumes at the failing statement (`migrate.js:71-127`).
- Blocks marked `-- @optional` (triggers) are skipped on privilege errors, with a warning.
- There are 48 migrations and no down migrations, by design (`docs/BACKUP_RESTORE_AND_ROLLBACK.md` §4).
- A scan of the migrations (`migrations.txt`) found:
  - no `DROP` or `RENAME` statements;
  - 6 `MODIFY COLUMN … ENUM(...)` statements, all of which add values;
  - 5 `UPDATE … SET` backfills.
- The latest migration (`202610311400_workflow_draft_revision.sql`) carries its own rollback line, which is repeated in `docs/ADMIN_CONFIGURATION_STUDIO_DEPLOYMENT.md:15-20`.

### Hosting model (`docs/DEPLOYMENT.md`)
- The app runs on GoDaddy Node.js Hosting (cPanel), deployed by GoDaddy's GitHub integration from `main` and published by hand (**Update Preview**, then **Publish to Live**).
- It sits behind Cloudflare, with an optional origin lock (`ORIGIN_SECRET`).
- Cron (`POST /api/jobs/run` with `x-job-secret`, every 5 minutes) comes from cPanel.
- **Nothing technically links a deploy to a green CI run.** DEPLOYMENT A1 and M1 ask a person to check that GitHub Actions is green.

### Environment variable names
- **`config/environment.ts`** (17): NODE_ENV, APP_BASE_URL, DB_HOST, DB_PORT, DB_NAME, DB_USER, DB_PASSWORD, SESSION_SECRET, ENCRYPTION_KEY, JOB_RUNNER_SECRET, ORIGIN_SECRET, UPLOAD_DIR, BACKUP_DIR, BACKUP_KEEP_DAYS, FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL, FIREBASE_PRIVATE_KEY.
- **Read elsewhere through `process.env`:** LEGACY_HOSTS (`middleware.ts`), AI_CLAUDE_BASE_URL, MIGRATIONS_DIR, and NEXT_PUBLIC_FIREBASE_API_KEY / AUTH_DOMAIN / PROJECT_ID / APP_ID (`next.config.ts`, which has public defaults).
- **`.env.example`** lists every server variable above, including LEGACY_HOSTS and AI_CLAUDE_BASE_URL.

### Secret handling
- **`.gitignore`** excludes `.env`, `.env.*` (except `.env.example`), `*.pem`, `*.key`, `*secret*`, `backups/`, `storage/`, `*.sql.gz` and `*.dump`.
- **Tracked files:** the only env file in the index is `.env.example`. `.env.local` exists on disk but is untracked and was not opened.
- **History scan** (`secret-scan.txt`):
  - 0 hits for AWS, GitHub, Slack, Resend `re_` and `mysql://user:pass@` patterns.
  - The `sk-` / `sk-ant-` hits (17 lines) are all low-entropy test fixtures in `tests/**`, such as `sk-ant-test…`, `sk-ant-e2e…`, `sk-ant-int…` and `sk-pro…`.
  - `-----BEGIN PRIVATE KEY-----` appears only in a test (`tests/qa/deploy-fixes.test.tsx`, body `ABC/DEF`) and in DEPLOYMENT.md's placeholder `MIIE...`.
  - The `.env.example` hit is a placeholder value.
  - One `AIza…` value is the Firebase **web** API key, used as a fallback in `next.config.ts:10`. It is public by design (it ships to every browser). Mentioned for completeness.
- **No real secret was found.**
- **One operational note:** DEPLOYMENT A4 says a CEOITBox test key was once "pasted in chat on 8 Oct" and asks for it to be switched off. Whether that happened cannot be verified (BLOCKED).

### Production (one HEAD request)
- `HTTP/1.1 200 OK` from `Server: cloudflare`.
- TLS was negotiated and the certificate verified by Windows Schannel (no verification error; curl/Schannel prints no certificate details).
- Security headers present:
  - `strict-transport-security: max-age=31536000; includeSubDomains`;
  - a CSP with a nonce, `frame-ancestors 'none'`, `object-src 'none'`;
  - `x-frame-options: DENY`, `x-content-type-options: nosniff`, `referrer-policy: strict-origin-when-cross-origin`, a `permissions-policy`;
  - `Cache-Control: private, no-store`.
- Two `x-request-id` headers are returned (the platform's and the app's CF-Ray-based one). This is cosmetic.
- `ss-product-id: paas-nodejs-v1` reveals the hosting product. This is informational.

## 3. Checks

| ID | Check | Method | Status | Evidence |
|---|---|---|---|---|
| DO-01 | `main` checked out and in sync with origin; HEAD tagged | `git branch`, `rev-list --left-right`, `describe` | PASS | `git.txt`: `0 0`, `v1.39.0` |
| DO-02 | Remote is `HarishDevs/ARS-Approval-System`, private | `git remote -v`, `gh repo view` | PASS | `git.txt`, `gh-repo.txt` (`"isPrivate":true`) |
| DO-03 | Every release has a tag | tag loop v1.0.0 to v1.39.0 | PARTIAL | `git.txt`: `missing v1.34.0` → OPS-05 |
| DO-04 | `package.json` version matches the tag | read | PASS | `"version": "1.39.0"`, tag `v1.39.0` |
| DO-05 | CI covers lint, typecheck, unit, production audit, build, integration, e2e, QA and origin lock | read `ci.yml`; job list of the latest run | PASS | `.github/workflows/ci.yml`; `gh-runs.txt` |
| DO-06 | The CI run for the audited commit is green | `gh run view 41223507740` | PARTIAL | checks ✓, integration ✓, e2e still in progress when last checked (`gh-runs.txt`). Not concluded. |
| DO-07 | CI on `main` is stable | `gh run list --limit 10`, failed-run logs | PARTIAL | 2 of 10 failed on single e2e tests; one is the `v1.36.0` release commit (`gh-failed-runs.txt`) → OPS-04 |
| DO-08 | The e2e job has headroom under its timeout | job start and end times | FAIL | 23–29 min against a 30 min limit (`ci-e2e-durations.txt`) → OPS-03 |
| DO-09 | CI actions on supported runtimes | run annotations | PARTIAL | Node 20 deprecation warning for `checkout@v4` and `setup-node@v4` (`gh-runs.txt`) → OPS-06 |
| DO-10 | Branch protection on `main` (required checks) | `gh api …/branches/main/protection` | BLOCKED | HTTP 404 "Not Found". The token cannot tell "not protected" from "no admin access" (`gh-repo.txt`). |
| DO-11 | Build and start scripts sound | read `package.json` | PASS (code review) | `build` cleans `.next`; `start` = migrate, seed, `next start` |
| DO-12 | Migration runner tracked, resumable, idempotent | read `scripts/database/migrate.js` | PASS (code review) | `migrate.js:64-127` |
| DO-13 | Migrations additive (the rollback premise) | grep of `database/migrations` | PARTIAL | No DROP or RENAME; 6 ENUM widenings and 5 backfill UPDATEs (`migrations.txt`). See R-DO-3. |
| DO-14 | Deployment guide current | read `docs/DEPLOYMENT.md` | PARTIAL | Steps are detailed, but the header says v1.4.0 and the examples are stale (see 18_DOCUMENTATION_AUDIT, OPS-14) |
| DO-15 | Environment variables documented | `config/environment.ts` vs `.env.example` vs DEPLOYMENT D4 | PASS | Names only: every server variable is in `.env.example` |
| DO-16 | Secrets git-ignored | read `.gitignore` | PASS | `.env.*`, `*.pem`, `*.key`, `*secret*`, `backups/`, `*.sql.gz` |
| DO-17 | No secret files tracked | `git ls-files` | PASS | Only `.env.example` |
| DO-18 | No secrets in history (spot-check) | `git log -p --all -G` for 11 patterns, values masked | PASS | `secret-scan.txt`: test fixtures and placeholders only |
| DO-19 | Release versioning and notes | `package.json`, tags, `docs/RELEASE-NOTES.md` | PASS | v1.39.0 entry at the top of RELEASE-NOTES; semver tags |
| DO-20 | Rollback documented | read DEPLOYMENT Part M, BACKUP §4, studio deployment doc | PASS (doc review) | `DEPLOYMENT.md:417-421`; `BACKUP_RESTORE_AND_ROLLBACK.md` §4; `ADMIN_CONFIGURATION_STUDIO_DEPLOYMENT.md:15-36` |
| DO-21 | Production TLS and security headers | one `curl -sI -v …/login` | PASS | `curl-prod-login-headers.txt`: 200, HSTS, CSP, XFO DENY, via Cloudflare |
| DO-22 | Production hosting config, DNS, certificate details, deployed version, cron | — | BLOCKED | No access (rules: production out of scope) |
| DO-23 | A deploy can only follow a green CI run | DEPLOYMENT D5 and M1, `ci.yml` | PARTIAL | A manual check only; GoDaddy pulls `main` regardless of CI (see R-DO-1) |

**Totals:** 23 checks: 13 PASS, 7 PARTIAL, 1 FAIL, 0 NOT TESTED, 2 BLOCKED, 0 NOT APPLICABLE.

## 4. Risks and recommendations (not defects)

- **R-DO-1, CI does not gate deploys.** GoDaddy deploys `main`, and Publish is manual. A red commit can be published if the A1 check is skipped. This already happened once: v1.36.0 was tagged on a red run.
  - Protect `main` with required checks and merge through pull requests.
  - Or deploy from a `release` branch that only moves after green CI.
- **R-DO-2, release tags.** Create tags only after CI is green. A GitHub Release per tag would also give the owner a "what is live" pointer. Today it is not recorded which version is published on GoDaddy: PLAN-CHECKLIST "Now" entries say "**Owner:** publish vX" for v1.28.1 to v1.39.0.
- **R-DO-3, ENUM widenings and older code.** Rolling the code back after new ENUM values were written can leave older code with values it does not know, such as `auth_method='TRY_AS'` or `channel='INAPP'`. Add this to the rollback notes.
- **R-DO-4, operational hygiene.** Confirm the CEOITBox test key mentioned in DEPLOYMENT A4 was revoked. Rotate any secret that has ever left the password manager.
- **R-DO-5, CI maintenance.** Pin `ubuntu-24.04` (or test on 26), and move to `actions/checkout`/`setup-node` versions that run on Node 24.

## 5. Defects

| Defect ID | Module | Feature | Category | Description | Expected | Actual | Severity | Priority | Reproduction | Evidence | Root cause | Recommendation | Status |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| OPS-03 | CI | e2e job | Pipeline reliability | The e2e job (Playwright e2e, then the QA suite, then the origin-lock suite) runs almost to its 30-minute timeout. | Comfortable headroom (e.g. under 70% of the limit). | 23, 27, 29, 27, 29, 26 and 25 min in the last 7 completed runs; v1.38.0 took 29 of 30 min. A few more tests will make every run fail on timeout. | Medium | P2 | `gh run view <id> --json jobs` for runs 41199998724, 41180845726 | `audit/TEST_EVIDENCE/OPS/ci-e2e-durations.txt` | The suite grows every release (193 e2e tests plus QA plus origin) in one serial job | Shard Playwright (`--shard`) across a matrix, or split the QA and origin suites into their own jobs. Raise `timeout-minutes` only as a stop-gap. | Open |
| OPS-04 | CI / release | e2e stability, tagging | Pipeline reliability / process | E2E tests fail intermittently on `main`, and a release was tagged on a red run. | `main` is green, and release tags only on green commits (DEPLOYMENT M1: "green on all 3 jobs"). | 2 of the last 10 runs failed on one test each: `v137-ux-laws.spec.ts:53` (run 41188584683) and `v131-work-more.spec.ts:56` (run 41185787171). The second is the `v1.36.0` commit, which carries the `v1.36.0` tag. | Medium | P2 | `gh run list --limit 10`; `gh run view 41185787171 --log-failed` | `audit/TEST_EVIDENCE/OPS/gh-runs.txt`, `gh-failed-runs.txt` | Timing-dependent tests (repeating task completion, decision banner); no enforced green-before-tag rule | Stabilise the two specs (wait on state, not on time). Enable Playwright `retries: 1` in CI and report flaky tests. Only tag after a green run. | Open |
| OPS-05 | Release | Versioning | Release management | A version listed in the release notes has no tag. | Every version in RELEASE-NOTES has a tag. | `v1.34.0` has no tag. Its changes shipped in the `v1.35.0` commit `b764c41`, but `docs/RELEASE-NOTES.md:36` presents v1.34.0 as its own release. | Low | P3 | `git rev-parse v1.34.0` fails | `audit/TEST_EVIDENCE/OPS/git.txt` | v1.34.0 and v1.35.0 were committed together | Add a note to the v1.34.0 entry ("released together with v1.35.0"), or tag `b764c41` as both. | Open |
| OPS-06 | CI | Workflow actions | Maintenance | The CI actions target a deprecated runtime. | Actions run on a supported Node runtime. | GitHub annotation: `actions/checkout@v4` and `actions/setup-node@v4` target Node 20 and are being forced onto Node 24. | Low | P3 | `gh run view 41223507740` (annotations) | `audit/TEST_EVIDENCE/OPS/gh-runs.txt` | Action versions not updated | Update to action versions built for Node 24, and pin the runner image. | Open |
