"use client";

import { ArrowDown, ArrowUp, Diamond, Heart, Lock, X } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { deleteTaskAction, dependencyAction, followAction, likeAction, moveTaskAction, parentAction, subtaskOrderAction, tagAction, taskFieldsAction, taskProjectAction } from "@/app/users/work/actions";
import { FieldError, ResultMessage, SubmitButton, useActionForm } from "@/features/ui/form";
import { ProjectDot, TaskCheck, usePaneLink, useWorkCall } from "@/features/work/client";
import { dueLabel, TONE_TEXT } from "@/features/work/format";
import { AddTask } from "@/features/work/ProjectWorkspace";
import { FieldInput, RepeatEditor, type FieldView } from "@/features/work/MoreParts";
import type { Recurrence } from "@/server/work/more-rules";

// D-215: what Task & Project Management adds to the task page: its projects
// (and section in each), subtasks, what it waits for, tags, followers,
// likes, milestone and start date, delete. Every change is checked again on
// the server.
export interface PanelData {
  taskId: number;
  taskNo: string;
  title: string;
  open: boolean;
  isMilestone: boolean;
  startsOn: string;
  meId: number;
  canEdit: boolean;
  canProgress: boolean; // dates, tags, waiting for, fields, repeat (D-222: ad hoc → its creator only)
  canDetails: boolean; // milestone and other details (D-222)
  adhoc: boolean; // D-222: ad hoc (one time) or periodic
  canComment: boolean;
  deleted: boolean;
  parent: { id: number; taskNo: string; title: string } | null;
  links: { projectId: number; projectName: string; color: string; sectionId: number; sections: { id: number; name: string }[] }[];
  projectChoices: { id: number; name: string }[];
  subtasks: { id: number; title: string; status: string; assigneeName: string; dueAt: string | null; subtasks: number }[];
  blockedBy: { id: number; taskNo: string; title: string; status: string }[];
  blocking: { id: number; taskNo: string; title: string; status: string }[];
  tags: { id: number; name: string }[];
  followers: { id: number; name: string }[];
  people: { id: number; label: string }[];
  likes: { id: number; name: string }[];
  nowIso: string;
  // D-218
  recurrence: Recurrence | null;
  recurrenceOn: boolean;
  fields: { projectId: number; fields: FieldView[]; values: Record<number, string> }[];
}

const OPEN = ["OPEN", "IN_PROGRESS", "BLOCKED"];

