"use client";

import { useTransition } from "react";
import { markAllReadAction } from "@/app/users/collab-actions";

export function MarkAllReadButton() {
  const [pending, start] = useTransition();
  return (
    <button type="button" disabled={pending} onClick={() => start(async () => void (await markAllReadAction()))} className="btn-secondary btn-compact">
      {pending ? "Working…" : "Mark all as read"}
    </button>
  );
}
