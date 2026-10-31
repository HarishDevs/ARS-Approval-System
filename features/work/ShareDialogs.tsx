"use client";

import { Link2, Lock, Share2, Users, X } from "lucide-react";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { followAction, memberAction, privacyAction } from "@/app/users/work/actions";
import { initials } from "@/features/ui/Display";
import { useToast } from "@/features/ui/Toast";
import { useWorkCall } from "@/features/work/client";
import { PRIVACY, PRIVACY_LABEL, PROJECT_ROLE_LABEL, PROJECT_ROLES, type ProjectRole } from "@/server/work/access";
import { COPY_BLOCKED, copyText } from "@/features/ui/clipboard";

// D-220 (owner's screenshot: Asana's Share dialog): share a project or a
// task from its own screen. Project: invite people or a department with a
// role, who can see it (access settings), who has access with their roles,
// copy the link. Task: add collaborators (followers), who can see it, copy
// the link. Every change is checked again on the server.
function useDialog(open: boolean, onClose: () => void) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    if (open && ref.current && !ref.current.open) ref.current.showModal();
    if (!open && ref.current?.open) ref.current.close();
  }, [open]);
  return { ref, props: { onClose, onCancel: onClose } };
}

function copy(path: string, toast: ReturnType<typeof useToast>, what: string) {
  const link = `${window.location.origin}${path}`;
  void copyText(link).then((done) => toast(done ? { tone: "success", title: `${what} link copied.` } : { tone: "error", title: `${COPY_BLOCKED} ${link}` }));
}

const Dot = ({ name }: { name: string }) => (
  <span aria-hidden="true" className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary-50 text-caption font-semibold text-primary-700">
    {initials(name)}
  </span>
);

export function ProjectShareButton(props: {
  projectId: number;
  name: string;
  privacy: string;
  departmentId: number | null;
  departments: { id: number; name: string }[];
  members: { type: "USER" | "DEPARTMENT"; id: number; name: string; role: ProjectRole }[];
  people: { id: number; label: string }[];
  canShare: boolean;
  canManage: boolean;
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className="btn-primary btn-compact inline-flex items-center gap-1" data-testid="share-project">
        <Share2 aria-hidden="true" className="h-4 w-4" /> Share
      </button>
      {open && <ProjectShareDialog {...props} onClose={() => setOpen(false)} />}
    </>
  );
}