export function TaskWorkPanel({ data }: { data: PanelData }) {
  const { call, pending } = useWorkCall();
  const now = new Date(data.nowIso);
  const [addProject, setAddProject] = useState<number | "">("");
  const paneLink = usePaneLink();
  const [parentRef, setParentRef] = useState("");
  const liked = data.likes.some((person) => person.id === data.meId);

  if (data.deleted)
    return (
      <section className="card space-y-2 px-5 py-4" aria-label="Deleted">
        <p>This task was deleted. It can be restored for 30 days after it was deleted.</p>
        <button type="button" className="btn-primary btn-compact" disabled={pending} aria-busy={pending || undefined} onClick={() => void call(() => deleteTaskAction(data.taskId, true))}>
          {pending ? "Working…" : "Restore task"}
        </button>
      </section>
    );

  return (
    <div className="space-y-6">
      <section className="card space-y-3 px-5 py-4" aria-labelledby="work-projects">
        <div className="flex flex-wrap items-center gap-2">
          <h2 id="work-projects" className="font-semibold">
            Projects
          </h2>
          <button
            type="button"
            aria-pressed={liked}
            onClick={() => void call(() => likeAction("TASK", data.taskId), { success: false })}
            title={data.likes.length ? `Liked by ${data.likes.map((person) => person.name).join(", ")}` : "Like"}
            className={`ml-auto inline-flex items-center gap-1 rounded-md px-2 py-1 text-label ${liked ? "bg-danger-50 text-danger-600" : "text-ink-muted hover:bg-surface-muted"}`}
          >
            <Heart aria-hidden="true" className="h-4 w-4" fill={liked ? "currentColor" : "none"} />
            {liked ? "Liked" : "Like"}
            {data.likes.length > 0 && <span>· {data.likes.length}</span>}
          </button>
        </div>
        {data.links.length === 0 && <p className="text-label text-ink-muted">In no project: only you, its people and its followers see it.</p>}
        <ul className="space-y-2">
          {data.links.map((link) => (
            <li key={link.projectId} className="flex flex-wrap items-center gap-2 text-label">
              <ProjectDot color={link.color} />
              <Link href={`/users/work/projects/${link.projectId}`} className="link">
                {link.projectName}
              </Link>
              <select
                aria-label={`Section in ${link.projectName}`}
                value={link.sectionId}
                disabled={!data.canEdit}
                onChange={(event) => void call(() => moveTaskAction({ taskId: data.taskId, projectId: link.projectId, sectionId: Number(event.target.value), beforeId: null, afterId: null }))}
                className="field-input h-8 w-auto py-0 text-label"
              >
                {link.sections.map((section) => (
                  <option key={section.id} value={section.id}>
                    {section.name}
                  </option>
                ))}
              </select>
              {data.fields
                .find((item) => item.projectId === link.projectId)
                ?.fields.map((field) => (
                  <span key={field.id} className="flex w-full items-center gap-2 pl-5 text-caption">
                    <span className="w-28 shrink-0 truncate text-ink-muted">{field.name}</span>
                    <span className="w-56">
                      <FieldInput taskId={data.taskId} field={field} value={data.fields.find((item) => item.projectId === link.projectId)?.values[field.id] ?? ""} canChange={data.canProgress} compact />
                    </span>
                  </span>
                ))}
              {data.canEdit && (
                <button type="button" aria-label={`Remove from ${link.projectName}`} onClick={() => void call(() => taskProjectAction(data.taskId, link.projectId, false))} className="rounded p-1 text-ink-faint hover:text-danger-600">
                  <X aria-hidden="true" className="h-4 w-4" />
                </button>
              )}
            </li>
          ))}
        </ul>
        {data.canProgress && data.projectChoices.length > 0 && (
          <div className="flex flex-wrap items-end gap-2">
            <div>
              <label htmlFor="add-to-project" className="field-label">
                Add to a project
              </label>
              <select id="add-to-project" value={addProject} onChange={(event) => setAddProject(event.target.value ? Number(event.target.value) : "")} className="field-input h-9 w-64">
                <option value="">Choose a project…</option>
                {data.projectChoices
                  .filter((project) => !data.links.some((link) => link.projectId === project.id))
                  .map((project) => (
                    <option key={project.id} value={project.id}>
                      {project.name}
                    </option>
                  ))}
              </select>
            </div>
            <button type="button" disabled={addProject === ""} className="btn-secondary btn-compact" onClick={() => addProject !== "" && void call(() => taskProjectAction(data.taskId, addProject, true)).then(() => setAddProject(""))}>
              Add
            </button>
          </div>
        )}
      </section>

      <section className="card space-y-3 px-5 py-4" aria-labelledby="work-subtasks">
        <h2 id="work-subtasks" className="font-semibold">
          Subtasks {data.subtasks.length > 0 && <span className="font-normal text-ink-muted">({data.subtasks.filter((item) => item.status === "COMPLETED").length}/{data.subtasks.length} done)</span>}
        </h2>
        <ul className="divide-y divide-line" data-testid="subtasks">
          {data.subtasks.map((task, index) => {
            const due = dueLabel(task.dueAt, now, OPEN.includes(task.status));
            return (
              <li key={task.id} className="work-row flex items-center gap-2 py-1.5" tabIndex={-1}>
                <TaskCheck taskId={task.id} done={task.status === "COMPLETED"} disabled={task.status === "CANCELLED"} label={task.title} />
                <Link href={paneLink(task.id)} className={`min-w-0 flex-1 truncate text-label hover:underline ${task.status === "COMPLETED" ? "text-ink-muted line-through" : ""}`}>
                  {task.title}
                  {task.subtasks > 0 && <span className="ml-1 text-caption text-ink-muted">({task.subtasks} subtasks)</span>}
                </Link>
                <span className="text-caption text-ink-muted">{task.assigneeName}</span>
                {due && <span className={`text-caption ${TONE_TEXT[due.tone]}`}>{due.text}</span>}
                {data.canEdit && (
                  <span className="flex">
                    <button type="button" aria-label={`Move ${task.title} up`} disabled={index === 0} onClick={() => void call(() => subtaskOrderAction(task.id, data.subtasks[index - 1]!.id, null), { success: false })} className="rounded p-1 text-ink-faint hover:text-ink disabled:opacity-30">
                      <ArrowUp aria-hidden="true" className="h-3.5 w-3.5" />
                    </button>
                    <button type="button" aria-label={`Move ${task.title} down`} disabled={index === data.subtasks.length - 1} onClick={() => void call(() => subtaskOrderAction(task.id, null, data.subtasks[index + 1]!.id), { success: false })} className="rounded p-1 text-ink-faint hover:text-ink disabled:opacity-30">
                      <ArrowDown aria-hidden="true" className="h-3.5 w-3.5" />
                    </button>
                  </span>
                )}
              </li>
            );
          })}
        </ul>
        {data.canProgress && data.open && <AddTask parentId={data.taskId} placeholder="Add a subtask… (Enter to add; paste several lines for several)" />}
        {data.canEdit && (
          <div className="flex flex-wrap items-end gap-2 border-t border-line pt-3">
            {data.parent ? (
              <button type="button" className="btn-secondary btn-compact" onClick={() => void call(() => parentAction(data.taskId, null))}>
                Make it a top-level task
              </button>
            ) : (
              <>
                <div>
                  <label htmlFor="parent-ref" className="field-label">
                    Make it a subtask of (task number)
                  </label>
                  <input id="parent-ref" value={parentRef} onChange={(event) => setParentRef(event.target.value)} placeholder="TSK-2026-000123" className="field-input h-9 w-56" />
                </div>
                <button type="button" disabled={!parentRef.trim()} className="btn-secondary btn-compact" onClick={() => void call(() => parentAction(data.taskId, parentRef)).then((result) => result?.ok && setParentRef(""))}>
                  Move under it
                </button>
              </>
            )}
          </div>
        )}
      </section>

      <section className="card space-y-3 px-5 py-4" aria-labelledby="work-deps">
        <h2 id="work-deps" className="font-semibold">
          Waiting for
        </h2>
        {data.blockedBy.length === 0 && <p className="text-label text-ink-muted">Nothing: it can start any time.</p>}
        <DependencyList items={data.blockedBy} taskId={data.taskId} canChange={data.canProgress} />
        {data.canProgress && <DependencyForm taskId={data.taskId} />}
        {data.blocking.length > 0 && (
          <div>
            <h3 className="text-label font-semibold">Tasks waiting for this one</h3>
            <ul className="mt-1 space-y-1 text-label">
              {data.blocking.map((item) => (
                <li key={item.id}>
                  <Link href={paneLink(item.id)} className="link">
                    {item.taskNo}
                  </Link>{" "}
                  {item.title}
                </li>
              ))}
            </ul>
          </div>
        )}
      </section>
    </div>
  );
}

