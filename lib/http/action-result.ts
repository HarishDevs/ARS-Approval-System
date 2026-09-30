// Result of a Server Action. Messages are safe to show; field errors are
// keyed by form field name. Never carries stack traces or provider details.
export type ActionResult =
  | { ok: true; message?: string; data?: Record<string, unknown> }
  | { ok: false; message: string; fieldErrors?: Record<string, string> };

export const IDLE: ActionResult | null = null;