function ProjectShareDialog({ projectId, name, privacy, departmentId, departments, members, people, canShare, canManage, onClose }: Parameters<typeof ProjectShareButton>[0] & { onClose: () => void }) {
  const { ref, props } = useDialog(true, onClose);
  const toast = useToast();
  const { call, pending } = useWorkCall();
  const [who, setWho] = useState("");
  const [role, setRole] = useState<ProjectRole>("EDITOR");
  const [access, setAccess] = useState(privacy);
  const [department, setDepartment] = useState<number | "">(departmentId ?? "");
  const roles = PROJECT_ROLES.filter((item) => canManage || item !== "OWNER");
  const send = (member: string, value: string) => {
    const data = new FormData();
    data.set("projectId", String(projectId));
    data.set("member", member);
    data.set("role", value);
    return call(() => memberAction(null, data));
  };
  return (
    <dialog ref={ref} {...props} aria-labelledby="share-project-title" className="w-[calc(100%-2rem)] max-w-xl rounded-xl border border-line bg-raised p-0 text-ink shadow-overlay backdrop:bg-overlay" data-testid="share-dialog">
      <header className="flex items-center gap-2 border-b border-line px-6 py-4">
        <h2 id="share-project-title" className="flex-1 text-card-title font-semibold">
          Share {name}
        </h2>
        <Link href={`/users/work/projects/${projectId}/settings#permissions`} className="text-caption text-ink-muted hover:text-ink">
          Project permissions
        </Link>
        <button type="button" aria-label="Close" onClick={onClose} className="rounded p-1 text-ink-muted hover:bg-surface-muted">
          <X aria-hidden="true" className="h-5 w-5" />
        </button>
      </header>
      {canShare && (
        <section className="space-y-2 border-b border-line px-6 py-4" aria-labelledby="invite-title">
          <h3 id="invite-title" className="font-semibold">
            Invite
          </h3>
          <div className="flex gap-2">
            <div className="flex flex-1 items-center rounded-md border border-line-strong focus-within:border-primary-600">
              <select aria-label="Add people or a department" value={who} onChange={(event) => setWho(event.target.value)} className="h-10 min-w-0 flex-1 bg-transparent px-3 text-body focus:outline-none">
                <option value="">Add people or a department…</option>
                <optgroup label="People">
                  {people
                    .filter((person) => !members.some((member) => member.type === "USER" && member.id === person.id))
                    .map((person) => (
                      <option key={person.id} value={`USER:${person.id}`}>
                        {person.label}
                      </option>
                    ))}
                </optgroup>
                <optgroup label="Departments">
                  {departments
                    .filter((item) => !members.some((member) => member.type === "DEPARTMENT" && member.id === item.id))
                    .map((item) => (
                      <option key={item.id} value={`DEPARTMENT:${item.id}`}>
                        {item.name}
                      </option>
                    ))}
                </optgroup>
              </select>
              <select aria-label="Role" value={role} onChange={(event) => setRole(event.target.value as ProjectRole)} className="h-10 bg-transparent px-2 text-label font-medium focus:outline-none">
                {roles.map((item) => (
                  <option key={item} value={item}>
                    {PROJECT_ROLE_LABEL[item]}
                  </option>
                ))}
              </select>
            </div>
            <button type="button" disabled={!who || pending} onClick={() => void send(who, role).then((result) => result?.ok && setWho(""))} className="btn-primary btn-compact h-10">
              Invite
            </button>
          </div>
          <p className="text-caption text-ink-muted">People you add are told in the app and by email.</p>
        </section>
      )}
      <section className="space-y-3 px-6 py-4" aria-labelledby="access-title">
        <h3 id="access-title" className="font-semibold">
          Access settings
        </h3>
        <div className="flex flex-wrap gap-2">
          <select
            aria-label="Who can see this project"
            value={access}
            disabled={!canManage}
            onChange={(event) => {
              const next = event.target.value;
              setAccess(next);
              if (next !== "DEPARTMENT") void call(() => privacyAction(projectId, next, null));
              else if (department !== "") void call(() => privacyAction(projectId, next, Number(department)));
            }}
            className="field-input h-10 flex-1"
          >
            {PRIVACY.map((item) => (
              <option key={item} value={item}>
                {item === "PRIVATE" ? "🔒 " : ""}
                {PRIVACY_LABEL[item]}
              </option>
            ))}
          </select>
          {access === "DEPARTMENT" && (
            <select
              aria-label="Department"
              value={department}
              disabled={!canManage}
              onChange={(event) => {
                const next = event.target.value ? Number(event.target.value) : "";
                setDepartment(next);
                if (next !== "") void call(() => privacyAction(projectId, "DEPARTMENT", next));
              }}
              className="field-input h-10 w-56"
            >
              <option value="">Choose a department…</option>
              {departments.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name}
                </option>
              ))}
            </select>
          )}
        </div>
        {!canManage && <p className="text-caption text-ink-muted">Only the project&apos;s owners change who can see it.</p>}
        <div className="flex items-center justify-between pt-2">
          <h3 className="font-semibold">Who has access</h3>
          <Link href="/users/notifications/settings" className="link text-label">
            Manage notifications
          </Link>
        </div>
        <ul className="max-h-72 space-y-1 overflow-y-auto" aria-label="Who has access">
          {members.map((member) => (
            <li key={`${member.type}:${member.id}`} className="flex items-center gap-3 py-1.5">
              {member.type === "USER" ? <Dot name={member.name} /> : <Users aria-hidden="true" className="h-8 w-8 rounded-full bg-surface-muted p-1.5 text-ink-muted" />}
              <span className="min-w-0 flex-1">
                <span className="block truncate">{member.name}</span>
                {member.type === "DEPARTMENT" && <span className="text-caption text-ink-muted">Everyone in this department</span>}
              </span>
              {canShare && (canManage || member.role !== "OWNER") ? (
                <select aria-label={`Role of ${member.name}`} value={member.role} onChange={(event) => void send(`${member.type}:${member.id}`, event.target.value)} className="bg-transparent text-label font-medium focus:outline-none">
                  {roles
                    .filter((item) => member.type === "USER" || item !== "OWNER")
                    .map((item) => (
                      <option key={item} value={item}>
                        {item === "OWNER" ? "Project admin" : PROJECT_ROLE_LABEL[item]}
                      </option>
                    ))}
                  <option value="REMOVE">Remove</option>
                </select>
              ) : (
                <span className="text-label text-ink-muted">{member.role === "OWNER" ? "Project admin" : PROJECT_ROLE_LABEL[member.role]}</span>
              )}
            </li>
          ))}
        </ul>
      </section>
      <footer className="flex justify-end border-t border-line px-6 py-3">
        <button type="button" className="btn-secondary btn-compact inline-flex items-center gap-1" onClick={() => copy(`/users/work/projects/${projectId}`, toast, "Project")}>
          <Link2 aria-hidden="true" className="h-4 w-4" /> Copy project link
        </button>
      </footer>
    </dialog>
  );
}