function DependencyList({ items, taskId, canChange }: { items: PanelData["blockedBy"]; taskId: number; canChange: boolean }) {
  const { call } = useWorkCall();
  const paneLink = usePaneLink();
  return (
    <ul className="space-y-1 text-label">
      {items.map((item) => (
        <li key={item.id} className="flex items-center gap-2">
          {OPEN.includes(item.status) ? <Lock aria-label="Not done yet" className="h-3.5 w-3.5 text-warning-600" /> : <span aria-label="Done">✓</span>}
          <Link href={paneLink(item.id)} className="link font-mono text-caption">
            {item.taskNo}
          </Link>
          <span className={`min-w-0 flex-1 truncate ${OPEN.includes(item.status) ? "" : "text-ink-muted line-through"}`}>{item.title}</span>
          {canChange && (
            <button
              type="button"
              aria-label={`Stop waiting for ${item.taskNo}`}
              onClick={() => {
                const form = new FormData();
                form.set("taskId", String(taskId));
                form.set("blocker", item.taskNo);
                form.set("on", "0");
                void call(() => dependencyAction(null, form));
              }}
              className="rounded p-1 text-ink-faint hover:text-danger-600"
            >
              <X aria-hidden="true" className="h-3.5 w-3.5" />
            </button>
          )}
        </li>
      ))}
    </ul>
  );
}

