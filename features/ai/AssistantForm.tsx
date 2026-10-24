"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowUp } from "lucide-react";
import { askAction } from "@/app/users/ai/actions";
import { ResultMessage, useActionForm } from "@/features/ui/form";

// D-169, D-178: the composer, pinned under the conversation like a chat app.
// Enter sends, Shift + Enter adds a line. While the answer is being prepared
// the question shows with a "thinking" line. A new conversation's address is
// opened once it exists.
export function AssistantForm({ conversationId, enabled, maxChars, modes, suggestions = [] }: { conversationId: number | null; enabled: boolean; maxChars: number; modes: { mode: string; label: string }[]; suggestions?: string[] }) {
  const { result, pending, onSubmit, formRef } = useActionForm(askAction, { resetOnSuccess: true });
  const router = useRouter();
  const box = useRef<HTMLTextAreaElement>(null);
  const [requestKey, setRequestKey] = useState(() => crypto.randomUUID());
  const [asked, setAsked] = useState("");
  useEffect(() => {
    if (result?.ok) setRequestKey(crypto.randomUUID());
    const id = result?.data?.conversationId;
    if (typeof id === "number" && id !== conversationId) router.replace(`/users/ai/assistant?c=${id}`, { scroll: false });
  }, [result, conversationId, router]);
  useEffect(() => {
    box.current?.scrollIntoView({ block: "end" });
  }, [pending, result]);

  return (
    <div className="space-y-3">
      {pending && asked && (
        <div className="space-y-3" aria-live="polite">
          <p className="ml-auto w-fit max-w-[85%] whitespace-pre-wrap break-words rounded-2xl bg-primary-50 px-4 py-2.5 text-primary-700">{asked}</p>
          <p className="flex items-center gap-2 text-label text-ink-muted">
            <span className="inline-flex gap-1" aria-hidden="true">
              <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-ink-faint" />
              <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-ink-faint [animation-delay:120ms]" />
              <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-ink-faint [animation-delay:240ms]" />
            </span>
            Analysing…
          </p>
        </div>
      )}
      {!pending && conversationId === null && enabled && suggestions.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {suggestions.map((text) => (
            <button
              key={text}
              type="button"
              className="rounded-full border border-line px-3 py-1.5 text-label text-ink-muted hover:border-line-strong hover:text-ink"
              onClick={() => {
                if (!box.current) return;
                box.current.value = text;
                box.current.focus();
              }}
            >
              {text}
            </button>
          ))}
        </div>
      )}
      <form
        ref={formRef}
        onSubmit={(event) => {
          setAsked(box.current?.value.trim() ?? "");
          onSubmit(event);
        }}
        className="sticky bottom-3 rounded-2xl border border-line bg-surface px-3 py-2 shadow-lg focus-within:border-primary-600"
        data-testid="ai-ask"
      >
        {conversationId !== null && <input type="hidden" name="conversationId" value={conversationId} />}
        {/* D-172: a fresh key per question, so a double submit is never asked twice. */}
        <input type="hidden" name="requestKey" value={requestKey} />
        {conversationId === null && modes.length === 1 && <input type="hidden" name="mode" value={modes[0]!.mode} />}
        <label htmlFor="ai-question" className="sr-only">
          Your question
        </label>
        <textarea
          ref={box}
          id="ai-question"
          name="question"
          rows={2}
          maxLength={maxChars}
          required
          disabled={!enabled || pending}
          className="block w-full resize-none border-0 bg-transparent px-1 py-1.5 text-body text-ink placeholder:text-ink-faint focus:outline-none"
          placeholder={enabled ? "Ask anything about your business…" : "Opens once an AI provider is set up"}
          onKeyDown={(event) => {
            if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
              event.preventDefault();
              event.currentTarget.form?.requestSubmit();
            }
          }}
        />
        <div className="flex items-center justify-between gap-2">
          {conversationId === null && modes.length > 1 ? (
            <select name="mode" aria-label="What this chat uses" title="What this chat uses" defaultValue={modes[0]?.mode} className="h-8 rounded-full border border-line bg-surface-muted px-3 text-label text-ink">
              {modes.map((item) => (
                <option key={item.mode} value={item.mode}>
                  {item.label}
                </option>
              ))}
            </select>
          ) : (
            <span />
          )}
          {enabled && (
            <button type="submit" disabled={pending} aria-label="Ask" title="Send (Enter)" className="inline-flex h-9 w-9 items-center justify-center rounded-full bg-primary-solid text-white hover:bg-primary-solid-hover disabled:bg-primary-solid-disabled">
              <ArrowUp aria-hidden="true" className="h-4 w-4" />
            </button>
          )}
        </div>
      </form>
      {/* A failed answer is already shown in the conversation; only other refusals show here. */}
      {result && !result.ok && typeof result.data?.conversationId !== "number" && <ResultMessage result={result} />}
    </div>
  );
}
