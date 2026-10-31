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
  // D-224: for myself by default; "Others" picks people by searching.
  const [forWhom, setForWhom] = useState<"self" | "others">("self");
  const [others, setOthers] = useState<number[]>([]);
  const [due, setDue] = useState("");
  const [project, setProject] = useState<number | "">(defaultProject ?? "");
  const [description, setDescription] = useState("");
  const [periodic, setPeriodic] = useState(false);
  const assignees = forWhom === "self" ? [meId] : periodic ? others.slice(0, 1) : others;
  const [kind, setKind] = useState<Recurrence["kind"]>("WEEKLY");
  const [every, setEvery] = useState(1);
  const [weekdays, setWeekdays] = useState<number[]>([]);
  const [small, setSmall] = useState(false);
  const [picking, setPicking] = useState<"" | "assignee" | "project" | "due" | "repeat">("");
  const name = useRef<HTMLInputElement>(null);
  useEffect(() => {
    name.current?.focus();
  }, []);
  const label = (id: number) => people.find((item) => item.id === id)?.label ?? "Someone";
  const chosen = projects.find((item) => item.id === project);
  const submit = async () => {
    if (!title.trim() || assignees.length === 0) return;
    const result = await call(
      (choice) =>
        quickAddAction({
          title,
          assigneeId: assignees[0] ?? meId,
          assigneeIds: !periodic && assignees.length > 1 ? assignees : undefined,
          dueDay: choice?.moveTo ?? due,
          holidayOk: choice?.holidayOk,
          projectId: project === "" ? null : project,
          description,
        }),
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
          <input
            ref={name}
            id="create-title"
            required
            maxLength={200}
            placeholder="Task name"
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            className="w-full bg-transparent text-title font-semibold placeholder:text-ink-faint focus:outline-none"
          />
          <div className="flex flex-wrap items-center gap-2 text-label">
            <span className="text-ink-muted">For</span>
            {/* D-224 (owner): a task is for myself (the default) or for others. */}
            <span role="radiogroup" aria-label="Who is the task for" className="inline-flex rounded-full border border-line p-0.5">
              {(["self", "others"] as const).map((value) => (
                <button
                  key={value}
                  type="button"
                  role="radio"
                  aria-checked={forWhom === value}
                  onClick={() => {
                    setForWhom(value);
                    setPicking(value === "others" && others.length === 0 ? "assignee" : "");
                  }}
                  className={`rounded-full px-2.5 py-0.5 text-label ${forWhom === value ? "bg-primary-50 font-semibold text-primary-700" : "text-ink-muted hover:text-ink"}`}
                >
                  {value === "self" ? "Myself" : "Others"}
                </button>
              ))}
            </span>
            {forWhom === "others" &&
              others.map((id) => (
                <span key={id} className={chip} data-testid="assignee-chip">
                  {label(id)}
                  <button type="button" aria-label={`Remove ${label(id)}`} onClick={() => setOthers((value) => value.filter((item) => item !== id))} className="text-ink-faint hover:text-danger-600">
                    <X aria-hidden="true" className="h-3 w-3" />
                  </button>
                </span>
              ))}
            {forWhom === "others" &&
              (picking === "assignee" ? (
                <PersonSearch
                  people={people.filter((item) => item.id !== meId && !others.includes(item.id))}
                  onPick={(id) => {
                    // Periodic: one person (the choice replaces); ad hoc: add people.
                    setOthers((value) => (periodic ? [id] : [...value, id]));
                    if (periodic) setPicking("");
                  }}
                  onDone={() => setPicking("")}
                />
              ) : (
                <button type="button" className={`${chip} border-dashed text-ink-muted`} onClick={() => setPicking("assignee")} aria-label={periodic && others.length ? "Change the assignee" : "Add an assignee"}>
                  {periodic && others.length ? "Change" : "+ Person"}
                </button>
              ))}
            <span className="text-ink-muted">in</span>
            {picking === "project" ? (
              <select
                autoFocus
                aria-label="Project"
                value={project}
                onChange={(event) => setProject(event.target.value ? Number(event.target.value) : "")}
                onBlur={() => setPicking("")}
                className="field-input h-8 w-56 py-0 text-label"
              >
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
          <textarea
            id="create-description"
            rows={4}
            maxLength={4000}
            placeholder="Description"
            value={description}
            onChange={(event) => setDescription(event.target.value)}
            className="w-full resize-none bg-transparent text-body placeholder:text-ink-faint focus:outline-none"
          />
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
                    setOthers((value) => value.slice(0, 1));
                  }}
                />{" "}
                Periodic (repeats)
              </label>
            </div>
            {periodic && (
              <>
                <div className="flex flex-wrap items-center gap-2 text-label">
                  Every
                  <input
                    type="number"
                    min={1}
                    max={365}
                    value={every}
                    onChange={(event) => setEvery(Math.max(1, Math.min(365, Number(event.target.value) || 1)))}
                    aria-label="Every how many"
                    className="field-input h-8 w-20 py-0"
                  />
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
            <button
              type="button"
              aria-label="Set a due date"
              title="Due date"
              onClick={() => setPicking(picking === "due" ? "" : "due")}
              className={`rounded p-1.5 hover:bg-surface-muted ${due ? "text-primary-700" : "text-ink-muted"}`}
            >
              <CalendarDays aria-hidden="true" className="h-4 w-4" />
            </button>
            <button
              type="button"
              aria-label="Repeat (periodic)"
              title="Repeat"
              onClick={() => setPicking(picking === "repeat" ? "" : "repeat")}
              className={`rounded p-1.5 hover:bg-surface-muted ${periodic ? "text-primary-700" : "text-ink-muted"}`}
            >
              <Repeat aria-hidden="true" className="h-4 w-4" />
            </button>
            <Link href="/users/tasks/new" className="ml-1 text-caption text-ink-muted hover:text-ink">
              Task with a form
            </Link>
            <button type="submit" disabled={pending || !title.trim() || assignees.length === 0} title={assignees.length === 0 ? "Choose who the task is for" : undefined} className="btn-primary btn-compact ml-auto">
              Create task
            </button>
          </footer>
        </form>
      )}
    </section>
  );
}

