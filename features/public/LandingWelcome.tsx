"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

// D-190 (owner): the welcome on the split layout. Signing in fades this out
// and the sign-in form fades in (AuthLayout's .auth-enter), while the brand
// panel and logo stay where they are. Without JavaScript, or with reduced
// motion, it is a plain link to /login.
const SIGN_IN = "/login";
const LEAVE_MS = 200;

export function LandingWelcome() {
  const router = useRouter();
  const [leaving, setLeaving] = useState(false);
  useEffect(() => router.prefetch(SIGN_IN), [router]);

  return (
    <div className={leaving ? "auth-leave" : undefined}>
      <p className="mt-10 text-label font-semibold uppercase tracking-[0.14em] text-primary-600">Central Management System</p>
      <h1 className="mt-2 text-[clamp(1.75rem,4vw,2.75rem)] font-bold leading-tight tracking-tight text-ink">Welcome to ARS-CMS</h1>
      <p className="mt-3 text-[clamp(0.9375rem,1.4vw,1.0625rem)] text-ink-muted">One workspace. Everything you need to work.</p>
      {/* D-197: Google's OAuth review needs the home page itself (on a phone
          too, where the brand panel is hidden) to say what the app is for. */}
      <p data-testid="landing-purpose" className="mt-4 text-body leading-relaxed text-ink-muted">
        ARS-CMS is the internal app of ARS Steels &amp; Alloy International Pvt. Ltd. Employees use it to raise and approve requests through any number of approval levels, share
        information, track tasks and, if they choose, keep their due dates in their Google Calendar. Accounts are created by the ARS IT team.
      </p>
      <a
        href={SIGN_IN}
        className="btn-primary mt-8"
        onClick={(event) => {
          if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || event.button !== 0) return; // a new tab or window
          event.preventDefault();
          if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
            router.push(SIGN_IN);
            return;
          }
          setLeaving(true);
          window.setTimeout(() => router.push(SIGN_IN), LEAVE_MS);
        }}
      >
        Sign in to continue <span aria-hidden="true">→</span>
      </a>
    </div>
  );
}
