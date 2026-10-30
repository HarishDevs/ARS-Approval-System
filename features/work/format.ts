// D-215: how dates read on task rows (India time). Pure.
const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

export const indiaDayOf = (value: Date) => new Date(value.getTime() + 330 * 60_000).toISOString().slice(0, 10);

export function dayText(day: string, today: string): string {
  if (day === today) return "Today";
  const date = new Date(`${day}T00:00:00Z`);
  const base = new Date(`${today}T00:00:00Z`);
  const diff = Math.round((date.getTime() - base.getTime()) / 86_400_000);
  if (diff === 1) return "Tomorrow";
  if (diff === -1) return "Yesterday";
  // D-219 (screen catalog §1.1): a weekday name within the coming week.
  if (diff > 1 && diff < 7) return WEEKDAYS[date.getUTCDay()]!;
  const text = `${date.getUTCDate()} ${MONTHS[date.getUTCMonth()]}`;
  return date.getUTCFullYear() === base.getUTCFullYear() ? text : `${text} ${date.getUTCFullYear()}`;
}

export function dueLabel(dueAt: Date | string | null, now: Date, open: boolean): { text: string; tone: "danger" | "success" | "neutral" } | null {
  if (!dueAt) return null;
  const due = typeof dueAt === "string" ? new Date(dueAt) : dueAt;
  const day = indiaDayOf(due);
  const today = indiaDayOf(now);
  const text = dayText(day, today);
  if (!open) return { text, tone: "neutral" };
  // Overdue in red; today in green (screen catalog §1.4).
  return { text, tone: day < today ? "danger" : day === today ? "success" : "neutral" };
}

export const TONE_TEXT: Record<"danger" | "success" | "neutral", string> = { danger: "text-danger-600", success: "text-success-600", neutral: "text-ink-muted" };
