"use client";

import { ArrowRight, CheckCircle2, FileText, FolderKanban, History, Keyboard, ListFilter, Megaphone, Search, User } from "lucide-react";
import { usePathname, useRouter } from "next/navigation";
import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import { SHORTCUTS, isTyping } from "@/features/shell/shortcuts";
import { Hint } from "@/features/ui/Hint";
import { Avatar } from "@/features/ui/Avatar";

// WS-03 (Ctrl+K) → D-232 (owner's screenshots of Asana's search): one search
// for the whole app at the top of every page. Type chips (Requests, Tasks,
// Projects, People, Information, Pages), recents and saved searches when
// empty, live results while typing (the same access-checked quick search as
// before), and Filters: a panel that builds a full search for one kind of
// record and opens its results page. A combobox with a listbox: arrows move,
// Enter opens, Escape closes. "?" shows the shortcut list.
export interface PaletteLink {
  href: string;
  label: string;
  group: string;
}
type Kind = "request" | "task" | "project" | "person" | "info" | "page" | "recent";
type Option = { key: string; href: string; label: string; detail?: string; group: string; kind: Kind; photo?: string | null };
type Chip = "all" | "requests" | "tasks" | "projects" | "people" | "info" | "pages";
type Quick = {
  kind: string;
  items: { id: number; requestNo: string; title: string; status: string }[];
  tasks?: { id: number; taskNo: string; title: string; status: string }[];
  projects?: { id: number; name: string }[];
  people?: { id: number; name: string; email: string; detail: string; photo: string | null }[];
  information?: { id: number; infoNo: string; title: string }[];
};
type FilterType = "task" | "request" | "project" | "info";

const CHIPS: { key: Chip; label: string; icon: typeof Search }[] = [
  { key: "tasks", label: "Tasks", icon: CheckCircle2 },
  { key: "requests", label: "Requests", icon: FileText },
  { key: "projects", label: "Projects", icon: FolderKanban },
  { key: "people", label: "People", icon: User },
  { key: "info", label: "Information", icon: Megaphone },
  { key: "pages", label: "Pages", icon: ArrowRight },
];
const CHIP_KIND: Record<Exclude<Chip, "all">, Kind> = { requests: "request", tasks: "task", projects: "project", people: "person", info: "info", pages: "page" };
// Asana's "Saved searches": ready-made ones that open the matching list.
const SAVED: { label: string; href: string; icon: typeof Search }[] = [
  { label: "Tasks I've created", href: "/users/work/search?created_by=me&status=all", icon: CheckCircle2 },
  { label: "Tasks I've assigned to others", href: "/users/tasks/assigned", icon: ArrowRight },
  { label: "Recently completed tasks", href: "/users/work/search?status=completed", icon: CheckCircle2 },
  { label: "My pending requests", href: "/users/requests?tab=open", icon: FileText },
  { label: "Waiting for me", href: "/users/queue", icon: History },
];
const RECENTS_KEY = "ars.search.recent";
const RECORD = /^\/users\/(requests|tasks|work\/projects|information|people)\/(\d+)$/;
const RECORD_KIND: Record<string, Kind> = { requests: "request", tasks: "task", "work/projects": "project", information: "info", people: "person" };

function readRecents(): Option[] {
  try {
    const value = JSON.parse(window.localStorage.getItem(RECENTS_KEY) ?? "[]") as Option[];
    return Array.isArray(value) ? value.slice(0, 8) : [];
  } catch {
    return [];
  }
}

const indiaDay = (offset = 0) => new Date(Date.now() + 330 * 60_000 + offset * 86_400_000).toISOString().slice(0, 10);

