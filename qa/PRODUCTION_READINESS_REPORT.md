# Production readiness: ARS-CMS v1.44.0

**Recommendation: ready to publish**, after the three owner checks below. Nothing in
this release needs a migration.

| Check | State |
|---|---|
| Build | `npm run build` clean (production mode) |
| Type check, lint | Clean |
| Tests | Unit 891/891, integration 330/330, QA 32/32, e2e full run 227/232 with the failure fixed and its file re-run 13/13 |
| Security | No open security finding; `npm audit --omit=dev` 0 |
| Database | No schema change. Optional index script waits for approval |
| Secrets | None added or committed; `DB_POOL_SIZE` is a setting, not a secret |
| Rollback | Publish the previous version: no data change to undo. Background-work tasks and `WORK_ASSIGNED` events stay as ordinary records |
| Monitoring | `/api/health/deep` now shows `dbClockOffsetMinutes` |
| Docs | Release notes, User Guide, Help, privacy (effective 2 Nov 2026), API reference, data model, deployment, mobile and journey docs updated |

## Before publishing (owner)

1. `npm ci` (no new packages since v1.42.0's lottie-web) and publish.
2. Set `DB_POOL_SIZE` (DEPLOYMENT B2).
3. After publishing, open `/api/health/deep`: `dbClockOffsetMinutes` = 0 (QA-DB-02).

## After publishing (owner UAT)

Phones (install, tabs, decide from the bar, notifications) and the journey (a request
with a background work step and an FYI, watched on a phone and a computer).

## Capacity

About 50 people clicking at the same moment with no errors on one process on the
development PC; beyond ~100 the server sheds load quickly instead of hanging. More
processes, not a bigger pool, is the next step if ever needed.
