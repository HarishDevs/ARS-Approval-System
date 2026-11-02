"use client";

import { AtSign, Heart, Pin, SendHorizontal } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { commentAction, commentChangeAction, likeAction } from "@/app/users/work/actions";
import { FieldError, ResultMessage, SubmitButton, useActionForm } from "@/features/ui/form";
import { useWorkCall } from "@/features/work/client";
import { commentParts } from "@/server/work/rules";
import { ConfirmButton } from "@/features/ui/ConfirmButton";

// D-215: the task's conversation. Comments with one level of replies, likes,
// pins; @mention a person to tell them (people who can't see the task are
// added as followers so they can, unless the writer unticks that).
export interface CommentView {
  id: number;
  parentCommentId: number | null;
  authorId: number;
  authorName: string;
  body: string;
  isPinned: boolean;
  edited: boolean;
  deleted: boolean;
  when: string; // already formatted (India time)
  likes: number;
  likedByMe: boolean;
}

export function CommentThread({ taskId, comments, meId, canComment, canPin, people, isAdmin, docked = false }: { taskId: number; comments: CommentView[]; meId: number; canComment: boolean; canPin: boolean; people: { id: number; label: string }[]; isAdmin: boolean; docked?: boolean }) {
  const roots = comments.filter((comment) => comment.parentCommentId === null).sort((a, b) => Number(b.isPinned) - Number(a.isPinned) || a.id - b.id);
  const replies = (id: number) => comments.filter((comment) => comment.parentCommentId === id);
  return (
    <section className="card space-y-4 px-5 py-4" aria-labelledby="comments">
      <h2 id="comments" className="font-semibold">
        Comments {comments.filter((comment) => !comment.deleted).length > 0 && <span className="font-normal text-ink-muted">({comments.filter((comment) => !comment.deleted).length})</span>}
      </h2>
      {roots.length === 0 && <p className="text-label text-ink-muted">No comments yet.</p>}
      <ol className="space-y-4" data-testid="comments">
        {roots.map((comment) => (
          <li key={comment.id}>
            <CommentItem comment={comment} meId={meId} canPin={canPin} isAdmin={isAdmin} />
            <ol className="ml-6 mt-2 space-y-2 border-l border-line pl-3">
              {replies(comment.id).map((reply) => (
                <li key={reply.id}>
                  <CommentItem comment={reply} meId={meId} canPin={false} isAdmin={isAdmin} />
                </li>
              ))}
              {canComment && !comment.deleted && <ReplyBox taskId={taskId} parentId={comment.id} people={people} />}
            </ol>
          </li>
        ))}
      </ol>
      {/* v1.46.0 (owner, Asana): on a phone the comment box stays at the bottom of the screen. */}
      {canComment ? docked ? <DockedComposer taskId={taskId} people={people} /> : <Composer taskId={taskId} people={people} /> : <p className="text-caption text-ink-muted">You can read this task but not comment on it.</p>}
    </section>
  );
}

function Body({ text }: { text: string }) {
  return (
    <p className="whitespace-pre-wrap break-words text-body">
      {commentParts(text).map((part, index) =>
        part.kind === "text" ? (
          <span key={index}>{part.text}</span>
        ) : (
          <span key={index} className="rounded bg-primary-50 px-1 font-medium text-primary-700">
            @{part.label}
          </span>
        ),
      )}
    </p>
  );
}

