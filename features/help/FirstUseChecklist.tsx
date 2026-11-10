"use client";

import Link from "next/link";
import { dismissOnboardingAction } from "@/app/users/help-actions";
import { ResultMessage, SubmitButton, useActionForm } from "@/features/ui/form";

// First-use checklist (#13) on My Work until the person hides it.
const STEPS: { text: string; href: string; link: string }[] = [
  { text: "Raise a request: pick a type, fill in the form, add files. Your typing is saved as a draft as you go.", href: "/users/custom", link: "New request" },
  { text: "Approve from Waiting for me: open a request and choose Approve, Ask for changes, Put on hold or Reject.", href: "/users/queue", link: "Waiting for me" },
  { text: "Going on leave? Name someone to approve for you.", href: "/users/delegation", link: "Out of office" },
  { text: "Give a task: Create → Task. Type / in the description for the menu, @ to mention someone.", href: "/users/work/my-tasks", link: "My Tasks" },
  { text: "Run a meeting: schedule it, send the points to the Meeting Owner, then the MOM. Action items become tasks.", href: "/users/meetings", link: "Meetings" },
  { text: "Choose which messages also come by email or WhatsApp (Profile → Notifications). Everything is in your Inbox.", href: "/users/notifications/settings", link: "Notifications" },
  { text: "Install the app and turn on notifications on your phone (Profile → App & devices).", href: "/users/profile/devices", link: "App & devices" },
  { text: "What does each screen and status mean? Find anything with the search bar at the top.", href: "/users/help", link: "Help" },
];

const COUNT = ["", "One", "Two", "Three", "Four", "Five", "Six", "Seven"];

// v1.49.5: steps for pages the person doesn't have (a requester has no Waiting for me) are left out.
export function FirstUseChecklist({ hidden = [] }: { hidden?: readonly string[] }) {
  const { result, pending, onSubmit } = useActionForm(dismissOnboardingAction);
  const steps = STEPS.filter((step) => !hidden.includes(step.href));
  return (
    <section aria-labelledby="first-use" className="card mb-6 border-primary-600/40 px-5 py-4">
      <h2 id="first-use" className="font-semibold">
        New here? {COUNT[steps.length] ?? steps.length} things to know
      </h2>
      <ol className="mt-2 list-decimal space-y-1.5 pl-5 text-label">
        {steps.map((step) => (
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
