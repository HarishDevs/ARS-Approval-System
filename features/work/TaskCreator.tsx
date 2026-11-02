"use client";

import { AtSign, Bold, CalendarDays, ChevronDown, Italic, List, ListOrdered, Paperclip, Plus, Repeat, Smile, Sparkles, Strikethrough, Type, UserPlus, X } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { followAction, quickAddAction, recurrenceAction, taskFieldsAction } from "@/app/users/work/actions";
import { taskAction } from "@/app/users/tasks/actions";
import { draftTaskTextAction } from "@/app/users/ai/actions";
import { CREATE_TASK_EVENT, ProjectDot, useWorkCall } from "@/features/work/client";
import { encodeMentions, mentionIds, prefixLines, wrapSelection } from "@/features/work/rich-text";
import { RECURRENCE_KINDS, type Recurrence } from "@/server/work/more-rules";

// D-221 (owner): "Create → Task" anywhere in the app opens Asana's Draft
// task panel (bottom right). Mounted once in the users layout; anything can
// ask for it with CREATE_TASK_EVENT (detail.projectId picks the project).
type RailProject = { id: number; name: string; color: string };
type Person = { id: number; label: string };

export function TaskCreator({ projects, people, meId, ai = false }: { projects: RailProject[]; people: Person[]; meId: number; ai?: boolean }) {
  const [open, setOpen] = useState<{ projectId: number | null } | null>(null);
  useEffect(() => {
    const onCreate = (event: Event) => setOpen({ projectId: (event as CustomEvent<{ projectId?: number | null } | null>).detail?.projectId ?? null });
    window.addEventListener(CREATE_TASK_EVENT, onCreate);
    return () => window.removeEventListener(CREATE_TASK_EVENT, onCreate);
  }, []);
  return open ? <CreateTaskDialog key={String(open.projectId)} onClose={() => setOpen(null)} projects={projects} people={people} meId={meId} defaultProject={open.projectId} ai={ai} /> : null;
}