function CommentItem({ comment, meId, canPin, isAdmin }: { comment: CommentView; meId: number; canPin: boolean; isAdmin: boolean }) {
  const { call, pending: busy } = useWorkCall();
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState(comment.body);
  if (comment.deleted) return <p className="text-label italic text-ink-muted">This comment was deleted.</p>;
  const mine = comment.authorId === meId;
  return (
    <div className={`rounded-md ${comment.isPinned ? "border border-primary-200 bg-primary-50/40 p-2" : ""}`} data-testid="comment">
      <div className="flex flex-wrap items-center gap-2 text-caption text-ink-muted">
        {comment.isPinned && (
          <span className="inline-flex items-center gap-0.5 text-primary-700">
            <Pin aria-hidden="true" className="h-3 w-3" /> Pinned
          </span>
        )}
        <span className="font-semibold text-ink">{comment.authorName}</span>
        <span>{comment.when}</span>
        {comment.edited && <span>(edited)</span>}
      </div>
      {editing ? (
        <form
          className="mt-1 space-y-2"
          onSubmit={(event) => {
            event.preventDefault();
            if (!busy) void call(() => commentChangeAction(comment.id, { body: text })).then((result) => result?.ok && setEditing(false));
          }}
        >
          <label htmlFor={`edit-${comment.id}`} className="sr-only">
            Edit comment
          </label>
          <textarea id={`edit-${comment.id}`} value={text} onChange={(event) => setText(event.target.value)} rows={3} maxLength={4000} className="field-input h-auto py-2" />
          <div className="flex gap-2">
            <button type="submit" disabled={busy} aria-busy={busy || undefined} className="btn-primary btn-compact">
              Save
            </button>
            <button type="button" className="btn-secondary btn-compact" onClick={() => setEditing(false)}>
              Cancel
            </button>
          </div>
        </form>
      ) : (
        <Body text={comment.body} />
      )}
      <div className="mt-1 flex flex-wrap items-center gap-3 text-caption">
        <button type="button" aria-pressed={comment.likedByMe} onClick={() => void call(() => likeAction("COMMENT", comment.id), { success: false })} className={`inline-flex items-center gap-1 ${comment.likedByMe ? "text-danger-600" : "text-ink-muted hover:text-ink"}`}>
          <Heart aria-hidden="true" className="h-3 w-3" fill={comment.likedByMe ? "currentColor" : "none"} />
          {comment.likedByMe ? "Liked" : "Like"}
          {comment.likes > 0 && ` · ${comment.likes}`}
        </button>
        {(canPin || mine) && comment.parentCommentId === null && (
          <button type="button" className="text-ink-muted hover:text-ink" onClick={() => void call(() => commentChangeAction(comment.id, { pinned: !comment.isPinned }), { success: false })}>
            {comment.isPinned ? "Unpin" : "Pin"}
          </button>
        )}
        {mine && !editing && (
          <button type="button" className="text-ink-muted hover:text-ink" onClick={() => setEditing(true)}>
            Edit
          </button>
        )}
        {(mine || isAdmin) && (
          <ConfirmButton title="Delete this comment?" body="It's removed for everyone on this task." className="text-ink-muted hover:text-danger-600" onConfirm={() => call(() => commentChangeAction(comment.id, { delete: true }), { success: "Comment deleted." })}>
            Delete
          </ConfirmButton>
        )}
      </div>
    </div>
  );
}

function MentionPicker({ people, onPick }: { people: { id: number; label: string }[]; onPick: (person: { id: number; label: string }) => void }) {
  const [value, setValue] = useState("");
  return (
    <span className="inline-flex items-center gap-1">
      <AtSign aria-hidden="true" className="h-3.5 w-3.5 text-ink-faint" />
      <select
        aria-label="Mention someone"
        value={value}
        onChange={(event) => {
          const person = people.find((item) => item.id === Number(event.target.value));
          if (person) onPick(person);
          setValue("");
        }}
        className="field-input h-8 w-44 py-0 text-label"
      >
        <option value="">Mention someone…</option>
        {people.map((person) => (
          <option key={person.id} value={person.id}>
            {person.label}
          </option>
        ))}
      </select>
    </span>
  );
}

function Composer({ taskId, people }: { taskId: number; people: { id: number; label: string }[] }) {
  const { result, pending, onSubmit, formRef } = useActionForm(commentAction, { resetOnSuccess: true });
  const box = useRef<HTMLTextAreaElement>(null);
  const insert = (person: { id: number; label: string }) => {
    const node = box.current;
    if (!node) return;
    const token = `@[${person.label.replace(/[\]\n]/g, "")}](user:${person.id}) `;
    const at = node.selectionStart ?? node.value.length;
    node.value = `${node.value.slice(0, at)}${token}${node.value.slice(node.selectionEnd ?? at)}`;
    node.focus();
    node.selectionStart = node.selectionEnd = at + token.length;
  };
  return (
    <form ref={formRef} onSubmit={onSubmit} className="space-y-2 border-t border-line pt-3" aria-label="Add a comment">
      <input type="hidden" name="taskId" value={taskId} />
      <label htmlFor="comment-body" className="field-label">
        Add a comment
      </label>
      <textarea
        id="comment-body"
        ref={box}
        name="body"
        rows={3}
        maxLength={4000}
        placeholder="Add a comment or @mention a teammate"
        className="field-input h-auto py-2"
        onKeyDown={(event) => {
          if (event.key === "Enter" && (event.ctrlKey || event.metaKey)) {
            event.preventDefault();
            event.currentTarget.form?.requestSubmit();
          }
        }}
        aria-keyshortcuts="Control+Enter"
      />
      <FieldError result={result} name="body" />
      <div className="flex flex-wrap items-center gap-3">
        <MentionPicker people={people} onPick={insert} />
        <label className="flex items-center gap-1.5 text-caption text-ink-muted">
          <input type="checkbox" name="mentionAccess" value="yes" defaultChecked />
          Let people I mention see this task
        </label>
        <SubmitButton pending={pending} className="btn-compact ml-auto">
          Comment
        </SubmitButton>
      </div>
      <ResultMessage result={result} />
    </form>
  );
}

