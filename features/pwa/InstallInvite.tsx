"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import { usePathname } from "next/navigation";
import { Download, PlusSquare, Share, X } from "lucide-react";
import { canPromptInstall, inviteState, isDesktopSafari, isStandalone, platform, promptInstall, rememberInvite, subscribeInstall } from "@/features/pwa/browser";
import { dismissInstallInviteAction } from "@/app/users/pwa-actions";
import { APP_BRANDING } from "@/lib/branding";

// D-251 (owner): the first-visit invitation to install the app. Shown once
// per device (and once per account when signed in), a few seconds after the
// page settles, never in the installed app and never over a sign-in form.
// Android and desktop Chrome/Edge: the browser's own install; iPhone and
// iPad: the Share → Add to Home Screen steps; Safari on a Mac: Add to Dock.
const QUIET_PATHS = /^\/(login|set-password|forgot-password|signed-out|security|try|privacy|terms)(\/|$)/;
const DELAY_MS = 2500;

type Mode = "prompt" | "ios" | "mac-safari";

export function InstallSteps({ mode }: { mode: "ios" | "mac-safari" }) {
  if (mode === "mac-safari") {
    return (
      <ol className="mt-2 list-decimal space-y-1 pl-5 text-label">
        <li>
          In Safari&apos;s menu bar choose <strong>File</strong> → <strong>Add to Dock</strong>.
        </li>
        <li>
          Press <strong>Add</strong>. ARS CMS opens from the Dock in its own window.
        </li>
      </ol>
    );
  }
  return (
    <ol className="mt-2 space-y-1.5 text-label" data-testid="ios-steps">
      <li className="flex items-center gap-2">
        <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-primary-50 text-caption font-semibold text-primary-700">1</span>
        <span>
          Tap <Share className="inline h-4 w-4 align-text-bottom" aria-label="Share" /> <strong>Share</strong> in Safari&apos;s toolbar.
        </span>
      </li>
      <li className="flex items-center gap-2">
        <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-primary-50 text-caption font-semibold text-primary-700">2</span>
        <span>
          Choose <PlusSquare className="inline h-4 w-4 align-text-bottom" aria-hidden="true" /> <strong>Add to Home Screen</strong> (scroll the list if you don&apos;t see it).
        </span>
      </li>
      <li className="flex items-center gap-2">
        <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-primary-50 text-caption font-semibold text-primary-700">3</span>
        <span>
          Tap <strong>Add</strong>, then open ARS CMS from your Home Screen.
        </span>
      </li>
    </ol>
  );
}

export function InstallInvite() {
  const pathname = usePathname();
  const promptReady = useSyncExternalStore(subscribeInstall, canPromptInstall, () => false);
  const [eligible, setEligible] = useState(false);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    // Decided once the page has settled, so it never flashes on a quick visit.
    const timer = window.setTimeout(() => setEligible(!isStandalone() && inviteState() === null), DELAY_MS);
    return () => window.clearTimeout(timer);
  }, []);

  const mode: Mode | null = promptReady ? "prompt" : platform() === "ios" ? "ios" : isDesktopSafari() ? "mac-safari" : null;
  useEffect(() => {
    setOpen(eligible && mode !== null && !QUIET_PATHS.test(pathname ?? ""));
  }, [eligible, mode, pathname]);

  if (!open || !mode) return null;

  const later = () => {
    rememberInvite("dismissed");
    setOpen(false);
    setEligible(false);
    if (pathname?.startsWith("/users")) void dismissInstallInviteAction().catch(() => undefined);
  };
  const install = async () => {
    setBusy(true);
    const outcome = await promptInstall();
    setBusy(false);
    if (outcome === "accepted") {
      rememberInvite("installed");
      setOpen(false);
    }
  };

  return (
    <aside
      role="dialog"
      aria-modal="false"
      aria-labelledby="install-invite-title"
      data-testid="install-invite"
      className="fixed inset-x-3 bottom-[calc(env(safe-area-inset-bottom)+72px)] z-[60] mx-auto max-w-md rounded-xl border border-line bg-raised p-4 shadow-overlay motion-safe:animate-[fadeIn_200ms_ease-out] sm:inset-x-auto sm:bottom-6 sm:right-6 sm:mx-0 sm:w-[380px] lg:bottom-6"
    >
      <div className="flex items-start gap-3">
        {/* eslint-disable-next-line @next/next/no-img-element -- small static app icon */}
        <img src={APP_BRANDING.icon} alt="" width={44} height={44} className="h-11 w-11 shrink-0 rounded-lg" />
        <div className="min-w-0 flex-1">
          <h2 id="install-invite-title" className="font-semibold">
            Install ARS CMS
          </h2>
          <p className="mt-0.5 text-label text-ink-muted">Get faster access to your workplace app. Install it on this device for an app-like experience and notifications.</p>
          {mode !== "prompt" && <InstallSteps mode={mode} />}
        </div>
        <button type="button" onClick={later} aria-label="Close" className="-mr-1 -mt-1 grid h-9 w-9 shrink-0 place-items-center rounded-md text-ink-muted hover:bg-surface-muted hover:text-ink">
          <X className="h-4 w-4" />
        </button>
      </div>
      <div className="mt-3 flex flex-wrap justify-end gap-2">
        <button type="button" onClick={later} className="btn-secondary">
          Maybe later
        </button>
        {mode === "prompt" ? (
          <button type="button" onClick={() => void install()} disabled={busy} className="btn-primary inline-flex items-center gap-1.5">
            <Download className="h-4 w-4" aria-hidden="true" />
            {busy ? "Opening…" : "Install app"}
          </button>
        ) : (
          <button type="button" onClick={later} className="btn-primary">
            Got it
          </button>
        )}
      </div>
    </aside>
  );
}

// Signed in: an account that said "Maybe later" on another device isn't asked
// again here, even after this browser's storage was cleared.
export function InstallInviteAccountSync({ dismissed }: { dismissed: boolean }) {
  useEffect(() => {
    if (dismissed && inviteState() === null) rememberInvite("dismissed");
  }, [dismissed]);
  return null;
}
