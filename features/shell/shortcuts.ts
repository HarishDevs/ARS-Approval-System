// WS-02: keyboard shortcuts never fire while the person types.
export function isTyping(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  if (target.isContentEditable) return true;
  const tag = target.tagName;
  if (tag === "TEXTAREA" || tag === "SELECT") return true;
  if (tag === "INPUT") {
    const type = (target as HTMLInputElement).type;
    return !["checkbox", "radio", "button", "submit", "reset", "range", "color", "file"].includes(type);
  }
  return false;
}

export const SHORTCUTS: { keys: string; what: string }[] = [
  { keys: "Ctrl + K", what: "Go anywhere: pages, requests by number or title" },
  { keys: "?", what: "Show these shortcuts" },
  { keys: "J / K", what: "Waiting for me: next / previous request" },
  { keys: "Enter", what: "Open the selected request" },
  { keys: "A", what: "Approve (opens the request and asks first)" },
  { keys: "C", what: "Ask for changes (opens the request and asks first)" },
  { keys: "Esc", what: "Close a dialog or menu" },
  // D-215: Task & Project Management pages.
  { keys: "Q", what: "Tasks: create a task (ad hoc or periodic)" },
  { keys: "G then H / M / I / R / P / S", what: "Tasks: go to Home / My Tasks / Inbox / Periodic tasks / All projects / Search" },
  { keys: "Esc", what: "Tasks: close the task pane" },
  { keys: "J / K", what: "Task lists: next / previous task" },
  { keys: "X", what: "Task lists: complete or reopen the selected task" },
  { keys: "Alt + ↑ / ↓", what: "Task lists: move the task up / down (Alt + Shift: to the next section)" },
];
