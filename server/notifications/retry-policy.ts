import { CeoitboxError } from "@/server/integrations/ceoitbox/client";
import { EmailSendError } from "@/server/integrations/resend/client";

// D-243: one retry policy for the first send (notify) and the retry runner,
// so the setting "Retries for a failed send" (whatsapp.retry_limit, used for
// email too) means exactly that many retries, and 0 means none.

// Failures worth another try: network, timeout, provider 5xx, rate limits.
const RETRYABLE = new Set(["CEOITBOX_REQUEST_FAILED", "CEOITBOX_TIMEOUT", "CEOITBOX_RATE_LIMITED", "EMAIL_REQUEST_FAILED", "EMAIL_RATE_LIMITED"]);

export function isRetryableCode(code: string): boolean {
  return RETRYABLE.has(code);
}

// attemptsSoFar counts every send made, the first one included (so after the
// first send fails it is 1). Retries wait 2, 4, 8… minutes and stop once
// `retryLimit` retries have been made.
export function nextRetryMinutes(attemptsSoFar: number, retryLimit: number): number | null {
  const retriesDone = Math.max(0, attemptsSoFar - 1);
  if (retriesDone >= retryLimit) return null;
  return 2 ** Math.max(1, attemptsSoFar);
}

// The provider's own Retry-After (CEOITBox 429), in seconds, when given.
export function providerRetryAfterSeconds(error: unknown): number | null {
  if (error instanceof EmailSendError) {
    // v1.54.8: the SMTP hourly limit asks for a wait.
    const asked = (error.providerBody as { retryAfterSeconds?: unknown } | null | undefined)?.retryAfterSeconds;
    return typeof asked === "number" ? asked : null;
  }
  return error instanceof CeoitboxError && typeof error.retryAfterSeconds === "number" ? error.retryAfterSeconds : null;
}

// Minutes until the next try: the backoff, or longer when the provider asked
// for a longer wait. null = no more tries.
export function retryDelayMinutes(code: string, error: unknown, attemptsSoFar: number, retryLimit: number): number | null {
  if (!isRetryableCode(code)) return null;
  const backoff = nextRetryMinutes(attemptsSoFar, retryLimit);
  if (backoff === null) return null;
  const asked = providerRetryAfterSeconds(error);
  return asked === null ? backoff : Math.max(backoff, Math.ceil(asked / 60));
}
