"use client";

import { useState, useTransition } from "react";
import { markAllReadAction } from "@/app/users/collab-actions";
import { guardAction } from "@/features/ui/form";

// A failure is said, not swallowed (audit D-02).
export function MarkAllReadButton() {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  return (
    <span className="flex flex-col items-end gap-1">
      <button
        type="button"
        disabled={pending}
        onClick={() =>
          start(async () => {
            setError(null);
            const result = await guardAction(markAllReadAction)(null, new FormData());
            if (!result.ok) setError(result.message);
          })
        }
        className="btn-secondary btn-compact"
      >
        {pending ? "Working…" : "Mark all as read"}
      </button>
      {error && (
        <span role="alert" className="text-caption text-danger-600">
          {error}
        </span>
      )}
    </span>
  );
}
