"use client";

import { CalendarDays, ChevronDown, Paperclip, Plus, Repeat, Sparkles, UserPlus, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { followAction, quickAddAction, recurrenceAction, taskFieldsAction } from "@/app/users/work/actions";
import { taskAction } from "@/app/users/tasks/actions";
import { draftTaskTextAction } from "@/app/users/ai/actions";
import { CREATE_TASK_EVENT, ProjectDot, useWorkCall } from "@/features/work/client";
import { RichEditor } from "@/features/ui/RichEditor";
import { useProjectsOn } from "@/features/work/projects-access";
import { mentionIds } from "@/features/work/rich-text";
import { RECURRENCE_KINDS, type Recurrence } from "@/server/work/more-rules";

// D-221 (owner): "Create → Task" anywhere in the app opens Asana's Draft
// task panel (bottom right). Mounted once in the users layout; anything can
// ask for it with CREATE_TASK_EVENT (detail.projectId picks the project).
type RailProject = { id: number; name: string; color: string };
type Person = { id: number; label: string; detail?: string };

export function TaskCreator({ projects, people, meId, ai = false }: { projects: RailProject[]; people: Person[]; meId: number; ai?: boolean }) {
  const [open, setOpen] = useState<{ projectId: number | null } | null>(null);
  useEffect(() => {
    const onCreate = (event: Event) => setOpen({ projectId: (event as CustomEvent<{ projectId?: number | null } | null>).detail?.projectId ?? null });
    window.addEventListener(CREATE_TASK_EVENT, onCreate);
    // v1.48.2: "New task" links (/users/tasks/new) arrive with ?create=task.
    const url = new URL(window.location.href);
    if (url.searchParams.get("create") === "task") {
      setOpen({ projectId: null });
      url.searchParams.delete("create");
      window.history.replaceState(window.history.state, "", url.pathname + (url.search ? url.search : "") + url.hash);
    }
    return () => window.removeEventListener(CREATE_TASK_EVENT, onCreate);
  }, []);
  return open ? <CreateTaskDialog key={String(open.projectId)} onClose={() => setOpen(null)} projects={projects} people={people} meId={meId} defaultProject={open.projectId} ai={ai} /> : null;
}

const UNIT: Record<(typeof RECURRENCE_KINDS)[number], string> = { DAILY: "days", WEEKLY: "weeks", MONTHLY: "months", YEARLY: "years", AFTER_DONE: "days after it is completed" };
const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
// The upload's own limits (server/attachments/files.ts), said before sending.
const MAX_FILES = 5;
const MAX_BYTES = 10 * 1024 * 1024;
const ACCEPT = ".pdf,.png,.jpg,.jpeg,.webp,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.csv,.txt";
type Pop = "" | "plus" | "collab";
const initials = (name: string) =>
  name
    .replace(/\(.*\)/, "")
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((word) => word[0]?.toUpperCase() ?? "")
    .join("");
const sizeText = (bytes: number) => (bytes < 1024 * 1024 ? `${Math.max(1, Math.round(bytes / 1024))} KB` : `${(bytes / 1024 / 1024).toFixed(1)} MB`);

// D-220 (owner's screenshot: Asana's "Draft task"): a panel at the bottom
// right: Task name; "For <people> in <project>"; Description; then the
// due date, repeat (periodic) and Create task. Ad hoc unless a repeat is set.
// D-238 (owner's Asana screenshots): the toolbar under the description: + (more),
// Formatting, Emoji, @mention, Attach (or paste an image), ✨ Pico Bot (only for
// people it answers), the due date and repeat; collaborators beside Create task;
// "/" in the description opens the same commands. The panel is taller than wide
// and grows a step at a time with the screen.
function CreateTaskDialog({
  onClose,
  projects,
  people,
  meId,
  defaultProject,
  ai,
}: {
  onClose: () => void;
  projects: RailProject[];
  people: Person[];
  meId: number;
  defaultProject: number | null;
  ai: boolean;
}) {
  const router = useRouter();
  const { call, pending } = useWorkCall();
  const [title, setTitle] = useState("");
  // D-222: an ad hoc task may go to several people (one copy each); a periodic one to one.
  // D-224: for myself by default; "Others" picks people by searching.
  const [forWhom, setForWhom] = useState<"self" | "others">("self");
  const [others, setOthers] = useState<number[]>([]);
  const [due, setDue] = useState("");
  const [dueTime, setDueTime] = useState("23:59"); // v1.54.7 (owner): 11:59 pm unless changed
  const [project, setProject] = useState<number | "">(defaultProject ?? "");
  const [description, setDescription] = useState("");
  const [editorKey, setEditorKey] = useState(0); // remounts the editor when Pico Bot (or Undo) replaces the text
  const [periodic, setPeriodic] = useState(false);
  // D-259: priority, set on the new task(s) right after they are made.
  const [priority, setPriority] = useState<"LOW" | "NORMAL" | "IMPORTANT" | "HIGH" | "URGENT">("NORMAL");
  const assignees = forWhom === "self" || periodic ? [meId] : others;
  const [kind, setKind] = useState<Recurrence["kind"]>("WEEKLY");
  const [every, setEvery] = useState(1);
  const [weekdays, setWeekdays] = useState<number[]>([]);
  const [small, setSmall] = useState(false);
  const [picking, setPicking] = useState<"" | "assignee" | "project" | "due" | "repeat">("");
  const projectsOn = useProjectsOn();
  // D-238: the toolbar's state.
  const [pop, setPop] = useState<Pop>("");
  const [files, setFiles] = useState<File[]>([]);
  const [fileProblem, setFileProblem] = useState("");
  const [collaborators, setCollaborators] = useState<number[]>([]);
  // v1.46.0 (owner: the calendar and repeat buttons did nothing on a wide
  // window, where both settings are always shown): the calendar button opens
  // the due date's picker; the repeat button makes the task periodic and
  // takes you to its repeat settings.
  const openDue = () => {
    setPicking("due");
    window.requestAnimationFrame(() => {
      const input = document.getElementById("create-due") as HTMLInputElement | null;
      input?.focus();
      try {
        input?.showPicker?.();
      } catch {
        // Some browsers allow the picker only from a direct click; the box has focus.
      }
    });
  };
  const openRepeat = () => {
    if (!periodic) {
      // v1.54.4 (owner): a repeating task is always for yourself.
      setPeriodic(true);
      setForWhom("self");
    }
    setPicking("repeat");
    window.requestAnimationFrame(() => {
      const every = document.getElementById("create-every") as HTMLInputElement | null;
      every?.scrollIntoView({ block: "nearest" });
      every?.focus();
    });
  };
  const [aiBusy, setAiBusy] = useState(false);
  const [beforeAi, setBeforeAi] = useState<string | null>(null);
  const name = useRef<HTMLInputElement>(null);
  const filePicker = useRef<HTMLInputElement>(null);
  useEffect(() => {
    name.current?.focus();
  }, []);
  const label = (id: number) => people.find((item) => item.id === id)?.label ?? "Someone";
  const chosen = projects.find((item) => item.id === project);

  const addFiles = (list: File[]) => {
    const problems: string[] = [];
    const fitting = list.filter((file) => {
      if (file.size > MAX_BYTES) problems.push(`${file.name} is larger than 10 MB.`);
      return file.size > 0 && file.size <= MAX_BYTES;
    });
    const room = MAX_FILES - files.length;
    if (fitting.length > room) problems.push(`Attach at most ${MAX_FILES} files.`);
    setFiles((value) => [...value, ...fitting.slice(0, Math.max(0, room))]);
    setFileProblem(problems.join(" "));
  };
  const askAi = async () => {
    if (aiBusy) return;
    setAiBusy(true);
    try {
      const result = await call(() => draftTaskTextAction({ title, description }), { success: false });
      const written = (result as { text?: string } | null)?.text;
      if (result?.ok && written) {
        setBeforeAi(description);
        setDescription(written);
        setEditorKey((value) => value + 1);
      }
    } finally {
      setAiBusy(false);
    }
  };

  const submit = async () => {
    if (!title.trim() || assignees.length === 0 || !due) {
      if (!due) setPicking("due");
      return;
    }
    const body = description;
    const result = await call(
      (choice) =>
        quickAddAction({
          title,
          assigneeId: assignees[0] ?? meId,
          assigneeIds: !periodic && assignees.length > 1 ? assignees : undefined,
          dueDay: `${choice?.moveTo ?? due}T${/^\d{2}:\d{2}$/.test(dueTime) ? dueTime : "23:59"}`,
          holidayOk: choice?.holidayOk,
          projectId: project === "" ? null : project,
          description: body,
        }),
      { success: false },
    );
    if (!result?.ok || !result.value) return;
    const id = result.value.id;
    if (periodic) await call(() => recurrenceAction(id, { kind, every, weekdays: kind === "WEEKLY" ? weekdays : [] }), { success: false });
    if (priority !== "NORMAL") for (const one of (result.value as { ids?: number[] }).ids ?? [id]) await call(() => taskFieldsAction(one, { priority }), { success: false });
    // D-238: files and collaborators follow once the task exists (its own checks apply).
    if (files.length) {
      const data = new FormData();
      data.set("taskId", String(id));
      data.set("action", "COMMENT");
      data.set("reason", "");
      for (const file of files) data.append("attachments", file);
      await call(() => taskAction(null, data), { success: false });
    }
    const follow = [...new Set([...collaborators, ...mentionIds(body)])].filter((person) => person !== meId && !assignees.includes(person));
    for (const person of follow) await call(() => followAction(id, person, true), { success: false });
    onClose();
    // D-246 (audit UI-D04): a task for someone else isn't in my own list, so it
    // opens on its page (still found later under Tasks assigned by me).
    router.push(project !== "" ? `/users/work/projects/${project}?task=${id}` : assignees.includes(meId) ? `/users/work/my-tasks?task=${id}` : `/users/tasks/${id}`);
  };
  const chip = "inline-flex items-center gap-1 rounded-full border border-line px-2 py-0.5 text-label hover:border-line-strong";
  const tool = (on = false) => `grid h-8 w-8 place-items-center rounded hover:bg-surface-muted ${on ? "bg-primary-50 text-primary-700" : "text-ink-muted hover:text-ink"}`;
  const popover = "absolute bottom-full z-20 mb-2 rounded-lg border border-line bg-raised p-2 shadow-overlay";
  return (
    <section
      role="dialog"
      aria-modal="false"
      aria-labelledby="draft-task-title"
      data-testid="create-dialog"
      onKeyDown={(event) => {
        if (event.key === "Escape") {
          if (pop) {
            setPop("");
            return;
          }
          onClose();
        }
        if (event.key === "Enter" && (event.ctrlKey || event.metaKey)) void submit();
      }}
      className={`draft-task fixed bottom-4 right-4 z-50 flex max-h-[calc(100dvh-2rem)] w-[min(30rem,calc(100vw-2rem))] flex-col rounded-xl border border-line bg-raised text-ink shadow-overlay ${small ? "" : "h-[34rem] lg:bottom-auto lg:right-auto lg:left-1/2 lg:top-1/2 lg:h-auto lg:max-h-[min(44rem,calc(100dvh-4rem))] lg:w-[min(60rem,calc(100vw-4rem))] lg:-translate-x-1/2 lg:-translate-y-1/2"}`}
    >
      <header className="draft-head flex items-center gap-2 border-b border-line px-4 py-2.5">
        <h2 id="draft-task-title" className="flex-1 font-semibold">
          Create task <span className="text-caption font-normal text-ink-muted">· draft</span>
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
          className="flex min-h-0 flex-1 flex-col"
          onSubmit={(event) => {
            event.preventDefault();
            void submit();
          }}
        >
          <div className="draft-body flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto px-5 py-4 lg:grid lg:grid-cols-[minmax(0,1fr)_16.5rem] lg:items-start lg:gap-6">
            <div className="flex min-h-0 min-w-0 flex-1 flex-col gap-3">
              <p className="hidden text-caption font-semibold uppercase tracking-wide text-ink-faint lg:block">Task details</p>
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
                className="w-full bg-transparent text-title font-semibold placeholder:text-ink-faint focus:outline-none lg:rounded-md lg:border lg:border-line lg:px-3 lg:py-2 lg:text-body lg:focus:border-primary-600"
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
                        // v1.54.4 (owner): a task for others is ad hoc; only one for yourself repeats.
                        if (value === "others") setPeriodic(false);
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
                      <button
                        type="button"
                        aria-label={`Remove ${label(id)}`}
                        onClick={() => setOthers((value) => value.filter((item) => item !== id))}
                        className="text-ink-faint hover:text-danger-600"
                      >
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
                    <button
                      type="button"
                      className={`${chip} border-dashed text-ink-muted`}
                      onClick={() => setPicking("assignee")}
                      aria-label={periodic && others.length ? "Change the assignee" : "Add an assignee"}
                    >
                      {periodic && others.length ? "Change" : "+ Person"}
                    </button>
                  ))}
                {projectsOn && <span className="text-ink-muted">in</span>}
                {!projectsOn ? null : picking === "project" ? (
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
                  <button
                    type="button"
                    className={`${chip} ${chosen ? "" : "border-dashed text-ink-muted"}`}
                    onClick={() => setPicking("project")}
                    aria-label={`Project: ${chosen?.name ?? "none"}. Change`}
                  >
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
              {/* v1.54.7 (owner: "long text formattable and visibly formatted like a mail body"):
                  the description is the formatted editor (bold, italic, underline, lists,
                  links, quote, heading, emoji, @mention); a pasted image is attached. */}
              <div className="flex min-h-[6rem] flex-1 flex-col" data-testid="create-description-box">
                <RichEditor
                  key={editorKey}
                  name="description"
                  id="create-description"
                  label="Description"
                  placeholder="Description. Format it like an email; @ to mention someone; paste an image to attach it."
                  initialText={description}
                  people={people.filter((item) => item.id !== meId).map((item) => ({ id: item.id, label: item.label, detail: item.detail, name: item.label.split(" - ")[0] }))}
                  onText={setDescription}
                  onPasteFiles={(pasted) => addFiles(pasted.map((file) => (/^image\.\w+$/.test(file.name) ? new File([file], `pasted-image-${Date.now()}.${file.name.split(".").pop()}`, { type: file.type }) : file)))}
                  minHeight={120}
                  testId="create-description-editor"
                />
              </div>
              {beforeAi !== null && (
                <p role="status" className="flex items-center gap-2 text-caption text-ink-muted">
                  <Sparkles aria-hidden="true" className="h-3.5 w-3.5 text-primary-700" /> Written by Pico Bot: check it before you create the task.
                  <button
                    type="button"
                    className="link"
                    onClick={() => {
                      setDescription(beforeAi);
                      setBeforeAi(null);
                      setEditorKey((value) => value + 1);
                    }}
                  >
                    Undo
                  </button>
                </p>
              )}
              {files.length > 0 && (
                <ul aria-label="Files to attach" className="flex flex-wrap gap-2" data-testid="draft-files">
                  {files.map((file, index) => (
                    <li key={`${file.name}-${index}`} className={chip}>
                      <Paperclip aria-hidden="true" className="h-3 w-3" />
                      <span className="max-w-[12rem] truncate">{file.name}</span>
                      <span className="text-caption text-ink-faint">{sizeText(file.size)}</span>
                      <button
                        type="button"
                        aria-label={`Remove ${file.name}`}
                        onClick={() => setFiles((value) => value.filter((_, at) => at !== index))}
                        className="text-ink-faint hover:text-danger-600"
                      >
                        <X aria-hidden="true" className="h-3 w-3" />
                      </button>
                    </li>
                  ))}
                </ul>
              )}
              {fileProblem && (
                <p role="alert" className="text-caption text-danger-600">
                  {fileProblem}
                </p>
              )}
            </div>
            <aside className="draft-settings flex flex-col gap-3 lg:rounded-lg lg:border lg:border-line lg:bg-surface-muted lg:p-3" aria-label="Task settings">
              <p className="hidden text-caption font-semibold uppercase tracking-wide text-ink-muted lg:block">Task settings</p>
              <div className={`${picking === "due" || due ? "flex" : "hidden lg:flex"} items-center gap-2 text-label lg:flex-col lg:items-stretch lg:gap-1`}>
                <label htmlFor="create-due" className="text-ink-muted">
                  Due date <span className="text-danger-600" aria-hidden="true">*</span>
                </label>
                <span className="flex items-center gap-1.5">
                  <input id="create-due" type="date" value={due} required aria-required="true" onChange={(event) => setDue(event.target.value)} className="field-input h-8 w-40 py-0 text-label lg:w-full" />
                  <label htmlFor="create-due-time" className="sr-only">
                    Due time
                  </label>
                  <input id="create-due-time" type="time" value={dueTime} onChange={(event) => setDueTime(event.target.value || "23:59")} className="field-input h-8 w-28 py-0 text-label" />
                </span>
              </div>
              <div className="flex items-center gap-2 text-label lg:flex-col lg:items-stretch lg:gap-1">
                <label htmlFor="create-priority" className="text-ink-muted">
                  Priority
                </label>
                <select id="create-priority" value={priority} onChange={(event) => setPriority(event.target.value as typeof priority)} className="field-input h-8 w-40 py-0 text-label lg:w-full">
                  <option value="URGENT">Critical</option>
                  <option value="HIGH">Most Important</option>
                  <option value="IMPORTANT">Important</option>
                  <option value="NORMAL">Normal</option>
                </select>
              </div>
              <fieldset
                className={picking === "repeat" || periodic ? "space-y-2 rounded-md border border-line p-3" : "sr-only lg:not-sr-only lg:space-y-2 lg:rounded-md lg:border lg:border-line lg:p-3"}
              >
                <legend className="px-1 text-label font-semibold">Ad hoc or periodic</legend>
                <div className="flex flex-wrap gap-4 text-label">
                  <label className="flex items-center gap-2">
                    <input type="radio" name="create-kind" checked={!periodic} onChange={() => setPeriodic(false)} /> Ad hoc (one time; for you or for others, several at once)
                  </label>
                  <label className="flex items-center gap-2">
                    <input
                      type="radio"
                      name="create-kind"
                      checked={periodic}
                      onChange={() => {
                        setPeriodic(true);
                        setForWhom("self");
                      }}
                    />{" "}
                    Periodic (repeats; only for yourself)
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
                        id="create-every"
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
                            <input
                              type="checkbox"
                              checked={weekdays.includes(index)}
                              onChange={(event) => setWeekdays((value) => (event.target.checked ? [...value, index] : value.filter((item) => item !== index)))}
                            />{" "}
                            {day}
                          </label>
                        ))}
                      </fieldset>
                    )}
                  </>
                )}
              </fieldset>
              <div className="hidden text-label lg:block">
                <p className="text-ink-muted">Collaborators</p>
                {collaborators.length ? <p className="mt-1">{collaborators.map(label).join(", ")}</p> : <p className="mt-1 text-caption text-ink-muted">None yet: use the people button below.</p>}
              </div>
            </aside>
          </div>
          <input
            ref={filePicker}
            type="file"
            multiple
            accept={ACCEPT}
            aria-label="Choose files to attach"
            className="sr-only"
            tabIndex={-1}
            onChange={(event) => {
              addFiles(Array.from(event.target.files ?? []));
              event.target.value = "";
            }}
          />
          <footer className="draft-foot relative flex flex-wrap items-center gap-0.5 border-t border-line px-3 py-2" role="toolbar" aria-label="Task tools">
            {pop === "plus" && (
              <ul role="menu" aria-label="More" className={`${popover} left-0 w-56 py-1`}>
                {[
                  ...(projectsOn ? [{ label: "Add to a project", run: () => setPicking("project") }] : []),
                  { label: "Set a due date", run: openDue },
                  { label: "Repeat (periodic)", run: openRepeat },
                  { label: "Attach a file", run: () => filePicker.current?.click() },
                  { label: "Add collaborators", run: () => setPop("collab") },
                ].map((item) => (
                  <li key={item.label} role="none">
                    <button
                      type="button"
                      role="menuitem"
                      onClick={() => {
                        setPop("");
                        item.run();
                      }}
                      className="block w-full rounded px-3 py-1.5 text-left text-label hover:bg-surface-muted"
                    >
                      {item.label}
                    </button>
                  </li>
                ))}
              </ul>
            )}
            {pop === "collab" && (
              <div className={`${popover} right-0 w-72`} data-testid="collaborators-editor">
                <p className="mb-1 px-1 text-label font-semibold">Collaborators</p>
                <p className="mb-2 px-1 text-caption text-ink-muted">They follow the task: told of comments and changes.</p>
                {collaborators.length > 0 && (
                  <ul className="mb-2 flex flex-wrap gap-1">
                    {collaborators.map((id) => (
                      <li key={id} className={chip} data-testid="collaborator-chip">
                        {label(id)}
                        <button
                          type="button"
                          aria-label={`Remove collaborator ${label(id)}`}
                          onClick={() => setCollaborators((value) => value.filter((item) => item !== id))}
                          className="text-ink-faint hover:text-danger-600"
                        >
                          <X aria-hidden="true" className="h-3 w-3" />
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
                <PersonSearch
                  label="Search people to add as collaborators"
                  listId="collab-search-list"
                  people={people.filter((item) => item.id !== meId && !collaborators.includes(item.id))}
                  // v1.46.0 (owner): choosing a person closes the list (the people button adds more).
                  onPick={(id) => {
                    setCollaborators((value) => [...value, id]);
                    setPop("");
                  }}
                  onDone={() => setPop("")}
                  closeOnBlur={false}
                />
              </div>
            )}
            <button
              type="button"
              aria-label="More"
              title="More"
              aria-haspopup="menu"
              aria-expanded={pop === "plus"}
              onClick={() => setPop(pop === "plus" ? "" : "plus")}
              className={tool(pop === "plus")}
            >
              <Plus aria-hidden="true" className="h-4 w-4" />
            </button>
            <span aria-hidden="true" className="mx-0.5 h-5 w-px bg-line" />
            <button type="button" aria-label="Attach a file or paste an image" title="Attach a file or paste an image" onClick={() => filePicker.current?.click()} className={tool(files.length > 0)}>
              <Paperclip aria-hidden="true" className="h-4 w-4" />
            </button>
            {ai && (
              <button
                type="button"
                aria-label="Write the description with Pico Bot"
                title="Write the description with Pico Bot"
                disabled={aiBusy || (!title.trim() && !description.trim())}
                onClick={() => void askAi()}
                className={`${tool()} disabled:opacity-50`}
              >
                <Sparkles aria-hidden="true" className={`h-4 w-4 ${aiBusy ? "animate-pulse text-primary-700" : ""}`} />
              </button>
            )}
            <button type="button" aria-label="Set a due date" title="Due date" onClick={openDue} className={tool(Boolean(due))}>
              <CalendarDays aria-hidden="true" className="h-4 w-4" />
            </button>
            <button type="button" aria-label="Repeat (periodic)" title="Repeat" onClick={openRepeat} className={tool(periodic)}>
              <Repeat aria-hidden="true" className="h-4 w-4" />
            </button>
            <span className="ml-auto flex items-center gap-2">
              <button
                type="button"
                onClick={() => setPop(pop === "collab" ? "" : "collab")}
                aria-expanded={pop === "collab"}
                aria-label={collaborators.length ? `Edit collaborators (${collaborators.length})` : "Add collaborators"}
                title={collaborators.length ? collaborators.map(label).join(", ") : "Add collaborators"}
                className="flex items-center gap-1 rounded-full px-1 py-0.5 text-caption text-ink-muted hover:bg-surface-muted hover:text-ink"
              >
                <span className="flex -space-x-1.5">
                  {collaborators.slice(0, 3).map((id) => (
                    <span
                      key={id}
                      aria-hidden="true"
                      className="grid h-6 w-6 place-items-center rounded-full border-2 border-raised bg-primary-100 text-[length:calc(10px*var(--text-scale,1))] font-semibold text-primary-700"
                    >
                      {initials(label(id))}
                    </span>
                  ))}
                  {collaborators.length === 0 && (
                    <span aria-hidden="true" className="grid h-6 w-6 place-items-center rounded-full border border-dashed border-line-strong">
                      <UserPlus className="h-3.5 w-3.5" />
                    </span>
                  )}
                </span>
                {collaborators.length > 3 && <span>+{collaborators.length - 3}</span>}
              </button>
              <button type="button" onClick={onClose} className="btn-ghost btn-compact hidden lg:inline-flex">
                Cancel
              </button>
              <button
                type="submit"
                disabled={pending || !title.trim() || assignees.length === 0 || !due}
                title={assignees.length === 0 ? "Choose who the task is for" : !due ? "Choose a due date" : undefined}
                className="btn-primary btn-compact"
              >
                Create task
              </button>
            </span>
          </footer>
        </form>
      )}
    </section>
  );
}

// D-224 (owner): the assignee is chosen by typing part of a name; arrows and
// Enter pick, Esc or leaving the box closes it. D-238: also for mentions and
// collaborators (each with its own name and list).
function PersonSearch({
  people,
  onPick,
  onDone,
  label = "Search people",
  listId = "person-search-list",
  closeOnBlur = true,
}: {
  people: Person[];
  onPick: (id: number) => void;
  onDone: () => void;
  label?: string;
  listId?: string;
  closeOnBlur?: boolean;
}) {
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
        aria-label={label}
        aria-expanded={matches.length > 0}
        aria-controls={listId}
        aria-autocomplete="list"
        aria-activedescendant={matches[at] ? `${listId}-${matches[at].id}` : undefined}
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
        onBlur={() => closeOnBlur && window.setTimeout(onDone, 150)}
        className="field-input h-8 w-56 py-0 text-label"
      />
      <ul id={listId} role="listbox" aria-label="People" className="absolute left-0 top-full z-10 mt-1 max-h-64 w-64 overflow-y-auto rounded-md border border-line bg-raised py-1 shadow-overlay">
        {matches.length === 0 ? (
          <li className="px-3 py-1.5 text-label text-ink-muted">No one matches.</li>
        ) : (
          matches.map((item, index) => (
            <li
              key={item.id}
              id={`${listId}-${item.id}`}
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
