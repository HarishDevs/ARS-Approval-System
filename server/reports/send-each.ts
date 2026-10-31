// D-243 (audit DB-013): a scheduled report goes to each recipient on their
// own. One failure (a bad address, a provider refusal) is recorded and the
// others still get the report. Pure apart from the injected send.
export interface RecipientOutcome {
  sent: number;
  failed: number;
  firstError: string | null;
}

export async function sendToEach<T>(entries: readonly T[], send: (entry: T) => Promise<void>, onError?: (entry: T, error: unknown) => void): Promise<RecipientOutcome> {
  const outcome: RecipientOutcome = { sent: 0, failed: 0, firstError: null };
  for (const entry of entries) {
    try {
      await send(entry);
      outcome.sent += 1;
    } catch (error) {
      outcome.failed += 1;
      outcome.firstError ??= error instanceof Error ? `${error.name}: ${error.message}` : "Failed";
      onError?.(entry, error);
    }
  }
  return outcome;
}

// The run's status: SENT when anyone got it (partial success is described in
// the message), FAILED when nobody did, so a broken schedule still pauses
// after three failures in a row.
export function runResult(outcome: RecipientOutcome, total: number): { status: "SENT" | "FAILED"; note: string } {
  if (outcome.sent === 0) return { status: "FAILED", note: `Not sent to anyone (${total} ${total === 1 ? "person" : "people"})${outcome.firstError ? `: ${outcome.firstError}` : "."}` };
  if (outcome.failed === 0) return { status: "SENT", note: "" };
  return { status: "SENT", note: ` Sent to ${outcome.sent} of ${total}; ${outcome.failed} failed${outcome.firstError ? ` (${outcome.firstError})` : ""}.` };
}
