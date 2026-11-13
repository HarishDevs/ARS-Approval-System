"use client";

import { useState } from "react";

// v1.54.6 (Google sign-in fix): what went wrong is said plainly. The popup's
// own failures (blocked, offline, wrong web address, storage blocked…) are
// told apart from the server's answer (account not found, inactive…), the
// server's reference is shown so IT can find the log line, and popup failures
// are reported to the server (code only) so they are visible in the logs.
const POPUP_MESSAGE: Record<string, string> = {
  "auth/popup-blocked": "Your browser blocked the Google sign-in window. Allow pop-ups for approval.arssteels.net (the icon at the right of the address bar), then try again.",
  "auth/network-request-failed": "Couldn't reach Google. Check your internet connection and try again.",
  "auth/unauthorized-domain": "Google sign-in isn't enabled for this web address. Open https://approval.arssteels.net and try again.",
  "auth/web-storage-unsupported": "Your browser is blocking the site data Google sign-in needs (third-party cookies or storage). Allow them for this site, use another browser, or sign in with your User ID.",
  "auth/operation-not-supported-in-this-environment": "Google sign-in doesn't work in this browser window. Open ARS CMS in Chrome, Edge, Firefox or Safari directly.",
  "auth/too-many-requests": "Too many sign-in tries from this device. Wait a few minutes and try again.",
  "auth/user-disabled": "This Google account has been disabled. Use another account or contact IT.",
  "auth/internal-error": "Google sign-in had a problem. Please try again in a moment.",
};
const SILENT = new Set(["auth/popup-closed-by-user", "auth/cancelled-popup-request", "auth/user-cancelled"]);

function report(code: string) {
  // Best effort: never blocks or changes what the person sees.
  void fetch("/api/auth/google/client-event", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ code }), keepalive: true }).catch(() => undefined);
}

export function GoogleButton({ onDone }: { onDone: (redirectTo: string) => void }) {
  const [error, setError] = useState<{ message: string; reference?: string } | null>(null);
  const [busy, setBusy] = useState(false);

  async function signIn() {
    if (busy) return; // one sign-in at a time (a second click is ignored)
    setError(null);
    setBusy(true);
    let idToken: string;
    try {
      // Loaded on click so the Firebase SDK isn't in the first page load.
      const { signInWithGoogleGetIdToken } = await import("@/lib/firebase/client");
      idToken = await signInWithGoogleGetIdToken();
    } catch (caught) {
      const code = String((caught as { code?: string })?.code ?? "unknown");
      if (!SILENT.has(code)) {
        report(code);
        setError({ message: POPUP_MESSAGE[code] ?? "Google sign-in didn't finish. Please try again." });
      }
      setBusy(false);
      return;
    }
    try {
      const response = await fetch("/api/auth/google", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ idToken }),
      });
      const body = await response.json().catch(() => null);
      if (!response.ok || !body?.success) {
        // The request id the server's log line carries (set by the middleware on every response).
        const reference = response.headers.get("x-request-id") ?? body?.error?.requestId ?? undefined;
        setError({ message: body?.error?.message ?? (response.status >= 500 ? "Sign-in is temporarily unavailable. Please try again later." : "Google sign-in failed. Please try again."), reference });
        return;
      }
      onDone(body.data.redirectTo);
    } catch {
      setError({ message: "Couldn't reach ARS CMS to finish signing in. Check your connection and try again." });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <button type="button" onClick={signIn} disabled={busy} aria-busy={busy || undefined} className="btn-secondary">
        <svg viewBox="0 0 24 24" className="h-5 w-5" aria-hidden="true">
          <path fill="#4285F4" d="M23.5 12.3c0-.8-.1-1.6-.2-2.3H12v4.4h6.5a5.6 5.6 0 0 1-2.4 3.7v3h3.9c2.3-2.1 3.5-5.2 3.5-8.8z" />
          <path fill="#34A853" d="M12 24c3.2 0 6-1.1 8-2.9l-3.9-3c-1.1.7-2.5 1.2-4.1 1.2-3.1 0-5.8-2.1-6.7-5H1.3v3.1A12 12 0 0 0 12 24z" />
          <path fill="#FBBC05" d="M5.3 14.3a7.2 7.2 0 0 1 0-4.6V6.6h-4a12 12 0 0 0 0 10.8l4-3.1z" />
          <path fill="#EA4335" d="M12 4.8c1.8 0 3.3.6 4.6 1.8l3.4-3.4A12 12 0 0 0 1.3 6.6l4 3.1c.9-2.9 3.6-4.9 6.7-4.9z" />
        </svg>
        {busy ? "Opening Google…" : "Continue with Google"}
      </button>
      {error && (
        <div role="alert" className="mt-3 text-label text-danger-600" data-testid="google-error">
          <p>{error.message}</p>
          {error.reference && <p className="mt-1 text-caption text-ink-muted">Reference for IT: {error.reference}</p>}
        </div>
      )}
    </div>
  );
}
