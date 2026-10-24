# Pic bot - ai: concurrency test report

**Date:** 24 Oct 2026.
**Machine:** a Windows 11 workstation; local MySQL 8 in Docker; Node 24 (Node 22 on GoDaddy).

**The AI provider was mocked in every run.** No real provider was called, so these figures measure the app, the database and the limits, not a provider's speed or its rate limits.

## Setup

| Test | How | File |
|---|---|---|
| A. In-process, 10 people | 10 distinct people read from MySQL (as a session would) call `askAssistant()` at the same moment. Real authorization, routing, concurrency gate, idempotency, tool and database writes. Mocked provider: 300 ms per call, 2 calls per question (a tool call, then the answer naming the asker). | `tests/integration/ai-concurrency.int.test.ts` |
| B. Over HTTP, 10 signed-in clients | The production build (`next start`), 10 separate session cookies, 10 `POST /api/ai/chat` at the same moment. The app reaches a local mock Claude (`AI_CLAUDE_BASE_URL=http://127.0.0.1:4011`, 300 ms per call). | `tests/e2e/picbot.spec.ts` ("10 signed-in clients…"), `tests/e2e/mock-provider.ts` |

Raw results are written to `test-results/picbot-concurrency.json` and `test-results/picbot-http-concurrency.json` on each run.

## Results (measured)

### A. In-process, 10 people (run of 24 Oct 2026)

| Scenario | Succeeded | Failed | Peak provider calls in flight | Avg | p95 | Max | Wall | Notes |
|---|---:|---:|---:|---:|---:|---:|---:|---|
| Global limit 10 | 10 | 0 | 10 | 773 ms | 776 ms | 776 ms | 776 ms | RSS 121 MB (+29 MB); CPU 172 ms. Database: 10 conversations, 20 messages, exactly as expected |
| Global limit 4 | 10 | 0 | **4** | 1,219 ms | 2,001 ms | 2,001 ms | 2,002 ms | The others waited in the bounded queue, then succeeded |
| One person's provider fails (HTTP 500, retried once) | 9 | 1 (the intended one) | — | — | — | — | — | The other 9 were unaffected |
| One person sends 3 at once (per-person limit 2) | 2 | 1 refused (PERSON_BUSY) | — | — | — | — | — | As designed |

**Isolation was checked for every person:**
- the stored question is their own;
- the answer is exactly `Answer for <their name>: <their own count> waiting.`;
- one question and one answer are stored.

The gate returned to zero (no leaked slots).

### B. Over HTTP, 10 signed-in clients (production build, run of 24 Oct 2026)

| Clients | Succeeded | Failed | Avg | p95 | Max | Wall | Provider calls | Peak in flight |
|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| 10 | 10 | 0 | 797 ms | 806 ms | 806 ms | 808 ms | 20 | 10 |

Every response carried only its own client's question and answer.

## What limits capacity

1. **The provider.** Its rate limits, quotas and latency (seconds per answer for real models) dominate everything else measured here, which costs about 0.2 s on top of the provider's time. Real throughput depends on the provider account's limits. **These weren't measured; there's no real key.**
2. **The "Questions sent to providers at once" setting** (default 10, per server process). Past it, questions wait in a bounded queue (at most 2 × the limit, at most 15 s), then get "busy". Test A2 shows the queue working.
3. **One Node process on GoDaddy.** In-process counters are exact there. With several processes, each has its own counters (the per-minute limit in MySQL is shared).
4. **MySQL** wasn't a bottleneck at 10 clients: no errors, and the expected row counts.

## Not claimed

- No claim is made for 50–100 concurrent users. Nothing above 10 simultaneous clients was measured, and nothing at all against a real provider.
- GoDaddy's own request timeout and memory limit for the plan weren't measured. An answer is one HTTP request (no streaming), held for up to the answer timeout (default 60 s).
- **To test higher numbers:** run test B with more clients against a staging copy and a real provider key, and watch the provider's 429s and the app's memory.
