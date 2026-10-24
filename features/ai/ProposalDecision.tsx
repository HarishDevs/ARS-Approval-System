"use client";

import { decideProposalAction } from "@/app/users/ai/actions";
import { ResultMessage, useActionForm } from "@/features/ui/form";

// D-169 Phase 7: approve or reject a proposal. The version and content hash
// shown here go with the decision, so a changed proposal is refused.
export function ProposalDecision({ id, version, contentHash }: { id: number; version: number; contentHash: string }) {
  const { result, pending, onSubmit } = useActionForm(decideProposalAction);
  return (
    <form onSubmit={onSubmit} className="space-y-2">
      <input type="hidden" name="proposalId" value={id} />
      <input type="hidden" name="version" value={version} />
      <input type="hidden" name="contentHash" value={contentHash} />
      <label htmlFor={`note-${id}`} className="field-label">
        Note (needed to reject)
      </label>
      <input id={`note-${id}`} name="note" maxLength={500} className="field-input" />
      <div className="flex flex-wrap gap-2">
        <button type="submit" name="decision" value="APPROVED" disabled={pending} className="btn-primary btn-compact">
          Approve
        </button>
        <button type="submit" name="decision" value="REJECTED" disabled={pending} className="btn-secondary btn-compact">
          Reject
        </button>
        {pending && <span className="text-label text-ink-muted">Saving…</span>}
      </div>
      <ResultMessage result={result} />
    </form>
  );
}