export function TaskShareButton(props: { taskId: number; title: string; followers: { id: number; name: string }[]; people: { id: number; label: string }[]; visibility: string; canAdd: boolean; compact?: boolean }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className={props.compact ? "inline-flex items-center gap-1 rounded px-2 py-1 text-label text-ink-muted hover:bg-surface-muted hover:text-ink" : "btn-secondary btn-compact inline-flex items-center gap-1"} data-testid="share-task">
        <Share2 aria-hidden="true" className="h-4 w-4" /> Share
      </button>
      {open && <TaskShareDialog {...props} onClose={() => setOpen(false)} />}
    </>
  );
}

function TaskShareDialog({ taskId, title, followers, people, visibility, canAdd, onClose }: Parameters<typeof TaskShareButton>[0] & { onClose: () => void }) {
  const { ref, props } = useDialog(true, onClose);
  const toast = useToast();
  const { call, pending } = useWorkCall();
  const [who, setWho] = useState("");
  return (
    <dialog ref={ref} {...props} aria-labelledby="share-task-title" className="w-[calc(100%-2rem)] max-w-lg rounded-xl border border-line bg-raised p-0 text-ink shadow-overlay backdrop:bg-overlay" data-testid="share-dialog">
      <header className="flex items-center gap-2 border-b border-line px-6 py-4">
        <h2 id="share-task-title" className="min-w-0 flex-1 truncate text-card-title font-semibold">
          Share {title}
        </h2>
        <button type="button" aria-label="Close" onClick={onClose} className="rounded p-1 text-ink-muted hover:bg-surface-muted">
          <X aria-hidden="true" className="h-5 w-5" />
        </button>
      </header>
      {canAdd && (
        <section className="space-y-2 border-b border-line px-6 py-4">
          <h3 className="font-semibold">Add collaborators</h3>
          <div className="flex gap-2">
            <select aria-label="Add a collaborator" value={who} onChange={(event) => setWho(event.target.value)} className="field-input h-10 flex-1">
              <option value="">Add people…</option>
              {people
                .filter((person) => !followers.some((item) => item.id === person.id))
                .map((person) => (
                  <option key={person.id} value={person.id}>
                    {person.label}
                  </option>
                ))}
            </select>
            <button type="button" disabled={!who || pending} onClick={() => void call(() => followAction(taskId, Number(who), true)).then((result) => result?.ok && setWho(""))} className="btn-primary btn-compact h-10">
              Add
            </button>
          </div>
          <p className="text-caption text-ink-muted">Collaborators can see the task and hear about comments and changes.</p>
        </section>
      )}
      <section className="space-y-2 px-6 py-4">
        <h3 className="font-semibold">Who can see it</h3>
        <p className="flex items-center gap-2 rounded-md bg-surface-muted px-3 py-2 text-label text-ink-muted">
          <Lock aria-hidden="true" className="h-4 w-4 shrink-0" /> {visibility}
        </p>
        <ul className="max-h-60 space-y-1 overflow-y-auto" aria-label="Collaborators">
          {followers.map((person) => (
            <li key={person.id} className="flex items-center gap-3 py-1">
              <Dot name={person.name} />
              <span className="flex-1 truncate">{person.name}</span>
              {canAdd && (
                <button type="button" className="text-label text-ink-muted hover:text-danger-600" onClick={() => void call(() => followAction(taskId, person.id, false))}>
                  Remove
                </button>
              )}
            </li>
          ))}
        </ul>
      </section>
      <footer className="flex justify-end border-t border-line px-6 py-3">
        <button type="button" className="btn-secondary btn-compact inline-flex items-center gap-1" onClick={() => copy(`/users/tasks/${taskId}`, toast, "Task")}>
          <Link2 aria-hidden="true" className="h-4 w-4" /> Copy task link
        </button>
      </footer>
    </dialog>
  );
}
