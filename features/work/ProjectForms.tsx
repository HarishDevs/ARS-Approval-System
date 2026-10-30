"use client";

import { Star } from "lucide-react";
import { useState } from "react";
import { createProjectAction, memberAction, projectCommand, removeStatusAction, statusAction, updateProjectAction } from "@/app/users/work/actions";
import { FieldError, ResultMessage, SubmitButton, useActionForm } from "@/features/ui/form";
import { COLOR_HEX, useWorkCall } from "@/features/work/client";
import { PRIVACY, PRIVACY_LABEL, PROJECT_COLORS, PROJECT_ROLE_HELP, PROJECT_ROLE_LABEL, PROJECT_ROLES, STATUS_KIND_LABEL, STATUS_KINDS, type ProjectRole } from "@/server/work/access";

// D-215: creating and editing a project, its members, its status updates,
// and the small project commands (star, join, leave, archive, delete).
export interface ProjectFormValues {
  id?: number;
  name: string;
  description: string;
  color: string;
  privacy: string;
  departmentId: number | null;
  defaultAccessRole: string;
  defaultView: string;
  startOn: string;
  dueOn: string;
}

export function ProjectForm({ values, departments, myDepartmentId }: { values?: ProjectFormValues; departments: { id: number; name: string }[]; myDepartmentId: number | null }) {
  const { result, pending, onSubmit } = useActionForm(values?.id ? updateProjectAction : createProjectAction);
  const [privacy, setPrivacy] = useState(values?.privacy ?? "PRIVATE");
  const [color, setColor] = useState(values?.color ?? "green");
  return (
    <form onSubmit={onSubmit} className="space-y-4" aria-label={values?.id ? "Project details" : "New project"}>
      {values?.id && <input type="hidden" name="projectId" value={values.id} />}
      <div>
        <label htmlFor="project-name" className="field-label">
          Project name
        </label>
        <input id="project-name" name="name" required minLength={2} maxLength={150} defaultValue={values?.name} className="field-input" />
        <FieldError result={result} name="name" />
      </div>
      <div>
        <label htmlFor="project-description" className="field-label">
          What it is for <span className="font-normal text-ink-faint">(optional)</span>
        </label>
        <textarea id="project-description" name="description" rows={3} maxLength={4000} defaultValue={values?.description} className="field-input h-auto py-2" />
      </div>
      <fieldset>
        <legend className="field-label">Who can see it</legend>
        <div className="space-y-1.5">
          {PRIVACY.map((option) => (
            <label key={option} className="flex items-center gap-2 text-body">
              <input type="radio" name="privacy" value={option} checked={privacy === option} onChange={() => setPrivacy(option)} />
              {PRIVACY_LABEL[option]}
              <span className="text-caption text-ink-muted">
                {option === "PRIVATE" ? "only the people and departments you add" : option === "DEPARTMENT" ? "everyone in the department below" : "every active person at ARS"}
              </span>
            </label>
          ))}
        </div>
        {values?.id && values.privacy !== privacy && <p className="mt-1 text-caption text-warning-600">Changing who can see it takes effect for everyone at once.</p>}
      </fieldset>
      <div className="grid gap-4 md:grid-cols-2">
        <div>
          <label htmlFor="project-department" className="field-label">
            Department {privacy !== "DEPARTMENT" && <span className="font-normal text-ink-faint">(optional)</span>}
          </label>
          <select id="project-department" name="department" defaultValue={values?.departmentId ?? myDepartmentId ?? ""} className="field-input">
            <option value="">None</option>
            {departments.map((department) => (
              <option key={department.id} value={department.id}>
                {department.name}
              </option>
            ))}
          </select>
          <FieldError result={result} name="department" />
        </div>
        <div>
          <label htmlFor="project-access" className="field-label">
            Others who can see it may
          </label>
          <select id="project-access" name="default_access_role" defaultValue={values?.defaultAccessRole ?? "COMMENTER"} className="field-input" disabled={privacy === "PRIVATE"}>
            <option value="EDITOR">Edit (add and change tasks)</option>
            <option value="COMMENTER">Comment</option>
            <option value="VIEWER">Only view</option>
          </select>
          {privacy === "PRIVATE" && <input type="hidden" name="default_access_role" value={values?.defaultAccessRole ?? "COMMENTER"} />}
        </div>
        <div>
          <label htmlFor="project-start" className="field-label">
            Starts <span className="font-normal text-ink-faint">(optional)</span>
          </label>
          <input id="project-start" type="date" name="start_on" defaultValue={values?.startOn} className="field-input" />
        </div>
        <div>
          <label htmlFor="project-due" className="field-label">
            Due <span className="font-normal text-ink-faint">(optional)</span>
          </label>
          <input id="project-due" type="date" name="due_on" defaultValue={values?.dueOn} className="field-input" />
          <FieldError result={result} name="due_on" />
        </div>
        <div>
          <label htmlFor="project-view" className="field-label">
            Opens as
          </label>
          <select id="project-view" name="default_view" defaultValue={values?.defaultView ?? "LIST"} className="field-input">
            <option value="LIST">List</option>
            <option value="BOARD">Board</option>
            <option value="CALENDAR">Calendar</option>
            <option value="TIMELINE">Timeline</option>
          </select>
        </div>
        <fieldset>
          <legend className="field-label">Colour</legend>
          <div className="flex flex-wrap gap-2">
            {PROJECT_COLORS.map((option) => (
              <label key={option} className="cursor-pointer">
                <input type="radio" name="color" value={option} checked={color === option} onChange={() => setColor(option)} className="peer sr-only" />
                <span
                  aria-label={option}
                  title={option}
                  className="block h-7 w-7 rounded-md ring-offset-2 peer-checked:ring-2 peer-checked:ring-primary-600 peer-focus-visible:ring-2"
                  style={{ backgroundColor: COLOR_HEX[option] }}
                />
              </label>
            ))}
          </div>
        </fieldset>
      </div>
      <ResultMessage result={result} />
      <SubmitButton pending={pending}>{values?.id ? "Save details" : "Create project"}</SubmitButton>
    </form>
  );
}

