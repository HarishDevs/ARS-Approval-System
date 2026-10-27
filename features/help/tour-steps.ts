// v1.14.0 (D-167, owner): the onboarding tour for the user space. Each step
// opens its page (`path`) and points at one part of it (`target`, a CSS
// selector); without a target, or when the part isn't on screen (e.g. the
// sidebar on a phone), the card shows in the middle. Steps whose page is
// hidden from the person (page access) are left out.
export interface TourStep {
  id: string;
  section: "Start" | "Approvals" | "Tasks" | "Calendar" | "Everyday";
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
    intro: "This is where ARS raises requests, approves them, hands out tasks and keeps dates in one calendar. The tour takes about two minutes.",
    points: ["Next and Back move through the steps; each one opens the page it talks about.", "Skip ends the tour at any time. You can take it again from Help or your account menu."],
  },
  {
    id: "overview",
    section: "Start",
    title: "Overview: what needs you first",
    intro: "Your home page. Start here every day.",
    points: [
      "The tiles count what's waiting for you, what's overdue, your open requests and changes asked of you. Click one to open the list.",
      "Drafts you haven't submitted are listed here, so you can carry on where you left off.",
    ],
    path: "/users",
    target: '[data-tour="overview-tiles"]',
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
      "Add as many levels as you need, one after another.",
      "At each level pick the approvers (Manager and above) and whether any one of them or all of them must approve.",
      "Nobody can approve their own request.",
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
      "On a request: comments (type @ and a User ID to mention someone), files, the full history and Download PDF.",
    ],
    path: "/users/requests",
    target: HEADER,
  },
  {
    id: "tasks",
    section: "Tasks",
    title: "My tasks",
    intro: "Work given to you, separate from approvals.",
    points: [
      "Tabs show what's overdue and due soon. Open a task to Start it, add comments and files, and Complete it.",
      "Blocked (when the task type allows it) says why you can't go on.",
      "Assigned by me shows tasks you gave; Team tasks shows your team's.",
      "Reminders come before the due time and once when it's overdue.",
    ],
    path: "/users/tasks",
    target: HEADER,
  },
  {
    id: "new-task",
    section: "Tasks",
    title: "Give someone a task",
    intro: "New task, in the Tasks group of the sidebar.",
    points: [
      "Choose a task type, then the title, who does it, the due date and priority, and add files.",
      "You can link it to a request it belongs to.",
      "They're told straight away, and you can follow it in Assigned by me.",
    ],
    path: "/users/tasks/new",
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
    title: "Notifications",
    intro: "The bell shows the latest messages; click one to open it.",
    points: [
      "Approvals waiting for you and security messages also come by email and WhatsApp.",
      "Choose which other messages come by email or WhatsApp in Notification settings.",
    ],
    target: '[data-tour="bell"]',
  },
  {
    id: "search",
    section: "Everyday",
    title: "Go to and search",
    intro: "Press Ctrl K (or this button) to jump to any page or request by name or number.",
    points: ["Search, in the sidebar, finds requests by number, title, type, status and dates, and saves searches as views."],
    target: '[data-tour="search"]',
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
    points: ["Help (in your account menu) explains every status and has Copy details for IT if something isn't working.", "Take the tour again any time from Help or your account menu."],
  },
];

// Steps left out when their page is hidden from the person.
export function tourStepsFor(canOpen: (path: string) => boolean): TourStep[] {
  return TOUR_STEPS.filter((step) => !step.path || canOpen(step.path));
}
