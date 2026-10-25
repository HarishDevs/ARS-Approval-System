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
