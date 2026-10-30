"use client";

import { CalendarDays, ChevronDown, Repeat, X } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { quickAddAction, recurrenceAction } from "@/app/users/work/actions";
import { CREATE_TASK_EVENT, ProjectDot, useWorkCall } from "@/features/work/client";
import { RECURRENCE_KINDS, type Recurrence } from "@/server/work/more-rules";

// D-221 (owner): "Create → Task" anywhere in the app opens Asana's Draft
// task panel (bottom right). Mounted once in the users layout; anything can
// ask for it with CREATE_TASK_EVENT (detail.projectId picks the project).
type RailProject = { id: number; name: string; color: string };

export function TaskCreator({ projects, people, meId }: { projects: RailProject[]; people: { id: number; label: string }[]; meId: number }) {
  const [open, setOpen] = useState<{ projectId: number | null } | null>(null);
  useEffect(() => {
    const onCreate = (event: Event) => setOpen({ projectId: (event as CustomEvent<{ projectId?: number | null } | null>).detail?.projectId ?? null });
    window.addEventListener(CREATE_TASK_EVENT, onCreate);
    return () => window.removeEventListener(CREATE_TASK_EVENT, onCreate);
  }, []);
  return open ? <CreateTaskDialog key={String(open.projectId)} onClose={() => setOpen(null)} projects={projects} people={people} meId={meId} defaultProject={open.projectId} /> : null;
}

const UNIT: Record<(typeof RECURRENCE_KINDS)[number], string> = { DAILY: "days", WEEKLY: "weeks", MONTHLY: "months", YEARLY: "years", AFTER_DONE: "days after it is completed" };
const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

