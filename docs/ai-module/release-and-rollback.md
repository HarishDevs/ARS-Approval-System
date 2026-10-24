# AI module: testing, release and rollback

## Tests

| Suite | Files | Covers |
|---|---|---|
| Unit | `tests/modules/module-access.test.ts`, `tests/ai/ai-engine.test.ts` | module rules and the page-to-module map; provider request and response formats for all four; key redaction; routing; the figure check; proposal rules; Salesforce parsing, SOQL and paging |
| Integration (MySQL) | `tests/integration/ai-modules.int.test.ts`, `tests/integration/ai-assistant.int.test.ts` | the module default for every way of creating a person; saving and audit; rules; list filter; page refusal; no tools without approval; evidence; ownership; module-limited tools; daily limit; proposals (approver, refusals, changed hash, expiry, `executed: false`); Salesforce copy (paging, no duplicates, checkpoint kept on failure) |
| End to end | `tests/e2e/ai-modules.spec.ts` | module access by address and API, AI pages and sidebar group, honest empty states, AI settings for the Super Admin only |
| Everything else | the existing suites | that the rest of the app is unchanged |

- No test calls a real provider or Salesforce: `fetch` is replaced in the tests.
- Testing with a real key is done by the owner in AI settings (**Test**, then the Assistant).

## Release checklist (owner)

1. Merge `feature/ai-module` into `main` only after reviewing it. CI runs on the pull request.
2. Publish. The migrations are additive and run at start.
3. Check `/api/health`, then sign in.
4. Super Admin → **AI settings**:
   - enter one provider's key and model;
   - choose it as the active provider;
   - press **Test**.
5. Decide **"may see business data"** per provider. NOT_ALLOWED is the default, so the assistant has no ARS data until you allow it.
6. Admin → Users & roles: tick **AI** for a few people first, as a trial.
7. Salesforce, Oracle and Power BI only after the steps in `integrations-and-data.md` are approved.

## Rollback

| Problem | Do |
|---|---|
| AI misbehaving | Providers & security → Feature switches → **AI module: OFF** (immediate, no redeploy); or set the active provider to NONE |
| A provider leaking or failing | AI settings: set its business data to NOT_ALLOWED, change the active provider, or remove its key |
| A person shouldn't have AI | Untick AI on their user page (applies on their next click) |
| Module access wrong for someone | Fix their check boxes. As an emergency for everyone: redeploy the previous tag; the old code ignores `module_access` |
| The release itself | Redeploy the previous tag (v1.14.0). The new tables and column stay and are ignored. No down-migration is needed; dropping them is optional and destructive, so avoid it. |
| Salesforce sync wrong | Remove the Salesforce settings (stops the sync). Copied records stay until deleted on purpose. |

## Backup

The existing daily backup covers the new tables. Restore follows `docs/BACKUP_RESTORE_AND_ROLLBACK.md`.
