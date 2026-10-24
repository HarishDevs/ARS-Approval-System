# Risk register

Likelihood and impact: L (low), M (medium), H (high). Owner: who acts. Status as of 24 Oct 2026.

| ID | Risk | L | I | Mitigation | Owner | Status |
|---|---|---|---|---|---|---|
| R-01 | The AI module changes existing behaviour by accident | M | H | Built on branch `feature/ai-module` in its own worktree; additive migrations only; module backfill keeps everyone's current access; the whole existing test suite runs on every change; "AI module available" off by default; nothing reaches `main` or the live site without the owner | Dev | Mitigated |
| R-18 | DeepSeek and Grok process data under their own terms and jurisdictions | M | H | Each provider gets an explicit list of data classes it may see; DeepSeek starts with none; restricted data never falls back to a provider not approved for it | Owner + Dev | Planned (Phase 5) |
| R-02 | GoDaddy Node.js Hosting can't run Python, a long-running service or Ollama | H | H | Owner decision 24 Oct 2026: API-based models only; the AI layer is TypeScript in the existing app | Owner | Closed |
| R-03 | No approved identity provider for the new app; temptation to share the approval app's sessions | M | H | Owner decision 24 Oct 2026: one application, so the AI module uses the existing sign-in and sessions | Owner | Closed |
| R-04 | Module grants hidden in the UI but not enforced in an API | M | H | Every route declares its requirement; deny by default; a route-inventory test fails on any unguarded route; direct-API tests per module | Dev | Planned (Phase 3) |
| R-05 | Privilege escalation when an admin edits unrelated user fields | M | H | Grants saved only through their own endpoint with a version check; profile edits ignore grant fields; audited before and after | Dev | Planned (Phase 3) |
| R-06 | Confidential data sent to an unapproved hosted model (including as a fallback when Ollama is down) | M | H | Routing by data class; external processing off by default; no automatic fallback to a hosted model for restricted classes; tests | Dev + owner (Q-AI-04) | Planned (Phase 5) |
| R-07 | Prompt injection through CRM notes or documents, leading to data exfiltration or tool misuse | M | H | Retrieved text treated as data and fenced; tools re-check authorization; no free-form SQL or URL tools; output validated; no tool can write | Dev | Planned (Phase 5) |
| R-08 | The model invents numbers or presents a hypothesis as a fact | H | M | Numbers only from tool results; validator rejects figures not found in results; "verified" and "hypothesis" sections; evidence links | Dev | Planned (Phase 5) |
| R-09 | One user reads another's conversation by changing an id | M | H | Ownership enforced in the query (`WHERE owner_id = :me`); 404 for anyone else; auditor access is separate, scoped and audited; tests | Dev | Planned (Phase 4) |
| R-10 | Salesforce or Oracle access with too much privilege, or against production too early | M | H | Dedicated read-only integration identities; sandbox first; no guessed credentials; owner approval per source | Owner (Q-AI-05) | Open |
| R-11 | Stale or partial data shown as current | M | M | Freshness per dataset; partial runs never replace the last good snapshot; labels on every figure | Dev | Planned (Phase 6) |
| R-12 | Local model too slow or too weak on the available hardware | M | M | Benchmark quality, latency, memory and concurrency before company-wide use; usage limits; feature flag | Dev + owner | Open |
| R-13 | Hosted model cost runs away | L | M | Per-user and global quotas, maximum request size, cost tracking, an off switch | Dev | Planned (Phase 5) |
| R-14 | Secrets leak into logs, client responses or the repository | L | H | Secrets only in the server environment or secret store; `.env*` ignored; log redaction; tests that scan responses and logs; dependency and secret scanning in CI | Dev | Planned (Phase 2) |
| R-15 | An AI proposal is executed without a human decision, or after it was changed | L | H | Execution disabled; proposals versioned by content hash; expiry; approver can't be the requester or the AI; re-validation at any future execution | Dev | Planned (Phase 7) |
| R-16 | Python 3.14 on the workstation is newer than some libraries support | M | L | Engine pinned to Python 3.12 through uv (`requires-python`), so CI and hosting use the same version | Dev | Planned (Phase 2) |
| R-17 | Two apps to support with a small IT team | M | M | Same web stack and look as the approval app; one README; health checks; written runbooks | Owner | Accepted |
