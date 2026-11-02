import type { Metadata } from "next";
import { LifeBuoy } from "lucide-react";
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
// D-249 (owner: "Help includes all the features built new"): every module and
// screen people use, as of v1.40.0.
const TOPICS: HelpTopic[] = [
  { id: "home", group: "Getting around", title: "Home", body: "Approvers open on the Approval Overview, everyone else on My Work; switch at the top. Approval Overview: cards for what's waiting, overdue, your open requests and changes asked; Waiting for me; your drafts, recently viewed and Quick insights for a period. My Work: Total, Upcoming, Overdue and Completed for a period, My Tasks, projects with progress, the latest updates and your weekly workload.", link: { href: "/users", label: "Home" } },
  { id: "sidebar", group: "Getting around", title: "The sidebar", body: "Home, Inbox, My Approvals, Tasks & projects, Information, Calendar and Analytics (what your access includes). Groups open and close; ☰ folds the sidebar to icons and the app remembers it. On a phone, see On your phone." },
  { id: "request-page", group: "Getting around", title: "The request page and its journey", body: "The Approval Journey card shows the request's status, the road with every level and the van where it is now, the Request Status ring and the detailed levels; refresh checks for news, share copies the link. Below: Request details, Approval levels (who it waits for, progress, time in process), your actions and Attachments, Collaborators and Discussion on the right, then Linked requests, the Timeline (the latest 3, Show more for the rest) and Reuse. Colours: blue in progress, amber on hold, orange changes required, green approved, red rejected, purple withdrawn, grey expired.", link: { href: "/users/requests", label: "My requests" } },
  { id: "priority", group: "Getting around", title: "Priority and coloured choices", body: "If a request's form has a Priority field (a choice with the key priority), its value shows in colour beside the title, in a Priority column on the request lists (sort or group by it in the order IT set the options) and on Home. IT gives each option of a Dropdown, Radio or Multi-select field a colour in the Form Designer; those values show as coloured pills wherever they appear. Tasks show their priority (Urgent, High, Low) the same way.", link: { href: "/users/requests", label: "My requests" } },
  { id: "phone", group: "Getting around", title: "On your phone", body: "Below 768 pixels ARS-CMS uses its phone layout, laid out like the Asana app (a computer is unchanged). Tabs at the bottom: Home, Approvals, My tasks, Inbox and More. Each list has a big title with … (more pages), and a floating bar: Manage view (Compact mode, sort, group, filters), Choose view (which list) and the red + (new request or task). Tick a task's circle to complete it. On a task: back, Mark complete, copy link and … (its actions); Add a comment stays at the bottom of the screen. Information, New request (one slim row of steps and buttons) and Analytics (filters folded into one row) fit the phone too. Inbox is grouped by day; Choose view has All activity, Bookmarks and Archived. Search (the magnifier) searches requests or tasks and has quick filters. More has your profile, Out of office, Notifications, settings, help and Sign out. On a request, Approve, Return, Hold and Reject stay at the bottom. While a page loads you see the shape of that screen.", link: { href: "/users", label: "Home" } },
  { id: "create", group: "Getting around", title: "Create", body: "The Create button at the top of the sidebar makes anything new: an approval request, a task, a project or a notice (what you're allowed to make)." },
  { id: "search", group: "Getting around", title: "Search everything", body: "The search bar at the top (or Ctrl K) finds requests, tasks, projects, people, notices and pages. Filters opens a full search of requests by number, title, type, status and dates; save a search as a view to reuse it.", link: { href: "/users/search", label: "Full search" } },
  { id: "classic", group: "Getting around", title: "Compact or Classic view", body: "Account menu → View. Compact is this layout. Classic shows Tally-style screens: a gateway of modules with letter keys, Label : value forms, Enter moves to the next field, Ctrl+A accepts, Esc goes back. Text size can be changed in Classic." },
  { id: "install", group: "Getting around", title: "Install the app", body: "ARS-CMS installs like an app and opens in its own window. Android, Chrome or Edge: Install app (on the first visit, or the browser's install icon). iPhone and iPad: Share → Add to Home Screen → Add. Safari on a Mac: File → Add to Dock.", link: { href: "/users/profile/devices", label: "App & devices" } },
  { id: "tour", group: "Getting around", title: "The tour", body: "A short walk through the main screens. Take it again any time from this page or your account menu." },
  { id: "raise", group: "How to", title: "Raise a request", body: "Choose Request templates, pick the type, fill in the form and add files. Your typing is saved as a draft as you go; you can come back to it from Home.", link: { href: "/users/new", label: "Request templates" } },
  { id: "custom", group: "How to", title: "Ask anyone for approval (New request)", body: "New request lets you set your own levels and pick the approvers (Manager and above); your reporting manager is filled in first. Nobody approves their own request. A finished request can be raised again with the same approvers. Fields with a red * are required: Next moves on only when they're filled in, and the approvers can be changed only after Next. A level can be an Approval, a Work task (it also appears in their My Tasks; ticking it there marks it done on the request; untick 'The request waits until it's done' to give it as tasks without holding the request up) or an FYI (they're told and can open the request; put it after the last approval to tell them only on full approval).", link: { href: "/users/custom", label: "New request" } },
  { id: "decide", group: "How to", title: "Approve, reject, ask for changes or put on hold", body: "Open the request from Waiting for me. Approve; Reject (it asks first: it can't be undone); Ask for changes sends it back to the requester; Put on hold pauses it (the response time stops) until it is resumed. After a decision, Next waiting for you opens the next one.", link: { href: "/users/queue", label: "Waiting for me" } },
  { id: "bulk", group: "How to", title: "Approve several at once", body: "On Waiting for me, tick straightforward approvals and review them before approving. Work tasks and requests on hold are done one by one.", link: { href: "/users/queue", label: "Waiting for me" } },
  { id: "todo", group: "How to", title: "To do (work steps)", body: "Some steps are tasks to do rather than decisions, for example raising a PO. They show a To do badge in Waiting for me; open the request and choose Mark as done." },
  { id: "road", group: "How to", title: "Where my request is (the journey)", body: "On a request, the approval journey at the top shows submitted, one point per level, then the finish flag. The ARS van waits beside the level deciding now, with the request out for review; an approval stamps it green, it goes back into the van and the van drives on; at the flag the road turns green (100%). Red stamp: rejected; orange: changes asked (the van drives back until you resubmit). Work tasks and Information (FYI) are shown beside the road with their own status. Tap a point for who decides there, when and their comments. It checks for news every 10 seconds. Below it, Request details starts with who raised it and their department; your action box, Attachments and Collaborators are on the right." },
  { id: "my-list", group: "How to", title: "My requests: cards, columns and actions", body: "Raised by me / Shared with me, with a card per status (Overdue requests also count under Waiting). Search by number, title, type or the person it waits on; Filter, Sort, Group and Columns (kept on your account). The progress column opens the road; ⋮ has what you can do with that request.", link: { href: "/users/requests", label: "My requests" } },
  { id: "draft", group: "How to", title: "Drafts", body: "A request you started but didn't submit is kept for 30 days. Open it from Home to carry on, or discard it. Submitting removes the draft." },
  { id: "mention", group: "How to", title: "Mention someone", body: "In a comment or a task description, type @ and part of their name, then pick them. Only people who can see the record are told; you are shown anyone who wasn't." },
  { id: "pdf", group: "How to", title: "Download a summary", body: "On a request, Download PDF gives the details, levels, decisions and history in one file." },
  { id: "amend", group: "How to", title: "Change an approved request", body: "Where the approval type allows it, Amend on an approved request changes the allowed fields with a reason; the approvals run again for the change." },
  { id: "my-tasks", group: "Tasks & projects", title: "My Tasks", body: "Everything given to you, from every project, in your own sections (Overdue, Recently assigned, Today, Upcoming, Later; add your own). Tick to complete; click a name to open it beside the list. List, Board and Calendar views; Filter, Sort and Group. Click a cell in the table to change the due date, assignee, priority, collaborators or tags.", link: { href: "/users/work/my-tasks", label: "My Tasks" } },
  { id: "new-task", group: "Tasks & projects", title: "Give a task (Create task)", body: "Create → Task (or Q in Tasks & projects). Name it; For Myself, or Others (type part of a name); pick a project. In the description type / for the menu, @ to mention, or paste a screenshot to attach it. Task settings: due date, priority, repeat, collaborators. An ad hoc task can go to several people (one copy each)." },
  { id: "periodic", group: "Tasks & projects", title: "Periodic tasks", body: "A task with a repeat makes its next one when it is completed (daily, weekly on chosen days, monthly, yearly, or a number of days after completion). Periodic tasks lists them all.", link: { href: "/users/work/periodic", label: "Periodic tasks" } },
  { id: "projects", group: "Tasks & projects", title: "Projects", body: "Group tasks into a project with sections. Views: List, Board, Calendar, Timeline and Overview (status updates). Members and permissions decide who sees and changes what; templates start a new project ready-made.", link: { href: "/users/work/projects", label: "All projects" } },
  { id: "task-form", group: "Tasks & projects", title: "Tasks with a form", body: "Some task types IT set up have their own form (Task with a type). They work like other tasks, with the form's fields on the task.", link: { href: "/users/tasks/new", label: "Task with a type" } },
  { id: "inbox", group: "Inbox, information and calendar", title: "Inbox", body: "Every message ARS sends you: approvals, tasks, information and system messages. Open one to go to it; Bookmark what you'll come back to and Archive what's done. Mark all as read can be undone.", link: { href: "/users/inbox", label: "Inbox" } },
  { id: "information", group: "Inbox, information and calendar", title: "Information (notices)", body: "Circulars and notices for you are in the Information inbox; press Acknowledge when a notice asks. With permission, New information sends one to people, departments or everyone.", link: { href: "/users/information", label: "Information inbox" } },
  { id: "calendar", group: "Inbox, information and calendar", title: "Calendar", body: "Approvals due from you, your tasks' due dates, your requests' needed-by dates and information dates, by Month, Week, Day or Agenda (a list). The Show dropdown shows or hides each kind and counts its entries. Add private entries of your own. Profile → Calendar connects Google Calendar (optional).", link: { href: "/users/calendar", label: "Calendar" } },
  { id: "analytics", group: "Inbox, information and calendar", title: "Analytics", body: "Numbers for your requests, your approvals, your tasks (My tasks), your team or your department (as your access allows): approvals, tasks and information, with drill-down lists. Each dashboard comes in pages that fit the screen.", link: { href: "/users/analytics", label: "Analytics" } },
  { id: "ai", group: "Inbox, information and calendar", title: "AI Assistant (Pico Bot)", body: "If IT gave you access: ask in plain words for answers, dashboards and insights from your data. It reads only what you may see and can't approve, send or change anything. Check important figures before relying on them. In a Draft task, ✨ can write the description." },
  { id: "profile", group: "Your account", title: "Profile and photo", body: "Your details from IT, your manager and team, and your access. Add a photo and a few words About me; colleagues see them on your card.", link: { href: "/users/profile", label: "Profile" } },
  { id: "push", group: "Your account", title: "Phone and desktop notifications", body: "Profile → App & devices → Turn on notifications on this device, on each phone or computer you use. They come even when the app is closed or you're signed out; choose which kinds under Profile → Notifications → Phone & desktop. On iPhone and iPad they work in the installed app. Remove a device you no longer use.", link: { href: "/users/profile/devices", label: "App & devices" } },
  { id: "session", group: "Your account", title: "How long you stay signed in", body: "On a phone, a tablet or the installed app: until midnight (India time), even if you close the app. On a computer: until a while without activity (IT sets it), and at most 12 hours. Keep your devices locked." },
  { id: "notify", group: "Your account", title: "Notifications (what reaches you)", body: "Profile → Notifications: choose kind by kind what reaches you in the app, by email and on WhatsApp. Approvals waiting for you and security messages always come. Do not disturb pauses them for a while, outside your hours or on days off. The Inbox always has everything.", link: { href: "/users/notifications/settings", label: "Notifications" } },
  { id: "ooo", group: "Your account", title: "Going on leave (out of office)", body: "Name someone to approve for you between two dates (India time). They see approvals already waiting and new ones; both names are recorded. You can end it early.", link: { href: "/users/delegation", label: "Out of office" } },
  { id: "security", group: "Your account", title: "Sign-in & devices", body: "Where and when you signed in, and the devices you use. Sign out of other devices if something looks wrong, and tell IT.", link: { href: "/users/security", label: "Sign-in & devices" } },
  { id: "it", group: "Your account", title: "Something isn't working", body: "Use Copy details for IT below and paste it in your message to IT, with what you were doing. It doesn't include anything private." },
  { id: "s-progress", group: "Statuses", title: "In progress", body: "Waiting for approval at one or more levels." },
  { id: "s-hold", group: "Statuses", title: "On hold", body: "An approver paused it. Nothing moves and the response time stops until it is resumed." },
  { id: "s-changes", group: "Statuses", title: "Changes required", body: "An approver asked the requester to change something. The requester edits and resubmits it; the same checks as a new request apply. If the new details change which levels are needed (for example a higher amount), it starts again from the first level affected; approvals before it stand, and the history says which levels were added or removed." },
  { id: "s-approved", group: "Statuses", title: "Approved", body: "Every required level approved. It is finished." },
  { id: "s-expired", group: "Statuses", title: "Expired", body: "An approved request of a type with a validity period, past its valid-until date. It is still on record as approved, but shown as Expired everywhere. You can amend it or raise a follow-up from it; you'll be asked why, and the reason is kept on its history." },
  { id: "s-rejected", group: "Statuses", title: "Rejected", body: "An approver rejected it. It is finished and never counts as approved." },
  { id: "s-withdrawn", group: "Statuses", title: "Withdrawn", body: "The requester withdrew it before it finished." },
  { id: "t-waiting", group: "Approval steps", title: "Not started / Waiting for approval", body: "A level that hasn't been reached yet, or one waiting for its approvers now." },
  { id: "t-skipped", group: "Approval steps", title: "Skipped / Not needed", body: "A level the rules left out for this request (for example below an amount), or one that wasn't needed once others decided. A request is never approved without at least one real approval: if every level is skipped, it goes to the requester's head of department (or IT, if there is none) to approve, unless IT set the type to allow it. In parallel levels where any one (or any N) is enough, IT can let the other branches carry on when one branch rejects." },
  { id: "t-blocked", group: "Approval steps", title: "Blocked", body: "Nobody could be found for a level (for example no HOD set). IT is told and chooses who decides; nobody can move a step of their own request on." },
  { id: "t-overdue", group: "Approval steps", title: "Due soon / Overdue", body: "A level can have a response time in working hours. You get a heads-up when it is nearly due, a reminder when it is overdue, and then the manager is told." },
];

export default async function HelpPage() {
  await requireArea("users");
  return (
    <>
      <PageHeader title="Help" icon={LifeBuoy} description="How things work, and what each word on the screen means." />
      <div className="max-w-4xl space-y-6">
        {/* v1.14.0 (D-167): the guided tour of Approvals, Tasks and Calendar. */}
        <section className="card flex flex-wrap items-center justify-between gap-3 px-5 py-4" data-testid="help-tour">
          <div className="min-w-0">
            <h2 className="flex items-center gap-1.5 font-semibold">
              New here? Take the tour
              <Hint text="About three minutes: Home, the Inbox, Create, approvals, tasks and projects, the calendar, notifications, search and your profile." align="start" />
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