export function CommandPalette({ pages }: { pages: PaletteLink[] }) {
  const [open, setOpen] = useState(false);
  const [help, setHelp] = useState(false);
  const [query, setQuery] = useState("");
  const [chip, setChip] = useState<Chip>("all");
  const [active, setActive] = useState(0);
  const [found, setFound] = useState<Quick>({ kind: "recent", items: [] });
  const [state, setState] = useState<"idle" | "loading" | "error" | "limited">("idle");
  const [recents, setRecents] = useState<Option[]>([]);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [filters, setFilters] = useState<Record<string, string>>({ type: "task", status: "open", assignee: "", createdBy: "", due: "", from: "", to: "", priority: "", kind: "", role: "any", overdue: "" });
  const [extra, setExtra] = useState<string[]>([]);
  const dialog = useRef<HTMLDialogElement>(null);
  const helpDialog = useRef<HTMLDialogElement>(null);
  const input = useRef<HTMLInputElement>(null);
  const router = useRouter();
  const pathname = usePathname();
  const listId = useId();

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setOpen(true);
      } else if (event.key === "?" && !isTyping(event.target) && !document.querySelector("dialog[open]")) {
        event.preventDefault();
        setHelp(true);
      }
    };
    const onOpen = () => setOpen(true);
    document.addEventListener("keydown", onKey);
    window.addEventListener("ars:open-palette", onOpen);
    return () => {
      document.removeEventListener("keydown", onKey);
      window.removeEventListener("ars:open-palette", onOpen);
    };
  }, []);

  // Recents: the records the person opened, by their page heading.
  useEffect(() => {
    const match = RECORD.exec(pathname);
    if (!match) return;
    const timer = window.setTimeout(() => {
      const label = document.querySelector("main h1")?.textContent?.replace(/\s+/g, " ").trim();
      if (!label) return;
      const entry: Option = { key: `v:${pathname}`, href: pathname, label: label.slice(0, 120), group: "Recents", kind: RECORD_KIND[match[1]!] ?? "recent" };
      try {
        const list = [entry, ...readRecents().filter((item) => item.href !== pathname)].slice(0, 8);
        window.localStorage.setItem(RECENTS_KEY, JSON.stringify(list));
      } catch {
        // storage blocked: no recents
      }
    }, 800);
    return () => window.clearTimeout(timer);
  }, [pathname]);

  useEffect(() => {
    const node = dialog.current;
    if (!node) return;
    if (open && !node.open) {
      node.showModal();
      setQuery("");
      setChip("all");
      setFiltersOpen(false);
      setActive(0);
      setRecents(readRecents());
      requestAnimationFrame(() => input.current?.focus());
    } else if (!open && node.open) node.close();
  }, [open]);
  useEffect(() => {
    const node = helpDialog.current;
    if (!node) return;
    if (help && !node.open) node.showModal();
    else if (!help && node.open) node.close();
  }, [help]);

  // Debounced; the latest answer wins.
  useEffect(() => {
    if (!open) return;
    // Results for the previous text must never be picked by Enter.
    setFound({ kind: query.trim().length >= 2 ? "search" : "recent", items: [] });
    const controller = new AbortController();
    const timer = setTimeout(
      async () => {
        setState("loading");
        try {
          const response = await fetch(`/api/me/quick?q=${encodeURIComponent(query.trim())}`, { signal: controller.signal, cache: "no-store" });
          // D-233: too many searches in a short time says so.
          if (response.status === 429) return setState("limited");
          if (!response.ok) throw new Error(String(response.status));
          setFound(await response.json());
          setState("idle");
        } catch (error) {
          if ((error as Error).name !== "AbortError") setState("error");
        }
      },
      query.trim().length >= 2 ? 250 : 0,
    );
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [query, open]);

  const options: Option[] = useMemo(() => {
    const words = query.toLowerCase().split(/\s+/).filter(Boolean);
    const searching = found.kind === "search";
    const all: Option[] = [
      ...found.items.map((item) => ({
        key: `r:${item.id}`,
        href: `/users/requests/${item.id}`,
        label: `${item.requestNo}: ${item.title}`,
        detail: item.status,
        group: searching ? "Requests" : "Recently viewed requests",
        kind: "request" as const,
      })),
      ...(found.tasks ?? []).map((item) => ({
        key: `t:${item.id}`,
        href: `/users/tasks/${item.id}`,
        label: `${item.taskNo}: ${item.title}`,
        detail: item.status === "COMPLETED" ? "Completed" : undefined,
        group: "Tasks",
        kind: "task" as const,
      })),
      ...(found.projects ?? []).map((item) => ({ key: `j:${item.id}`, href: `/users/work/projects/${item.id}`, label: item.name, group: "Projects", kind: "project" as const })),
      ...(found.people ?? []).map((item) => ({ key: `u:${item.id}`, href: `/users/people/${item.id}`, label: item.name, detail: item.detail || item.email, group: "People", kind: "person" as const, photo: item.photo })),
      ...(found.information ?? []).map((item) => ({ key: `i:${item.id}`, href: `/users/information/${item.id}`, label: `${item.infoNo}: ${item.title}`, group: "Information", kind: "info" as const })),
      ...pages
        .filter((page) => words.length > 0 && words.every((word) => `${page.label} ${page.group}`.toLowerCase().includes(word)))
        .slice(0, 8)
        .map((page) => ({ key: `p:${page.href}`, href: page.href, label: page.label, detail: page.group, group: "Pages", kind: "page" as const })),
    ];
    const shown = chip === "all" ? all : all.filter((option) => option.kind === CHIP_KIND[chip]);
    if (words.length === 0 && chip === "all") return [...recents.filter((item) => !shown.some((option) => option.href === item.href)), ...shown];
    if (words.length === 0 && chip === "pages") return pages.slice(0, 12).map((page) => ({ key: `p:${page.href}`, href: page.href, label: page.label, detail: page.group, group: "Pages", kind: "page" as const }));
    return shown;
  }, [pages, query, found, chip, recents]);

  useEffect(() => setActive(0), [query, chip]);
  const go = useCallback(
    (href: string | undefined) => {
      if (!href) return;
      setOpen(false);
      router.push(href);
    },
    [router],
  );
  const onKeyDown = (event: React.KeyboardEvent) => {
    if (filtersOpen) return;
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setActive((index) => Math.min(options.length - 1, index + 1));
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setActive((index) => Math.max(0, index - 1));
    } else if (event.key === "Enter") {
      event.preventDefault();
      go(options[active]?.href);
    }
  };

  // The Filters panel → the full results page for that kind of record.
  const set = (key: string, value: string) => setFilters((current) => ({ ...current, [key]: value }));
  const fullSearch = () => {
    const f = (key: string) => filters[key] ?? "";
    const params = new URLSearchParams();
    const put = (key: string, value: string) => value && params.set(key, value);
    put("q", query.trim());
    if (f("type") === "task") {
      if (f("status") !== "open") put("status", f("status"));
      put("assignee", f("assignee"));
      put("created_by", f("createdBy"));
      const due = f("due");
      if (due === "overdue") put("overdue", "1");
      const [from, to] = due === "today" ? [indiaDay(), indiaDay()] : due === "week" ? [indiaDay(), indiaDay(7)] : due === "custom" ? [f("from"), f("to")] : ["", ""];
      put("due_from", from);
      put("due_to", to);
      put("priority", f("priority"));
      put("kind", f("kind"));
      put("followed", f("following"));
      return go(`/users/work/search${params.size ? `?${params}` : ""}`);
    }
    if (f("type") === "request") {
      put("status", f("rstatus"));
      if (f("role") !== "any") put("role", f("role"));
      put("from", f("from"));
      put("to", f("to"));
      put("overdue", f("overdue"));
      return go(`/users/search${params.size ? `?${params}` : ""}`);
    }
    if (f("type") === "project") return go(`/users/work/projects${params.size ? `?${params}` : ""}`);
    params.set("tab", f("show") || "all");
    return go(`/users/information?${params}`);
  };
  const ADD: Record<FilterType, { key: string; label: string }[]> = {
    task: [
      { key: "priority", label: "Priority" },
      { key: "kind", label: "Periodic or ad hoc" },
      { key: "following", label: "Tasks I follow" },
    ],
    request: [{ key: "overdue", label: "Overdue only" }],
    project: [],
    info: [],
  };
  const type = filters.type as FilterType;
  const row = (label: string, control: React.ReactNode, id: string) => (
    <div className="grid items-center gap-2 sm:grid-cols-[8rem_1fr]">
      <label htmlFor={id} className="text-label text-ink-muted">
        {label}
      </label>
      {control}
    </div>
  );
  const select = "field-input h-9 text-label";

  let lastGroup = "";
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="hidden h-9 w-full min-w-0 max-w-md items-center gap-2 rounded-full border border-line bg-surface-muted px-4 text-label text-ink-muted hover:border-line-strong hover:text-ink sm:inline-flex"
        aria-keyshortcuts="Control+K"
        data-tour="search"
        data-testid="search-bar"
      >
        <Search aria-hidden="true" className="h-4 w-4" />
        <span className="flex-1 truncate text-left">Search ARS CMS</span>
        <kbd className="rounded border border-line bg-surface px-1.5 text-[length:calc(11px*var(--text-scale,1))]">Ctrl K</kbd>
      </button>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="Search ARS CMS"
        data-tour="search"
        className="flex h-9 w-9 items-center justify-center rounded-full text-ink-muted hover:bg-surface-muted hover:text-ink sm:hidden"
      >
        <Search aria-hidden="true" className="h-5 w-5" />
      </button>
      <dialog
        ref={dialog}
        aria-label="Search ARS CMS"
        onClose={() => setOpen(false)}
        onClick={(event) => event.target === dialog.current && setOpen(false)}
        className="z-palette mt-2 w-[calc(100%-1rem)] max-w-2xl rounded-xl border border-line bg-raised p-0 text-ink shadow-overlay backdrop:bg-overlay/40"
        data-testid="search-panel"
      >
        {open && (
          <div onKeyDown={onKeyDown}>
            <div className="m-2 flex items-center gap-2 rounded-lg border-2 border-primary-600 px-3">
              <Search aria-hidden="true" className="h-4 w-4 text-ink-faint" />
              <input
                ref={input}
                role="combobox"
                aria-expanded={!filtersOpen}
                aria-controls={listId}
                aria-activedescendant={!filtersOpen && options[active] ? `${listId}-${active}` : undefined}
                aria-label="Type a page, a request or task number, a title, a person or a project"
                placeholder={filtersOpen ? "Contains the words" : "Search"}
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                onKeyDown={(event) => filtersOpen && event.key === "Enter" && (event.preventDefault(), fullSearch())}
                className="h-11 w-full bg-transparent text-body focus:outline-none"
              />
              {(query || filtersOpen) && (
                <button type="button" className="shrink-0 text-label text-ink-muted hover:text-ink" onClick={() => (setQuery(""), input.current?.focus())}>
                  Clear
                </button>
              )}
              <button type="button" aria-pressed={filtersOpen} onClick={() => setFiltersOpen((value) => !value)} className={`tb-btn shrink-0 ${filtersOpen ? "tb-on" : ""}`} data-testid="search-filters">
                <ListFilter aria-hidden="true" className="h-4 w-4" /> Filters
              </button>
            </div>
            {filtersOpen ? (
              <div className="space-y-3 px-4 pb-3 pt-1" data-testid="search-filter-panel">
                {row(
                  "Type",
                  <select id="sf-type" className={select} value={filters.type} onChange={(event) => (set("type", event.target.value), setExtra([]))}>
                    <option value="task">Task</option>
                    <option value="request">Approval request</option>
                    <option value="project">Project</option>
                    <option value="info">Information</option>
                  </select>,
                  "sf-type",
                )}
                {type === "task" && (
                  <>
                    {row(
                      "Status",
                      <select id="sf-status" className={select} value={filters.status} onChange={(event) => set("status", event.target.value)}>
                        <option value="open">Incomplete</option>
                        <option value="completed">Completed</option>
                        <option value="cancelled">Cancelled</option>
                        <option value="all">All</option>
                      </select>,
                      "sf-status",
                    )}
                    {row(
                      "Assigned to",
                      <select id="sf-assignee" className={select} value={filters.assignee} onChange={(event) => set("assignee", event.target.value)}>
                        <option value="">Anyone</option>
                        <option value="me">Me</option>
                      </select>,
                      "sf-assignee",
                    )}
                    {row(
                      "Created by",
                      <select id="sf-created" className={select} value={filters.createdBy} onChange={(event) => set("createdBy", event.target.value)}>
                        <option value="">Anyone</option>
                        <option value="me">Me</option>
                      </select>,
                      "sf-created",
                    )}
                    {row(
                      "Due date",
                      <select id="sf-due" className={select} value={filters.due} onChange={(event) => set("due", event.target.value)}>
                        <option value="">Any time</option>
                        <option value="overdue">Overdue</option>
                        <option value="today">Today</option>
                        <option value="week">Within the next 7 days</option>
                        <option value="custom">Between dates…</option>
                      </select>,
                      "sf-due",
                    )}
                    {filters.due === "custom" &&
                      row(
                        "Between",
                        <span className="flex items-center gap-2">
                          <input id="sf-from" type="date" aria-label="Due from" className={select} value={filters.from} onChange={(event) => set("from", event.target.value)} />
                          <span>and</span>
                          <input type="date" aria-label="Due to" className={select} value={filters.to} onChange={(event) => set("to", event.target.value)} />
                        </span>,
                        "sf-from",
                      )}
                    {extra.includes("priority") &&
                      row(
                        "Priority",
                        <select id="sf-priority" className={select} value={filters.priority} onChange={(event) => set("priority", event.target.value)}>
                          <option value="">Any</option>
                          <option value="URGENT">Urgent</option>
                          <option value="HIGH">High</option>
                          <option value="NORMAL">Normal</option>
                          <option value="LOW">Low</option>
                        </select>,
                        "sf-priority",
                      )}
                    {extra.includes("kind") &&
                      row(
                        "Kind",
                        <select id="sf-kind" className={select} value={filters.kind} onChange={(event) => set("kind", event.target.value)}>
                          <option value="">Both</option>
                          <option value="periodic">Periodic</option>
                          <option value="adhoc">Ad hoc</option>
                        </select>,
                        "sf-kind",
                      )}
                    {extra.includes("following") &&
                      row(
                        "Following",
                        <label className="flex items-center gap-2 text-label">
                          <input id="sf-following" type="checkbox" checked={Boolean(filters.following)} onChange={(event) => set("following", event.target.checked ? "1" : "")} /> Only tasks I follow
                        </label>,
                        "sf-following",
                      )}
                  </>
                )}
                {type === "request" && (
                  <>
                    {row(
                      "Status",
                      <select id="sf-rstatus" className={select} value={filters.rstatus ?? ""} onChange={(event) => set("rstatus", event.target.value)}>
                        <option value="">All</option>
                        <option value="IN_PROGRESS">Waiting for approvers</option>
                        <option value="CHANGES_REQUIRED">Sent back</option>
                        <option value="ON_HOLD">On hold</option>
                        <option value="APPROVED">Approved</option>
                        <option value="REJECTED">Rejected</option>
                        <option value="CANCELLED">Withdrawn</option>
                      </select>,
                      "sf-rstatus",
                    )}
                    {row(
                      "My part",
                      <select id="sf-role" className={select} value={filters.role} onChange={(event) => set("role", event.target.value)}>
                        <option value="any">Any</option>
                        <option value="raised">I raised it</option>
                        <option value="approver">I approve or approved it</option>
                      </select>,
                      "sf-role",
                    )}
                    {row(
                      "Raised between",
                      <span className="flex items-center gap-2">
                        <input id="sf-rfrom" type="date" aria-label="Raised from" className={select} value={filters.from} onChange={(event) => set("from", event.target.value)} />
                        <span>and</span>
                        <input type="date" aria-label="Raised to" className={select} value={filters.to} onChange={(event) => set("to", event.target.value)} />
                      </span>,
                      "sf-rfrom",
                    )}
                    {extra.includes("overdue") &&
                      row(
                        "Overdue",
                        <label className="flex items-center gap-2 text-label">
                          <input id="sf-overdue" type="checkbox" checked={Boolean(filters.overdue)} onChange={(event) => set("overdue", event.target.checked ? "1" : "")} /> Only overdue requests
                        </label>,
                        "sf-overdue",
                      )}
                  </>
                )}
                {type === "info" &&
                  row(
                    "Show",
                    <select id="sf-show" className={select} value={filters.show ?? "all"} onChange={(event) => set("show", event.target.value)}>
                      <option value="all">All information</option>
                      <option value="unread">Unread</option>
                      <option value="to_ack">To acknowledge</option>
                      <option value="current">Current</option>
                    </select>,
                    "sf-show",
                  )}
                <div className="flex flex-wrap items-center gap-2 border-t border-line pt-3">
                  {ADD[type].filter((item) => !extra.includes(item.key)).length > 0 && (
                    <label className="inline-flex items-center gap-1 text-label">
                      <span className="sr-only">Add filter</span>
                      <select aria-label="Add filter" value="" onChange={(event) => event.target.value && setExtra((value) => [...value, event.target.value])} className="field-input h-9 w-auto text-label">
                        <option value="">Add filter…</option>
                        {ADD[type]
                          .filter((item) => !extra.includes(item.key))
                          .map((item) => (
                            <option key={item.key} value={item.key}>
                              {item.label}
                            </option>
                          ))}
                      </select>
                    </label>
                  )}
                  <span className="ml-auto flex gap-2">
                    <button
                      type="button"
                      className="btn-secondary btn-compact"
                      onClick={() => (
                        setFilters((current) => ({
                          ...current,
                          status: "open",
                          assignee: "",
                          createdBy: "",
                          due: "",
                          from: "",
                          to: "",
                          priority: "",
                          kind: "",
                          following: "",
                          rstatus: "",
                          role: "any",
                          overdue: "",
                          show: "all",
                        })),
                        setExtra([])
                      )}
                    >
                      Reset filters
                    </button>
                    <button type="button" className="btn-primary btn-compact w-auto" onClick={fullSearch}>
                      Search
                    </button>
                  </span>
                </div>
              </div>
            ) : (
              <>
                <div className="flex flex-wrap gap-1.5 px-3 pb-2" role="group" aria-label="Look for">
                  {CHIPS.map((item) => (
                    <button
                      key={item.key}
                      type="button"
                      aria-pressed={chip === item.key}
                      onClick={() => setChip((value) => (value === item.key ? "all" : item.key))}
                      className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-label ${chip === item.key ? "border-primary-600 bg-primary-50 font-semibold text-primary-700" : "border-line text-ink-muted hover:bg-surface-muted hover:text-ink"}`}
                    >
                      <item.icon aria-hidden="true" className="h-3.5 w-3.5" /> {item.label}
                    </button>
                  ))}
                </div>
                <ul id={listId} role="listbox" aria-label="Results" className="max-h-[50vh] overflow-y-auto px-2 pb-2">
                  {options.map((option, index) => {
                    const heading = option.group !== lastGroup ? option.group : null;
                    lastGroup = option.group;
                    const Icon =
                      option.kind === "task"
                        ? CheckCircle2
                        : option.kind === "project"
                          ? FolderKanban
                          : option.kind === "info"
                            ? Megaphone
                            : option.kind === "page"
                              ? ArrowRight
                              : option.group === "Recents" || option.group.startsWith("Recently")
                                ? History
                                : FileText;
                    return (
                      <li key={option.key} role="presentation">
                        {heading && <p className="px-2 pb-1 pt-2 text-caption font-semibold text-ink-faint">{heading}</p>}
                        <div
                          id={`${listId}-${index}`}
                          role="option"
                          aria-selected={index === active}
                          onMouseEnter={() => setActive(index)}
                          onClick={() => go(option.href)}
                          className={`flex cursor-pointer items-center gap-3 rounded-md px-2 py-2 text-label ${index === active ? "bg-primary-50 text-primary-700" : "text-ink"}`}
                        >
                          {option.kind === "person" ? <Avatar name={option.label} src={option.photo} size="xs" /> : <Icon aria-hidden="true" className="h-4 w-4 shrink-0" />}
                          <span className="min-w-0 flex-1 truncate">{option.label}</span>
                          {option.detail && <span className="max-w-[45%] shrink-0 truncate text-caption text-ink-muted">{option.detail}</span>}
                        </div>
                      </li>
                    );
                  })}
                </ul>
                {!query.trim() && chip === "all" && (
                  <div className="border-t border-line px-4 py-3" data-testid="saved-searches">
                    <p className="mb-2 text-caption font-semibold text-ink-faint">Saved searches</p>
                    <div className="flex flex-wrap gap-1.5">
                      {SAVED.map((item) => (
                        <button key={item.href} type="button" onClick={() => go(item.href)} className="inline-flex items-center gap-1.5 rounded-full border border-line px-3 py-1 text-label hover:bg-surface-muted">
                          <item.icon aria-hidden="true" className="h-3.5 w-3.5 text-ink-muted" /> {item.label}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </>
            )}
            <p role="status" className="border-t border-line px-4 py-2 text-caption text-ink-muted">
              {filtersOpen
                ? "Choose what to look for, then Search to see every match."
                : state === "loading"
                  ? "Searching…"
                  : state === "limited"
                    ? "Too many searches in a short time. Wait a moment, then type again; pages still work."
                    : state === "error"
                      ? "Couldn't search right now; pages still work."
                      : options.length === 0
                        ? query.trim()
                          ? "Nothing matches. Try a request number like PUR-2026-000123, or Filters."
                          : "Type to search requests, tasks, projects, people, information and pages."
                        : `${options.length} result${options.length === 1 ? "" : "s"}. Arrows to move, Enter to open.`}
              <button type="button" className="link float-right inline-flex items-center gap-1" onClick={() => setHelp(true)}>
                <Keyboard aria-hidden="true" className="h-3.5 w-3.5" />
                Shortcuts
              </button>
            </p>
          </div>
        )}
      </dialog>
      <dialog
        ref={helpDialog}
        aria-labelledby={`${listId}-help`}
        onClose={() => setHelp(false)}
        onClick={(event) => event.target === helpDialog.current && setHelp(false)}
        className="z-palette w-[calc(100%-2rem)] max-w-md rounded-xl border border-line bg-raised p-0 text-ink shadow-overlay backdrop:bg-overlay"
      >
        {help && (
          <div className="p-5">
            <h2 id={`${listId}-help`} className="flex items-center gap-1.5 font-semibold">
              Keyboard shortcuts
              <Hint text="They never fire while you type in a field." align="start" />
            </h2>
            <dl className="mt-3 divide-y divide-line text-label">
              {SHORTCUTS.map((item) => (
                <div key={item.keys} className="flex items-center justify-between gap-4 py-2">
                  <dt>
                    <kbd className="rounded border border-line bg-surface-muted px-1.5 py-0.5 text-caption">{item.keys}</kbd>
                  </dt>
                  <dd className="text-right text-ink-muted">{item.what}</dd>
                </div>
              ))}
            </dl>
            <button type="button" className="btn-secondary btn-compact mt-4" onClick={() => setHelp(false)}>
              Close
            </button>
          </div>
        )}
      </dialog>
    </>
  );
}
