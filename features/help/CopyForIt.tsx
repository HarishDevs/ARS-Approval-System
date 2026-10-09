"use client";

import { useState } from "react";

// #13/#14 "Copy details for IT": what IT needs to find a problem, and
// nothing private (no cookies, no form contents, no address query).
export function itDetails(input: { reference: string; digest?: string; version?: string; path: string; userAgent: string; screen: string; now: Date }): string {
  const time = new Intl.DateTimeFormat("en-IN", { timeZone: "Asia/Kolkata", dateStyle: "medium", timeStyle: "medium" }).format(input.now);
  return [
    "ARS Approvals: details for IT",
    `Time: ${time} (India)`,
    `Page: ${input.path}`,
    input.reference ? `Reference: ${input.reference}` : null,
    input.digest ? `Error code: ${input.digest}` : null,
    input.version ? `App version: ${input.version}` : null,
    `Browser: ${input.userAgent}`,
    `Screen: ${input.screen}`,
  ]
    .filter(Boolean)
    .join("\n");
}

export function CopyForIt({ digest, version }: { digest?: string; version?: string }) {
  const [state, setState] = useState<"idle" | "copied" | "shown">("idle");
  const [text, setText] = useState("");
  const copy = async () => {
    const details = itDetails({
      reference: document.querySelector<HTMLMetaElement>('meta[name="ars-request-id"]')?.content ?? "",
      digest,
      version,
      path: window.location.pathname,
      userAgent: navigator.userAgent,
      screen: `${window.innerWidth}×${window.innerHeight}`,
      now: new Date(),
    });
    setText(details);
    try {
      await navigator.clipboard.writeText(details);
      setState("copied");
    } catch {
      setState("shown");
    }
  };
  return (
    <div className="space-y-2">
      <button type="button" onClick={copy} className="btn-secondary btn-compact">
        {state === "copied" ? "Copied. Paste it in your message to IT" : "Copy details for IT"}
      </button>
      {state === "shown" && <textarea readOnly value={text} rows={7} aria-label="Details for IT" className="field-input h-auto w-full py-2 font-mono text-caption" />}
    </div>
  );
}
