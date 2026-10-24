import type { Metadata } from "next";
import Link from "next/link";
import { PageHeader } from "@/features/shell/PageHeader";
import { Badge, EmptyState } from "@/features/ui/Display";
import { requireAiPage } from "@/features/ai/guard";
import { ProposalDecision } from "@/features/ai/ProposalDecision";
import { listProposalsRequestedBy, listProposalsToDecide, type AiProposal } from "@/lib/db/repositories/ai.repository";
import { canDecide, PROPOSAL_DAYS } from "@/server/ai/proposals";
import { formatIndiaTime } from "@/server/notifications/security-messages";

export const metadata: Metadata = { title: "Insights & Recommendations" };
export const dynamic = "force-dynamic";

const KIND_LABEL: Record<AiProposal["kind"], string> = { REMINDER: "Reminder", FOLLOW_UP: "Follow-up", REVIEW: "Review", OTHER: "Other" };
const STATUS_TONE = { PENDING: "warning", APPROVED: "success", REJECTED: "danger", EXPIRED: "neutral" } as const;

// D-169 Phase 7 (AI module branch): suggestions the AI recorded while
// answering, for a person to approve or reject. The approver is the asker's
// reporting manager (or an IT Admin), never the asker or the AI. Approving
// records a decision only: nothing is carried out automatically.
export default async function AiInsightsPage() {
  const { user } = await requireAiPage();
  const isItAdmin = user.roles.includes("IT_ADMIN") || user.roles.includes("SUPER_ADMIN");
  const [toDecide, mine] = await Promise.all([listProposalsToDecide(user.id, isItAdmin), listProposalsRequestedBy(user.id)]);
  return (
    <>
      <PageHeader title="Insights & Recommendations" description={`Suggestions the AI recorded, with their evidence. Each needs a person's decision within ${PROPOSAL_DAYS} days; nothing is carried out automatically.`}>
        <Link href="/users/ai/assistant" className="btn-secondary btn-compact">
          Ask the assistant
        </Link>
      </PageHeader>
      <div className="max-w-4xl space-y-8">
        <section aria-labelledby="to-decide">
          <h2 id="to-decide" className="mb-3 text-card-title font-semibold">
            Waiting for your decision ({toDecide.length})
          </h2>
          {toDecide.length === 0 ? (
            <EmptyState title="Nothing to decide" body="Suggestions from people who report to you appear here." />
          ) : (
            <ul className="space-y-3" data-testid="ai-to-decide">
              {toDecide.map((proposal) => (
                <ProposalCard key={proposal.id} proposal={proposal} decision={canDecide(user, proposal).ok} />
              ))}
            </ul>
          )}
        </section>
        <section aria-labelledby="mine">
          <h2 id="mine" className="mb-3 text-card-title font-semibold">
            From your questions ({mine.length})
          </h2>
          {mine.length === 0 ? (
            <EmptyState title="No suggestions yet" body="Ask the assistant to suggest a follow-up; it is recorded here for your manager to decide." />
          ) : (
            <ul className="space-y-3" data-testid="ai-mine">
              {mine.map((proposal) => (
                <ProposalCard key={proposal.id} proposal={proposal} decision={false} />
              ))}
            </ul>
          )}
        </section>
      </div>
    </>
  );
}

function ProposalCard({ proposal, decision }: { proposal: AiProposal; decision: boolean }) {
  const status = proposal.status === "PENDING" && proposal.expired ? "EXPIRED" : proposal.status;
  return (
    <li className="card space-y-2 px-5 py-4">
      <div className="flex flex-wrap items-center gap-2">
        <Badge tone={STATUS_TONE[status]}>{status === "PENDING" ? "Waiting for a decision" : status.charAt(0) + status.slice(1).toLowerCase()}</Badge>
        <Badge tone="neutral">{KIND_LABEL[proposal.kind]}</Badge>
        <span className="text-caption text-ink-muted">
          From {proposal.requestedByName}&apos;s question · {formatIndiaTime(proposal.createdAt)} · decided by {proposal.approverName ?? "an IT Admin"}
        </span>
      </div>
      <h3 className="font-semibold break-words">{proposal.title}</h3>
      <p className="whitespace-pre-wrap break-words text-label">{proposal.details}</p>
      {proposal.evidence.length > 0 && (
        <details className="text-label">
          <summary className="cursor-pointer text-ink-muted">Evidence ({proposal.evidence.length})</summary>
          <ul className="mt-2 space-y-1">
            {proposal.evidence.map((item, index) => (
              <li key={index} className="text-caption">
                {item.label}: {item.source}, read {formatIndiaTime(new Date(item.asOf))}
              </li>
            ))}
          </ul>
        </details>
      )}
      {proposal.decidedAt && (
        <p className="text-caption text-ink-muted">
          {proposal.status === "APPROVED" ? "Approved" : "Rejected"} by {proposal.decidedByName} · {formatIndiaTime(proposal.decidedAt)}
          {proposal.decisionNote ? ` · “${proposal.decisionNote}”` : ""}
          {proposal.status === "APPROVED" ? " · Nothing was carried out automatically." : ""}
        </p>
      )}
      {decision && status === "PENDING" && <ProposalDecision id={proposal.id} version={proposal.version} contentHash={proposal.contentHash} />}
    </li>
  );
}