export function StarButton({ projectId, starred, name }: { projectId: number; starred: boolean; name: string }) {
  const { call } = useWorkCall();
  return (
    <button
      type="button"
      aria-pressed={starred}
      aria-label={`${starred ? "Unstar" : "Star"} ${name}`}
      title={starred ? "Starred: shown first" : "Star to show it first"}
      onClick={() => void call(() => projectCommand(projectId, "STAR"), { success: false })}
      className={`rounded p-1 ${starred ? "text-warning-600" : "text-ink-faint hover:text-warning-600"}`}
    >
      <Star aria-hidden="true" className="h-4 w-4" fill={starred ? "currentColor" : "none"} />
    </button>
  );
}

export function ProjectCommandButton({ projectId, command, label, danger, confirmText }: { projectId: number; command: "JOIN" | "LEAVE" | "ARCHIVE" | "UNARCHIVE" | "DELETE" | "RESTORE"; label: string; danger?: boolean; confirmText?: string }) {
  const { call, pending } = useWorkCall();
  const [asking, setAsking] = useState(false);
  if (asking)
    return (
      <span className="inline-flex flex-wrap items-center gap-2 rounded-md bg-danger-50 px-2 py-1 text-label" role="group">
        {confirmText}
        <button type="button" className="btn-danger btn-compact" onClick={() => void call(() => projectCommand(projectId, command)).then(() => setAsking(false))}>
          Yes, {label.toLowerCase()}
        </button>
        <button type="button" className="btn-secondary btn-compact" onClick={() => setAsking(false)}>
          Cancel
        </button>
      </span>
    );
  return (
    <button type="button" disabled={pending} className={`${danger ? "btn-danger" : "btn-secondary"} btn-compact`} onClick={() => (confirmText ? setAsking(true) : void call(() => projectCommand(projectId, command)))}>
      {label}
    </button>
  );
}

