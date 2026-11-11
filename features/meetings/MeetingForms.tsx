"use client";

import { useMemo, useState } from "react";
import { Plus, Trash2, ArrowUp, ArrowDown } from "lucide-react";
import { closeOpenPointAction, meetingAction, reviewMeetingAction, scheduleMeetingAction } from "@/app/users/meetings/actions";
import { PeoplePicker, type PersonOption } from "@/features/ui/PeoplePicker";
import { FieldError, ResultMessage, SubmitButton, useActionForm } from "@/features/ui/form";
import { UnsavedGuard } from "@/features/ui/UnsavedGuard";
import { PRIORITIES, PRIORITY_LABEL, type Attendance, type MeetingPriority } from "@/server/meetings/rules";

// v1.51.0 (D-300, D-301): Meeting Management forms. Every people choice is
// search-and-select (owner rule): one person for Owner, Coordinator,
// presenter and action owner; several for participants and departments.

export interface MeetingTypeOption {
  id: number;
  name: string;
  template: string | null;
}

export interface ScheduleDefaults {
  meetingId: number | null;
  rowVersion: number | null;
  parentMeetingId: number | null;
  title: string;
  description: string;
  typeId: number | null;
  departmentId: number | null;
  departmentIds: number[];
  ownerId: number | null;
  coordinatorId: number | null;
  participantIds: number[];
  mode: string;
  venue: string;
  link: string;
  priority: string;
  confidentiality: string;
  guests: string;
  date: string;
  startTime: string;
  endTime: string;
  agendaDue: string;
  momDue: string;
  pointsPolicy: string;
}

