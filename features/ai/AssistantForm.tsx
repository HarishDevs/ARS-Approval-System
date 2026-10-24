"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { askAction } from "@/app/users/ai/actions";
import { ResultMessage, SubmitButton, useActionForm } from "@/features/ui/form";

// D-169: the question box. A new conversation's address is opened once it exists.
export function AssistantForm({ conversationId, enabled, maxChars, modes }: { conversationId: number | null; enabled: boolean; maxChars: number; modes: { mode: string; label: string }[] }) {
  const { result, pending, onSubmit, formRef } = useActionForm(askAction, { resetOnSuccess: true });
  const router = useRouter();
  const box = useRef<HTMLTextAreaElement>(null);
  const [requestKey, setRequestKey] = useState(() => crypto.randomUUID());
  useEffect(() => {
    if (result?.ok) setRequestKey(crypto.randomUUID());
    const id = result?.data?.conversationId;
    if (typeof id === "number" && id !== conversationId) router.replace(`/users/ai/assistant?c=${id}`, { scroll: false });
  }, [result, conversationId, router]);
  return (
    <form ref={formRef} onSubmit={onSubmit} className="card space-y-3 px-5 py-4" data-testid="ai-ask">
      {conversationId !== null && <input type="hidden" name="conversationId" value={conversationId} />}
      {/* D-172: a fresh key per question, so a double submit is never asked twice. */}
      <input type="hidden" name="requestKey" value={requestKey} />
      {conversationId === null && modes.length > 1 && (
        <div>
          <label htmlFor="ai-mode" className="field-label">
            What should this chat use?
          </label>
          <select id="ai-mode" name="mode" className="field-input sm:w-72" defaultValue={modes[0]?.mode}>
            {modes.map((item) => (
              <option key={item.mode} value={item.mode}>
                {item.label}
              </option>
            ))}
          </select>
        </div>
      )}
      {conversationId === null && modes.length === 1 && <input type="hidden" name="mode" value={modes[0]!.mode} />}
      <label htmlFor="ai-question" className="field-label">
        Your question
      </label>
      <textarea
        ref={box}
        id="ai-question"
        name="question"
        rows={3}
        maxLength={maxChars}
        required
        disabled={!enabled}
        className="field-input"
        placeholder={enabled ? "e.g. Which approvals have waited longest for me?" : "The assistant opens once an AI provider is set up."}
        onKeyDown={(event) => {
          if (event.key === "Enter" && (event.ctrlKey || event.metaKey)) event.currentTarget.form?.requestSubmit();
        }}
      />
      <div className="flex flex-wrap items-center gap-3">
        {enabled && (
          <SubmitButton pending={pending} className="btn-compact">
            Ask
          </SubmitButton>
        )}
        <span className="text-caption text-ink-muted">Ctrl + Enter to send. Answers can take a few seconds.</span>
      </div>
      {result && !result.ok && <ResultMessage result={result} />}
    </form>
  );
}
