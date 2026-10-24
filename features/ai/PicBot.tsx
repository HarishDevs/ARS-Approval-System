"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Copy, History, Minus, Plus, RotateCcw, Square, Trash2, X } from "lucide-react";
import { ConfirmDialog } from "@/features/ui/Dialog";
import { Hint } from "@/features/ui/Hint";
import { RichAnswer } from "@/features/ai/RichAnswer";

// D-172 Pic bot - ai: the floating launcher (the supplied logo) and chat
// panel, on every page for people who have at least one chat mode. It talks
// only to /api/ai/* (the server checks the session, modules, modes and the
// conversation's owner on every call; nothing here is trusted for access).
// Answers are Markdown rendered to React elements (D-178), never raw HTML. Theme tokens follow light/dark.
type ModeOption = { mode: string; label: string };
type Conversation = { id: number; title: string; mode: string; updatedAt: string; usable: boolean };
type Message = {
  id: number;
  role: "user" | "assistant";
  content: string;
  error: string | null;
  model: string | null;
  evidence: { label: string; source: string; asOf: string; links: { label: string; href: string }[] }[];
  unverified: string[];
  createdAt: string;
};
type Pending = { question: string; requestKey: string };

const LOGO = "/brand/pic-bot.jpg";

async function api<T>(path: string, init?: RequestInit): Promise<{ ok: boolean; status: number; data: T | null; message: string | null }> {
  try {
    const response = await fetch(path, { ...init, cache: "no-store", headers: { "content-type": "application/json", ...(init?.headers ?? {}) } });
    const body = (await response.json().catch(() => null)) as { success?: boolean; data?: T; error?: { message?: string } } | null;
    return { ok: response.ok && Boolean(body?.success), status: response.status, data: (body?.data ?? null) as T | null, message: body?.error?.message ?? (response.ok ? null : "Something went wrong. Please try again.") };
  } catch (error) {
    if ((error as Error)?.name === "AbortError") return { ok: false, status: 499, data: null, message: "Stopped." };
    return { ok: false, status: 0, data: null, message: "Couldn't reach the server. Check your connection and try again." };
  }
}

// D-178: the technical detail of an answer, for its hover hint.
function aboutAnswer(message: Message): string {
  const sources = [...new Set(message.evidence.map((item) => item.source))];
  const read = message.evidence[0] ? new Date(message.evidence[0].asOf).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" }) : null;
  const parts = [sources.length ? `From ${sources.join(" and ")}${read ? `, read ${read}` : ""}.` : "Answered without company data."];
  if (message.unverified.length) parts.push(`Calculated by Pic bot, not read directly: ${message.unverified.join(", ")}.`);
  parts.push("Pic bot can't approve, send or change anything.");
  return parts.join(" ");
}

