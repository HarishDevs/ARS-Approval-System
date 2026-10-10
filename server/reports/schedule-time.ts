// When a scheduled report runs next (D-123). Pure. Times are India time
// (UTC+5:30, no daylight saving); the result is a UTC Date.
export type Frequency = "DAILY" | "WEEKLY" | "MONTHLY";

export interface ScheduleTime {
  frequency: Frequency;
  weekday: number | null; // 1 = Monday … 7 = Sunday
  monthDay: number | null; // 1–28
  hourIst: number; // 0–23
}

const IST_MS = 330 * 60_000;

export function nextRunAt(schedule: ScheduleTime, after: Date): Date {
  const hour = Math.min(23, Math.max(0, Math.trunc(schedule.hourIst)));
  // Work in "India wall clock" as if it were UTC, then shift back.
  const local = new Date(after.getTime() + IST_MS);
  const candidate = new Date(Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate(), hour, 0, 0));
  const later = (date: Date) => date.getTime() > local.getTime();
  if (schedule.frequency === "DAILY") {
    if (!later(candidate)) candidate.setUTCDate(candidate.getUTCDate() + 1);
  } else if (schedule.frequency === "WEEKLY") {
    const want = Math.min(7, Math.max(1, schedule.weekday ?? 1)) % 7; // JS: 0 = Sunday
    let days = (want - candidate.getUTCDay() + 7) % 7;
    if (days === 0 && !later(candidate)) days = 7;
    candidate.setUTCDate(candidate.getUTCDate() + days);
  } else {
    const day = Math.min(28, Math.max(1, schedule.monthDay ?? 1));
    candidate.setUTCDate(day);
    if (!later(candidate)) candidate.setUTCMonth(candidate.getUTCMonth() + 1, day);
  }
  return new Date(candidate.getTime() - IST_MS);
}

export function describeSchedule(schedule: ScheduleTime): string {
  const at = `${String(schedule.hourIst).padStart(2, "0")}:00`;
  if (schedule.frequency === "DAILY") return `Every day at ${at}`;
  if (schedule.frequency === "WEEKLY") return `Every ${["", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"][schedule.weekday ?? 1]} at ${at}`;
  return `On day ${schedule.monthDay ?? 1} of each month at ${at}`;
}

// Alerts (D-123): fire when the value reaches the threshold and either it
// wasn't firing before, or the cool-down has passed. Back under the line
// resets it, so the next crossing alerts at once.
export function alertDecision(rule: { threshold: number; firing: boolean; lastFiredAt: Date | null; cooldownHours: number }, value: number, now: Date): { fire: boolean; firing: boolean } {
  const over = value >= rule.threshold;
  if (!over) return { fire: false, firing: false };
  const cooled = !rule.lastFiredAt || now.getTime() - rule.lastFiredAt.getTime() >= rule.cooldownHours * 3_600_000;
  return { fire: !rule.firing || cooled, firing: true };
}

// v1.7.0 (B08): quiet hours in India time, start inclusive, end exclusive.
// 22 to 7 wraps past midnight; equal or missing hours mean no quiet time.
export function inQuietHours(rule: { quietStart: number | null; quietEnd: number | null }, now: Date): boolean {
  const { quietStart: start, quietEnd: end } = rule;
  if (start === null || end === null || start === end) return false;
  const hour = new Date(now.getTime() + 330 * 60_000).getUTCHours();
  return start < end ? hour >= start && hour < end : hour >= start || hour < end;
}
