// D-215: how dates read on task rows (India time). Pure.
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

export const indiaDayOf = (value: Date) => new Date(value.getTime() + 330 * 60_000).toISOString().slice(0, 10);

export function dayText(day: string, today: string): string {
  if (day === today) return "Today";
  const date = new Date(`${day}T00:00:00Z`);
  const base = new Date(`${today}T00:00:00Z`);
  const diff = Math.round((date.getTime() - base.getTime()) / 86_400_000);
  if (diff === 1) return "Tomorrow";
  if (diff === -1) return "Yesterday";
  const text = `${date.getUTCDate()} ${MONTHS[date.getUTCMonth()]}`;
  return date.getUTCFullYear() === base.getUTCFullYear() ? text : `${text} ${date.getUTCFullYear()}`;
}

export function dueLabel(dueAt: Date | string | null, now: Date, open: boolean): { text: string; tone: "danger" | "warning" | "neutral" } | null {
  if (!dueAt) return null;
  const due = typeof dueAt === "string" ? new Date(dueAt) : dueAt;
  const day = indiaDayOf(due);
  const today = indiaDayOf(now);
  const text = dayText(day, today);
  if (!open) return { text, tone: "neutral" };
  return { text, tone: day < today ? "danger" : day === today ? "warning" : "neutral" };
}

export const TONE_TEXT: Record<"danger" | "warning" | "neutral", string> = { danger: "text-danger-600", warning: "text-warning-600", neutral: "text-ink-muted" };
