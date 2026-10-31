"use client";

import { Bell, BellOff, ChevronDown, Mail, MessageCircle, Moon, Sunrise } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { savePreferencesAction } from "@/app/users/preferences-actions";
import { ResultMessage, SubmitButton, useActionForm } from "@/features/ui/form";
import { Hint } from "@/features/ui/Hint";
import type { Channel } from "@/server/notifications/preferences";
import { UnsavedGuard } from "@/features/ui/UnsavedGuard";

// D-231 (owner's screenshots of Asana's notification settings): the whole
// app's notifications in one place. For the app, email and WhatsApp: each
// group with a tick for all of it and a tick per kind of message (the
// must-reach ones are locked on); the morning summary; Do not disturb (pause,
// quiet hours, days off). One Save keeps everything.
export interface CenterGroup {
  key: string;
  label: string;
  help: string;
  mandatory: boolean;
  events: { key: string; label: string; on: Record<Channel, boolean> }[];
}
export interface CenterDnd {
  pausedUntil: string | null;
  pausedText: string | null;
  quiet: { from: string; to: string } | null;
  daysOff: number[];
}

const CHANNEL: Record<Channel, { title: string; by: string; help: string; icon: typeof Bell }> = {
  INAPP: { title: "In the app", by: "in the app", help: "The bell and pop-ups here. Switched off, a message is still kept under Notifications, already read.", icon: Bell },
  EMAIL: { title: "Email", by: "by email", help: "Sent to your email address.", icon: Mail },
  WHATSAPP: { title: "WhatsApp", by: "by WhatsApp", help: "Sent to your WhatsApp number.", icon: MessageCircle },
};
const DAYS = [
  [1, "Mon"],
  [2, "Tue"],
  [3, "Wed"],
  [4, "Thu"],
  [5, "Fri"],
  [6, "Sat"],
  [0, "Sun"],
] as const;

function GroupTicks({ group, channel, state, setState }: { group: CenterGroup; channel: Channel; state: Record<string, boolean>; setState: (changes: Record<string, boolean>) => void }) {
  const keys = group.events.map((event) => `E:${event.key}:${channel}`);
  const onCount = keys.filter((key) => group.mandatory || state[key]).length;
  const all = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (all.current) all.current.indeterminate = onCount > 0 && onCount < keys.length;
  }, [onCount, keys.length]);
  return (
    <fieldset className="border-t border-line py-3 first:border-t-0" data-testid={`group-${group.key}-${channel}`}>
      <legend className="sr-only">{group.label}</legend>
      <label className="flex items-center gap-2 font-semibold">
        <input
          ref={all}
          type="checkbox"
          className="h-6 w-6 shrink-0"
          checked={onCount === keys.length}
          disabled={group.mandatory}
          aria-label={`${group.label} ${CHANNEL[channel].by}`}
          onChange={(event) => setState(Object.fromEntries(keys.map((key) => [key, event.target.checked])))}
        />
        {group.label}
        <Hint text={group.help} align="start" />
        {group.mandatory && <span className="badge bg-surface-muted text-ink-muted">Always on</span>}
      </label>
      {/* The must-reach groups are one line: nothing in them can be switched off. */}
      {!group.mandatory && (
        <ul className="mt-1 pl-6">
          {group.events.map((event) => {
            const key = `E:${event.key}:${channel}`;
            return (
              <li key={key}>
                <label className="flex min-h-7 items-center gap-2 text-label">
                  <input
                    type="checkbox"
                    className="h-6 w-6 shrink-0"
                    name={group.mandatory ? undefined : key}
                    checked={group.mandatory || Boolean(state[key])}
                    disabled={group.mandatory}
                    onChange={(change) => setState({ [key]: change.target.checked })}
                    aria-label={`${event.label} ${CHANNEL[channel].by}`}
                  />
                  {event.label}
                </label>
              </li>
            );
          })}
        </ul>
      )}
    </fieldset>
  );
}

function Card({ icon: Icon, title, help, children, testId }: { icon: typeof Bell; title: string; help: string; children: React.ReactNode; testId: string }) {
  return (
    <details open className="card group" data-testid={testId}>
      <summary className="flex cursor-pointer list-none items-center gap-3 px-5 py-4">
        <Icon aria-hidden="true" className="h-5 w-5 shrink-0 text-primary-700" />
        <span className="min-w-0 flex-1">
          <span className="block font-semibold">{title}</span>
          <span className="block text-caption text-ink-muted">{help}</span>
        </span>
        <ChevronDown aria-hidden="true" className="h-4 w-4 shrink-0 text-ink-muted transition-transform group-open:rotate-180" />
      </summary>
      <div className="border-t border-line px-5 py-2">{children}</div>
    </details>
  );
}