export function ScheduleMeetingForm({
  defaults,
  types,
  people,
  departments,
  carried,
}: {
  defaults: ScheduleDefaults;
  types: MeetingTypeOption[];
  people: PersonOption[];
  departments: PersonOption[];
  carried?: { actions: number; openPoints: number };
}) {
  const { result, pending, onSubmit } = useActionForm(scheduleMeetingAction);
  const [typeId, setTypeId] = useState<number | null>(defaults.typeId);
  const [mode, setMode] = useState(defaults.mode || "OFFLINE");
  const template = types.find((type) => type.id === typeId)?.template ?? "";
  const [points, setPoints] = useState(template);
  const [touchedPoints, setTouchedPoints] = useState(false);
  const isNew = defaults.meetingId === null;
  const err = (name: string) => <FieldError result={result} name={name} />;
  return (
    <form onSubmit={onSubmit} className="card space-y-5 px-5 py-5" aria-label="Meeting">
      <UnsavedGuard />
      {defaults.meetingId && <input type="hidden" name="meetingId" value={defaults.meetingId} />}
      {defaults.rowVersion !== null && <input type="hidden" name="rowVersion" value={defaults.rowVersion} />}
      {defaults.parentMeetingId && <input type="hidden" name="parentMeetingId" value={defaults.parentMeetingId} />}
      {carried && (
        <p className="rounded-md bg-info-50 px-3 py-2 text-label text-info-600">
          Follow-up meeting: {carried.actions} open action item(s) and {carried.openPoints} open point(s) will be carried forward.
        </p>
      )}
      <div className="grid gap-4 md:grid-cols-[2fr_1fr]">
        <div>
          <label htmlFor="mtg-title" className="field-label">
            Meeting title
          </label>
          <input id="mtg-title" name="title" defaultValue={defaults.title} required minLength={3} maxLength={200} className="field-input" />
          {err("title")}
        </div>
        <div>
          <label htmlFor="mtg-type" className="field-label">
            Meeting type
          </label>
          <select
            id="mtg-type"
            name="typeId"
            value={typeId ?? ""}
            onChange={(event) => {
              const next = Number(event.target.value) || null;
              setTypeId(next);
              if (!touchedPoints) setPoints(types.find((type) => type.id === next)?.template ?? "");
            }}
            required
            className="field-input"
          >
            <option value="">Choose…</option>
            {types.map((type) => (
              <option key={type.id} value={type.id}>
                {type.name}
              </option>
            ))}
          </select>
          {err("typeId")}
        </div>
      </div>
      <div className="grid gap-4 md:grid-cols-3">
        <div>
          <label htmlFor="mtg-date" className="field-label">
            Date
          </label>
          <input id="mtg-date" name="date" type="date" defaultValue={defaults.date} required className="field-input" />
          {err("start")}
        </div>
        <div>
          <label htmlFor="mtg-start" className="field-label">
            Starts
          </label>
          <input id="mtg-start" name="startTime" type="time" defaultValue={defaults.startTime} required className="field-input" />
        </div>
        <div>
          <label htmlFor="mtg-end" className="field-label">
            Ends
          </label>
          <input id="mtg-end" name="endTime" type="time" defaultValue={defaults.endTime} required className="field-input" />
          {err("end")}
        </div>
      </div>
      <div className="grid gap-4 md:grid-cols-2">
        <div>
          <PeoplePicker
            name="owner"
            options={people}
            label="Meeting Owner"
            help="Approves the meeting points and the MOM. Can be anyone."
            max={1}
            initial={defaults.ownerId ? [defaults.ownerId] : []}
            invalid={Boolean(result && !result.ok && result.fieldErrors?.ownerId)}
          />
          {err("ownerId")}
        </div>
        <div>
          <PeoplePicker
            name="coordinator"
            options={people}
            label="Coordinator"
            help="Runs the meeting: points, attendance and MOM. Can be the Owner."
            max={1}
            initial={defaults.coordinatorId ? [defaults.coordinatorId] : []}
            invalid={Boolean(result && !result.ok && result.fieldErrors?.coordinatorId)}
          />
          {err("coordinatorId")}
        </div>
      </div>
      <div>
        <PeoplePicker
          name="participants"
          options={people}
          label="Participants"
          help="Everyone invited. The Owner and Coordinator are added automatically."
          max={200}
          initial={defaults.participantIds}
        />
        {err("participants")}
      </div>
      <div className="grid gap-4 md:grid-cols-2">
        <PeoplePicker name="department" options={departments} label="Organising department" max={1} initial={defaults.departmentId ? [defaults.departmentId] : []} />
        <PeoplePicker name="departments" options={departments} label="Departments involved" help="For IDMs, choose every department taking part." max={50} initial={defaults.departmentIds} />
      </div>
      <div className="grid gap-4 md:grid-cols-3">
        <div>
          <label htmlFor="mtg-mode" className="field-label">
            Mode
          </label>
          <select id="mtg-mode" name="mode" value={mode} onChange={(event) => setMode(event.target.value)} className="field-input">
            <option value="OFFLINE">Offline (in person)</option>
            <option value="ONLINE">Online</option>
            <option value="HYBRID">Hybrid</option>
          </select>
        </div>
        <div>
          <label htmlFor="mtg-venue" className="field-label">
            Venue
          </label>
          <input id="mtg-venue" name="venue" defaultValue={defaults.venue} maxLength={200} className="field-input" />
        </div>
        {mode !== "OFFLINE" && (
          <div>
            <label htmlFor="mtg-link" className="field-label">
              Meeting link
            </label>
            <input id="mtg-link" name="link" type="url" defaultValue={defaults.link} maxLength={500} placeholder="https://" className="field-input" />
            {err("link")}
          </div>
        )}
      </div>
      <div className="grid gap-4 md:grid-cols-3">
        <div>
          <label htmlFor="mtg-priority" className="field-label">
            Priority
          </label>
          <select id="mtg-priority" name="priority" defaultValue={defaults.priority || "NORMAL"} className="field-input">
            {PRIORITIES.map((priority) => (
              <option key={priority} value={priority}>
                {PRIORITY_LABEL[priority]}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="mtg-conf" className="field-label">
            Who can see it
          </label>
          <select id="mtg-conf" name="confidentiality" defaultValue={defaults.confidentiality || "GENERAL"} className="field-input">
            <option value="GENERAL">General: people on it and their HODs</option>
            <option value="MANAGEMENT">Management: people on it, ED, MD and IT only</option>
          </select>
        </div>
        <div>
          <label htmlFor="mtg-guests" className="field-label">
            External guests
          </label>
          <input id="mtg-guests" name="guests" defaultValue={defaults.guests} maxLength={1000} placeholder="Names and companies" className="field-input" />
        </div>
      </div>
      <div className="grid gap-4 md:grid-cols-3">
        <div>
          <label htmlFor="mtg-agenda-due" className="field-label">
            Points due by
          </label>
          <input id="mtg-agenda-due" name="agendaDue" type="datetime-local" defaultValue={defaults.agendaDue} className="field-input" />
          <p className="mt-1 text-caption text-ink-muted">Deadline for the Coordinator to send the points.</p>
          {err("agendaDueAt")}
        </div>
        <div>
          <label htmlFor="mtg-mom-due" className="field-label">
            MOM due by
          </label>
          <input id="mtg-mom-due" name="momDue" type="datetime-local" defaultValue={defaults.momDue} className="field-input" />
          <p className="mt-1 text-caption text-ink-muted">Deadline for the Coordinator to send the MOM.</p>
          {err("momDueAt")}
        </div>
        <fieldset>
          <legend className="field-label">If the points aren&apos;t approved in time</legend>
          <label className="flex items-center gap-2 text-label">
            <input type="radio" name="pointsPolicy" value="LAST_APPROVED" defaultChecked={defaults.pointsPolicy !== "BLOCK"} /> Hold the meeting anyway
          </label>
          <label className="mt-1 flex items-center gap-2 text-label">
            <input type="radio" name="pointsPolicy" value="BLOCK" defaultChecked={defaults.pointsPolicy === "BLOCK"} /> Don&apos;t start until approved
          </label>
        </fieldset>
      </div>
      {isNew && (
        <div>
          <label htmlFor="mtg-points" className="field-label">
            Meeting points
          </label>
          <textarea
            id="mtg-points"
            name="points"
            rows={5}
            value={points}
            onChange={(event) => {
              setPoints(event.target.value);
              setTouchedPoints(true);
            }}
            maxLength={30000}
            className="field-input h-auto py-2"
            placeholder="One point per line. You can change them later."
          />
        </div>
      )}
      <div>
        <label htmlFor="mtg-desc" className="field-label">
          Purpose (optional)
        </label>
        <textarea id="mtg-desc" name="description" rows={3} defaultValue={defaults.description} maxLength={8000} className="field-input h-auto py-2" />
      </div>
      <ResultMessage result={result} />
      <div className="flex justify-end">
        <SubmitButton pending={pending}>{isNew ? "Schedule meeting" : "Save changes"}</SubmitButton>
      </div>
    </form>
  );
}

// ---- meeting points ------------------------------------------------------------------------
interface PointRow {
  key: string;
  id: number | null;
  title: string;
  presenterId: number | null;
}
let seq = 0;
const nextKey = () => `row-${++seq}`;

export function PointsEditor({
  meetingId,
  rowVersion,
  initial,
  people,
  canSubmit,
  selfApprove,
}: {
  meetingId: number;
  rowVersion: number;
  initial: { id: number; title: string; presenterId: number | null }[];
  people: PersonOption[];
  canSubmit: boolean;
  selfApprove: boolean;
}) {
  const [rows, setRows] = useState<PointRow[]>(() => (initial.length ? initial.map((row) => ({ key: nextKey(), ...row })) : [{ key: nextKey(), id: null, title: "", presenterId: null }]));
  const { result, pending, onSubmit } = useActionForm(meetingAction);
  const json = useMemo(() => JSON.stringify(rows.map(({ id, title, presenterId }) => ({ id, title, presenterId }))), [rows]);
  const set = (key: string, change: Partial<PointRow>) => setRows((current) => current.map((row) => (row.key === key ? { ...row, ...change } : row)));
  const move = (index: number, by: number) =>
    setRows((current) => {
      const next = [...current];
      const [row] = next.splice(index, 1);
      next.splice(Math.max(0, Math.min(next.length, index + by)), 0, row!);
      return next;
    });
  return (
    <form onSubmit={onSubmit} className="space-y-3" aria-label="Meeting points">
      <UnsavedGuard />
      <input type="hidden" name="meetingId" value={meetingId} />
      <input type="hidden" name="rowVersion" value={rowVersion} />
      <input type="hidden" name="points" value={json} />
      <ol className="space-y-3">
        {rows.map((row, index) => (
          <li key={row.key} className="rounded-md border border-line p-3">
            <div className="flex items-start gap-2">
              <span className="mt-2 w-6 shrink-0 text-label font-semibold text-ink-muted">{index + 1}.</span>
              <div className="min-w-0 flex-1 space-y-2">
                <label className="sr-only" htmlFor={`point-${row.key}`}>
                  Point {index + 1}
                </label>
                <input
                  id={`point-${row.key}`}
                  value={row.title}
                  onChange={(event) => set(row.key, { title: event.target.value })}
                  maxLength={300}
                  className="field-input"
                  placeholder="What will be discussed"
                />
                <PeoplePicker
                  options={people}
                  label="Presenter (optional)"
                  max={1}
                  value={row.presenterId ? [row.presenterId] : []}
                  onChange={(chosen) => set(row.key, { presenterId: chosen[0] ?? null })}
                />
              </div>
              <div className="flex shrink-0 flex-col gap-1">
                <button type="button" className="btn-secondary btn-compact" aria-label={`Move point ${index + 1} up`} disabled={index === 0} onClick={() => move(index, -1)}>
                  <ArrowUp className="h-4 w-4" aria-hidden />
                </button>
                <button type="button" className="btn-secondary btn-compact" aria-label={`Move point ${index + 1} down`} disabled={index === rows.length - 1} onClick={() => move(index, 1)}>
                  <ArrowDown className="h-4 w-4" aria-hidden />
                </button>
                <button
                  type="button"
                  className="btn-secondary btn-compact text-danger-600"
                  aria-label={`Remove point ${index + 1}`}
                  onClick={() => setRows((current) => current.filter((item) => item.key !== row.key))}
                >
                  <Trash2 className="h-4 w-4" aria-hidden />
                </button>
              </div>
            </div>
          </li>
        ))}
      </ol>
      <button type="button" className="btn-secondary btn-compact" onClick={() => setRows((current) => [...current, { key: nextKey(), id: null, title: "", presenterId: null }])}>
        <Plus className="h-4 w-4" aria-hidden /> Add a point
      </button>
      <ResultMessage result={result} />
      <div className="flex flex-wrap justify-end gap-2">
        <button type="submit" name="action" value="SAVE_POINTS" className="btn-secondary" disabled={pending}>
          Save points
        </button>
        {canSubmit && (
          <button type="submit" name="action" value="SUBMIT_POINTS" className="btn-primary" disabled={pending}>
            {selfApprove ? "Approve and share points" : "Send to Meeting Owner"}
          </button>
        )}
      </div>
    </form>
  );
}

// ---- simple actions (respond, start, cancel, close, decide) ---------------------------------
export function MeetingButton({
  meetingId,
  rowVersion,
  action,
  label,
  variant = "secondary",
  confirm,
  remarks,
  remarksLabel,
  remarksRequired = false,
  danger = false,
}: {
  meetingId: number;
  rowVersion: number;
  action: string;
  label: string;
  variant?: "primary" | "secondary";
  confirm?: string;
  remarks?: boolean;
  remarksLabel?: string;
  remarksRequired?: boolean;
  danger?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const { result, pending, onSubmit, confirmBar } = useActionForm(
    meetingAction,
    confirm ? { confirm, confirmTitle: `${label}?`, confirmLabel: label, confirmTone: danger ? "danger" : "primary" } : {},
  );
  if (remarks && !open)
    return (
      <button type="button" className={`${variant === "primary" ? "btn-primary" : "btn-secondary"} btn-compact ${danger ? "text-danger-600" : ""}`} onClick={() => setOpen(true)}>
        {label}
      </button>
    );
  return (
    <form onSubmit={onSubmit} className={remarks ? "w-full space-y-2 rounded-md border border-line p-3" : "inline-block"} aria-label={label}>
      <input type="hidden" name="meetingId" value={meetingId} />
      <input type="hidden" name="rowVersion" value={rowVersion} />
      <input type="hidden" name="action" value={action} />
      {remarks && (
        <div>
          <label htmlFor={`remarks-${action}`} className="field-label">
            {remarksLabel ?? "Remarks"}
            {!remarksRequired && " (optional)"}
          </label>
          <textarea id={`remarks-${action}`} name="remarks" rows={2} maxLength={1000} required={remarksRequired} className="field-input h-auto py-2" />
        </div>
      )}
      <div className="flex flex-wrap items-center gap-2">
        <SubmitButton pending={pending} variant={variant} className="btn-compact">
          {label}
        </SubmitButton>
        {remarks && (
          <button type="button" className="btn-secondary btn-compact" onClick={() => setOpen(false)}>
            Cancel
          </button>
        )}
      </div>
      <ResultMessage result={result} />
      {confirmBar}
    </form>
  );
}

export function RespondForm({ meetingId, current }: { meetingId: number; current: string }) {
  const { result, pending, onSubmit } = useActionForm(meetingAction);
  const [answer, setAnswer] = useState(current === "PENDING" ? "ACCEPTED" : current);
  return (
    <form onSubmit={onSubmit} className="space-y-2" aria-label="Your answer">
      <input type="hidden" name="meetingId" value={meetingId} />
      <input type="hidden" name="action" value="RESPOND" />
      <fieldset className="flex flex-wrap gap-3">
        <legend className="field-label">Will you attend?</legend>
        {[
          ["ACCEPTED", "Attend"],
          ["TENTATIVE", "Maybe"],
          ["DECLINED", "Can't attend"],
        ].map(([value, label]) => (
          <label key={value} className="flex items-center gap-1.5 text-label">
            <input type="radio" name="response" value={value} checked={answer === value} onChange={() => setAnswer(value!)} /> {label}
          </label>
        ))}
      </fieldset>
      {answer !== "ACCEPTED" && (
        <div>
          <label htmlFor="respond-note" className="field-label">
            Reason {answer === "TENTATIVE" && "(optional)"}
          </label>
          <input id="respond-note" name="remarks" maxLength={300} required={answer === "DECLINED"} className="field-input" />
        </div>
      )}
      <SubmitButton pending={pending} variant="secondary" className="btn-compact">
        Save answer
      </SubmitButton>
      <ResultMessage result={result} />
    </form>
  );
}

export function RecordHeldForm({ meetingId, rowVersion, start, end }: { meetingId: number; rowVersion: number; start: string; end: string }) {
  const [open, setOpen] = useState(false);
  const { result, pending, onSubmit } = useActionForm(meetingAction);
  if (!open)
    return (
      <button type="button" className="btn-secondary btn-compact" onClick={() => setOpen(true)}>
        Record as held
      </button>
    );
  return (
    <form onSubmit={onSubmit} className="w-full space-y-2 rounded-md border border-line p-3" aria-label="Record as held">
      <input type="hidden" name="meetingId" value={meetingId} />
      <input type="hidden" name="rowVersion" value={rowVersion} />
      <input type="hidden" name="action" value="END" />
      <p className="text-label text-ink-muted">The meeting already happened: enter when it really started and ended.</p>
      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <label htmlFor="held-start" className="field-label">
            Started
          </label>
          <input id="held-start" name="actualStart" type="datetime-local" defaultValue={start} required className="field-input" />
        </div>
        <div>
          <label htmlFor="held-end" className="field-label">
            Ended
          </label>
          <input id="held-end" name="actualEnd" type="datetime-local" defaultValue={end} required className="field-input" />
        </div>
      </div>
      <div className="flex gap-2">
        <SubmitButton pending={pending} className="btn-compact">
          Save times
        </SubmitButton>
        <button type="button" className="btn-secondary btn-compact" onClick={() => setOpen(false)}>
          Cancel
        </button>
      </div>
      <ResultMessage result={result} />
    </form>
  );
}

// ---- MOM ---------------------------------------------------------------------------------
interface ActionRow {
  key: string;
  title: string;
  description: string;
  ownerId: number | null;
  priority: MeetingPriority;
  dueOn: string;
}
interface OpenRow {
  key: string;
  text: string;
  ownerId: number | null;
  reviewOn: string;
}
export interface MomDefaults {
  points: { id: number; title: string; discussion: string }[];
  decisions: string[];
  actions: { title: string; description: string; ownerId: number; priority: MeetingPriority; dueOn: string }[];
  tasked: { title: string; ownerName: string; taskNo: string | null }[];
  openPoints: { text: string; ownerId: number | null; reviewOn: string }[];
  attendance: { userId: number; name: string; attendance: Attendance; declined?: boolean }[];
  // v1.51.2 (owner): asked when the MOM is entered.
  timing: { scheduledStart: string; scheduledEnd: string; startedOnTime: boolean; startTime: string; extended: boolean; endTime: string; pointsOnTime: boolean; momOnTime: boolean };
}

// Minutes between two "HH:MM" times on the same day (0 if not later).
const minutesAfter = (from: string, to: string) => {
  if (!/^\d{2}:\d{2}$/.test(from) || !/^\d{2}:\d{2}$/.test(to)) return 0;
  const at = (text: string) => Number(text.slice(0, 2)) * 60 + Number(text.slice(3, 5));
  return Math.max(0, at(to) - at(from));
};

export function MomEditor({
  meetingId,
  rowVersion,
  defaults,
  people,
  canSubmit,
  selfApprove,
}: {
  meetingId: number;
  rowVersion: number;
  defaults: MomDefaults;
  people: PersonOption[];
  canSubmit: boolean;
  selfApprove: boolean;
}) {
  const { result, pending, onSubmit } = useActionForm(meetingAction);
  const [discussions, setDiscussions] = useState<Record<number, string>>(() => Object.fromEntries(defaults.points.map((point) => [point.id, point.discussion])));
  const [decisions, setDecisions] = useState<{ key: string; text: string }[]>(() => defaults.decisions.map((text) => ({ key: nextKey(), text })));
  const [actions, setActions] = useState<ActionRow[]>(() => defaults.actions.map((action) => ({ key: nextKey(), ...action })));
  const [openPoints, setOpenPoints] = useState<OpenRow[]>(() => defaults.openPoints.map((point) => ({ key: nextKey(), ...point })));
  // v1.51.2 (owner): a tick = present, no tick = absent. Unmarked people start ticked unless they said they can't attend.
  const [present, setPresent] = useState<Record<number, boolean>>(() =>
    Object.fromEntries(defaults.attendance.map((row) => [row.userId, row.attendance === "PRESENT" || row.attendance === "LATE" || (row.attendance === "UNMARKED" && !row.declined)])),
  );
  const [timing, setTiming] = useState(defaults.timing);
  const setTime = (change: Partial<MomDefaults["timing"]>) => setTiming((current) => ({ ...current, ...change }));
  const extraMinutes = timing.extended ? minutesAfter(timing.scheduledEnd, timing.endTime) : 0;
  const json = useMemo(
    () =>
      JSON.stringify({
        discussions: Object.entries(discussions).map(([pointId, text]) => ({ pointId: Number(pointId), text })),
        decisions: decisions.map((row) => row.text),
        actions: actions.map(({ title, description, ownerId, priority, dueOn }) => ({ title, description, ownerId, priority, dueOn })),
        openPoints: openPoints.map(({ text, ownerId, reviewOn }) => ({ text, ownerId, reviewOn })),
        attendance: Object.entries(present).map(([userId, value]) => ({ userId: Number(userId), attendance: value ? "PRESENT" : "ABSENT" })),
        timing: { startedOnTime: timing.startedOnTime, startTime: timing.startTime, extended: timing.extended, endTime: timing.endTime, pointsOnTime: timing.pointsOnTime, momOnTime: timing.momOnTime },
      }),
    [discussions, decisions, actions, openPoints, present, timing],
  );
  const setAction = (key: string, change: Partial<ActionRow>) => setActions((current) => current.map((row) => (row.key === key ? { ...row, ...change } : row)));
  const setOpen = (key: string, change: Partial<OpenRow>) => setOpenPoints((current) => current.map((row) => (row.key === key ? { ...row, ...change } : row)));
  return (
    <form onSubmit={onSubmit} className="space-y-6" aria-label="Minutes of meeting">
      <UnsavedGuard />
      <input type="hidden" name="meetingId" value={meetingId} />
      <input type="hidden" name="rowVersion" value={rowVersion} />
      <input type="hidden" name="mom" value={json} />

      <section aria-labelledby="mom-timing" className="space-y-3 rounded-md border border-line p-3" data-testid="mom-timing">
        <h3 id="mom-timing" className="font-semibold">
          Timing
        </h3>
        <p className="text-caption text-ink-muted">
          Scheduled {timing.scheduledStart} to {timing.scheduledEnd}. Tick what applies.
        </p>
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
          <label className="flex items-center gap-2 text-label">
            <input type="checkbox" checked={timing.startedOnTime} onChange={(event) => setTime({ startedOnTime: event.target.checked })} /> Started on time
          </label>
          {!timing.startedOnTime && (
            <label className="flex items-center gap-2 text-label">
              Started at <input type="time" value={timing.startTime} onChange={(event) => setTime({ startTime: event.target.value })} required className="field-input h-9 w-auto" />
            </label>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
          <label className="flex items-center gap-2 text-label">
            <input type="checkbox" checked={timing.extended} onChange={(event) => setTime({ extended: event.target.checked })} /> Meeting was extended
          </label>
          {timing.extended && (
            <>
              <label className="flex items-center gap-2 text-label">
                Ended at <input type="time" value={timing.endTime} onChange={(event) => setTime({ endTime: event.target.value })} required className="field-input h-9 w-auto" />
              </label>
              <span className="text-label font-semibold text-warning-600" data-testid="extended-by">
                {extraMinutes > 0 ? `Extended by ${extraMinutes} min` : "Enter a time after the scheduled end"}
              </span>
            </>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
          <label className="flex items-center gap-2 text-label">
            <input type="checkbox" checked={timing.pointsOnTime} onChange={(event) => setTime({ pointsOnTime: event.target.checked })} /> Points shared in time
          </label>
          <label className="flex items-center gap-2 text-label">
            <input type="checkbox" checked={timing.momOnTime} onChange={(event) => setTime({ momOnTime: event.target.checked })} /> MOM in time
          </label>
        </div>
      </section>

      <section aria-labelledby="mom-attendance">
        <h3 id="mom-attendance" className="mb-1 font-semibold">
          Attendance
        </h3>
        <p className="mb-2 text-caption text-ink-muted">Ticked = present; not ticked = absent.</p>
        <ul className="grid gap-x-6 gap-y-1.5 sm:grid-cols-2">
          {defaults.attendance.map((row) => (
            <li key={row.userId}>
              <label className="flex items-center gap-2 text-label">
                <input type="checkbox" checked={present[row.userId] ?? false} onChange={(event) => setPresent((current) => ({ ...current, [row.userId]: event.target.checked }))} aria-label={`${row.name} present`} />
                {row.name}
              </label>
            </li>
          ))}
        </ul>
      </section>

      <section aria-labelledby="mom-discussion">
        <h3 id="mom-discussion" className="mb-2 font-semibold">
          Discussion, point by point
        </h3>
        {defaults.points.length === 0 ? (
          <p className="text-label text-ink-muted">No meeting points were added.</p>
        ) : (
          <ol className="space-y-3">
            {defaults.points.map((point, index) => (
              <li key={point.id}>
                <label htmlFor={`disc-${point.id}`} className="field-label">
                  {index + 1}. {point.title}
                </label>
                <textarea
                  id={`disc-${point.id}`}
                  rows={3}
                  maxLength={8000}
                  value={discussions[point.id] ?? ""}
                  onChange={(event) => setDiscussions((current) => ({ ...current, [point.id]: event.target.value }))}
                  className="field-input h-auto py-2"
                />
              </li>
            ))}
          </ol>
        )}
      </section>

      <section aria-labelledby="mom-decisions">
        <h3 id="mom-decisions" className="mb-2 font-semibold">
          Decisions
        </h3>
        <ul className="space-y-2">
          {decisions.map((row, index) => (
            <li key={row.key} className="flex items-center gap-2">
              <label className="sr-only" htmlFor={`dec-${row.key}`}>
                Decision {index + 1}
              </label>
              <input
                id={`dec-${row.key}`}
                value={row.text}
                maxLength={1000}
                onChange={(event) => setDecisions((current) => current.map((item) => (item.key === row.key ? { ...item, text: event.target.value } : item)))}
                className="field-input"
              />
              <button
                type="button"
                className="btn-secondary btn-compact text-danger-600"
                aria-label={`Remove decision ${index + 1}`}
                onClick={() => setDecisions((current) => current.filter((item) => item.key !== row.key))}
              >
                <Trash2 className="h-4 w-4" aria-hidden />
              </button>
            </li>
          ))}
        </ul>
        <button type="button" className="btn-secondary btn-compact mt-2" onClick={() => setDecisions((current) => [...current, { key: nextKey(), text: "" }])}>
          <Plus className="h-4 w-4" aria-hidden /> Add a decision
        </button>
      </section>

      <section aria-labelledby="mom-actions">
        <h3 id="mom-actions" className="mb-1 font-semibold">
          Action items
        </h3>
        <p className="mb-2 text-caption text-ink-muted">Each action item becomes a task for its owner when the MOM is approved.</p>
        {defaults.tasked.length > 0 && (
          <ul className="mb-2 space-y-1 text-label text-ink-muted">
            {defaults.tasked.map((row, index) => (
              <li key={index}>
                {row.taskNo ?? "Task"}: {row.title} ({row.ownerName}), already a task
              </li>
            ))}
          </ul>
        )}
        <ol className="space-y-3">
          {actions.map((row, index) => (
            <li key={row.key} className="space-y-2 rounded-md border border-line p-3">
              <div className="flex items-start gap-2">
                <div className="min-w-0 flex-1">
                  <label className="field-label" htmlFor={`act-${row.key}`}>
                    Action {index + 1}
                  </label>
                  <input
                    id={`act-${row.key}`}
                    value={row.title}
                    maxLength={200}
                    onChange={(event) => setAction(row.key, { title: event.target.value })}
                    className="field-input"
                    placeholder="What needs doing"
                  />
                </div>
                <button
                  type="button"
                  className="btn-secondary btn-compact mt-6 text-danger-600"
                  aria-label={`Remove action ${index + 1}`}
                  onClick={() => setActions((current) => current.filter((item) => item.key !== row.key))}
                >
                  <Trash2 className="h-4 w-4" aria-hidden />
                </button>
              </div>
              <div className="grid gap-3 md:grid-cols-3">
                <PeoplePicker options={people} label="Responsible" max={1} value={row.ownerId ? [row.ownerId] : []} onChange={(chosen) => setAction(row.key, { ownerId: chosen[0] ?? null })} />
                <div>
                  <label className="field-label" htmlFor={`act-pri-${row.key}`}>
                    Priority
                  </label>
                  <select id={`act-pri-${row.key}`} value={row.priority} onChange={(event) => setAction(row.key, { priority: event.target.value as MeetingPriority })} className="field-input">
                    {PRIORITIES.map((priority) => (
                      <option key={priority} value={priority}>
                        {PRIORITY_LABEL[priority]}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="field-label" htmlFor={`act-due-${row.key}`}>
                    Due date
                  </label>
                  <input id={`act-due-${row.key}`} type="date" value={row.dueOn} onChange={(event) => setAction(row.key, { dueOn: event.target.value })} className="field-input" />
                </div>
              </div>
              <div>
                <label className="field-label" htmlFor={`act-desc-${row.key}`}>
                  Details (optional)
                </label>
                <textarea
                  id={`act-desc-${row.key}`}
                  rows={2}
                  maxLength={2000}
                  value={row.description}
                  onChange={(event) => setAction(row.key, { description: event.target.value })}
                  className="field-input h-auto py-2"
                />
              </div>
            </li>
          ))}
        </ol>
        <button
          type="button"
          className="btn-secondary btn-compact mt-2"
          onClick={() => setActions((current) => [...current, { key: nextKey(), title: "", description: "", ownerId: null, priority: "NORMAL", dueOn: "" }])}
        >
          <Plus className="h-4 w-4" aria-hidden /> Add an action item
        </button>
      </section>

      <section aria-labelledby="mom-open">
        <h3 id="mom-open" className="mb-1 font-semibold">
          Open points
        </h3>
        <p className="mb-2 text-caption text-ink-muted">Matters to revisit later, without a task. They carry into the follow-up meeting until closed.</p>
        <ul className="space-y-3">
          {openPoints.map((row, index) => (
            <li key={row.key} className="space-y-2 rounded-md border border-line p-3">
              <div className="flex items-start gap-2">
                <div className="min-w-0 flex-1">
                  <label className="field-label" htmlFor={`open-${row.key}`}>
                    Open point {index + 1}
                  </label>
                  <input id={`open-${row.key}`} value={row.text} maxLength={1000} onChange={(event) => setOpen(row.key, { text: event.target.value })} className="field-input" />
                </div>
                <button
                  type="button"
                  className="btn-secondary btn-compact mt-6 text-danger-600"
                  aria-label={`Remove open point ${index + 1}`}
                  onClick={() => setOpenPoints((current) => current.filter((item) => item.key !== row.key))}
                >
                  <Trash2 className="h-4 w-4" aria-hidden />
                </button>
              </div>
              <div className="grid gap-3 md:grid-cols-2">
                <PeoplePicker
                  options={people}
                  label="Who follows it up (optional)"
                  max={1}
                  value={row.ownerId ? [row.ownerId] : []}
                  onChange={(chosen) => setOpen(row.key, { ownerId: chosen[0] ?? null })}
                />
                <div>
                  <label className="field-label" htmlFor={`open-on-${row.key}`}>
                    Review on (optional)
                  </label>
                  <input id={`open-on-${row.key}`} type="date" value={row.reviewOn} onChange={(event) => setOpen(row.key, { reviewOn: event.target.value })} className="field-input" />
                </div>
              </div>
            </li>
          ))}
        </ul>
        <button type="button" className="btn-secondary btn-compact mt-2" onClick={() => setOpenPoints((current) => [...current, { key: nextKey(), text: "", ownerId: null, reviewOn: "" }])}>
          <Plus className="h-4 w-4" aria-hidden /> Add an open point
        </button>
      </section>

      <ResultMessage result={result} />
      <div className="flex flex-wrap justify-end gap-2">
        <button type="submit" name="action" value="SAVE_MOM" className="btn-secondary" disabled={pending}>
          Save MOM
        </button>
        {canSubmit && (
          <button type="submit" name="action" value="SUBMIT_MOM" className="btn-primary" disabled={pending}>
            {selfApprove ? "Approve MOM and create tasks" : "Send MOM to Meeting Owner"}
          </button>
        )}
      </div>
    </form>
  );
}

// ---- follow-up of an action item -------------------------------------------------------------
export function ActionReviewForm({ actionId, canConfirm, canSendBack }: { actionId: number; canConfirm: boolean; canSendBack: boolean }) {
  const [mode, setMode] = useState<"" | "SEND_BACK" | "NOTE">("");
  const { result, pending, onSubmit } = useActionForm(reviewMeetingAction);
  return (
    <form onSubmit={onSubmit} className="space-y-2" aria-label="Follow up the action">
      <input type="hidden" name="actionId" value={actionId} />
      {mode && (
        <div>
          <label htmlFor={`note-${actionId}`} className="field-label">
            {mode === "SEND_BACK" ? "What is still needed" : "Follow-up note"}
          </label>
          <textarea id={`note-${actionId}`} name="note" rows={2} maxLength={1000} required className="field-input h-auto py-2" />
        </div>
      )}
      <div className="flex flex-wrap gap-2">
        {!mode && canConfirm && (
          <button type="submit" name="decision" value="CONFIRM" className="btn-primary btn-compact" disabled={pending}>
            Confirm done
          </button>
        )}
        {!mode && canSendBack && (
          <button type="button" className="btn-secondary btn-compact" onClick={() => setMode("SEND_BACK")}>
            Send back
          </button>
        )}
        {!mode && (
          <button type="button" className="btn-secondary btn-compact" onClick={() => setMode("NOTE")}>
            Add note
          </button>
        )}
        {mode && (
          <>
            <button type="submit" name="decision" value={mode} className="btn-primary btn-compact" disabled={pending}>
              {mode === "SEND_BACK" ? "Send back" : "Save note"}
            </button>
            <button type="button" className="btn-secondary btn-compact" onClick={() => setMode("")}>
              Cancel
            </button>
          </>
        )}
      </div>
      <ResultMessage result={result} />
    </form>
  );
}

export function CloseOpenPointForm({ pointId }: { pointId: number }) {
  const [open, setOpen] = useState(false);
  const { result, pending, onSubmit } = useActionForm(closeOpenPointAction);
  if (!open)
    return (
      <button type="button" className="btn-secondary btn-compact" onClick={() => setOpen(true)}>
        Close point
      </button>
    );
  return (
    <form onSubmit={onSubmit} className="space-y-2" aria-label="Close the open point">
      <input type="hidden" name="pointId" value={pointId} />
      <label htmlFor={`close-${pointId}`} className="field-label">
        How it was closed
      </label>
      <textarea id={`close-${pointId}`} name="note" rows={2} maxLength={1000} required className="field-input h-auto py-2" />
      <div className="flex gap-2">
        <SubmitButton pending={pending} className="btn-compact">
          Close point
        </SubmitButton>
        <button type="button" className="btn-secondary btn-compact" onClick={() => setOpen(false)}>
          Cancel
        </button>
      </div>
      <ResultMessage result={result} />
    </form>
  );
}
