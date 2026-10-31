// D-247 (audit FI-D01): the weekly HOD report's timing and wording (pure,
// unit-tested). India time has no daylight saving: always UTC+5:30.
const IST_MS = 330 * 60_000;
const DAY_MS = 86_400_000;
const SEND_HOUR = 9;

export interface HodWeekStats {
  raised: number;
  approved: number;
  rejected: number;
  openNow: number;
  overdueNow: number;
  oldest: { requestNo: string; title: string; submittedAt: Date }[];
}

const isoDay = (ms: number) => new Date(ms).toISOString().slice(0, 10);

// This week's report is due from Monday 09:00 India time until the next
// Monday. It covers the 7 days before that Monday 00:00 (India time).
export function hodWeekDue(now: Date): { weekStart: string; from: Date; to: Date; label: string } | null {
  const local = now.getTime() + IST_MS; // India wall-clock, as if UTC
  const dayOfWeek = (new Date(local).getUTCDay() + 6) % 7; // Monday = 0
  const mondayMidnightLocal = Math.floor(local / DAY_MS) * DAY_MS - dayOfWeek * DAY_MS;
  if (local < mondayMidnightLocal + SEND_HOUR * 3_600_000) return null;
  const to = new Date(mondayMidnightLocal - IST_MS);
  const from = new Date(to.getTime() - 7 * DAY_MS);
  const label = `${isoDay(mondayMidnightLocal - 7 * DAY_MS)} to ${isoDay(mondayMidnightLocal - DAY_MS)}`;
  return { weekStart: isoDay(mondayMidnightLocal), from, to, label };
}

export function hodReportText(input: { department: string; hodName: string; weekLabel: string; stats: HodWeekStats; link: string }): string {
  const { stats } = input;
  const lines = [
    `${input.department}: weekly approvals report (${input.weekLabel})`,
    "",
    `Dear ${input.hodName},`,
    "",
    `Requests raised by your department in the week: ${stats.raised}`,
    `Approved: ${stats.approved}`,
    `Rejected: ${stats.rejected}`,
    `Still open now: ${stats.openNow}`,
    `Overdue now (an approval past its response time): ${stats.overdueNow}`,
  ];
  if (stats.oldest.length) {
    lines.push("", "Waiting longest:");
    for (const item of stats.oldest) lines.push(`- ${item.requestNo}: ${item.title} (since ${isoDay(item.submittedAt.getTime() + IST_MS)})`);
  }
  lines.push("", `More in ARS-CMS: ${input.link}`, "", "You get this because you are the head of this department. IT can switch the weekly report off in Super Admin → Settings → General.");
  return lines.join("\n");
}