export function NotificationCenter({ groups, channels, digest, dnd }: { groups: CenterGroup[]; channels: Channel[]; digest: boolean; dnd: CenterDnd }) {
  const { result, pending, onSubmit } = useActionForm(savePreferencesAction);
  const [state, setStateRaw] = useState<Record<string, boolean>>(() =>
    Object.fromEntries(groups.flatMap((group) => group.events.flatMap((event) => channels.map((channel) => [`E:${event.key}:${channel}`, event.on[channel]] as const)))),
  );
  const setState = (changes: Record<string, boolean>) => setStateRaw((current) => ({ ...current, ...changes }));
  const [quietOn, setQuietOn] = useState(Boolean(dnd.quiet));
  const [days, setDays] = useState<number[]>(dnd.daysOff);
  return (
    <form onSubmit={onSubmit} className="space-y-4" data-testid="notification-center">
      <UnsavedGuard />
      {channels.map((channel) => (
        <Card key={channel} icon={CHANNEL[channel].icon} title={`${CHANNEL[channel].title} notifications`} help={CHANNEL[channel].help} testId={`channel-${channel}`}>
          {groups.map((group) => (
            <GroupTicks key={group.key} group={group} channel={channel} state={state} setState={setState} />
          ))}
        </Card>
      ))}
      <Card icon={Sunrise} title="Summaries" help="Round-ups instead of single messages." testId="summaries">
        <label className="flex items-center gap-2 py-3 text-label">
          <input type="checkbox" name="digest" defaultChecked={digest} className="h-6 w-6 shrink-0" />
          Morning summary of your tasks on working days (overdue, due today, new)
        </label>
      </Card>
      <Card icon={Moon} title="Do not disturb" help="Hold email and WhatsApp for a while, every night or on your days off. Sign-in and security messages still come." testId="dnd">
        <div className="space-y-4 py-3 text-label">
          <div className="flex flex-wrap items-center gap-3">
            {dnd.pausedText ? (
              <p className="inline-flex items-center gap-1.5 font-semibold text-warning-600" data-testid="dnd-paused">
                <BellOff aria-hidden="true" className="h-6 w-6 shrink-0" /> Notifications paused until {dnd.pausedText}
              </p>
            ) : (
              <p className="text-ink-muted">Notifications are on.</p>
            )}
            <label htmlFor="dnd-pause" className="sr-only">
              Pause notifications
            </label>
            <select id="dnd-pause" name="pause" defaultValue="keep" className="field-input h-9 w-auto">
              <option value="keep">{dnd.pausedText ? "Keep the pause" : "Don't pause"}</option>
              <option value="1h">Pause for 1 hour</option>
              <option value="3h">Pause for 3 hours</option>
              <option value="tomorrow">Pause until tomorrow 9:00</option>
              <option value="week">Pause for a week</option>
              {dnd.pausedText && <option value="resume">Resume notifications now</option>}
            </select>
          </div>
          <fieldset>
            <legend className="mb-2 font-semibold">Schedule</legend>
            <div className="flex flex-wrap items-center gap-2">
              <label className="flex items-center gap-2">
                <input type="checkbox" name="quiet" checked={quietOn} onChange={(event) => setQuietOn(event.target.checked)} className="h-6 w-6 shrink-0" />
                Do not notify me from
              </label>
              <input type="time" name="quietFrom" aria-label="Quiet from" defaultValue={dnd.quiet?.from ?? "19:00"} disabled={!quietOn} className="field-input h-9 w-32" />
              <span>to</span>
              <input type="time" name="quietTo" aria-label="Quiet to" defaultValue={dnd.quiet?.to ?? "09:00"} disabled={!quietOn} className="field-input h-9 w-32" />
            </div>
          </fieldset>
          <fieldset>
            <legend className="mb-2 font-semibold">Do not disturb me on my days off</legend>
            <div className="inline-flex overflow-hidden rounded-md border border-line-strong" role="group" aria-label="Days off">
              {DAYS.map(([day, label]) => {
                const on = days.includes(day);
                return (
                  <label key={day} className={`cursor-pointer border-l border-line-strong px-3 py-1.5 first:border-l-0 ${on ? "bg-primary-solid font-semibold text-on-solid" : "hover:bg-surface-muted"}`}>
                    <input type="checkbox" name="dayOff" value={day} checked={on} onChange={() => setDays((value) => (on ? value.filter((item) => item !== day) : [...value, day]))} className="sr-only" />
                    {label}
                  </label>
                );
              })}
            </div>
          </fieldset>
        </div>
      </Card>
      <div className="sticky bottom-0 z-10 flex flex-wrap items-center gap-3 border-t border-line bg-[var(--color-surface-page)] py-3">
        <SubmitButton pending={pending} className="btn-compact">
          Save choices
        </SubmitButton>
        <ResultMessage result={result} />
      </div>
    </form>
  );
}
