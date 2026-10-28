"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { saveTextSizeAction, saveWorkspaceViewAction } from "@/app/users/view-actions";
import { applyTextScale } from "@/features/shell/TextScale";
import { TEXT_SCALE, TEXT_SIZE_LABEL, TEXT_SIZES, VIEW_LABEL, WORKSPACE_VIEWS, type TextSize, type WorkspaceView } from "@/server/ui/workspace-view";

// D-210: Compact or Classic, saved on the person's account (every device).
// D-211: in the Classic view, the text size too (it changes at once).
export function ViewSwitch({ initial, initialText = "M", compact = false }: { initial: WorkspaceView; initialText?: TextSize; compact?: boolean }) {
  const router = useRouter();
  const [view, setView] = useState<WorkspaceView>(initial);
  const [text, setText] = useState<TextSize>(initialText);
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
  const chooseText = (next: TextSize) => {
    if (next === text) return;
    const before = text;
    setText(next);
    applyTextScale(TEXT_SCALE[next]);
    start(async () => {
      const form = new FormData();
      form.set("size", next);
      const result = await saveTextSizeAction(null, form);
      setMessage(result.ok ? null : result.message);
      if (result.ok) router.refresh();
      else {
        setText(before);
        applyTextScale(TEXT_SCALE[before]);
      }
    });
  };
  const label = compact ? "pb-1 text-caption font-semibold uppercase tracking-wider text-ink-faint" : "field-label";
  const button = (on: boolean) => `rounded px-3 py-1 text-label ${on ? "bg-primary-solid font-semibold text-white" : "text-ink hover:bg-surface-muted"}`;
  return (
    <div className={compact ? "space-y-2 px-3 py-1.5" : "space-y-3"}>
      <div>
        <p id="view-switch-label" className={label}>
          View
        </p>
        <div role="radiogroup" aria-labelledby="view-switch-label" className="inline-flex rounded-md border border-line p-0.5" data-testid="view-switch">
          {WORKSPACE_VIEWS.map((option) => (
            <button key={option} type="button" role="radio" aria-checked={view === option} disabled={pending} onClick={() => choose(option)} className={button(view === option)}>
              {VIEW_LABEL[option]}
            </button>
          ))}
        </div>
      </div>
      {view === "CLASSIC" && (
        <div>
          <p id="text-size-label" className={label}>
            Text size
          </p>
          <div role="radiogroup" aria-labelledby="text-size-label" className="inline-flex flex-wrap rounded-md border border-line p-0.5" data-testid="text-size">
            {TEXT_SIZES.map((option) => (
              <button
                key={option}
                type="button"
                role="radio"
                aria-checked={text === option}
                aria-label={TEXT_SIZE_LABEL[option]}
                title={`${TEXT_SIZE_LABEL[option]} (${Math.round(TEXT_SCALE[option] * 100)}%)`}
                onClick={() => chooseText(option)}
                className={`${button(text === option)} leading-none`}
                // Fixed sizes, so the choices themselves don't jump as the text grows.
                style={{ fontSize: `${11 + TEXT_SIZES.indexOf(option) * 2}px` }}
              >
                A
              </button>
            ))}
          </div>
        </div>
      )}
      {message && (
        <p role="alert" className="mt-1 text-caption text-danger-600">
          {message}
        </p>
      )}
    </div>
  );
}
