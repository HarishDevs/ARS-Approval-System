"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export function SignOutEverywhereButton() {
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);

  async function run() {
    setBusy(true);
    await fetch("/api/me/sign-out-everywhere", { method: "POST" }).catch(() => null);
    router.replace("/login");
    router.refresh();
  }

  if (!confirming) {
    return (
      <button type="button" onClick={() => setConfirming(true)} className="btn-secondary">
        Sign out everywhere
      </button>
    );
  }
  return (
    <div className="flex gap-2">
      <button type="button" onClick={run} disabled={busy} className="btn-primary">
        {busy ? "Signing out…" : "Yes, sign out"}
      </button>
      <button type="button" onClick={() => setConfirming(false)} className="btn-secondary">
        Cancel
      </button>
    </div>
  );
}
