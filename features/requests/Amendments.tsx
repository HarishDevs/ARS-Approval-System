import Link from "next/link";
import { FilePenLine } from "lucide-react";
import { RequestStatusPill } from "@/features/requests/StatusPill";
import { SafeText } from "@/features/ui/SafeText";
import { displayValue, type FormField } from "@/server/forms/fields";
import { findAmendment, listAmendments, type AmendmentRecord } from "@/server/approvals/amendments";
import { formatIndiaTime } from "@/server/notifications/security-messages";
import type { InstanceStatus } from "@/server/engine/types";

// FN5 on the request page (server component; the page has already checked
// the viewer may see this request). On an original: its amendments, which
// one is in force, and an Amend link for the requester. On an amendment:
// what it changes and why.
function Changes({ amendment, form }: { amendment: AmendmentRecord; form: readonly FormField[] }) {
  const names = new Map<number, string>();
  return (
    <ul className="mt-1 space-y-0.5 text-label">
      {amendment.changes.map((change) => {
        const field = form.find((item) => item.key === change.key);
        if (!field) return null;
        return (
          <li key={change.key}>
            <span className="font-medium">{field.label}:</span> <del className="text-ink-muted">{displayValue(field, change.from, names)}</del> → <ins className="no-underline">{displayValue(field, change.to, names)}</ins>
          </li>
        );
      })}
    </ul>
  );
}

export async function AmendmentsCard({ requestId, form, canAmend }: { requestId: number; form: readonly FormField[]; canAmend: boolean }) {
  const asAmendment = await findAmendment(requestId);
  if (asAmendment) {
    return (
      <section aria-label="Amendment" className="card border-primary-600 px-5 py-4">
        <h2 className="flex items-center gap-2 font-semibold">
          <FilePenLine aria-hidden="true" className="h-4 w-4 text-primary-600" />
          Amendment of{" "}
          <Link href={`/users/requests/${asAmendment.originalId}`} className="link">
            {asAmendment.originalNo}
          </Link>
        </h2>
        <p className="mt-1 text-label">
          Why: <SafeText text={asAmendment.reason} />
        </p>
        <Changes amendment={asAmendment} form={form} />
        <p className="mt-2 text-caption text-ink-muted">If this is approved, the new values replace the old ones on {asAmendment.originalNo}. If it is rejected or withdrawn, nothing changes there.</p>
      </section>
    );
  }
  const amendments = await listAmendments(requestId);
  if (!amendments.length && !canAmend) return null;
  const inForce = amendments.find((amendment) => amendment.status === "APPROVED") ?? null;
  return (
    <section aria-label="Amendments" className="card px-5 py-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="flex items-center gap-2 font-semibold">
          <FilePenLine aria-hidden="true" className="h-4 w-4 text-ink-muted" />
          Amendments
        </h2>
        {canAmend && (
          <Link href={`/users/requests/${requestId}/amend`} className="btn-secondary btn-compact">
            Amend
          </Link>
        )}
      </div>
      {inForce ? (
        <p role="status" className="mt-2 rounded-md bg-primary-50 px-3 py-2 text-label text-primary-700">
          Amended: the values in force are from {inForce.requestNo}. The details on this page are as first approved.
        </p>
      ) : (
        !amendments.length && <p className="mt-1 text-label text-ink-muted">Need to change something after approval? Raise an amendment; it goes through the approval steps again.</p>
      )}
      {amendments.length > 0 && (
        <ol className="mt-3 space-y-3">
          {amendments.map((amendment) => (
            <li key={amendment.amendmentId} className="border-t border-line pt-3 first:border-0 first:pt-0">
              <p className="flex flex-wrap items-center gap-2 text-label">
                <Link href={`/users/requests/${amendment.amendmentId}`} className="link font-semibold">
                  {amendment.requestNo}
                </Link>
                <RequestStatusPill status={amendment.status as InstanceStatus} />
                <span className="text-caption text-ink-muted">{formatIndiaTime(amendment.createdAt)}</span>
              </p>
              <p className="text-label">
                Why: <SafeText text={amendment.reason} />
              </p>
              <Changes amendment={amendment} form={form} />
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}
