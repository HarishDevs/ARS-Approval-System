"use client";

import { emailDiagnosticAction } from "@/app/superadmin/settings/actions";
import { ResultMessage, SubmitButton, useActionForm } from "@/features/ui/form";
import { Hint } from "@/features/ui/Hint";

type Finding = { verdict: string; text: string };
const TONE: Record<string, string> = {
  VERIFIED: "text-success-600",
  LIKELY: "text-warning-600",
  UNVERIFIED: "text-ink-muted",
  "BLOCKED BY HOSTING PROVIDER": "text-danger-600",
  "REQUIRES ADMINISTRATOR ACTION": "text-primary-700",
};

// v1.54.14 (owner's email delivery audit): runs on the live server and shows
// what it finds: DNS, which mail routes are open, and each SMTP reply.
export function EmailDiagnosticsPanel({ email }: { email: string }) {
  const { result, pending, onSubmit } = useActionForm(emailDiagnosticAction, { timeoutMs: 45_000 });
  const data = result?.data as { text?: string; findings?: Finding[]; id?: string } | undefined;
  const download = () => {
    if (!data?.text) return;
    const url = URL.createObjectURL(new Blob([data.text], { type: "text/plain;charset=utf-8" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = `${data.id ?? "email-diagnostic"}.txt`;
    link.click();
    URL.revokeObjectURL(url);
  };
  return (
    <section className="card" data-testid="email-diagnostics">
      <div className="flex items-center gap-1.5 border-b border-line px-5 py-4">
        <h2 className="font-semibold">Email diagnostics</h2>
        <Hint
          text="Runs on the server: checks DNS, which mail routes the hosting allows, and talks to each relay step by step (no password is used). Optionally sends one test message and shows the relay's queue id, so GoDaddy can trace it. Accepted by the relay is not the same as delivered."
          align="start"
        />
      </div>
      <form onSubmit={onSubmit} className="space-y-3 px-5 py-5">
        <div>
          <label htmlFor="diag-recipient" className="field-label">
            Test recipient
          </label>
          <input id="diag-recipient" name="recipient" type="email" required maxLength={254} defaultValue={email} className="field-input" autoComplete="off" />
        </div>
        <div>
          <label htmlFor="diag-send-via" className="field-label">
            Send one test message through
          </label>
          <select id="diag-send-via" name="sendVia" defaultValue="localhost" className="field-input">
            <option value="localhost">Local relay (localhost:25)</option>
            <option value="relay">GoDaddy relay (relay-hosting.secureserver.net:25)</option>
            <option value="none">Don&apos;t send: stop after the recipient is accepted</option>
          </select>
        </div>
        <SubmitButton pending={pending} variant="secondary" className="btn-compact">
          Run diagnostics
        </SubmitButton>
        <ResultMessage result={result} />
        {data?.findings && (
          <div className="space-y-2" data-testid="email-diagnostics-findings">
            <ul className="space-y-1.5 text-label">
              {data.findings.map((finding, index) => (
                <li key={index}>
                  <span className={`font-semibold ${TONE[finding.verdict] ?? ""}`}>{finding.verdict}:</span> {finding.text}
                </li>
              ))}
            </ul>
            <details>
              <summary className="cursor-pointer text-label font-medium">Full report</summary>
              <pre className="mt-2 max-h-80 overflow-auto whitespace-pre-wrap rounded-md bg-surface-muted p-3 text-caption">{data.text}</pre>
            </details>
            <button type="button" onClick={download} className="btn-secondary btn-compact">
              Download report
            </button>
          </div>
        )}
      </form>
    </section>
  );
}
