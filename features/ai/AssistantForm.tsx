"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { askAction } from "@/app/users/ai/actions";
import { ResultMessage, SubmitButton, useActionForm } from "@/features/ui/form";

// D-169: the question box. A new conversation's address is opened once it exists.
export function AssistantForm({ conversationId, enabled, maxChars }: { conversationId: number | null; enabled: boolean; maxChars: number }) {
  const { result, pending, onSubmit, formRef } = useActionForm(askAction, { resetOnSuccess: true });
  const router = useRouter();
  const box = useRef<HTMLTextAreaElement>(null);
  useEffect(() => {
    const id = result?.data?.conversationId;
    if (typeof id === "number" && id !== conversationId) router.replace(`/users/ai/assistant?c=${id}`, { scroll: false });
  }, [result, conversationId, router]);
  return (
    <form ref={formRef} onSubmit={onSubmit} className="card space-y-3 px-5 py-4" data-testid="ai-ask">
      {conversationId !== null && <input type="hidden" name="conversationId" value={conversationId} />}
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
