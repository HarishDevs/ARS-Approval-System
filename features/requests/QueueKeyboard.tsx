"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef } from "react";
import { isTyping } from "@/features/shell/shortcuts";

// WS-02 keyboard for Waiting for me: J / K move between requests, Enter
// opens one, A opens it ready to approve and C ready to ask for changes.
// A and C never decide anything here: the request page asks first.
// Keys do nothing while typing in a field.
export function QueueKeyboard({ children }: { children: React.ReactNode }) {
  const box = useRef<HTMLDivElement>(null);
  const router = useRouter();
  useEffect(() => {
    const links = () => [...(box.current?.querySelectorAll<HTMLAnchorElement>("a[data-queue-link]") ?? [])].filter((link) => link.offsetParent !== null);
    const onKey = (event: KeyboardEvent) => {
      if (event.ctrlKey || event.metaKey || event.altKey || isTyping(event.target)) return;
      const all = links();
      if (all.length === 0) return;
      const index = all.indexOf(document.activeElement as HTMLAnchorElement);
      const key = event.key.toLowerCase();
      if (key === "j" || key === "k") {
        event.preventDefault();
        const next = key === "j" ? Math.min(all.length - 1, index + 1) : Math.max(0, index === -1 ? 0 : index - 1);
        all[next]?.focus();
        all[next]?.scrollIntoView({ block: "nearest" });
      } else if ((key === "a" || key === "c") && index >= 0) {
        event.preventDefault();
        const href = all[index]!.getAttribute("href");
        if (href) router.push(`${href}?act=${key === "a" ? "approve" : "changes"}`);
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [router]);
  return <div ref={box}>{children}</div>;
}
