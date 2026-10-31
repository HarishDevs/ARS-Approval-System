// v1.14.0 (D-167, owner): the onboarding tour for the user space. Each step
// opens its page (`path`) and points at one part of it (`target`, a CSS
// selector); without a target, or when the part isn't on screen (e.g. the
// sidebar on a phone), the card shows in the middle. Steps whose page is
// hidden from the person (page access) are left out.
export interface TourStep {
  id: string;
  section: "Start" | "Approvals" | "Tasks" | "Calendar" | "Everyday";
  // D-249 (owner: "the tour includes all the features built new"): v1.40.0
  // covers Home, the Inbox, Create, Tasks & projects, the Draft task, the
  // header search, Profile → Notifications and the Classic view.
  title: string;
  intro: string;
  points: string[];
  path?: string;
  target?: string;
}

const HEADER = '[data-tour="page-header"]';

export const TOUR_STEPS: readonly TourStep[] = [
  {
    id: "welcome",
    section: "Start",
    title: "Welcome to ARS-CMS",
    intro: "This is where ARS raises requests, approves them, runs tasks and projects, shares notices and keeps dates in one calendar. The tour takes about three minutes.",
    points: ["Next and Back move through the steps; each one opens the page it talks about.", "Skip ends the tour at any time. You can take it again from Help or your account menu."],
  },
  {
    id: "overview",
    section: "Start",
    title: "Home: what needs you first",
    intro: "Your home page. Start here every day.",
    points: [
      "The tiles count what's waiting for you, what's overdue, your open requests and changes asked of you. Click one to open the list.",
      "Drafts you haven't submitted are listed here, so you can carry on where you left off.",
      "Below them, My work: your tasks (upcoming, overdue, done), tasks you gave, your team and your projects.",
    ],
    path: "/users",
    target: '[data-tour="overview-tiles"]',
  },
  {
    id: "inbox",
    section: "Start",
    title: "Inbox: every message in one place",
    intro: "Everything ARS tells you: approvals, tasks, information and system messages. The number beside Inbox is what you haven't read.",
    points: [
      "Open a message to go to what it's about. Bookmark what you'll come back to; Archive what's done.",
      "Filter by Approvals, Tasks, Information or System, or show only what you haven't read. Mark all as read can be undone.",
    ],
    path: "/users/inbox",
    target: HEADER,
  },
  {
    id: "create",
    section: "Start",
    title: "Create",
    intro: "One button for anything new: an approval request, a task, a project or a notice (what you're allowed to make).",
    points: ["It's at the top of the sidebar, on every page.", "Q opens a new task straight away when you're in Tasks & projects."],
    target: '[data-testid="create-menu"]',
  },
  {
    id: "new-request",
    section: "Approvals",
    title: "Raise a request",
    intro: "Request templates lists the approval types IT has set up, such as purchases or payments.",
    points: [
      "Pick a type, give it a title, fill in the form and attach files (quotes, bills, photos).",
      "What you type is saved as a draft as you go.",
      "Submit: the request gets a number and goes to its first approvers. You're told at each step.",
    ],
    path: "/users/new",
    target: HEADER,
  },
  {
    id: "custom",
    section: "Approvals",
    title: "New request: your own approvers",
    intro: "For anything that has no ready-made type.",
    points: [
      "Your reporting manager is already the first approver; add as many levels as you need.",
      "At each level pick the approvers (Manager and above) and whether any one of them or all of them must approve.",
      "Nobody can approve their own request. A finished request can be raised again with the same approvers.",
    ],
    path: "/users/custom",
    target: HEADER,
  },
  {
    id: "queue",
    section: "Approvals",
    title: "Waiting for me: approve",
    intro: "Everything that needs your decision, oldest first, with how long it has waited.",
    points: [
      "Open a request and choose Approve, Reject, Ask for changes (back to the requester) or Put on hold (pauses the clock). Add a comment.",
      "Tick several straightforward ones to approve them together.",
      "A To do badge means a step to do rather than decide (for example raise a PO): open it and Mark as done.",
    ],
    path: "/users/queue",
    target: HEADER,
  },
  {
    id: "my-requests",
    section: "Approvals",
    title: "My requests: follow what you raised",
    intro: "Where each of your requests is, and who it's waiting on.",
    points: [
      "Statuses: In progress, On hold, Changes required, Approved, Rejected, Withdrawn.",
      "Changes required: edit and resubmit. You can withdraw a request before it finishes.",
      "On a request: comments (type @ and a name to mention someone), files, the full history and Download PDF.",
    ],
    path: "/users/requests",
    target: HEADER,
  },
  {
    id: "tasks",
    section: "Tasks",
    title: "My Tasks",
    intro: "Everything given to you, from every project, in your own sections (Overdue, Recently assigned, Today, Upcoming, Later).",
    points: [
      "Tick a task to complete it; click its name to open it beside the list (comments, files, subtasks, followers).",
      "List, Board and Calendar views; Filter, Sort and Group like any list. Periodic tasks repeat by themselves.",
      "The morning summary email lists what's due; switch it off here.",
    ],
    path: "/users/work/my-tasks",
    target: "main h1",
  },
  {
    id: "new-task",
    section: "Tasks",
    title: "Give someone a task",
    intro: "Create → Task opens a Draft task in the corner of any page.",
    points: [
      "Name it; it's for Myself, or choose Others (type part of a name). Pick a project if it belongs to one.",
      "In the description, type / for the menu, @ to mention someone (they follow the task), or paste a screenshot to attach it.",
      "The toolbar adds a due date, a repeat (periodic), files, emoji and collaborators. They're told straight away.",
    ],
    path: "/users/work/my-tasks",
    target: '[data-testid="create-menu"]',
  },
  {
    id: "projects",
    section: "Tasks",
    title: "Projects",
    intro: "Group work into projects with sections, like a board.",
    points: [
      "All projects lists what you're in; New project sets one up step by step (or from a template).",
      "Each project has List, Board, Calendar, Timeline and Overview (status updates), and its own members and permissions.",
    ],
    path: "/users/work/projects",
    target: HEADER,
  },
  {
    id: "information",
    section: "Tasks",
    title: "Information: notices",
    intro: "Circulars and notices from your organisation.",
    points: ["Information inbox: open a notice to read it. If it asks, press Acknowledge.", "With permission you can send one yourself from New information."],
    path: "/users/information",
    target: HEADER,
  },
  {
    id: "ai",
    section: "Tasks",
    title: "AI Assistant (if you have it)",
    intro: "Your business analyst: ask in plain words and get answers, dashboards and insights from your data.",
    points: [
      "Your chats are listed under AI Assistant in the sidebar, with a search.",
      "It reads your data only; it can't approve, send or change anything.",
    ],
    path: "/users/ai/assistant",
    target: HEADER,
  },
  {
    id: "calendar",
    section: "Calendar",
    title: "Your calendar",
    intro: "Every date that matters to you, in one place.",
    points: [
      "Approvals due from you, your tasks' due dates, your requests' needed-by dates and information dates.",
      "Switch between Month, Week and Day, and filter by kind.",
      "Add your own entries (meetings, reminders); only you see them.",
    ],
    path: "/users/calendar",
    target: HEADER,
  },
  {
    id: "google-calendar",
    section: "Calendar",
    title: "Connect Google Calendar (optional)",
    intro: "See the same dates in your Google Calendar, and your Google events here.",
    points: [
      "Profile → Calendar → Connect Google Account, then tick both calendar boxes on Google's screen.",
      "Events are private and show only a reference. Nothing is ever approved or completed from Google.",
      "Disconnect whenever you like.",
    ],
    path: "/users/profile/calendar",
    target: 'section[aria-labelledby="gcal-title"]',
  },
  {
    id: "notifications",
    section: "Everyday",
    title: "The bell and your notifications",
    intro: "The bell shows the latest messages; click one to open it, or Read more for the Inbox.",
    points: [
      "Approvals waiting for you and security messages also come by email and WhatsApp.",
      "Profile → Notifications: choose, kind by kind, what reaches you in the app, by email and on WhatsApp, and pause them (Do not disturb).",
    ],
    target: '[data-tour="bell"]',
  },
  {
    id: "search",
    section: "Everyday",
    title: "Search everything",
    intro: "The search bar at the top (or Ctrl K) finds requests, tasks, projects, people, notices and pages.",
    points: ["Type a number, a name or a few words. Filters opens a full search; you can save a search and reuse it."],
    target: '[data-tour="search"]',
  },
  {
    id: "profile",
    section: "Everyday",
    title: "Your profile and view",
    intro: "Your account menu (your initials, top right) has Profile, the Inbox, Sign-in & devices, Out of office and Help.",
    points: [
      "Profile: add your photo and a few words about you; see what IT holds about you.",
      "View: Compact (this layout) or Classic (Tally-style screens with keyboard keys). ☰ folds the sidebar to icons.",
    ],
    target: 'button[aria-label^="Account menu"]',
  },
  {
    id: "out-of-office",
    section: "Everyday",
    title: "Going on leave",
    intro: "Out of office names someone to approve for you between two dates.",
    points: ["They see what's already waiting and what comes in; both names are recorded.", "End it early whenever you're back."],
    path: "/users/delegation",
    target: HEADER,
  },
  {
    id: "finish",
    section: "Everyday",
    title: "You're ready",
    intro: "That's the tour.",
    points: ["Help (in your account menu) explains every feature and status, and has Copy details for IT if something isn't working.", "Take the tour again any time from Help or your account menu."],
  },
];

// Steps left out when their page is hidden from the person.
export function tourStepsFor(canOpen: (path: string) => boolean): TourStep[] {
  return TOUR_STEPS.filter((step) => !step.path || canOpen(step.path));
}
