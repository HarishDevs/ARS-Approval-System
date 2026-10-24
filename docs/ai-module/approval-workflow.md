# AI module: human approval of AI proposals

The AI never acts. It can record a **proposal** (`propose_action` tool) while answering, and a person decides it.

```
Question → AI calls propose_action(kind, title, details) → ai_proposals (PENDING, version 1, content hash, expires in 7 days)
        → Approver: the asker's reporting manager (or any IT Admin if they have none)
        → Insights & Recommendations: Approve / Reject (reason required) → APPROVED / REJECTED (version + 1, audited)
        → 7 days without a decision → EXPIRED (job or at decision time)
APPROVED = a recorded decision. Nothing is carried out automatically (execution switched off).
```

| Rule | How |
|---|---|
| Identify the action and the records | `kind` and `title`; `details` cites the figures; `evidence_json` holds the tool results it was based on |
| Requester's permission | The proposal is created inside their own question, after their module and page checks |
| Evidence | Shown on the card ("Evidence") with source and time read |
| Approver by explicit policy | Reporting manager; else any IT Admin; `canDecide()` |
| Authenticated decision | Server Action with the session, the AI module and the `users.ai_insights` page rule |
| Who decided, when, which version | `decided_by`, `decided_at`, `version`; audit `AI_PROPOSAL_APPROVED` / `REJECTED` with the content hash and `executed: false` |
| Expired, altered or unauthorized | Expired: refused and marked EXPIRED. Hash or version mismatch: refused. Not the approver, or the requester: refused |
| Execution-time revalidation | Not applicable while execution is off. A future executor must re-check the approver's decision, the proposal's version and hash, the requester's and approver's current permissions, and the records' current state before acting |

## Enabling execution later

This is a separate, reviewed change:
1. one executor per action kind, read-only until approved;
2. its own feature switch;
3. revalidation as above;
4. an audit entry per execution;
5. tests.

`EXECUTION_ENABLED` in `server/ai/proposals.ts` is a constant `false` today, and nothing reads it as a toggle.