function DependencyForm({ taskId }: { taskId: number }) {
  const { result, pending, onSubmit, formRef } = useActionForm(dependencyAction, { resetOnSuccess: true });
  return (
    <form ref={formRef} onSubmit={onSubmit} className="flex flex-wrap items-end gap-2" aria-label="Add a task it waits for">
      <input type="hidden" name="taskId" value={taskId} />
      <div>
        <label htmlFor="blocker" className="field-label">
          Waits for task number
        </label>
        <input id="blocker" name="blocker" required placeholder="TSK-2026-000123" className="field-input h-9 w-56" />
      </div>
      <SubmitButton pending={pending} variant="secondary" className="btn-compact">
        Add
      </SubmitButton>
      <div className="w-full">
        <FieldError result={result} name="blocker" />
        {result?.ok && <ResultMessage result={result} />}
      </div>
    </form>
  );
}

// The side card: milestone, start date, tags, followers, delete.
export function TaskWorkSide({ data }: { data: PanelData }) {
  const { call } = useWorkCall();
  const [tag, setTag] = useState("");
  const [follower, setFollower] = useState<number | "">("");
  const following = data.followers.some((person) => person.id === data.meId);
  const [confirming, setConfirming] = useState(false);
  if (data.deleted) return null;
  return (
    <section className="card space-y-4 px-5 py-4" aria-label="Planning and people">
      {(data.recurrenceOn || data.recurrence) && <RepeatEditor taskId={data.taskId} current={data.recurrence} canChange={data.canProgress && data.open} />}
      {data.adhoc && !data.canDetails && <p className="rounded-md bg-surface-muted px-3 py-2 text-caption text-ink-muted">Ad hoc task: only its creator changes the details. You can start it, complete it and comment.</p>}
      {data.canDetails && (
        <label className="flex items-center gap-2 text-label">
          <input type="checkbox" checked={data.isMilestone} onChange={(event) => void call(() => taskFieldsAction(data.taskId, { milestone: event.target.checked }))} />
          <Diamond aria-hidden="true" className="h-3.5 w-3.5 text-primary-600" /> Milestone (a point to reach, no start date)
        </label>
      )}
      {!data.isMilestone && data.canProgress && data.open && (
        <div>
          <label htmlFor="start-on" className="field-label">
            Start date <span className="font-normal text-ink-faint">(shows the task as a range on the Timeline)</span>
          </label>
          <input id="start-on" type="date" defaultValue={data.startsOn} onBlur={(event) => {
              const picked = event.target.value;
              if (picked !== data.startsOn) void call((choice) => taskFieldsAction(data.taskId, { startDay: choice?.moveTo ?? picked, holidayOk: choice?.holidayOk }));
            }} className="field-input h-9" />
        </div>
      )}
      <div>
        <h3 className="field-label">Tags</h3>
        <ul className="flex flex-wrap gap-1.5">
          {data.tags.length === 0 && <li className="text-caption text-ink-muted">None</li>}
          {data.tags.map((item) => (
            <li key={item.id} className="inline-flex items-center gap-1 rounded-full bg-surface-muted px-2 py-0.5 text-caption">
              #{item.name}
              {data.canProgress && (
                <button type="button" aria-label={`Remove tag ${item.name}`} onClick={() => void call(() => tagAction(data.taskId, item.name, false), { success: false })} className="text-ink-faint hover:text-danger-600">
                  <X aria-hidden="true" className="h-3 w-3" />
                </button>
              )}
            </li>
          ))}
        </ul>
        {data.canProgress && (
          <form
            className="mt-2 flex gap-2"
            onSubmit={(event) => {
              event.preventDefault();
              if (tag.trim()) void call(() => tagAction(data.taskId, tag, true), { success: false }).then((result) => result?.ok && setTag(""));
            }}
          >
            <label htmlFor="new-tag" className="sr-only">
              Add a tag
            </label>
            <input id="new-tag" value={tag} onChange={(event) => setTag(event.target.value)} placeholder="Add a tag…" maxLength={60} className="field-input h-8 text-label" />
            <button type="submit" className="btn-secondary btn-compact">
              Add
            </button>
          </form>
        )}
      </div>
      <div>
        <h3 className="field-label">Followers ({data.followers.length})</h3>
        <p className="mb-1 text-caption text-ink-muted">They see this task and hear about comments and changes.</p>
        <ul className="flex flex-wrap gap-1.5" data-testid="followers">
          {data.followers.map((person) => (
            <li key={person.id} className="inline-flex items-center gap-1 rounded-full bg-surface-muted px-2 py-0.5 text-caption">
              {person.name}
              {(data.canComment || person.id === data.meId) && (
                <button type="button" aria-label={`Remove follower ${person.name}`} onClick={() => void call(() => followAction(data.taskId, person.id, false))} className="text-ink-faint hover:text-danger-600">
                  <X aria-hidden="true" className="h-3 w-3" />
                </button>
              )}
            </li>
          ))}
        </ul>
        <div className="mt-2 flex flex-wrap gap-2">
          <button type="button" className="btn-secondary btn-compact" onClick={() => void call(() => followAction(data.taskId, data.meId, !following))}>
            {following ? "Stop following" : "Follow"}
          </button>
          {data.canComment && (
            <>
              <label htmlFor="add-follower" className="sr-only">
                Add a follower
              </label>
              <select id="add-follower" value={follower} onChange={(event) => setFollower(event.target.value ? Number(event.target.value) : "")} className="field-input h-8 w-44 py-0 text-label">
                <option value="">Add a follower…</option>
                {data.people
                  .filter((person) => !data.followers.some((item) => item.id === person.id))
                  .map((person) => (
                    <option key={person.id} value={person.id}>
                      {person.label}
                    </option>
                  ))}
              </select>
              <button type="button" disabled={follower === ""} className="btn-secondary btn-compact" onClick={() => follower !== "" && void call(() => followAction(data.taskId, follower, true)).then(() => setFollower(""))}>
                Add
              </button>
            </>
          )}
        </div>
      </div>
      {data.canEdit && (
        <div className="border-t border-line pt-3">
          {confirming ? (
            <span className="flex flex-wrap items-center gap-2 text-label">
              Delete this task{data.subtasks.length ? " and its subtasks" : ""}? It can be restored for 30 days.
              <button type="button" className="btn-danger btn-compact" onClick={() => void call(() => deleteTaskAction(data.taskId))}>
                Yes, delete
              </button>
              <button type="button" className="btn-secondary btn-compact" onClick={() => setConfirming(false)}>
                Cancel
              </button>
            </span>
          ) : (
            <button type="button" className="btn-danger-quiet btn-compact" onClick={() => setConfirming(true)}>
              Delete task
            </button>
          )}
        </div>
      )}
    </section>
  );
}
