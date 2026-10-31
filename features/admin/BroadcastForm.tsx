"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Send, Users } from "lucide-react";
import { PeoplePicker, type PersonOption } from "@/features/ui/PeoplePicker";
import { ConfirmDialog } from "@/features/ui/Dialog";
import { previewBroadcastAction, sendBroadcastAction } from "@/app/admin/notifications/actions";

// D-252: Admin → Notifications → Send. Who it reaches is counted on the
// server before sending, and Send always asks first.
const CATEGORIES = [
  { value: "ANNOUNCEMENT", label: "Announcement" },
  { value: "MANAGEMENT", label: "Management notice" },
  { value: "SYSTEM", label: "System notice" },
  { value: "IMPORTANT", label: "Important alert (can't be switched off)" },
] as const;

export function BroadcastForm({ people, departments, roles }: { people: PersonOption[]; departments: { id: number; name: string }[]; roles: { code: string; name: string }[] }) {
  const router = useRouter();
  const [title, setTitle] = useState("");
  const [message, setMessage] = useState("");
  const [category, setCategory] = useState<(typeof CATEGORIES)[number]["value"]>("ANNOUNCEMENT");
  const [priority, setPriority] = useState<"NORMAL" | "HIGH">("NORMAL");
  const [link, setLink] = useState("");
  const [everyone, setEveryone] = useState(false);
  const [userIds, setUserIds] = useState<number[]>([]);
  const [departmentIds, setDepartmentIds] = useState<number[]>([]);
  const [roleCodes, setRoleCodes] = useState<string[]>([]);
  const [hods, setHods] = useState(false);
  const [managers, setManagers] = useState(false);
  const [reach, setReach] = useState<{ people: number; devices: number } | null>(null);
  const [confirm, setConfirm] = useState(false);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; message: string; fieldErrors?: Record<string, string> } | null>(null);

  const audience = { everyone, userIds, departmentIds, roleCodes, hods, managers };
  const toggle = <T,>(list: T[], value: T) => (list.includes(value) ? list.filter((item) => item !== value) : [...list, value]);
  const changed = () => setReach(null);

  const check = async () => {
    setBusy(true);
    const answer = await previewBroadcastAction(audience).catch(() => ({ ok: false, message: "Couldn't count. Please try again." }));
    setBusy(false);
    if (answer.ok && "people" in answer) setReach({ people: answer.people ?? 0, devices: answer.devices ?? 0 });
    else setResult({ ok: false, message: answer.message ?? "Choose who it goes to." });
    return answer.ok;
  };
  const send = async () => {
    setConfirm(false);
    setBusy(true);
    const answer = await sendBroadcastAction({ title, message, category, priority, link, audience }).catch(() => ({ ok: false, message: "Couldn't send. Please try again." }));
    setBusy(false);
    setResult(answer);
    if (answer.ok) {
      setTitle("");
      setMessage("");
      setLink("");
      setReach(null);
      router.refresh();
    }
  };
  const errors = result?.fieldErrors ?? {};

  return (
    <form
      className="space-y-5"
      data-testid="broadcast-form"
      onSubmit={async (event) => {
        event.preventDefault();
        setResult(null);
        if (await check()) setConfirm(true);
      }}
    >
      <div className="grid gap-4 md:grid-cols-2">
        <label className="block md:col-span-2">
          <span className="field-label">Title</span>
          <input className="field-input w-full" value={title} maxLength={120} onChange={(event) => setTitle(event.target.value)} aria-invalid={Boolean(errors.title)} required />
          <span className="mt-1 flex justify-between text-caption text-ink-muted">
            <span className="text-danger-600">{errors.title}</span>
            <span>{title.length} / 120</span>
          </span>
        </label>
        <label className="block md:col-span-2">
          <span className="field-label">Message</span>
          <textarea className="field-input h-auto min-h-24 py-2" value={message} maxLength={500} onChange={(event) => setMessage(event.target.value)} aria-invalid={Boolean(errors.message)} required />
          <span className="mt-1 flex justify-between text-caption text-ink-muted">
            <span className="text-danger-600">{errors.message ?? "Shown in the Inbox and on phones and computers. Keep private details out of it."}</span>
            <span>{message.length} / 500</span>
          </span>
        </label>
        <label className="block">
          <span className="field-label">Category</span>
          <select className="field-input w-full" value={category} onChange={(event) => setCategory(event.target.value as typeof category)}>
            {CATEGORIES.map((item) => (
              <option key={item.value} value={item.value}>
                {item.label}
              </option>
            ))}
          </select>
        </label>
        <label className="block">
          <span className="field-label">Priority</span>
          <select className="field-input w-full" value={priority} onChange={(event) => setPriority(event.target.value as "NORMAL" | "HIGH")}>
            <option value="NORMAL">Normal</option>
            <option value="HIGH">High (stays on screen until opened)</option>
          </select>
        </label>
        <label className="block md:col-span-2">
          <span className="field-label">Page to open (optional)</span>
          <input className="field-input w-full" value={link} placeholder="/users/information or /users/calendar" onChange={(event) => setLink(event.target.value)} aria-invalid={Boolean(errors.link)} />
          <span className="mt-1 block text-caption text-ink-muted">{errors.link ?? "A page of the app starting with /users. Empty: the Inbox."}</span>
        </label>
      </div>

      <fieldset className="rounded-md border border-line p-4" aria-describedby="audience-help">
        <legend className="px-1 text-label font-semibold">Who it goes to</legend>
        <p id="audience-help" className="mb-3 text-caption text-ink-muted">
          Active people only. Anyone matching any choice gets it once.
        </p>
        <label className="mb-3 flex items-center gap-2 text-label">
          <input
            type="checkbox"
            className="h-4 w-4"
            checked={everyone}
            onChange={(event) => {
              setEveryone(event.target.checked);
              changed();
            }}
          />
          Everyone active
        </label>
        {!everyone && (
          <div className="grid gap-4 lg:grid-cols-2">
            <div className="lg:col-span-2">
              <PeoplePicker
                label="People"
                options={people}
                max={500}
                value={userIds}
                onChange={(ids) => {
                  setUserIds(ids);
                  changed();
                }}
              />
            </div>
            <div>
              <p className="field-label">Departments</p>
              <div className="max-h-48 space-y-1 overflow-y-auto rounded-md border border-line p-2">
                {departments.map((department) => (
                  <label key={department.id} className="flex items-center gap-2 text-label">
                    <input
                      type="checkbox"
                      className="h-4 w-4"
                      checked={departmentIds.includes(department.id)}
                      onChange={() => {
                        setDepartmentIds(toggle(departmentIds, department.id));
                        changed();
                      }}
                    />
                    {department.name}
                  </label>
                ))}
              </div>
            </div>
            <div className="space-y-3">
              <div>
                <p className="field-label">Roles</p>
                <div className="space-y-1 rounded-md border border-line p-2">
                  {roles.map((role) => (
                    <label key={role.code} className="flex items-center gap-2 text-label">
                      <input
                        type="checkbox"
                        className="h-4 w-4"
                        checked={roleCodes.includes(role.code)}
                        onChange={() => {
                          setRoleCodes(toggle(roleCodes, role.code));
                          changed();
                        }}
                      />
                      {role.name}
                    </label>
                  ))}
                </div>
              </div>
              <label className="flex items-center gap-2 text-label">
                <input
                  type="checkbox"
                  className="h-4 w-4"
                  checked={hods}
                  onChange={(event) => {
                    setHods(event.target.checked);
                    changed();
                  }}
                />
                Heads of department
              </label>
              <label className="flex items-center gap-2 text-label">
                <input
                  type="checkbox"
                  className="h-4 w-4"
                  checked={managers}
                  onChange={(event) => {
                    setManagers(event.target.checked);
                    changed();
                  }}
                />
                Managers (everyone with someone reporting to them)
              </label>
            </div>
          </div>
        )}
        {errors.audience && <p className="mt-2 text-label text-danger-600">{errors.audience}</p>}
      </fieldset>

      <div className="flex flex-wrap items-center gap-3">
        <button type="button" className="btn-secondary inline-flex items-center gap-1.5" onClick={() => void check()} disabled={busy}>
          <Users className="h-4 w-4" aria-hidden="true" /> Count who it reaches
        </button>
        <button type="submit" className="btn-primary inline-flex items-center gap-1.5" disabled={busy}>
          <Send className="h-4 w-4" aria-hidden="true" /> {busy ? "Working…" : "Send"}
        </button>
        {reach && (
          <span className="text-label text-ink-muted" data-testid="broadcast-reach">
            Reaches {reach.people} {reach.people === 1 ? "person" : "people"} ({reach.devices} registered device{reach.devices === 1 ? "" : "s"}).
          </span>
        )}
      </div>
      {result && (
        <p role="status" className={`text-label ${result.ok ? "text-success-600" : "text-danger-600"}`} data-testid="broadcast-result">
          {result.message}
        </p>
      )}
      <ConfirmDialog
        open={confirm}
        title="Send this notification?"
        body={reach ? `It goes to ${reach.people} ${reach.people === 1 ? "person" : "people"} now and can't be called back.` : "It goes out now and can't be called back."}
        confirmLabel="Send now"
        onConfirm={() => void send()}
        onCancel={() => setConfirm(false)}
      />
    </form>
  );
}
