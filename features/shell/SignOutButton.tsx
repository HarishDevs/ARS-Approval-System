"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export function SignOutButton() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function signOut() {
    setBusy(true);
    await fetch("/api/auth/logout", { method: "POST" }).catch(() => null);
    router.replace("/login");
    router.refresh();
  }

  return (
    <button type="button" onClick={signOut} disabled={busy} className="rounded-md border border-line px-3 py-1.5 text-label font-medium text-ink-muted hover:bg-surface-muted hover:text-ink">
      {busy ? "Signing out…" : "Sign out"}
    </button>
  );
}