// D-224 (owner): the assignee is chosen by typing part of a name; arrows and
// Enter pick, Esc or leaving the box closes it.
function PersonSearch({ people, onPick, onDone }: { people: { id: number; label: string }[]; onPick: (id: number) => void; onDone: () => void }) {
  const [query, setQuery] = useState("");
  const [at, setAt] = useState(0);
  const terms = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
  const matches = people.filter((item) => terms.every((term) => item.label.toLowerCase().includes(term))).slice(0, 8);
  const pick = (id: number) => {
    onPick(id);
    setQuery("");
    setAt(0);
  };
  return (
    <span className="relative inline-block">
      <input
        autoFocus
        role="combobox"
        aria-label="Search people"
        aria-expanded={matches.length > 0}
        aria-controls="person-search-list"
        aria-autocomplete="list"
        aria-activedescendant={matches[at] ? `person-option-${matches[at].id}` : undefined}
        placeholder="Type a name…"
        value={query}
        onChange={(event) => {
          setQuery(event.target.value);
          setAt(0);
        }}
        onKeyDown={(event) => {
          if (event.key === "ArrowDown" || event.key === "ArrowUp") {
            event.preventDefault();
            setAt((value) => Math.max(0, Math.min(matches.length - 1, value + (event.key === "ArrowDown" ? 1 : -1))));
          } else if (event.key === "Enter" && !(event.ctrlKey || event.metaKey)) {
            event.preventDefault();
            if (matches[at]) pick(matches[at].id);
          } else if (event.key === "Escape") {
            event.stopPropagation();
            onDone();
          }
        }}
        onBlur={() => window.setTimeout(onDone, 150)}
        className="field-input h-8 w-56 py-0 text-label"
      />
      <ul id="person-search-list" role="listbox" aria-label="People" className="absolute left-0 top-full z-10 mt-1 max-h-64 w-64 overflow-y-auto rounded-md border border-line bg-raised py-1 shadow-overlay">
        {matches.length === 0 ? (
          <li className="px-3 py-1.5 text-label text-ink-muted">No one matches.</li>
        ) : (
          matches.map((item, index) => (
            <li
              key={item.id}
              id={`person-option-${item.id}`}
              role="option"
              aria-selected={index === at}
              onMouseDown={(event) => {
                event.preventDefault();
                pick(item.id);
              }}
              className={`cursor-pointer px-3 py-1.5 text-label ${index === at ? "bg-primary-50 text-primary-700" : "text-ink hover:bg-surface-muted"}`}
            >
              {item.label}
            </li>
          ))
        )}
      </ul>
    </span>
  );
}
