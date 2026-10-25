import type { Metadata } from "next";
import packageJson from "@/package.json";
import { requireArea } from "@/server/authorization/guards";
import { PageHeader } from "@/features/shell/PageHeader";
import { HelpTopics, type HelpTopic } from "@/features/help/HelpTopics";
import { CopyForIt } from "@/features/help/CopyForIt";
import { Hint } from "@/features/ui/Hint";
import Link from "next/link";

// WEB-05 (v1.10.0): a plain, non-confidential browser title.
export const metadata: Metadata = { title: "Help" };

// #13 help page: how-tos, the status words used everywhere (D-017), and
// "Copy details for IT".
const TOPICS: HelpTopic[] = [
  { id: "raise", group: "How to", title: "Raise a request", body: "Choose New request, pick the type, fill in the form and add files. Your typing is saved as a draft as you go; you can come back to it from Overview.", link: { href: "/users/new", label: "New request" } },
  { id: "custom", group: "How to", title: "Ask anyone for approval (custom approval)", body: "Custom approval lets you set your own levels and pick the approvers (Manager and above). Nobody approves their own request.", link: { href: "/users/custom", label: "Custom approval" } },
  { id: "decide", group: "How to", title: "Approve, reject, ask for changes or put on hold", body: "Open the request from Waiting for me. Approve or Reject; Ask for changes sends it back to the requester; Put on hold pauses it (the response time stops) until it is resumed.", link: { href: "/users/queue", label: "Waiting for me" } },
  { id: "bulk", group: "How to", title: "Approve several at once", body: "On Waiting for me, tick straightforward approvals and review them before approving. Work tasks and requests on hold are done one by one.", link: { href: "/users/queue", label: "Waiting for me" } },
  { id: "todo", group: "How to", title: "To do (work tasks)", body: "Some steps are tasks to do rather than decisions, for example raising a PO. They show a To do badge in Waiting for me; open the request and choose Mark as done." },
  { id: "draft", group: "How to", title: "Drafts", body: "A request you started but didn't submit is kept for 30 days. Open it from Overview to carry on, or discard it. Submitting removes the draft." },
  { id: "search", group: "How to", title: "Find a request", body: "Search looks through the requests you can see by number, title, type, status and dates. Save a search as a view to reuse it.", link: { href: "/users/search", label: "Search" } },
  { id: "mention", group: "How to", title: "Mention someone in a comment", body: "Type @ and their User ID. Only people who can already see the request are told; you are shown anyone who wasn't." },
  { id: "pdf", group: "How to", title: "Download a summary", body: "On a request, Download PDF gives the details, levels, decisions and history in one file." },
  { id: "ooo", group: "How to", title: "Going on leave (out of office)", body: "Name someone to approve for you between two dates (India time). They see approvals already waiting and new ones; both names are recorded. You can end it early.", link: { href: "/users/delegation", label: "Out of office" } },
  { id: "notify", group: "How to", title: "Choose email and WhatsApp messages", body: "Approvals waiting for you and security messages always come. Updates on your requests, reminders, comments and FYIs can be switched off by channel. The Notifications list in the app always has everything.", link: { href: "/users/notifications/settings", label: "Notification settings" } },
  { id: "it", group: "How to", title: "Something isn't working", body: "Use Copy details for IT below and paste it in your message to IT, with what you were doing. It doesn't include anything private." },
  { id: "s-progress", group: "Statuses", title: "In progress", body: "Waiting for approval at one or more levels." },
  { id: "s-hold", group: "Statuses", title: "On hold", body: "An approver paused it. Nothing moves and the response time stops until it is resumed." },
  { id: "s-changes", group: "Statuses", title: "Changes required", body: "An approver asked the requester to change something. The requester edits and resubmits it." },
  { id: "s-approved", group: "Statuses", title: "Approved", body: "Every required level approved. It is finished." },
  { id: "s-rejected", group: "Statuses", title: "Rejected", body: "An approver rejected it. It is finished and never counts as approved." },
  { id: "s-withdrawn", group: "Statuses", title: "Withdrawn", body: "The requester withdrew it before it finished." },
  { id: "t-waiting", group: "Approval steps", title: "Not started / Waiting for approval", body: "A level that hasn't been reached yet, or one waiting for its approvers now." },
  { id: "t-skipped", group: "Approval steps", title: "Skipped / Not needed", body: "A level the rules left out for this request (for example below an amount), or one that wasn't needed once others decided." },
  { id: "t-blocked", group: "Approval steps", title: "Blocked", body: "Nobody could be found for a level (for example no HOD set). IT is told and can choose who decides." },
  { id: "t-overdue", group: "Approval steps", title: "Due soon / Overdue", body: "A level can have a response time in working hours. You get a heads-up when it is nearly due, a reminder when it is overdue, and then the manager is told." },
];

export default async function HelpPage() {
  await requireArea("users");
  return (
    <>
      <PageHeader title="Help" description="How things work, and what each word on the screen means." />
      <div className="max-w-4xl space-y-6">
        {/* v1.14.0 (D-167): the guided tour of Approvals, Tasks and Calendar. */}
        <section className="card flex flex-wrap items-center justify-between gap-3 px-5 py-4" data-testid="help-tour">
          <div className="min-w-0">
            <h2 className="flex items-center gap-1.5 font-semibold">
              New here? Take the tour
              <Hint text="About two minutes: raising and approving requests, tasks, the calendar, notifications and where to find things." align="start" />
            </h2>
          </div>
          <Link href="/users?tour=1" className="btn-primary btn-compact">
            Take the tour
          </Link>
        </section>
        <HelpTopics topics={TOPICS} />
        <section className="card space-y-2 px-5 py-4">
          <h2 className="flex items-center gap-1.5 font-semibold">
            Need IT?
            <Hint text="Copy these details and paste them in your message, with what you were doing and the request number if there is one." align="start" />
          </h2>
          <CopyForIt version={packageJson.version} />
        </section>
      </div>
    </>
  );
}
