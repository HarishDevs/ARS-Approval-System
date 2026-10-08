"use client";

import { useState } from "react";
import { Email } from "@/features/ui/SafeText";

export function NotMeConfirm({ token }: { token: string }) {
  const [state, setState] = useState<"idle" | "busy" | "done" | "error">("idle");
  const [message, setMessage] = useState<string | null>(null);

  async function confirm() {
    setState("busy");
    const response = await fetch("/api/auth/not-me", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token }),
    });
    const body = await response.json().catch(() => null);
    if (response.ok && body?.success) setState("done");
    else {
      setState("error");
      setMessage(body?.error?.message ?? "Something went wrong. Contact IT.");
    }
  }

  if (state === "done") {
    return (
      <div className="mt-6">
        <h1 className="text-title font-semibold">Your account is secured</h1>
        <p className="mt-2 text-ink-muted">
          We signed your account out on every device and locked it. IT will contact you to unlock it. You can reach them at{" "}
          <span className="select-all font-medium text-ink"><Email address="itadmin@arssteels.co.in" /></span>.
        </p>
      </div>
    );
  }

  return (
    <div className="mt-6">
      <h1 className="text-title font-semibold">Wasn&apos;t you?</h1>
      <p className="mt-2 text-ink-muted">
        If you didn&apos;t just sign in, secure your account. This signs you out on every device and locks the account until IT unlocks it.
      </p>
      {state === "error" && (
        <p role="alert" className="mt-4 rounded-md border border-danger-200 bg-danger-50 px-3.5 py-2.5 text-label text-danger-600">
          {message}
        </p>
      )}
      <button type="button" onClick={confirm} disabled={state === "busy" || !token} className="btn-primary mt-6 !bg-danger-600 hover:!bg-[#b91c1c]">
        {state === "busy" ? "Securing…" : "Sign out everywhere and lock my account"}
      </button>
      <p className="mt-3 text-label text-ink-muted">If it was you, just close this page.</p>
    </div>
  );
}
