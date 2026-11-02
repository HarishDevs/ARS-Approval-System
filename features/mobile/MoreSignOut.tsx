"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { LogOut } from "lucide-react";
import { ConfirmDialog } from "@/features/ui/Dialog";

// v1.43.0: More → Sign out (asks first, as the brief's confirmation list says).
export function MoreSignOut() {
  const router = useRouter();
  const [asking, setAsking] = useState(false);
  const [busy, setBusy] = useState(false);
  return (
    <>
      <button type="button" onClick={() => setAsking(true)} disabled={busy} className="flex min-h-[52px] w-full items-center gap-3 px-4 text-left text-[15px] font-semibold text-[color:var(--m-red)]">
        <LogOut aria-hidden="true" className="h-5 w-5" />
        {busy ? "Signing out…" : "Sign out"}
      </button>
      <ConfirmDialog
        open={asking}
        title="Sign out?"
        body="You'll need to sign in again to use ARS CMS on this device. Phone notifications keep coming."
        confirmLabel="Sign out"
        onCancel={() => setAsking(false)}
        onConfirm={async () => {
          setAsking(false);
          setBusy(true);
          await fetch("/api/auth/logout", { method: "POST" }).catch(() => null);
          router.replace("/login");
          router.refresh();
        }}
      />
    </>
  );
}
