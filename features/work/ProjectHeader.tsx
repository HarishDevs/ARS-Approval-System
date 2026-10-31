"use client";

import { ChevronDown, Copy, Settings2 } from "lucide-react";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { SaveTemplateForm } from "@/features/work/MoreParts";
import { Menu, type MenuItem } from "@/features/ui/Menu";
import { initials } from "@/features/ui/Display";
import { useToast } from "@/features/ui/Toast";
import { COLOR_HEX } from "@/features/work/client";
import { StarButton } from "@/features/work/ProjectForms";
import { ProjectShareButton } from "@/features/work/ShareDialogs";
import type { ProjectRole } from "@/server/work/access";
import { STATUS_KIND_LABEL, STATUS_KINDS, type ProjectStatusKind } from "@/server/work/access";
import { COPY_BLOCKED, copyText } from "@/features/ui/clipboard";

// D-219 (screen catalog S-06): the project header: icon, name, the actions
// menu, star, the "Set status" pill, then member avatars, Share and Customize.
const STATUS_DOT: Record<ProjectStatusKind, string> = {
  ON_TRACK: "bg-success-600",
  AT_RISK: "bg-warning-600",
  OFF_TRACK: "bg-danger-600",
  ON_HOLD: "bg-info-600",
  COMPLETE: "bg-primary-solid",
  DROPPED: "bg-ink-faint",
};

export function ProjectHeader({
  projectId,
  name,
  color,
  meta,
  starred,
  status,
  members,
  canEdit,
  canManage,
  share,
}: {
  projectId: number;
  name: string;
  color: string;
  meta: string;
  starred: boolean;
  status: ProjectStatusKind | null;
  members: { id: number; name: string }[];
  canEdit: boolean;
  canManage: boolean;
  share: { privacy: string; departmentId: number | null; departments: { id: number; name: string }[]; members: { type: "USER" | "DEPARTMENT"; id: number; name: string; role: ProjectRole }[]; people: { id: number; label: string }[]; canShare: boolean };
}) {
  const toast = useToast();
  const [saving, setSaving] = useState(false);
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    if (saving && dialog.current && !dialog.current.open) dialog.current.showModal();
  }, [saving]);
  const base = `/users/work/projects/${projectId}`;
  const copyLink = () => {
    const link = `${window.location.origin}${base}`;
    void copyText(link).then((done) => toast(done ? { tone: "success", title: "Project link copied." } : { tone: "error", title: `${COPY_BLOCKED} ${link}` }));
  };
  const actions: MenuItem[] = [
    { label: "Edit project settings", href: `${base}/settings#details` },
    { label: "Manage members", href: `${base}/settings#members` },
    { label: "Copy project link", onSelect: copyLink },
    ...(canEdit ? [{ label: "Duplicate", href: `${base}/settings#reuse` }, { label: "Save as template", onSelect: () => setSaving(true) }] : []),
    ...(canManage ? [{ label: "Archive or delete", href: `${base}/settings#lifecycle`, tone: "danger" as const }] : []),
  ];
  const statuses: MenuItem[] = STATUS_KINDS.map((kind) => ({ label: STATUS_KIND_LABEL[kind], href: `${base}?view=overview&status=${kind}#post-status` }));
  return (
    <header className="mb-4 flex flex-wrap items-center gap-3" data-testid="project-header">
      <span aria-hidden="true" className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-caption font-bold text-white" style={{ backgroundColor: COLOR_HEX[color] ?? COLOR_HEX.gray }}>
        {initials(name)}
      </span>
      <div className="min-w-0">
        <div className="flex items-center gap-1">
          <h1 className="truncate text-title font-semibold tracking-tight">{name}</h1>
          <Menu label={`Actions for ${name}`} trigger={<ChevronDown aria-hidden="true" className="h-4 w-4" />} items={actions} align="left" />
          <StarButton projectId={projectId} starred={starred} name={name} />
          {canEdit ? (
            <Menu
              label={status ? `Set a status. Current status: ${STATUS_KIND_LABEL[status]}` : "Set a status. Current status: No recent updates"}
              trigger={
                <span className="inline-flex items-center gap-1.5 rounded-full border border-line px-2.5 py-0.5 text-caption">
                  <span aria-hidden="true" className={`h-2 w-2 rounded-full ${status ? STATUS_DOT[status] : "border border-ink-faint"}`} />
                  {status ? STATUS_KIND_LABEL[status] : "Set status"}
                </span>
              }
              items={statuses}
              align="left"
            />
          ) : (
            status && (
              <span className="inline-flex items-center gap-1.5 rounded-full border border-line px-2.5 py-0.5 text-caption">
                <span aria-hidden="true" className={`h-2 w-2 rounded-full ${STATUS_DOT[status]}`} />
                {STATUS_KIND_LABEL[status]}
              </span>
            )
          )}
        </div>
        <p className="text-caption text-ink-muted">{meta}</p>
      </div>
      <div className="ml-auto flex items-center gap-2">
        <span className="flex -space-x-1.5" aria-label={`${members.length} member${members.length === 1 ? "" : "s"}`}>
          {members.slice(0, 5).map((member) => (
            <span key={member.id} title={member.name} className="inline-flex h-7 w-7 items-center justify-center rounded-full border-2 border-surface bg-primary-50 text-[length:calc(10px*var(--text-scale,1))] font-semibold text-primary-700">
              {initials(member.name)}
            </span>
          ))}
          {members.length > 5 && <span className="inline-flex h-7 min-w-7 items-center justify-center rounded-full border-2 border-surface bg-surface-muted px-1 text-caption">+{members.length - 5}</span>}
        </span>
        <ProjectShareButton projectId={projectId} name={name} privacy={share.privacy} departmentId={share.departmentId} departments={share.departments} members={share.members} people={share.people} canShare={share.canShare} canManage={canManage} />
        {canEdit && (
          <Link href={`${base}/settings#fields`} className="btn-secondary btn-compact inline-flex items-center gap-1">
            <Settings2 aria-hidden="true" className="h-4 w-4" /> Customize
          </Link>
        )}
        <button type="button" onClick={copyLink} aria-label="Copy project link" title="Copy project link" className="btn-secondary btn-compact">
          <Copy aria-hidden="true" className="h-4 w-4" />
        </button>
      </div>
      {saving && (
        <dialog ref={dialog} onClose={() => setSaving(false)} aria-labelledby="save-template-title" className="w-[calc(100%-2rem)] max-w-md rounded-xl border border-line bg-raised p-0 text-ink shadow-overlay backdrop:bg-overlay" data-testid="save-template-dialog">
          <div className="space-y-3 p-5">
            <h2 id="save-template-title" className="font-semibold">
              Save {name} as a template
            </h2>
            <p className="text-label text-ink-muted">Its sections, fields and tasks (with their dates relative to the start) become a template the project&apos;s people can start new projects from.</p>
            <SaveTemplateForm projectId={projectId} name={name} />
            <button type="button" className="btn-secondary btn-compact" onClick={() => dialog.current?.close()}>
              Cancel
            </button>
          </div>
        </dialog>
      )}
    </header>
  );
}
