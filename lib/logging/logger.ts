import "server-only";

// Structured server-side log lines. Never pass secrets, tokens, OTP codes or
// passwords in `context`. Extra provider fields go before the stack so the
// host's log viewer doesn't truncate them away (Power BI site lesson).
export function logError(message: string, error: unknown, context?: Record<string, unknown>): void {
  const detail =
    error instanceof Error
      ? { name: error.name, message: error.message, ...extraFields(error), stack: error.stack }
      : { message: String(error) };
  console.error(JSON.stringify({ level: "error", message, ...context, error: detail }));
}

export function logInfo(message: string, context?: Record<string, unknown>): void {
  console.log(JSON.stringify({ level: "info", message, ...context }));
}

function extraFields(error: Error): Record<string, unknown> {
  const extra: Record<string, unknown> = {};
  for (const key of ["code", "providerStatus", "providerBody"]) {
    if (!(key in error)) continue;
    const value = (error as unknown as Record<string, unknown>)[key];
    extra[key] = key === "providerBody" ? redactProviderBody(value) : value;
  }
  return extra;
}

// Audit P-06: a provider's error body helps diagnose a failure (e.g. Resend's
// "domain not verified") but can echo a phone number or an email address.
// Those are masked, and the body is cut to 600 characters.
export function redactProviderBody(value: unknown): string {
  const text = typeof value === "string" ? value : JSON.stringify(value ?? null);
  return text
    .replace(/[A-Za-z0-9._%+-]+@([A-Za-z0-9.-]+\.[A-Za-z]{2,})/g, "•••@$1")
    .replace(/\+?\d[\d\s-]{7,}\d/g, (digits) => `•••${digits.replace(/\D/g, "").slice(-4)}`)
    .slice(0, 600);
}
