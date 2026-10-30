"use client";

import { Plus, Users, X } from "lucide-react";
import { useState } from "react";
import { permissionsAction } from "@/app/users/work/actions";
import { useWorkCall } from "@/features/work/client";
import { PERMISSION_ROLE_LABEL, PERMISSION_ROLES, RESTRICTABLE, RESTRICTABLE_LABEL, type PermissionRole, type ProjectPermissions } from "@/server/work/access";

// D-222 (owner's screenshot: Asana's Project permissions): Fields: choose a
// field and who may update its values in this project; Sharing tasks with
// other projects: who may add this project's tasks to other projects.
export function PermissionsPanel({ projectId, projectName, initial, fields, canManage }: { projectId: number; projectName: string; initial: ProjectPermissions; fields: { id: number; name: string }[]; canManage: boolean }) {
  const { call, pending } = useWorkCall();
  const [rules, setRules] = useState(initial.fields);
  const [share, setShare] = useState<PermissionRole>(initial.shareTasks);
  const options: [string, string][] = [...RESTRICTABLE.map((key) => [key, RESTRICTABLE_LABEL[key]] as [string, string]), ...fields.map((field) => [`field:${field.id}`, field.name] as [string, string])];
  const name = (key: string) => options.find(([value]) => value === key)?.[1] ?? key;
  const free = options.filter(([value]) => !rules.some((rule) => rule.field === value));
  const dirty = JSON.stringify({ rules, share }) !== JSON.stringify({ rules: initial.fields, share: initial.shareTasks });
  return (
    <div className="space-y-6" data-testid="permissions">
      <section aria-labelledby="perm-fields" className="space-y-2">
        <h3 id="perm-fields" className="font-semibold">
          Fields
        </h3>
        <p className="text-label text-ink-muted">
          Select a field and set who can update its values in the <strong className="text-ink">{projectName}</strong> project. Everyone else can still see them.
        </p>
        <ul className="space-y-2" aria-label="Field restrictions">
          {rules.map((rule, index) => (
            <li key={rule.field} className="flex flex-wrap items-center gap-2">
              <span className="min-w-36 rounded-md border border-line bg-surface-muted px-3 py-1.5 text-label">{name(rule.field)}</span>
              <span className="text-label text-ink-muted">can be updated by</span>
              <select
                aria-label={`Who can update ${name(rule.field)}`}
                value={rule.role}
                disabled={!canManage}
                onChange={(event) => setRules((value) => value.map((item, at) => (at === index ? { ...item, role: event.target.value as "OWNER" | "EDITOR" } : item)))}
                className="field-input h-9 w-auto"
              >
                <option value="OWNER">{PERMISSION_ROLE_LABEL.OWNER}</option>
                <option value="EDITOR">{PERMISSION_ROLE_LABEL.EDITOR}</option>
              </select>
              {canManage && (
                <button type="button" aria-label={`Remove the restriction on ${name(rule.field)}`} onClick={() => setRules((value) => value.filter((_, at) => at !== index))} className="rounded p-1.5 text-ink-muted hover:bg-surface-muted">
                  <X aria-hidden="true" className="h-4 w-4" />
                </button>
              )}
            </li>
          ))}
        </ul>
        {canManage && free.length > 0 && (
          <label className="inline-flex items-center gap-2">
            <Plus aria-hidden="true" className="h-4 w-4 text-ink-muted" />
            <span className="sr-only">Add restriction</span>
            <select aria-label="Add restriction" value="" onChange={(event) => event.target.value && setRules((value) => [...value, { field: event.target.value, role: "OWNER" }])} className="field-input h-9 w-auto">
              <option value="">Add restriction…</option>
              {free.map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </label>
        )}
      </section>
      <section aria-labelledby="perm-share" className="space-y-2">
        <h3 id="perm-share" className="font-semibold">
          Sharing tasks with other projects
        </h3>
        <label htmlFor="perm-share-select" className="block text-label text-ink-muted">
          Who can share tasks from this project with other projects?
        </label>
        <span className="flex items-center gap-2">
          <Users aria-hidden="true" className="h-4 w-4 text-ink-muted" />
          <select id="perm-share-select" value={share} disabled={!canManage} onChange={(event) => setShare(event.target.value as PermissionRole)} className="field-input h-10 w-72">
            {PERMISSION_ROLES.map((role) => (
              <option key={role} value={role}>
                {PERMISSION_ROLE_LABEL[role]}
              </option>
            ))}
          </select>
        </span>
      </section>
      {canManage ? (
        <button type="button" disabled={!dirty || pending} onClick={() => void call(() => permissionsAction(projectId, { fields: rules, shareTasks: share }))} className="btn-primary btn-compact">
          Save permissions
        </button>
      ) : (
        <p className="text-caption text-ink-muted">Only the project&apos;s admins (owners) change its permissions.</p>
      )}
    </div>
  );
}