// v1.46.0 (owner: "Asana keeps a comment box fixed at the bottom of a task"):
// a slim bar above the tab bar; tapping it opens the full box (mention,
// "let people I mention see", send). It closes after sending, on Escape, or
// when left empty. The same comment action as the inline box.
function DockedComposer({ taskId, people }: { taskId: number; people: { id: number; label: string }[] }) {
  const { result, pending, onSubmit, formRef } = useActionForm(commentAction, { resetOnSuccess: true });
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLTextAreaElement>(null);
  useEffect(() => {
    if (result?.ok) setOpen(false);
  }, [result]);
  useEffect(() => {
    if (open) box.current?.focus();
  }, [open]);
  const insert = (person: { id: number; label: string }) => {
    const node = box.current;
    if (!node) return;
    const token = `@[${person.label.replace(/[\]\n]/g, "")}](user:${person.id}) `;
    const at = node.selectionStart ?? node.value.length;
    node.value = `${node.value.slice(0, at)}${token}${node.value.slice(node.selectionEnd ?? at)}`;
    node.focus();
    node.selectionStart = node.selectionEnd = at + token.length;
  };
  return (
    <form
      ref={formRef}
      onSubmit={onSubmit}
      aria-label="Add a comment"
      data-testid="m-comment-dock"
      data-open={open ? "1" : undefined}
      className="mob-comment-dock fixed inset-x-0 bottom-[calc(4rem+env(safe-area-inset-bottom))] z-sticky border-t border-line bg-surface px-3 py-2 shadow-overlay"
      onKeyDown={(event) => {
        if (event.key === "Escape" && !box.current?.value) setOpen(false);
      }}
    >
      <input type="hidden" name="taskId" value={taskId} />
      {open ? (
        <div className="space-y-2">
          <label htmlFor="comment-dock-body" className="sr-only">
            Add a comment
          </label>
          <textarea
            id="comment-dock-body"
            ref={box}
            name="body"
            rows={3}
            maxLength={4000}
            placeholder="Add a comment or @mention a teammate"
            className="field-input h-auto max-h-[40dvh] py-2 text-[16px]"
            onBlur={(event) => {
              const next = event.relatedTarget as HTMLElement | null;
              if (!event.currentTarget.value && !event.currentTarget.form?.contains(next)) setOpen(false);
            }}
          />
          <FieldError result={result} name="body" />
          <div className="flex items-center gap-2">
            <MentionPicker people={people} onPick={insert} />
            <SubmitButton pending={pending} className="btn-compact ml-auto h-10 px-4">
              <SendHorizontal aria-hidden="true" className="h-4 w-4" /> Send
            </SubmitButton>
          </div>
          <label className="flex items-center gap-1.5 text-caption text-ink-muted">
            <input type="checkbox" name="mentionAccess" value="yes" defaultChecked />
            Let people I mention see this task
          </label>
        </div>
      ) : (
        <button type="button" onClick={() => setOpen(true)} className="flex min-h-11 w-full items-center rounded-full bg-surface-muted px-4 text-left text-[15px] text-ink-faint" data-testid="m-comment-open">
          Add a comment
        </button>
      )}
      <ResultMessage result={result} />
    </form>
  );
}

function ReplyBox({ taskId, parentId, people }: { taskId: number; parentId: number; people: { id: number; label: string }[] }) {
  const [open, setOpen] = useState(false);
  const { result, pending, onSubmit, formRef } = useActionForm(commentAction, { resetOnSuccess: true });
  const box = useRef<HTMLTextAreaElement>(null);
  if (!open)
    return (
      <li>
        <button type="button" className="text-caption link" onClick={() => setOpen(true)}>
          Reply
        </button>
      </li>
    );
  return (
    <li>
      <form ref={formRef} onSubmit={onSubmit} className="space-y-2" aria-label="Reply">
        <input type="hidden" name="taskId" value={taskId} />
        <input type="hidden" name="parentId" value={parentId} />
        <input type="hidden" name="mentionAccess" value="yes" />
        <label htmlFor={`reply-${parentId}`} className="sr-only">
          Reply
        </label>
        <textarea id={`reply-${parentId}`} ref={box} name="body" rows={2} maxLength={4000} autoFocus className="field-input h-auto py-2" />
        <FieldError result={result} name="body" />
        <div className="flex flex-wrap items-center gap-2">
          <MentionPicker
            people={people}
            onPick={(person) => {
              if (box.current) box.current.value += `@[${person.label.replace(/[\]\n]/g, "")}](user:${person.id}) `;
            }}
          />
          <SubmitButton pending={pending} className="btn-compact">
            Reply
          </SubmitButton>
          <button type="button" className="btn-secondary btn-compact" onClick={() => setOpen(false)}>
            Cancel
          </button>
        </div>
        <ResultMessage result={result} />
      </form>
    </li>
  );
}
