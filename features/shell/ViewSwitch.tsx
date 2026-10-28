"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { saveWorkspaceViewAction } from "@/app/users/view-actions";
import { VIEW_LABEL, WORKSPACE_VIEWS, type WorkspaceView } from "@/server/ui/workspace-view";

// D-210: Compact or Classic, saved on the person's account (every device).
export function ViewSwitch({ initial, compact = false }: { initial: WorkspaceView; compact?: boolean }) {
  const router = useRouter();
  const [view, setView] = useState<WorkspaceView>(initial);
  const [pending, start] = useTransition();
  const [message, setMessage] = useState<string | null>(null);
  const choose = (next: WorkspaceView) => {
    if (next === view || pending) return;
    setView(next);
    start(async () => {
      const form = new FormData();
      form.set("view", next);
      const result = await saveWorkspaceViewAction(null, form);
      setMessage(result.ok ? null : result.message);
      if (result.ok) router.push(next === "CLASSIC" ? "/users" : "/users?view=overview");
      else setView(view);
    });
  };
  return (
    <div className={compact ? "px-3 py-1.5" : ""}>
      <p id="view-switch-label" className={compact ? "pb-1 text-caption font-semibold uppercase tracking-wider text-ink-faint" : "field-label"}>
        View
      </p>
      <div role="radiogroup" aria-labelledby="view-switch-label" className="inline-flex rounded-md border border-line p-0.5" data-testid="view-switch">
        {WORKSPACE_VIEWS.map((option) => (
          <button
            key={option}
            type="button"
            role="radio"
            aria-checked={view === option}
            disabled={pending}
            onClick={() => choose(option)}
            className={`rounded px-3 py-1 text-label ${view === option ? "bg-primary-solid font-semibold text-white" : "text-ink hover:bg-surface-muted"}`}
          >
            {VIEW_LABEL[option]}
          </button>
        ))}
      </div>
      {message && (
        <p role="alert" className="mt-1 text-caption text-danger-600">
          {message}
        </p>
      )}
    </div>
  );
}
