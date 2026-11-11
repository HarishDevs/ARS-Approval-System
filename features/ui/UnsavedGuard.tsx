"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { ConfirmDialog } from "@/features/ui/Dialog";
import { SAVE_FAILED_EVENT, SAVED_EVENT } from "@/features/ui/form";

// Clicks this guard took over, so the page-change indicators (the top bar,
// the Classic loader) don't start for them. Next's Link always calls
// preventDefault, so defaultPrevented can't tell.
const held = new WeakSet<Event>();
export const navigationHeld = (event: Event) => held.has(event);

// D-233 (UI states: unsaved changes). Put inside a long form: once anything
// in it changes, leaving asks first, closing or reloading the tab through
// the browser's own question, and a link in the app through ours (Stay /
// Leave without saving). Saving (useActionForm) or resetting the form clears it.
export function UnsavedGuard() {
  const anchor = useRef<HTMLSpanElement>(null);
  const [dirty, setDirty] = useState(false);
  const [leaveTo, setLeaveTo] = useState<string | null>(null);
  const router = useRouter();

  useEffect(() => {
    const form = anchor.current?.closest("form");
    if (!form) return;
    const changed = () => setDirty(true);
    const clean = () => setDirty(false);
    // v1.51.2 (owner: "asking leave this page but submitting"): sending the
    // form is not leaving it unsaved. The question is dropped as soon as it is
    // sent (a save that opens the new record never asks); a refused save
    // makes the form unsaved again.
    const submitting = () => setDirty(false);
    const failed = () => setDirty(true);
    form.addEventListener("input", changed);
    form.addEventListener("change", changed);
    form.addEventListener(SAVED_EVENT, clean);
    form.addEventListener("reset", clean);
    form.addEventListener("submit", submitting);
    form.addEventListener(SAVE_FAILED_EVENT, failed);
    return () => {
      form.removeEventListener("input", changed);
      form.removeEventListener("change", changed);
      form.removeEventListener(SAVED_EVENT, clean);
      form.removeEventListener("reset", clean);
      form.removeEventListener("submit", submitting);
      form.removeEventListener(SAVE_FAILED_EVENT, failed);
    };
  }, []);

  useEffect(() => {
    if (!dirty) return;
    const beforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    // Seen on the way down (capture), before Next's Link takes the click.
    const onClick = (event: MouseEvent) => {
      if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      const link = (event.target as HTMLElement | null)?.closest?.("a[href]") as HTMLAnchorElement | null;
      if (!link || link.target === "_blank" || link.hasAttribute("download") || anchor.current?.closest("form")?.contains(link)) return;
      const url = new URL(link.href, window.location.href);
      if (url.origin !== window.location.origin || (url.pathname === window.location.pathname && url.search === window.location.search)) return;
      held.add(event);
      event.preventDefault();
      event.stopPropagation();
      setLeaveTo(url.pathname + url.search + url.hash);
    };
    window.addEventListener("beforeunload", beforeUnload);
    document.addEventListener("click", onClick, true);
    return () => {
      window.removeEventListener("beforeunload", beforeUnload);
      document.removeEventListener("click", onClick, true);
    };
  }, [dirty]);

  return (
    <>
      <span ref={anchor} hidden />
      <ConfirmDialog
        open={leaveTo !== null}
        onCancel={() => setLeaveTo(null)}
        onConfirm={() => {
          const to = leaveTo;
          setDirty(false);
          setLeaveTo(null);
          if (to) router.push(to);
        }}
        title="Leave without saving?"
        body="You changed this form but haven't saved it. If you leave now, the changes are lost."
        confirmLabel="Leave without saving"
        tone="danger"
      />
    </>
  );
}
