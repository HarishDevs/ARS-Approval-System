"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { BellRing, CalendarDays, GitBranch, ListChecks, Sparkles } from "lucide-react";
import { MailLink } from "@/features/ui/MailLink";

// D-190 (owner): the welcome on the split layout. Signing in fades this out
// and the sign-in form fades in (AuthLayout's .auth-enter), while the brand
// panel and logo stay where they are. Without JavaScript, or with reduced
// motion, it is a plain link to /login.
// D-200 (owner chose the split screen back, made Google-safe): Google's OAuth
// review rejected the bare welcome as "behind a login page", "doesn't explain
// the purpose" and "name doesn't match". So the welcome itself names ARS CMS,
// says what it is for, lists what people can do, who can use it and how
// Google data is used, and links the privacy policy, on every screen size.
const SIGN_IN = "/login";
const LEAVE_MS = 200;

const FEATURES = [
  { icon: GitBranch, text: "Multi-level approvals: route a request through as many levels as it needs" },
  { icon: BellRing, text: "Information notices: share updates and see who acknowledged them" },
  { icon: ListChecks, text: "Tasks & projects: assign work with due dates, repeat it, and follow projects on lists and boards" },
  { icon: CalendarDays, text: "Google Calendar (optional): your own due dates in your calendar" },
  { icon: Sparkles, text: "AI Assistant (for people IT chooses): answers from your own work data" },
] as const;

export function LandingWelcome() {
  const router = useRouter();
  const [leaving, setLeaving] = useState(false);
  useEffect(() => router.prefetch(SIGN_IN), [router]);

  return (
    <div className={leaving ? "auth-leave" : undefined}>
      <p className="mt-10 text-label font-semibold uppercase tracking-[0.14em] text-primary-600">Central Management System</p>
      <h1 className="mt-2 text-[clamp(2rem,4vw,2.75rem)] font-bold leading-tight tracking-tight text-ink">ARS CMS</h1>
      <p data-testid="landing-purpose" className="mt-3 text-[clamp(0.9375rem,1.4vw,1.0625rem)] leading-relaxed text-ink-muted">
        The internal workplace app of ARS Steels &amp; Alloy International Pvt. Ltd. Employees use it to raise and approve requests, share information and track tasks in one place.
      </p>

      <h2 className="sr-only">What you can do in ARS CMS</h2>
      <ul className="mt-5 space-y-2.5">
        {FEATURES.map(({ icon: Icon, text }) => (
          <li key={text} className="flex gap-3 text-body text-ink">
            <Icon aria-hidden="true" className="mt-0.5 h-5 w-5 shrink-0 text-primary-600" />
            <span>{text}</span>
          </li>
        ))}
      </ul>

      <a
        href={SIGN_IN}
        className="btn-primary mt-7"
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
        Sign in <span aria-hidden="true">→</span>
      </a>

      <p className="mt-6 text-caption leading-relaxed text-ink-muted">
        For ARS employees only; IT creates every account (<MailLink address="itadmin@arssteels.co.in" />). Google sign-in only confirms who you are. Google Calendar is used only if you connect it,
        and only for your own dates; Google data is never sold, used for ads or used to train AI. See the{" "}
        <Link href="/privacy" className="link">
          privacy policy
        </Link>
        .
      </p>
    </div>
  );
}
