"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export function SignOutEverywhereButton() {
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Only a confirmed sign-out goes to the sign-in page; a network failure
  // says so instead of pretending it worked (audit D-02).
  async function run() {
    setBusy(true);
    setError(null);
    const response = await fetch("/api/me/sign-out-everywhere", { method: "POST" }).catch(() => null);
    if (response && (response.ok || response.status === 404)) {
      router.replace("/login");
      router.refresh();
      return;
    }
    setBusy(false);
    setError(response ? "That didn't work. Please try again." : "Couldn't reach the server. Check your connection and try again.");
  }

  if (!confirming) {
    return (
      <button type="button" onClick={() => setConfirming(true)} className="btn-secondary">
        Sign out everywhere
      </button>
    );
  }
  return (
    <div className="space-y-2">
      <div className="flex gap-2">
        <button type="button" onClick={run} disabled={busy} className="btn-primary">
          {busy ? "Signing out…" : "Yes, sign out"}
        </button>
        <button type="button" onClick={() => setConfirming(false)} className="btn-secondary">
          Cancel
        </button>
      </div>
      {error && (
        <p role="alert" className="text-label text-danger-600">
          {error}
        </p>
      )}
    </div>
  );
}