const UNIT: Record<(typeof RECURRENCE_KINDS)[number], string> = { DAILY: "days", WEEKLY: "weeks", MONTHLY: "months", YEARLY: "years", AFTER_DONE: "days after it is completed" };
const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const EMOJI = ["👍", "✅", "🙏", "🎉", "🔥", "⚠️", "❗", "❓", "📌", "📎", "📅", "⏰", "🚚", "🏭", "💡", "📝", "📊", "💰", "🤝", "👀", "😊", "😀", "😅", "🙌", "👏", "💯", "🚀", "⭐", "✔️", "❌"];
// The upload's own limits (server/attachments/files.ts), said before sending.
const MAX_FILES = 5;
const MAX_BYTES = 10 * 1024 * 1024;
const ACCEPT = ".pdf,.png,.jpg,.jpeg,.webp,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.csv,.txt";
type Pop = "" | "plus" | "emoji" | "mention" | "slash" | "collab";
type Slash = { key: string; label: string; hint: string };
const SLASH: Slash[] = [
  { key: "bullets", label: "Bulleted list", hint: "- item" },
  { key: "numbers", label: "Numbered list", hint: "1. item" },
  { key: "bold", label: "Bold", hint: "**text**" },
  { key: "italic", label: "Italic", hint: "_text_" },
  { key: "strike", label: "Strikethrough", hint: "~~text~~" },
  { key: "mention", label: "Mention someone", hint: "@" },
  { key: "emoji", label: "Emoji", hint: "😊" },
  { key: "attach", label: "Attach a file", hint: "📎" },
  { key: "due", label: "Due date", hint: "📅" },
  { key: "repeat", label: "Repeat (periodic)", hint: "↻" },
];
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
  const [project, setProject] = useState<number | "">(defaultProject ?? "");
  const [description, setDescription] = useState("");
  const [periodic, setPeriodic] = useState(false);
  // D-259: priority, set on the new task(s) right after they are made.
  const [priority, setPriority] = useState<"LOW" | "NORMAL" | "HIGH" | "URGENT">("NORMAL");
  const assignees = forWhom === "self" ? [meId] : periodic ? others.slice(0, 1) : others;
  const [kind, setKind] = useState<Recurrence["kind"]>("WEEKLY");
  const [every, setEvery] = useState(1);
  const [weekdays, setWeekdays] = useState<number[]>([]);
  const [small, setSmall] = useState(false);
  const [picking, setPicking] = useState<"" | "assignee" | "project" | "due" | "repeat">("");
  // D-238: the toolbar's state.
  const [formatting, setFormatting] = useState(false);
  const [pop, setPop] = useState<Pop>("");
  const [mentioned, setMentioned] = useState<{ id: number; name: string }[]>([]);
  const [atSign, setAtSign] = useState<number | null>(null); // where a typed "@" is waiting for a name
  const [slash, setSlash] = useState<{ at: number; query: string; index: number } | null>(null);
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
      setPeriodic(true);
      setOthers((value) => value.slice(0, 1));
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
  const text = useRef<HTMLTextAreaElement>(null);
  const filePicker = useRef<HTMLInputElement>(null);
  useEffect(() => {
    name.current?.focus();
  }, []);
  const label = (id: number) => people.find((item) => item.id === id)?.label ?? "Someone";
  const chosen = projects.find((item) => item.id === project);
  const slashMatches = slash ? SLASH.filter((item) => item.label.toLowerCase().includes(slash.query.toLowerCase())) : [];

  // Put text where the cursor is (or replace the selection) and keep typing after it.
  const edit = (next: { value: string; start: number; end: number }) => {
    setDescription(next.value);
    requestAnimationFrame(() => {
      text.current?.focus();
      text.current?.setSelectionRange(next.start, next.end);
    });
  };
  const selection = () => ({ start: text.current?.selectionStart ?? description.length, end: text.current?.selectionEnd ?? description.length });
  const insert = (value: string) => {
    const { start, end } = selection();
    edit({ value: `${description.slice(0, start)}${value}${description.slice(end)}`, start: start + value.length, end: start + value.length });
  };
  const format = (how: "bold" | "italic" | "strike" | "bullets" | "numbers") => {
    const { start, end } = selection();
    if (how === "bullets" || how === "numbers") edit(prefixLines(description, start, end, how === "numbers"));
    else edit(wrapSelection(description, start, end, how === "bold" ? "**" : how === "italic" ? "_" : "~~", how === "bold" ? "bold text" : how === "italic" ? "italic text" : "struck text"));
  };
  const addMention = (id: number) => {
    const person = label(id);
    setMentioned((value) => (value.some((item) => item.id === id) ? value : [...value, { id, name: person }]));
    if (atSign !== null && description[atSign] === "@") {
      const after = atSign + 1;
      edit({ value: `${description.slice(0, after)}${person} ${description.slice(after)}`, start: after + person.length + 1, end: after + person.length + 1 });
    } else insert(`@${person} `);
    setAtSign(null);
    setPop("");
  };
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
  const runSlash = (key: string) => {
    if (!slash) return;
    // The "/command" typed goes away; the command runs where it was.
    const start = slash.at;
    const end = slash.at + 1 + slash.query.length;
    const value = `${description.slice(0, start)}${description.slice(end)}`;
    setSlash(null);
    setPop("");
    setDescription(value);
    requestAnimationFrame(() => {
      text.current?.focus();
      text.current?.setSelectionRange(start, start);
      if (key === "bullets" || key === "numbers" || key === "bold" || key === "italic" || key === "strike") {
        const next =
          key === "bullets" || key === "numbers"
            ? prefixLines(value, start, start, key === "numbers")
            : wrapSelection(value, start, start, key === "bold" ? "**" : key === "italic" ? "_" : "~~", key === "bold" ? "bold text" : key === "italic" ? "italic text" : "struck text");
        setDescription(next.value);
        requestAnimationFrame(() => text.current?.setSelectionRange(next.start, next.end));
      } else if (key === "mention") {
        setAtSign(null);
        setPop("mention");
      } else if (key === "emoji") setPop("emoji");
      else if (key === "attach") filePicker.current?.click();
      else if (key === "due") setPicking("due");
      else if (key === "repeat") setPicking("repeat");
    });
  };
  const askAi = async () => {
    if (aiBusy) return;
    setAiBusy(true);
    try {
      const result = await call(() => draftTaskTextAction({ title, description: encodeMentions(description, mentioned) }), { success: false });
      const written = (result as { text?: string } | null)?.text;
      if (result?.ok && written) {
        setBeforeAi(description);
        // Mentions come back as @[Name](user:id): shown as @Name again while editing.
        const found: { id: number; name: string }[] = [];
        const shown = written.replace(/@\[([^\]\n]{1,80})\]\(user:(\d{1,10})\)/g, (_all, who: string, id: string) => {
          found.push({ id: Number(id), name: who });
          return `@${who}`;
        });
        setMentioned((value) => [...value, ...found.filter((item) => !value.some((one) => one.id === item.id))]);
        setDescription(shown);
      }
    } finally {
      setAiBusy(false);
    }
  };

  const submit = async () => {
    if (!title.trim() || assignees.length === 0) return;
    const body = encodeMentions(description, mentioned);
    const result = await call(
      (choice) =>
        quickAddAction({
          title,
          assigneeId: assignees[0] ?? meId,
          assigneeIds: !periodic && assignees.length > 1 ? assignees : undefined,
          dueDay: choice?.moveTo ?? due,
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
          if (pop || slash) {
            setPop("");
            setSlash(null);
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
              {formatting && (
                <div role="toolbar" aria-label="Formatting" className="flex items-center gap-0.5 rounded-md border border-line px-1 py-0.5" data-testid="format-bar">
                  <button type="button" aria-label="Bold" title="Bold (**text**)" onClick={() => format("bold")} className={tool()}>
                    <Bold aria-hidden="true" className="h-4 w-4" />
                  </button>
                  <button type="button" aria-label="Italic" title="Italic (_text_)" onClick={() => format("italic")} className={tool()}>
                    <Italic aria-hidden="true" className="h-4 w-4" />
                  </button>
                  <button type="button" aria-label="Strikethrough" title="Strikethrough (~~text~~)" onClick={() => format("strike")} className={tool()}>
                    <Strikethrough aria-hidden="true" className="h-4 w-4" />
                  </button>
                  <span aria-hidden="true" className="mx-1 h-5 w-px bg-line" />
                  <button type="button" aria-label="Bulleted list" title="Bulleted list" onClick={() => format("bullets")} className={tool()}>
                    <List aria-hidden="true" className="h-4 w-4" />
                  </button>
                  <button type="button" aria-label="Numbered list" title="Numbered list" onClick={() => format("numbers")} className={tool()}>
                    <ListOrdered aria-hidden="true" className="h-4 w-4" />
                  </button>
                </div>
              )}
              <div className="relative flex min-h-[6rem] flex-1 flex-col lg:min-h-[12rem] lg:rounded-md lg:border lg:border-line lg:px-3 lg:py-2">
                <label htmlFor="create-description" className="sr-only">
                  Description
                </label>
                <textarea
                  ref={text}
                  id="create-description"
                  maxLength={4000}
                  placeholder="Description. Type / for menu, @ to mention someone; paste an image to attach it."
                  value={description}
                  aria-describedby="create-description-help"
                  onChange={(event) => {
                    const value = event.target.value;
                    const caret = event.target.selectionStart ?? value.length;
                    const typed = value.length === description.length + 1 ? value[caret - 1] : null;
                    const before = caret >= 2 ? value[caret - 2] : "";
                    setDescription(value);
                    if (typed === "/" && (!before || /\s/.test(before))) {
                      setSlash({ at: caret - 1, query: "", index: 0 });
                      setPop("slash");
                    } else if (typed === "@" && (!before || /\s/.test(before))) {
                      setAtSign(caret - 1);
                      setPop("mention");
                    } else if (slash) {
                      const query = value.slice(slash.at + 1, caret);
                      if (value[slash.at] !== "/" || caret <= slash.at || /\s/.test(query) || query.length > 20) {
                        setSlash(null);
                        setPop("");
                      } else setSlash({ ...slash, query, index: 0 });
                    }
                  }}
                  onKeyDown={(event) => {
                    if (!slash || pop !== "slash") return;
                    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
                      event.preventDefault();
                      setSlash({ ...slash, index: Math.max(0, Math.min(slashMatches.length - 1, slash.index + (event.key === "ArrowDown" ? 1 : -1))) });
                    } else if (event.key === "Enter" && !(event.ctrlKey || event.metaKey)) {
                      const item = slashMatches[slash.index];
                      if (item) {
                        event.preventDefault();
                        runSlash(item.key);
                      }
                    }
                  }}
                  onPaste={(event) => {
                    const pasted = Array.from(event.clipboardData.files);
                    if (!pasted.length) return;
                    event.preventDefault();
                    addFiles(pasted.map((file) => (/^image\.\w+$/.test(file.name) ? new File([file], `pasted-image-${Date.now()}.${file.name.split(".").pop()}`, { type: file.type }) : file)));
                  }}
                  className="min-h-[6rem] w-full flex-1 resize-none bg-transparent text-body placeholder:text-ink-faint focus:outline-none"
                />
                <p id="create-description-help" className="sr-only">
                  Type / for formatting and other commands, or @ to mention someone. Mentioned people become collaborators.
                </p>
                {pop === "slash" && slash && (
                  <ul
                    role="listbox"
                    aria-label="Commands"
                    className="absolute left-0 top-8 z-20 max-h-64 w-64 overflow-y-auto rounded-md border border-line bg-raised py-1 shadow-overlay"
                    data-testid="slash-menu"
                  >
                    {slashMatches.length === 0 ? (
                      <li className="px-3 py-1.5 text-label text-ink-muted">No command matches.</li>
                    ) : (
                      slashMatches.map((item, index) => (
                        <li
                          key={item.key}
                          role="option"
                          aria-selected={index === slash.index}
                          onMouseDown={(event) => {
                            event.preventDefault();
                            runSlash(item.key);
                          }}
                          className={`flex cursor-pointer items-center justify-between gap-2 px-3 py-1.5 text-label ${index === slash.index ? "bg-primary-50 text-primary-700" : "text-ink hover:bg-surface-muted"}`}
                        >
                          {item.label}
                          <span className="text-caption text-ink-faint">{item.hint}</span>
                        </li>
                      ))
                    )}
                  </ul>
                )}
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
              <p className="hidden text-caption font-semibold uppercase tracking-wide text-ink-faint lg:block">Task settings</p>
              <div className={`${picking === "due" || due ? "flex" : "hidden lg:flex"} items-center gap-2 text-label lg:flex-col lg:items-stretch lg:gap-1`}>
                <label htmlFor="create-due" className="text-ink-muted">
                  Due date
                </label>
                <input id="create-due" type="date" value={due} onChange={(event) => setDue(event.target.value)} className="field-input h-8 w-44 py-0 text-label lg:w-full" />
                {due && (
                  <button type="button" aria-label="Remove due date" onClick={() => setDue("")} className="rounded p-1 text-ink-muted hover:bg-surface-muted lg:self-start">
                    <X aria-hidden="true" className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>
              <div className="flex items-center gap-2 text-label lg:flex-col lg:items-stretch lg:gap-1">
                <label htmlFor="create-priority" className="text-ink-muted">
                  Priority
                </label>
                <select id="create-priority" value={priority} onChange={(event) => setPriority(event.target.value as typeof priority)} className="field-input h-8 w-40 py-0 text-label lg:w-full">
                  <option value="LOW">Low</option>
                  <option value="NORMAL">Normal</option>
                  <option value="HIGH">High</option>
                  <option value="URGENT">Urgent</option>
                </select>
              </div>
              <fieldset
                className={picking === "repeat" || periodic ? "space-y-2 rounded-md border border-line p-3" : "sr-only lg:not-sr-only lg:space-y-2 lg:rounded-md lg:border lg:border-line lg:p-3"}
              >
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
                {collaborators.length ? <p className="mt-1">{collaborators.map(label).join(", ")}</p> : <p className="mt-1 text-caption text-ink-faint">None yet: use the people button below.</p>}
              </div>
              <Link href="/users/tasks/new" onClick={onClose} className="link hidden text-label lg:inline">
                Task with a form instead
              </Link>
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
                  { label: "Add to a project", run: () => setPicking("project") },
                  { label: "Set a due date", run: openDue },
                  { label: "Repeat (periodic)", run: openRepeat },
                  { label: "Attach a file", run: () => filePicker.current?.click() },
                  { label: "Mention someone", run: () => setPop("mention") },
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
                <li role="none">
                  <Link href="/users/tasks/new" role="menuitem" onClick={onClose} className="block rounded px-3 py-1.5 text-label hover:bg-surface-muted">
                    Task with a form
                  </Link>
                </li>
              </ul>
            )}
            {pop === "emoji" && (
              <div role="group" aria-label="Emoji" className={`${popover} left-0 grid w-64 grid-cols-8 gap-0.5`} data-testid="emoji-picker">
                {EMOJI.map((emoji) => (
                  <button
                    key={emoji}
                    type="button"
                    aria-label={`Insert ${emoji}`}
                    onClick={() => {
                      insert(emoji);
                      setPop("");
                    }}
                    className="grid h-7 w-7 place-items-center rounded text-base hover:bg-surface-muted"
                  >
                    {emoji}
                  </button>
                ))}
              </div>
            )}
            {pop === "mention" && (
              <div className={`${popover} left-0 w-72`}>
                <p className="mb-1 px-1 text-caption text-ink-muted">Mention someone: they become a collaborator and are told.</p>
                <PersonSearch
                  label="Search people to mention"
                  listId="mention-search-list"
                  people={people.filter((item) => item.id !== meId)}
                  onPick={addMention}
                  onDone={() => {
                    setAtSign(null);
                    setPop("");
                    text.current?.focus();
                  }}
                />
              </div>
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
            <button type="button" aria-label="Formatting" title="Formatting" aria-pressed={formatting} onClick={() => setFormatting((value) => !value)} className={tool(formatting)}>
              <Type aria-hidden="true" className="h-4 w-4" />
            </button>
            <button type="button" aria-label="Emoji" title="Emoji" aria-expanded={pop === "emoji"} onClick={() => setPop(pop === "emoji" ? "" : "emoji")} className={tool(pop === "emoji")}>
              <Smile aria-hidden="true" className="h-4 w-4" />
            </button>
            <button
              type="button"
              aria-label="At-mention"
              title="At-mention"
              aria-expanded={pop === "mention"}
              onClick={() => {
                setAtSign(null);
                setPop(pop === "mention" ? "" : "mention");
              }}
              className={tool(pop === "mention")}
            >
              <AtSign aria-hidden="true" className="h-4 w-4" />
            </button>
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
                disabled={pending || !title.trim() || assignees.length === 0}
                title={assignees.length === 0 ? "Choose who the task is for" : undefined}
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
