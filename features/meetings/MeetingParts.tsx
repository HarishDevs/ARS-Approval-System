import Link from "next/link";
import { Badge, type Tone } from "@/features/ui/Display";
import { FOLLOW_UP_LABEL, POINTS_LABEL, STATUS_LABEL, type FollowUpState, type MeetingStatus, type PointsStatus } from "@/server/meetings/rules";

// v1.51.0 (D-300): shared pieces of the Meeting screens (server-safe).
export const STATUS_TONE: Record<MeetingStatus, Tone> = {
  SCHEDULED: "info",
  IN_PROGRESS: "primary",
  AWAITING_MOM: "warning",
  MOM_SUBMITTED: "warning",
  MOM_RETURNED: "danger",
  MOM_APPROVED: "success",
  CLOSED: "neutral",
  CANCELLED: "neutral",
};
export const POINTS_TONE: Record<PointsStatus, Tone> = { DRAFT: "neutral", SUBMITTED: "warning", APPROVED: "success", RETURNED: "danger" };
export const FOLLOW_UP_TONE: Record<FollowUpState, Tone> = { NO_TASK: "neutral", OPEN: "info", OVERDUE: "danger", DONE_UNCONFIRMED: "warning", CONFIRMED: "success", CANCELLED: "neutral" };

export const MeetingStatusBadge = ({ status }: { status: MeetingStatus }) => <Badge tone={STATUS_TONE[status]}>{STATUS_LABEL[status]}</Badge>;
export const PointsBadge = ({ status }: { status: PointsStatus }) => <Badge tone={POINTS_TONE[status]}>Points: {POINTS_LABEL[status]}</Badge>;
export const FollowUpBadge = ({ state }: { state: FollowUpState }) => <Badge tone={FOLLOW_UP_TONE[state]}>{FOLLOW_UP_LABEL[state]}</Badge>;

const SECTIONS = [
  { href: "/users/meetings", label: "Meetings" },
  { href: "/users/meetings/follow-ups", label: "Follow-ups" },
] as const;

// The Meeting pages, as tabs under the header (the dashboard is on Home, v1.51.1).
export function MeetingSections({ current }: { current: (typeof SECTIONS)[number]["href"] }) {
  return (
    <nav aria-label="Meeting pages" className="mb-4 flex flex-wrap gap-x-1 border-b border-line">
      {SECTIONS.map((section) => (
        <Link
          key={section.href}
          href={section.href}
          aria-current={current === section.href ? "page" : undefined}
          className={`-mb-px border-b-2 px-3 py-2 text-label ${current === section.href ? "border-primary-600 font-semibold text-primary-700" : "border-transparent text-ink-muted hover:text-ink"}`}
        >
          {section.label}
        </Link>
      ))}
    </nav>
  );
}

// India date and time pieces for inputs and text.
const IST = 330 * 60_000;
export const indiaInput = (date: Date | null) => (date ? new Date(date.getTime() + IST).toISOString().slice(0, 16) : "");
export const indiaDay = (date: Date | null) => (date ? new Date(date.getTime() + IST).toISOString().slice(0, 10) : "");
export const indiaTime = (date: Date | null) => (date ? new Date(date.getTime() + IST).toISOString().slice(11, 16) : "");
export function whenText(start: Date, end: Date) {
  const day = start.toLocaleDateString("en-IN", { weekday: "short", day: "2-digit", month: "short", year: "numeric", timeZone: "Asia/Kolkata" });
  const time = (date: Date) => date.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", hour12: true, timeZone: "Asia/Kolkata" });
  return `${day}, ${time(start)} to ${time(end)}`;
}