export function MembersPanel({
  projectId,
  members,
  people,
  departments,
  canShare,
  canManage,
}: {
  projectId: number;
  members: { type: "USER" | "DEPARTMENT"; id: number; name: string; role: ProjectRole }[];
  people: { id: number; label: string }[];
  departments: { id: number; name: string }[];
  canShare: boolean;
  canManage: boolean;
}) {
  const { result, pending, onSubmit, formRef } = useActionForm(memberAction, { resetOnSuccess: true });
  const { call } = useWorkCall();
  const roles = PROJECT_ROLES.filter((role) => canManage || role !== "OWNER");
  return (
    <div className="space-y-4">
      <ul className="divide-y divide-line" aria-label="Members">
        {members.map((member) => (
          <li key={`${member.type}:${member.id}`} className="flex flex-wrap items-center gap-3 py-2">
            <span className="min-w-0 flex-1">
              {member.name}
              {member.type === "DEPARTMENT" && <span className="ml-1 text-caption text-ink-muted">(department)</span>}
            </span>
            {canShare && (canManage || member.role !== "OWNER") ? (
              <>
                <select
                  aria-label={`Role of ${member.name}`}
                  value={member.role}
                  onChange={(event) => {
                    const data = new FormData();
                    data.set("projectId", String(projectId));
                    data.set("member", `${member.type}:${member.id}`);
                    data.set("role", event.target.value);
                    void call(() => memberAction(null, data));
                  }}
                  className="field-input h-8 w-auto py-0 text-label"
                >
                  {roles
                    .filter((role) => member.type === "USER" || role !== "OWNER")
                    .map((role) => (
                      <option key={role} value={role}>
                        {PROJECT_ROLE_LABEL[role]}
                      </option>
                    ))}
                </select>
                <button
                  type="button"
                  className="btn-secondary btn-compact"
                  onClick={() => {
                    const data = new FormData();
                    data.set("projectId", String(projectId));
                    data.set("member", `${member.type}:${member.id}`);
                    data.set("role", "REMOVE");
                    void call(() => memberAction(null, data));
                  }}
                >
                  Remove
                </button>
              </>
            ) : (
              <span className="text-label text-ink-muted">{PROJECT_ROLE_LABEL[member.role]}</span>
            )}
          </li>
        ))}
      </ul>
      {canShare && (
        <form ref={formRef} onSubmit={onSubmit} className="grid gap-3 rounded-md border border-line p-3 md:grid-cols-[1fr_180px_auto]" aria-label="Add a member">
          <input type="hidden" name="projectId" value={projectId} />
          <div>
            <label htmlFor="member-pick" className="field-label">
              Add a person or a whole department
            </label>
            <select id="member-pick" name="member" required defaultValue="" className="field-input">
              <option value="" disabled>
                Choose…
              </option>
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
                  .filter((department) => !members.some((member) => member.type === "DEPARTMENT" && member.id === department.id))
                  .map((department) => (
                    <option key={department.id} value={`DEPARTMENT:${department.id}`}>
                      {department.name}
                    </option>
                  ))}
              </optgroup>
            </select>
            <FieldError result={result} name="member" />
          </div>
          <div>
            <label htmlFor="member-role" className="field-label">
              As
            </label>
            <select id="member-role" name="role" defaultValue="EDITOR" className="field-input">
              {roles.map((role) => (
                <option key={role} value={role} title={PROJECT_ROLE_HELP[role]}>
                  {PROJECT_ROLE_LABEL[role]}
                </option>
              ))}
            </select>
          </div>
          <div className="self-end">
            <SubmitButton pending={pending}>Add</SubmitButton>
          </div>
          <div className="md:col-span-3">
            <ResultMessage result={result} />
          </div>
        </form>
      )}
      <dl className="grid gap-1 text-caption text-ink-muted">
        {PROJECT_ROLES.map((role) => (
          <div key={role}>
            <dt className="inline font-semibold">{PROJECT_ROLE_LABEL[role]}: </dt>
            <dd className="inline">{PROJECT_ROLE_HELP[role]}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

export function StatusForm({ projectId, initial }: { projectId: number; initial?: string }) {
  const { result, pending, onSubmit, formRef } = useActionForm(statusAction, { resetOnSuccess: true });
  return (
    <form ref={formRef} onSubmit={onSubmit} className="space-y-3" aria-label="Post a status update" id="post-status">
      <input type="hidden" name="projectId" value={projectId} />
      <fieldset>
        <legend className="field-label">How is it going?</legend>
        <div className="flex flex-wrap gap-3">
          {STATUS_KINDS.map((kind) => (
            <label key={kind} className="flex items-center gap-1.5 text-label">
              <input type="radio" name="status" value={kind} required defaultChecked={initial === kind} /> {STATUS_KIND_LABEL[kind]}
            </label>
          ))}
        </div>
        <FieldError result={result} name="status" />
      </fieldset>
      <div>
        <label htmlFor="status-title" className="field-label">
          Headline
        </label>
        <input id="status-title" name="title" maxLength={200} className="field-input" placeholder="e.g. Site survey done; vendor quotes pending" />
      </div>
      <div>
        <label htmlFor="status-body" className="field-label">
          Summary <span className="font-normal text-ink-faint">(optional)</span>
        </label>
        <textarea id="status-body" name="body" rows={3} maxLength={4000} className="field-input h-auto py-2" />
      </div>
      <ResultMessage result={result} />
      <SubmitButton pending={pending}>Post status update</SubmitButton>
    </form>
  );
}

export function RemoveStatusButton({ statusId }: { statusId: number }) {
  const { call } = useWorkCall();
  return (
    <button type="button" className="link text-caption" onClick={() => void call(() => removeStatusAction(statusId))}>
      Delete
    </button>
  );
}
