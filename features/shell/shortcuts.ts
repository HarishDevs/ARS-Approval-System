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
];
