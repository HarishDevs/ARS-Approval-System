"use client";

import Link from "next/link";
import { dismissOnboardingAction } from "@/app/users/help-actions";
import { ResultMessage, SubmitButton, useActionForm } from "@/features/ui/form";

// First-use checklist (#13) on My Work until the person hides it.
const STEPS: { text: string; href: string; link: string }[] = [
  { text: "Raise a request: pick a type, fill in the form, add files. Your typing is saved as a draft as you go.", href: "/users/new", link: "Request templates" },
  { text: "Approve from Waiting for me: open a request and choose Approve, Ask for changes, Put on hold or Reject.", href: "/users/queue", link: "Waiting for me" },
  { text: "Going on leave? Name someone to approve for you.", href: "/users/delegation", link: "Out of office" },
  { text: "Choose which messages also come by email or WhatsApp.", href: "/users/notifications/settings", link: "Notification settings" },
  { text: "What do the statuses mean? Find anything with search.", href: "/users/help", link: "Help" },
];

export function FirstUseChecklist() {
  const { result, pending, onSubmit } = useActionForm(dismissOnboardingAction);
  return (
    <section aria-labelledby="first-use" className="card mb-6 border-primary-600/40 px-5 py-4">
      <h2 id="first-use" className="font-semibold">
        New here? Five things to know
      </h2>
      <ol className="mt-2 list-decimal space-y-1.5 pl-5 text-label">
        {STEPS.map((step) => (
          <li key={step.href}>
            {step.text}{" "}
            <Link href={step.href} className="link">
              {step.link}
            </Link>
          </li>
        ))}
      </ol>
      <form onSubmit={onSubmit} className="mt-3 flex flex-wrap items-center gap-3">
        {/* v1.14.0 (D-167): the guided tour shows each of these on its page. */}
        <Link href="/users?tour=1" className="btn-primary btn-compact">
          Take the tour
        </Link>
        <SubmitButton pending={pending} variant="secondary" className="btn-compact">
          Got it, hide this
        </SubmitButton>
        <ResultMessage result={result} />
      </form>
    </section>
  );
}
