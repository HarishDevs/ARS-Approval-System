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
    if (key in error) extra[key] = (error as unknown as Record<string, unknown>)[key];
  }
  return extra;
}
