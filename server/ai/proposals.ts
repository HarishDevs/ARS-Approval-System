import "server-only";
import { createHash } from "node:crypto";
import { withTransaction } from "@/lib/db/transaction";
import { decideProposal, findProposal, insertProposal, reportingManagerOf, type AiEvidence, type AiProposal } from "@/lib/db/repositories/ai.repository";
import { recordAudit } from "@/lib/db/repositories/audit.repository";

// D-169 Phase 7 (AI module branch): actions the AI proposes, decided by a
// person. Rules:
//   - the approver is the requester's reporting manager; without one, any IT
//     Admin; never the requester and never the AI;
//   - a proposal expires after PROPOSAL_DAYS;
//   - a decision must name the version and content hash it was shown, so an
//     altered or already-decided proposal is refused;
//   - EXECUTION IS SWITCHED OFF: an approved proposal is a recorded decision
//     for a person to act on. Carrying actions out automatically needs a
//     separately reviewed change (docs/ai-module/approval-workflow.md).
export const PROPOSAL_DAYS = 7;

// The decision covers what the approver reads: kind, title and details (text
// columns, stored exactly). Evidence is shown beside it; MySQL's JSON type
// reorders keys, so it isn't part of the hash.
export function proposalHash(input: { kind: string; title: string; details: string }): string {
  return createHash("sha256").update(JSON.stringify([input.kind, input.title, input.details])).digest("hex");
}

export async function createProposal(
  person: { id: number },
  input: { conversationId: number | null; kind: AiProposal["kind"]; title: string; details: string; evidence: AiEvidence[] },
): Promise<{ id: number; approverLabel: string }> {
  const approver = await reportingManagerOf(person.id);
  const contentHash = proposalHash(input);
  const id = await insertProposal({ ...input, requestedBy: person.id, approverUserId: approver, contentHash, validDays: PROPOSAL_DAYS });
  await recordAudit({ actorUserId: person.id, action: "AI_PROPOSAL_CREATED", entityType: "AI_PROPOSAL", entityId: id, metadata: { kind: input.kind, approver: approver ?? "IT_ADMIN", by: "AI assistant" } });
  return { id, approverLabel: approver ? "the person's reporting manager" : "an IT Admin" };
}

export type DecisionResult = { ok: true; status: "APPROVED" | "REJECTED" } | { ok: false; message: string };

// Pure: may this person decide this proposal?
export function canDecide(person: { id: number; roles: readonly string[] }, proposal: Pick<AiProposal, "requestedBy" | "approverUserId" | "status">): { ok: true } | { ok: false; message: string } {
  if (proposal.status !== "PENDING") return { ok: false, message: "This proposal has already been decided." };
  if (proposal.requestedBy === person.id) return { ok: false, message: "A proposal from your own question is decided by someone else." };
  const itAdmin = person.roles.includes("IT_ADMIN") || person.roles.includes("SUPER_ADMIN");
  if (proposal.approverUserId === null ? !itAdmin : proposal.approverUserId !== person.id) return { ok: false, message: "This proposal isn't waiting for your decision." };
  return { ok: true };
}

export async function decide(
  person: { id: number; roles: readonly string[]; sessionId?: string },
  input: { proposalId: number; version: number; contentHash: string; decision: "APPROVED" | "REJECTED"; note: string | null },
): Promise<DecisionResult> {
  return withTransaction(async (connection) => {
    const proposal = await findProposal(input.proposalId, connection, true);
    if (!proposal) return { ok: false, message: "Not found." };
    const allowed = canDecide(person, proposal);
    if (!allowed.ok) return allowed;
    if (proposal.version !== input.version || proposal.contentHash !== input.contentHash || proposalHash(proposal) !== proposal.contentHash) {
      return { ok: false, message: "This proposal changed after you opened it. Reload the page and check it again." };
    }
    if (proposal.expired) {
      await decideProposal(proposal.id, { status: "EXPIRED", decidedBy: null, note: null, expectedVersion: proposal.version }, connection);
      return { ok: false, message: `This proposal expired (proposals are open for ${PROPOSAL_DAYS} days).` };
    }
    if (input.decision === "REJECTED" && !input.note) return { ok: false, message: "Say why it is rejected." };
    const saved = await decideProposal(proposal.id, { status: input.decision, decidedBy: person.id, note: input.note, expectedVersion: proposal.version }, connection);
    if (!saved) return { ok: false, message: "Someone decided it first. Reload the page." };
    await recordAudit(
      { actorUserId: person.id, action: input.decision === "APPROVED" ? "AI_PROPOSAL_APPROVED" : "AI_PROPOSAL_REJECTED", entityType: "AI_PROPOSAL", entityId: proposal.id, sessionId: person.sessionId, metadata: { version: proposal.version, contentHash: proposal.contentHash, executed: false } },
      connection,
    );
    return { ok: true, status: input.decision };
  });
}