export function PicBot({ initialModes }: { initialModes: ModeOption[] }) {
  const [open, setOpen] = useState(false);
  const [minimised, setMinimised] = useState(false);
  const [view, setView] = useState<"chat" | "history">("chat");
  const [modes, setModes] = useState<ModeOption[]>(initialModes);
  const [stopped, setStopped] = useState(false);
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [current, setCurrent] = useState<{ id: number | null; mode: string; usable: boolean }>({ id: null, mode: initialModes[0]?.mode ?? "", usable: true });
  const [messages, setMessages] = useState<Message[]>([]);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [retry, setRetry] = useState<Pending | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<number | null>(null);
  const [copied, setCopied] = useState<number | null>(null);
  const abort = useRef<AbortController | null>(null);
  const launcher = useRef<HTMLButtonElement>(null);
  const composer = useRef<HTMLTextAreaElement>(null);
  const list = useRef<HTMLOListElement>(null);
  // The launcher isn't on the page while the panel is open; focus returns to it once it is.
  const returnFocus = useRef(false);

  const refresh = useCallback(async () => {
    const result = await api<{ stopped: boolean; modes: ModeOption[]; conversations: Conversation[] }>("/api/ai/conversations");
    if (!result.ok || !result.data) {
      setNotice(result.message);
      return;
    }
    setStopped(result.data.stopped);
    setModes(result.data.modes);
    setConversations(result.data.conversations);
    setCurrent((value) => (value.id === null && !result.data!.modes.some((item) => item.mode === value.mode) ? { ...value, mode: result.data!.modes[0]?.mode ?? "" } : value));
  }, []);

  useEffect(() => {
    if (open && !minimised) {
      void refresh();
      composer.current?.focus();
    }
  }, [open, minimised, refresh]);

  useEffect(() => {
    list.current?.lastElementChild?.scrollIntoView({ block: "end" });
  }, [messages, busy]);

  const close = useCallback(() => {
    abort.current?.abort();
    returnFocus.current = true;
    setOpen(false);
    setMinimised(false);
  }, []);

  useEffect(() => {
    if ((!open || minimised) && returnFocus.current) {
      returnFocus.current = false;
      launcher.current?.focus();
    }
  }, [open, minimised]);

  function newChat(mode?: string) {
    abort.current?.abort();
    setCurrent({ id: null, mode: mode ?? current.mode ?? modes[0]?.mode ?? "", usable: true });
    setMessages([]);
    setRetry(null);
    setNotice(null);
    setView("chat");
    composer.current?.focus();
  }

  async function openConversation(id: number) {
    const result = await api<{ id: number; mode: string; usable: boolean; messages: Message[] }>(`/api/ai/conversations/${id}`);
    if (!result.ok || !result.data) return setNotice(result.message);
    setCurrent({ id: result.data.id, mode: result.data.mode, usable: result.data.usable });
    setMessages(result.data.messages);
    setRetry(null);
    setNotice(result.data.usable ? null : "This chat's mode is no longer available to you (or it's from an earlier version). You can read it; start a new chat to ask more.");
    setView("chat");
  }

  async function removeConversation(id: number) {
    setConfirmDelete(null);
    const result = await api(`/api/ai/conversations/${id}`, { method: "DELETE" });
    if (!result.ok) return setNotice(result.message);
    if (current.id === id) newChat();
    await refresh();
  }

  async function send(pending: Pending) {
    if (busy || !pending.question.trim()) return;
    setBusy(true);
    setNotice(null);
    setRetry(null);
    const controller = new AbortController();
    abort.current = controller;
    // Shown at once; replaced by the server's copy when the answer arrives.
    if (!messages.some((message) => message.role === "user" && message.content === pending.question && message.id < 0)) {
      setMessages((value) => [...value, { id: -Date.now(), role: "user", content: pending.question, error: null, model: null, evidence: [], unverified: [], createdAt: new Date().toISOString() }]);
    }
    const result = await api<{ conversationId: number | null; messages: Message[] }>("/api/ai/chat", {
      method: "POST",
      body: JSON.stringify({ conversationId: current.id, mode: current.id === null ? current.mode : null, question: pending.question, requestKey: pending.requestKey }),
      signal: controller.signal,
    });
    abort.current = null;
    setBusy(false);
    if (result.data?.conversationId) {
      setCurrent((value) => ({ ...value, id: result.data!.conversationId }));
      setMessages(result.data.messages);
    }
    if (!result.ok) {
      // A failed answer is already in the conversation; only other refusals need a notice.
      setNotice(result.data?.conversationId ? null : result.message);
      // A retry re-sends the same key: the server never stores or charges it twice.
      if (result.status !== 403 && result.status !== 413 && result.status !== 400) setRetry(pending);
    }
    void refresh();
  }

  function submit() {
    const question = draft.trim();
    if (!question) return;
    setDraft("");
    void send({ question, requestKey: crypto.randomUUID() });
  }

  async function copy(message: Message) {
    try {
      await navigator.clipboard.writeText(message.content);
      setCopied(message.id);
      setTimeout(() => setCopied(null), 1500);
    } catch {
      setNotice("Couldn't copy. Select the text and copy it instead.");
    }
  }

  const modeLabel = (mode: string) => modes.find((item) => item.mode === mode)?.label ?? (mode === "LEGACY" ? "Earlier version" : mode);

  return (
    <>
      {(!open || minimised) && (
        <button
          ref={launcher}
          type="button"
          onClick={() => {
            setOpen(true);
            setMinimised(false);
          }}
          aria-label={minimised ? "Open Pic bot - ai (minimised)" : "Open Pic bot - ai"}
          data-testid="picbot-launcher"
          className="fixed bottom-20 right-4 z-40 h-14 w-14 overflow-hidden rounded-full border border-line bg-white shadow-lg transition-transform hover:scale-105 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary-600 motion-reduce:transition-none md:bottom-6 md:right-6"
          style={{ marginBottom: "env(safe-area-inset-bottom)" }}
        >
          {/* eslint-disable-next-line @next/next/no-img-element -- small static logo */}
          <img src={LOGO} alt="" width={56} height={56} className="h-full w-full object-cover" />
          {minimised && busy && <span className="absolute right-1 top-1 h-3 w-3 rounded-full bg-primary-600" aria-hidden="true" />}
        </button>
      )}

      {open && !minimised && (
        <section
          role="dialog"
          aria-modal="false"
          aria-label="Pic bot - ai"
          data-testid="picbot-panel"
          onKeyDown={(event) => {
            if (event.key === "Escape") {
              event.stopPropagation();
              close();
            }
          }}
          className="card fixed inset-x-2 bottom-2 z-50 flex max-h-[calc(100dvh-1rem)] flex-col overflow-hidden shadow-xl sm:inset-x-auto sm:bottom-6 sm:right-6 sm:h-[min(680px,calc(100dvh-3rem))] sm:w-[440px]"
          style={{ marginBottom: "env(safe-area-inset-bottom)" }}
        >
          <header className="flex items-center gap-2 border-b border-line px-3 py-2">
            {/* eslint-disable-next-line @next/next/no-img-element -- small static logo */}
            <img src={LOGO} alt="" width={32} height={32} className="h-8 w-8 rounded-full border border-line bg-white object-cover" />
            <div className="min-w-0 flex-1">
              <h2 className="truncate text-body font-semibold">Pic bot - ai</h2>
              <p className="truncate text-caption text-ink-muted" data-testid="picbot-scope">
                {view === "history" ? "Your chats" : current.mode ? `Using: ${modeLabel(current.mode)}` : "No chat mode available"}
              </p>
            </div>
            <button type="button" onClick={() => setView(view === "history" ? "chat" : "history")} aria-label={view === "history" ? "Back to the chat" : "Your chats"} aria-pressed={view === "history"} className="rounded-md p-1.5 text-ink-muted hover:bg-surface-muted hover:text-ink">
              <History aria-hidden="true" className="h-4 w-4" />
            </button>
            <button type="button" onClick={() => newChat()} aria-label="New chat" className="rounded-md p-1.5 text-ink-muted hover:bg-surface-muted hover:text-ink">
              <Plus aria-hidden="true" className="h-4 w-4" />
            </button>
            <button
              type="button"
              onClick={() => {
                returnFocus.current = true;
                setMinimised(true);
              }}
              aria-label="Minimise Pic bot"
              className="rounded-md p-1.5 text-ink-muted hover:bg-surface-muted hover:text-ink">
              <Minus aria-hidden="true" className="h-4 w-4" />
            </button>
            <button type="button" onClick={close} aria-label="Close Pic bot" className="rounded-md p-1.5 text-ink-muted hover:bg-surface-muted hover:text-ink">
              <X aria-hidden="true" className="h-4 w-4" />
            </button>
          </header>

          {view === "history" ? (
            <div className="min-h-0 flex-1 overflow-y-auto">
              {conversations.length === 0 ? (
                <p className="px-4 py-6 text-label text-ink-muted">No chats yet.</p>
              ) : (
                <ul className="divide-y divide-line" data-testid="picbot-history">
                  {conversations.map((conversation) => (
                    <li key={conversation.id} className="flex items-center gap-2 px-3 py-2">
                      <button type="button" onClick={() => void openConversation(conversation.id)} className="min-w-0 flex-1 text-left">
                        <span className="block truncate text-label font-medium">{conversation.title}</span>
                        <span className="block text-caption text-ink-muted">
                          {modeLabel(conversation.mode)} · {new Date(conversation.updatedAt).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" })}
                        </span>
                      </button>
                      <button type="button" onClick={() => setConfirmDelete(conversation.id)} aria-label={`Delete chat: ${conversation.title}`} className="rounded-md p-1.5 text-ink-muted hover:bg-surface-muted hover:text-danger-600">
                        <Trash2 aria-hidden="true" className="h-4 w-4" />
                      </button>
                    </li>
                  ))}
                </ul>
              )}
              <p className="px-3 py-2 text-caption">
                <Link href="/users/ai/assistant" className="link">
                  Open the AI Assistant
                </Link>
              </p>
            </div>
          ) : (
            <>
              <div className="min-h-0 flex-1 overflow-y-auto px-3 py-3">
                {current.id === null && modes.length > 1 && (
                  <div className="mb-3">
                    <label htmlFor="picbot-mode" className="sr-only">
                      What should this chat use?
                    </label>
                    <select id="picbot-mode" title="What this chat uses" value={current.mode} onChange={(event) => setCurrent({ id: null, mode: event.target.value, usable: true })} className="h-8 rounded-full border border-line bg-surface-muted px-3 text-label text-ink" data-testid="picbot-mode">
                      {modes.map((item) => (
                        <option key={item.mode} value={item.mode}>
                          {item.label}
                        </option>
                      ))}
                    </select>
                  </div>
                )}
                {messages.length === 0 && !busy && (
                  <p className="text-label text-ink-muted">
                    {stopped ? "Pic bot is switched off for now." : modes.length ? "What would you like to know?" : "No chat mode is available to you."}
                  </p>
                )}
                <ol ref={list} className="space-y-3" aria-live="polite" data-testid="picbot-messages">
                  {messages.map((message) =>
                    message.role === "user" ? (
                      <li key={message.id} className="ml-auto w-fit max-w-[85%] whitespace-pre-wrap break-words rounded-2xl bg-primary-50 px-3 py-2 text-label text-primary-700">
                        {message.content}
                      </li>
                    ) : message.error ? (
                      <li key={message.id} role="alert" className="text-label text-danger-600">
                        {message.error}
                      </li>
                    ) : (
                      <li key={message.id} className="text-label" data-testid="picbot-answer">
                        <RichAnswer text={message.content} compact />
                        <div className="mt-1 flex items-center gap-1">
                          <button type="button" onClick={() => void copy(message)} className="inline-flex h-7 w-7 items-center justify-center rounded-md text-ink-faint hover:bg-surface-muted hover:text-ink" aria-label="Copy this answer" title={copied === message.id ? "Copied" : "Copy"}>
                            <Copy aria-hidden="true" className="h-3.5 w-3.5" />
                          </button>
                          <Hint text={aboutAnswer(message)} align="start" />
                          {message.evidence.flatMap((item) => item.links).slice(0, 2).map((link) => (
                            <Link key={link.href} href={link.href} className="link text-caption">
                              {link.label}
                            </Link>
                          ))}
                        </div>
                      </li>
                    ),
                  )}
                  {busy && (
                    <li className="text-label text-ink-muted" role="status">
                      Analysing…
                    </li>
                  )}
                </ol>
                {(notice || retry) && (
                  <p role={notice ? "alert" : undefined} className={notice ? "mt-3 rounded-md border border-danger-200 bg-danger-50 px-3 py-2 text-label text-danger-600" : "mt-2 text-label text-ink-muted"} data-testid="picbot-notice">
                    {notice}
                    {retry && (
                      <button type="button" onClick={() => void send(retry)} className="ml-2 inline-flex items-center gap-1 font-semibold underline">
                        <RotateCcw aria-hidden="true" className="h-3 w-3" /> Retry
                      </button>
                    )}
                  </p>
                )}
              </div>
              <form
                className="border-t border-line p-2"
                onSubmit={(event) => {
                  event.preventDefault();
                  submit();
                }}
              >
                <label htmlFor="picbot-input" className="sr-only">
                  Message Pic bot
                </label>
                <div className="flex items-end gap-2">
                  <textarea
                    ref={composer}
                    id="picbot-input"
                    rows={2}
                    value={draft}
                    maxLength={20000}
                    disabled={!modes.length || stopped || !current.usable}
                    onChange={(event) => setDraft(event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter" && !event.shiftKey) {
                        event.preventDefault();
                        submit();
                      }
                    }}
                    placeholder={current.usable ? "Ask anything…" : "Start a new chat to ask more."}
                    className="field-input min-h-[2.75rem] flex-1 resize-none"
                  />
                  {busy ? (
                    <button type="button" onClick={() => abort.current?.abort()} className="btn-secondary btn-compact inline-flex items-center gap-1" aria-label="Stop the answer">
                      <Square aria-hidden="true" className="h-3.5 w-3.5" /> Stop
                    </button>
                  ) : (
                    <button type="submit" disabled={!draft.trim() || !modes.length || stopped || !current.usable} className="btn-primary btn-compact">
                      Send
                    </button>
                  )}
                </div>
              </form>
            </>
          )}
        </section>
      )}

      <ConfirmDialog
        open={confirmDelete !== null}
        onCancel={() => setConfirmDelete(null)}
        onConfirm={() => confirmDelete !== null && void removeConversation(confirmDelete)}
        title="Delete this chat?"
        body="Its messages are deleted for good. Suggestions already recorded from it stay for their decision."
        confirmLabel="Yes, delete"
        tone="danger"
      />
    </>
  );
}
