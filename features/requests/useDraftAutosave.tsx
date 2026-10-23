"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { discardDraftAction, saveDraftAction } from "@/app/users/draft-actions";
import { actionErrorMessage } from "@/features/ui/form";

// Autosave for a request form (#3, D-108). Watches the form's inputs, waits
// 1.5 s after the last change (or saves at once when a field loses focus),
// and stores the values on the server under the person's account. Files are
// never saved. A failed save never shows "Saved".
export type DraftState =
  | { status: "idle" }
  | { status: "saving" }
  | { status: "saved"; at: Date }
  | { status: "error"; message: string }
  | { status: "conflict"; message: string };

const DEBOUNCE_MS = 1500;
const SKIP = new Set(["workflowId", "requestId", "submissionKey", "attachments", "allowDuplicate"]);

function snapshot(form: HTMLFormElement): { title: string; fields: Record<string, string> } {
  const data = new FormData(form);
  const fields: Record<string, string> = {};
  for (const [key, value] of data.entries()) {
    if (SKIP.has(key) || key.startsWith("$") || typeof value !== "string") continue;
    fields[key] = value;
  }
  const title = fields.title ?? "";
  delete fields.title;
  return { title, fields };
}

export function useDraftAutosave(options: { draftKey: string; initialVersion: number | null; savedAt: Date | null; disabled?: boolean }) {
  const formRef = useRef<HTMLFormElement>(null);
  const version = useRef<number | null>(options.initialVersion);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastSent = useRef<string>("");
  const inFlight = useRef(false);
  const [state, setState] = useState<DraftState>(options.savedAt ? { status: "saved", at: options.savedAt } : { status: "idle" });
  const stopped = useRef(false); // after a conflict, this tab stops saving

  const save = useCallback(async () => {
    const form = formRef.current;
    if (!form || options.disabled || stopped.current || inFlight.current) return;
    const content = snapshot(form);
    const serialized = JSON.stringify(content);
    if (serialized === lastSent.current) return;
    inFlight.current = true;
    setState({ status: "saving" });
    try {
      const result = await saveDraftAction({ key: options.draftKey, ...content, version: version.current });
      if (result.ok) {
        lastSent.current = serialized;
        if (result.version > 0) version.current = result.version;
        setState({ status: "saved", at: new Date(result.savedAt) });
      } else if (result.reason === "CONFLICT") {
        stopped.current = true;
        setState({ status: "conflict", message: result.message });
      } else {
        setState({ status: "error", message: result.message });
      }
    } catch (error) {
      // D-164: after a publish this page's actions are gone; say to reload.
      setState({ status: "error", message: actionErrorMessage(error) ?? "Couldn't save the draft (no connection?). Keep this tab open; it will try again when you type." });
    } finally {
      inFlight.current = false;
    }
  }, [options.draftKey, options.disabled]);

  useEffect(() => {
    const form = formRef.current;
    if (!form || options.disabled) return;
    const schedule = () => {
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => void save(), DEBOUNCE_MS);
    };
    const now = () => {
      if (timer.current) clearTimeout(timer.current);
      void save();
    };
    form.addEventListener("input", schedule);
    form.addEventListener("change", schedule);
    form.addEventListener("focusout", now);
    // The first snapshot is what was restored; unchanged forms aren't re-saved.
    lastSent.current = JSON.stringify(snapshot(form));
    return () => {
      form.removeEventListener("input", schedule);
      form.removeEventListener("change", schedule);
      form.removeEventListener("focusout", now);
      if (timer.current) clearTimeout(timer.current);
    };
  }, [save, options.disabled]);

  const discard = useCallback(async () => {
    const result = await discardDraftAction({ key: options.draftKey });
    if (result.ok) {
      stopped.current = true;
      if (timer.current) clearTimeout(timer.current);
    }
    return result;
  }, [options.draftKey]);

  // Saved controls in a state that also covers a hidden input changing (the custom form's levels).
  const nudge = useCallback(() => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => void save(), DEBOUNCE_MS);
  }, [save]);

  return { formRef, state, discard, nudge };
}

export function DraftStatus({ state, onDiscard, restoredAt }: { state: DraftState; onDiscard?: () => void; restoredAt?: Date | null }) {
  const time = (date: Date) => date.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", timeZone: "Asia/Kolkata" });
  return (
    <div className="flex flex-wrap items-center gap-3 text-caption">
      <span role="status" aria-live="polite" className={state.status === "error" || state.status === "conflict" ? "text-danger-600" : "text-ink-muted"}>
        {state.status === "saving" && "Saving draft…"}
        {state.status === "saved" && `Draft saved ${time(state.at)}`}
        {state.status === "idle" && (restoredAt ? "" : "Your typing is saved as a draft as you go.")}
        {(state.status === "error" || state.status === "conflict") && `Unable to save: ${state.message}`}
      </span>
      {onDiscard && (state.status === "saved" || restoredAt) && (
        <button type="button" onClick={onDiscard} className="link">
          Discard draft
        </button>
      )}
    </div>
  );
}
