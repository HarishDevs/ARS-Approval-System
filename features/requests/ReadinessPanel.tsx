"use client";

import Link from "next/link";
import { AlertTriangle, CheckCircle2, Info, RotateCcw, ShieldCheck, XCircle } from "lucide-react";
import type { Readiness, ReadinessItem } from "@/server/approvals/readiness";
import { Hint } from "@/features/ui/Hint";

// FN1 readiness summary: ready / ready with warnings / blocking problems,
// each linked to its field. The server checks everything again on submit,
// so this panel can never let a bad request through.
const ICON = { BLOCKING: XCircle, WARNING: AlertTriangle, INFO: Info } as const;
const TONE = { BLOCKING: "text-danger-600", WARNING: "text-warning-600", INFO: "text-info-600" } as const;
const WORD = { BLOCKING: "Must fix", WARNING: "Review", INFO: "Note" } as const;

export function ReadinessPanel({
  readiness,
  labels,
  stale,
  checking,
  failed,
  onCheck,
}: {
  readiness: Readiness | null;
  labels: Record<string, string>;
  stale: boolean;
  checking: boolean;
  failed: string | null;
  onCheck: () => void;
}) {
  const anchor = (field: string) => (field === "title" ? "title" : field === "attachments" ? "f-attachments" : `f-${field}`);
  const items = readiness?.items ?? [];
  return (
    <section aria-labelledby="readiness" className="rounded-md border border-line px-4 py-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 id="readiness" className="flex items-center gap-2 font-semibold">
          <ShieldCheck aria-hidden="true" className="h-4 w-4 text-primary-600" />
          Ready to submit?
          <Hint text="Checks the form, documents, who would approve, possible duplicates and the budget, without submitting." align="start" />
        </h3>
        <button type="button" onClick={onCheck} disabled={checking} className="btn-secondary btn-compact">
          <RotateCcw aria-hidden="true" className="h-4 w-4" />
          {checking ? "Checking…" : readiness ? "Check again" : "Check before submitting"}
        </button>
      </div>
      <div role="status" aria-live="polite">
        {failed && <p className="mt-2 text-label text-danger-600">{failed}</p>}
        {readiness && stale && <p className="mt-2 rounded bg-warning-50 px-2 py-1 text-label text-warning-600">You changed something since this check. Check again for an up-to-date result.</p>}
        {readiness && (
          <p className={`mt-2 flex items-center gap-2 text-label font-medium ${readiness.status === "READY" ? "text-success-600" : readiness.status === "WARNINGS" ? "text-warning-600" : "text-danger-600"}`}>
            {readiness.status === "READY" ? <CheckCircle2 aria-hidden="true" className="h-4 w-4" /> : readiness.status === "WARNINGS" ? <AlertTriangle aria-hidden="true" className="h-4 w-4" /> : <XCircle aria-hidden="true" className="h-4 w-4" />}
            {readiness.status === "READY" ? "Ready to submit." : readiness.status === "WARNINGS" ? "Ready, with warnings to review." : `Not ready: ${items.filter((item) => item.severity === "BLOCKING").length} thing(s) to fix.`}
          </p>
        )}
      </div>
      {items.length > 0 && (
        <ul className="mt-2 space-y-2 text-label">
          {items.map((item, index) => (
            <Row key={index} item={item} label={item.field ? labels[item.field] : undefined} href={item.field ? `#${anchor(item.field)}` : undefined} />
          ))}
        </ul>
      )}
    </section>
  );
}

function Row({ item, label, href }: { item: ReadinessItem; label?: string; href?: string }) {
  const Icon = ICON[item.severity];
  return (
    <li className="flex items-start gap-2">
      <Icon aria-hidden="true" className={`mt-0.5 h-4 w-4 shrink-0 ${TONE[item.severity]}`} />
      <div className="min-w-0">
        <p>
          <span className={`font-semibold ${TONE[item.severity]}`}>{WORD[item.severity]}: </span>
          {label && item.code === "FIELD" ? `${label}: ` : ""}
          {item.message}{" "}
          {href && (
            <a
              href={href}
              className="link"
              onClick={(event) => {
                const target = document.querySelector<HTMLElement>(href);
                if (target) {
                  event.preventDefault();
                  target.focus();
                  target.scrollIntoView({ block: "center", behavior: "smooth" });
                }
              }}
            >
              {item.field === "attachments" ? "Upload a document" : "Review"}
            </a>
          )}
        </p>
        {item.candidates && item.candidates.length > 0 && (
          <ul className="mt-1 list-disc pl-5 text-caption text-ink-muted">
            {item.candidates.map((candidate, index) =>
              candidate.id !== null ? (
                <li key={index}>
                  <Link href={`/users/requests/${candidate.id}`} className="link" target="_blank">
                    {candidate.requestNo}
                  </Link>{" "}
                  ({candidate.status?.toLowerCase().replace("_", " ")}): {candidate.reason}
                </li>
              ) : (
                <li key={index}>A matching request you can&apos;t open ({candidate.reason}). IT can confirm whether it&apos;s the same.</li>
              ),
            )}
          </ul>
        )}
      </div>
    </li>
  );
}