// D-220 (owner's screenshot: Asana's "Draft task"): a panel at the bottom
// right: Task name; "For <people> in <project>"; Description; then the
// due date, repeat (periodic) and Create task. Ad hoc unless a repeat is set.
function CreateTaskDialog({ onClose, projects, people, meId, defaultProject }: { onClose: () => void; projects: RailProject[]; people: { id: number; label: string }[]; meId: number; defaultProject: number | null }) {
  const router = useRouter();
  const { call, pending } = useWorkCall();
  const [title, setTitle] = useState("");
  // D-222: an ad hoc task may go to several people (one copy each); a periodic one to one.
  const [assignees, setAssignees] = useState<number[]>([meId]);
  const [due, setDue] = useState("");
  const [project, setProject] = useState<number | "">(defaultProject ?? "");
  const [description, setDescription] = useState("");
  const [periodic, setPeriodic] = useState(false);
  const [kind, setKind] = useState<Recurrence["kind"]>("WEEKLY");
  const [every, setEvery] = useState(1);
  const [weekdays, setWeekdays] = useState<number[]>([]);
  const [small, setSmall] = useState(false);
  const [picking, setPicking] = useState<"" | "assignee" | "project" | "due" | "repeat">("");
  const name = useRef<HTMLInputElement>(null);
  useEffect(() => {
    name.current?.focus();
  }, []);
  const label = (id: number) => people.find((item) => item.id === id)?.label ?? "Me";
  const chosen = projects.find((item) => item.id === project);
  const submit = async () => {
    if (!title.trim()) return;
    const result = await call(
      (choice) =>
        quickAddAction({ title, assigneeId: assignees[0] ?? meId, assigneeIds: !periodic && assignees.length > 1 ? assignees : undefined, dueDay: choice?.moveTo ?? due, holidayOk: choice?.holidayOk, projectId: project === "" ? null : project, description }),
      { success: false },
    );
    if (!result?.ok || !result.value) return;
    const id = result.value.id;
    if (periodic) await call(() => recurrenceAction(id, { kind, every, weekdays: kind === "WEEKLY" ? weekdays : [] }), { success: false });
    onClose();
    router.push(project === "" ? `/users/work/my-tasks?task=${id}` : `/users/work/projects/${project}?task=${id}`);
  };
  const chip = "inline-flex items-center gap-1 rounded-full border border-line px-2 py-0.5 text-label hover:border-line-strong";
  return (
    <section
      role="dialog"
      aria-modal="false"
      aria-labelledby="draft-task-title"
      data-testid="create-dialog"
      onKeyDown={(event) => {
        if (event.key === "Escape") onClose();
        if (event.key === "Enter" && (event.ctrlKey || event.metaKey)) void submit();
      }}
      className="fixed bottom-4 right-4 z-50 flex w-[min(560px,calc(100vw-2rem))] flex-col rounded-xl border border-line bg-raised text-ink shadow-overlay"
    >
      <header className="flex items-center gap-2 border-b border-line px-4 py-2.5">
        <h2 id="draft-task-title" className="flex-1 text-label font-semibold text-ink-muted">
          Draft task
        </h2>
        <button type="button" aria-label={small ? "Expand" : "Minimise"} onClick={() => setSmall((value) => !value)} className="rounded p-1 text-ink-muted hover:bg-surface-muted">
          <ChevronDown aria-hidden="true" className={`h-4 w-4 ${small ? "rotate-180" : ""}`} />
        </button>
        <button type="button" aria-label="Close" onClick={onClose} className="rounded p-1 text-ink-muted hover:bg-surface-muted">
          <X aria-hidden="true" className="h-4 w-4" />
        </button>
      </header>
      {!small && (
        <form
          className="flex flex-col gap-3 px-5 py-4"
          onSubmit={(event) => {
            event.preventDefault();
            void submit();
          }}
        >
          <label htmlFor="create-title" className="sr-only">
            Task name
          </label>
          <input ref={name} id="create-title" required maxLength={200} placeholder="Task name" value={title} onChange={(event) => setTitle(event.target.value)} className="w-full bg-transparent text-title font-semibold placeholder:text-ink-faint focus:outline-none" />
          <div className="flex flex-wrap items-center gap-2 text-label">
            <span className="text-ink-muted">For</span>
            {assignees.map((id) => (
              <span key={id} className={chip} data-testid="assignee-chip">
                {label(id)}
                {assignees.length > 1 && (
                  <button type="button" aria-label={`Remove ${label(id)}`} onClick={() => setAssignees((value) => value.filter((item) => item !== id))} className="text-ink-faint hover:text-danger-600">
                    <X aria-hidden="true" className="h-3 w-3" />
                  </button>
                )}
              </span>
            ))}
            {picking === "assignee" ? (
              <select
                autoFocus
                aria-label="Add an assignee"
                value=""
                onChange={(event) => {
                  const id = Number(event.target.value);
                  // Periodic: one person (the choice replaces); ad hoc: add people.
                  setAssignees((value) => (periodic ? [id] : value.includes(id) ? value : value[0] === meId && value.length === 1 && id !== meId ? [id] : [...value, id]));
                  setPicking("");
                }}
                onBlur={() => setPicking("")}
                className="field-input h-8 w-56 py-0 text-label"
              >
                <option value="">Choose a person…</option>
                {people.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.id === meId ? `${item.label} (me)` : item.label}
                  </option>
                ))}
              </select>
            ) : (
              <button type="button" className={`${chip} border-dashed text-ink-muted`} onClick={() => setPicking("assignee")} aria-label={periodic ? "Change the assignee" : "Add an assignee"}>
                {periodic ? "Change" : "+ Person"}
              </button>
            )}
            <span className="text-ink-muted">in</span>
            {picking === "project" ? (
              <select autoFocus aria-label="Project" value={project} onChange={(event) => setProject(event.target.value ? Number(event.target.value) : "")} onBlur={() => setPicking("")} className="field-input h-8 w-56 py-0 text-label">
                <option value="">No project (My Tasks)</option>
                {projects.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.name}
                  </option>
                ))}
              </select>
            ) : (
              <button type="button" className={`${chip} ${chosen ? "" : "border-dashed text-ink-muted"}`} onClick={() => setPicking("project")} aria-label={`Project: ${chosen?.name ?? "none"}. Change`}>
                {chosen ? (
                  <>
                    <ProjectDot color={chosen.color} /> {chosen.name}
                  </>
                ) : (
                  "Project"
                )}
              </button>
            )}
          </div>
          <label htmlFor="create-description" className="sr-only">
            Description
          </label>
          <textarea id="create-description" rows={4} maxLength={4000} placeholder="Description" value={description} onChange={(event) => setDescription(event.target.value)} className="w-full resize-none bg-transparent text-body placeholder:text-ink-faint focus:outline-none" />
          {(picking === "due" || due) && (
            <div className="flex items-center gap-2 text-label">
              <label htmlFor="create-due" className="text-ink-muted">
                Due date
              </label>
              <input id="create-due" type="date" value={due} onChange={(event) => setDue(event.target.value)} className="field-input h-8 w-44 py-0 text-label" />
              {due && (
                <button type="button" aria-label="Remove due date" onClick={() => setDue("")} className="rounded p-1 text-ink-muted hover:bg-surface-muted">
                  <X aria-hidden="true" className="h-3.5 w-3.5" />
                </button>
              )}
            </div>
          )}
          <fieldset className={picking === "repeat" || periodic ? "space-y-2 rounded-md border border-line p-3" : "sr-only"}>
            <legend className="px-1 text-label font-semibold">Ad hoc or periodic</legend>
            <div className="flex flex-wrap gap-4 text-label">
              <label className="flex items-center gap-2">
                <input type="radio" name="create-kind" checked={!periodic} onChange={() => setPeriodic(false)} /> Ad hoc (one time; you can give it to several people)
              </label>
              <label className="flex items-center gap-2">
                <input
                  type="radio"
                  name="create-kind"
                  checked={periodic}
                  onChange={() => {
                    setPeriodic(true);
                    setAssignees((value) => value.slice(0, 1));
                  }}
                />{" "}
                Periodic (repeats)
              </label>
            </div>
            {periodic && (
              <>
                <div className="flex flex-wrap items-center gap-2 text-label">
                  Every
                  <input type="number" min={1} max={365} value={every} onChange={(event) => setEvery(Math.max(1, Math.min(365, Number(event.target.value) || 1)))} aria-label="Every how many" className="field-input h-8 w-20 py-0" />
                  <select value={kind} onChange={(event) => setKind(event.target.value as Recurrence["kind"])} aria-label="Repeat unit" className="field-input h-8 w-auto py-0">
                    {RECURRENCE_KINDS.map((item) => (
                      <option key={item} value={item}>
                        {UNIT[item]}
                      </option>
                    ))}
                  </select>
                </div>
                {kind === "WEEKLY" && (
                  <fieldset className="flex flex-wrap gap-2 text-caption">
                    <legend className="sr-only">On these days</legend>
                    {DAYS.map((day, index) => (
                      <label key={day} className="flex items-center gap-1">
                        <input type="checkbox" checked={weekdays.includes(index)} onChange={(event) => setWeekdays((value) => (event.target.checked ? [...value, index] : value.filter((item) => item !== index)))} /> {day}
                      </label>
                    ))}
                  </fieldset>
                )}
              </>
            )}
          </fieldset>
          <footer className="flex items-center gap-1 border-t border-line pt-3">
            <button type="button" aria-label="Set a due date" title="Due date" onClick={() => setPicking(picking === "due" ? "" : "due")} className={`rounded p-1.5 hover:bg-surface-muted ${due ? "text-primary-700" : "text-ink-muted"}`}>
              <CalendarDays aria-hidden="true" className="h-4 w-4" />
            </button>
            <button type="button" aria-label="Repeat (periodic)" title="Repeat" onClick={() => setPicking(picking === "repeat" ? "" : "repeat")} className={`rounded p-1.5 hover:bg-surface-muted ${periodic ? "text-primary-700" : "text-ink-muted"}`}>
              <Repeat aria-hidden="true" className="h-4 w-4" />
            </button>
            <Link href="/users/tasks/new" className="ml-1 text-caption text-ink-muted hover:text-ink">
              Task with a form
            </Link>
            <button type="submit" disabled={pending || !title.trim()} className="btn-primary btn-compact ml-auto">
              Create task
            </button>
          </footer>
        </form>
      )}
    </section>
  );
}

