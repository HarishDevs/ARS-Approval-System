// D-233 (UI states: browser permission). One way to copy text for the whole
// app. The Clipboard API needs a secure page and the browser's permission;
// when it is missing or refused, an older copy command is tried; when that
// fails too, the caller says so and shows the text to copy by hand.
export const COPY_BLOCKED = "Your browser blocked copying. Select the text and copy it yourself (Ctrl+C).";

export async function copyText(text: string): Promise<boolean> {
  try {
    if (typeof navigator !== "undefined" && navigator.clipboard?.writeText && window.isSecureContext) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    // refused: try the older way below
  }
  try {
    const area = document.createElement("textarea");
    area.value = text;
    area.setAttribute("readonly", "");
    area.style.position = "fixed";
    area.style.opacity = "0";
    document.body.appendChild(area);
    area.select();
    const done = document.execCommand("copy");
    area.remove();
    return done;
  } catch {
    return false;
  }
}
