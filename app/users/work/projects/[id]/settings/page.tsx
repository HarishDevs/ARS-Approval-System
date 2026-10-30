import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { PageHeader } from "@/features/shell/PageHeader";
import { Breadcrumbs } from "@/features/ui/Display";
import { MembersPanel, ProjectCommandButton, ProjectForm } from "@/features/work/ProjectForms";
import { FieldsManager, FromTemplateForm, SaveTemplateForm } from "@/features/work/MoreParts";
import { listProjectEvents, listProjectFields, projectFor } from "@/lib/db/repositories/work.repository";
import { listDepartments } from "@/lib/db/repositories/organisation.repository";
import { indiaDateTimeText } from "@/server/modules/settings";
import { projectAbilities } from "@/server/work/access";
import { peopleOptions, workPage } from "@/server/work/page-context";

export const metadata: Metadata = { title: "Project settings" };
export const dynamic = "force-dynamic";

const EVENT_WORD: Record<string, string> = {
  CREATED: "Created the project",
  DETAILS: "Changed the details",
  PRIVACY: "Changed who can see it",
  MEMBER_ADDED: "Added a member",
  MEMBER_ROLE: "Changed a member's role",
  MEMBER_REMOVED: "Removed a member",
  JOINED: "Joined",
  LEFT: "Left",
  SECTION_ADDED: "Added a section",
  SECTION_DELETED: "Deleted a section",
  STATUS: "Posted a status update",
  ARCHIVE: "Archived it",
  UNARCHIVE: "Brought it back from the archive",
  DELETE: "Deleted it",
  RESTORE: "Restored it",
  FIELD_ADDED: "Added a field",
  FIELD_REMOVED: "Removed a field",
  TEMPLATE_SAVED: "Made this template",
  FROM_TEMPLATE: "Made it from a template",
  COPIED: "Made it as a copy",
};

// D-215: members and roles, details and privacy, archive and delete, history.
export default async function ProjectSettingsPage({ params }: { params: Promise<{ id: string }> }) {
  const { user, viewer } = await workPage();
  const { id } = await params;
  if (!/^\d{1,10}$/.test(id)) notFound();
  const found = await projectFor(Number(id), viewer);
  if (!found) notFound();
  const { project, members, role } = found;
  const can = projectAbilities(role);
  const [people, departments, events, fields] = await Promise.all([can.share ? peopleOptions() : Promise.resolve([]), listDepartments(), listProjectEvents(project.id), listProjectFields(project.id)]);
  const activeDepartments = departments.filter((department) => department.active).map((department) => ({ id: department.id, name: department.name }));
  const isMember = members.some((member) => member.type === "USER" && member.id === user.id);
  return (
    <>
      <Breadcrumbs items={[{ href: "/users/work/projects", label: "Projects" }, { href: `/users/work/projects/${project.id}`, label: project.name }, { label: "Members & settings" }]} />
      <PageHeader title={`${project.name}: members & settings`} />
      <div className="grid gap-6 lg:grid-cols-2">
        <section className="card px-5 py-4" aria-labelledby="members">
          <h2 id="members" className="mb-3 font-semibold">
            Members
          </h2>
          <MembersPanel projectId={project.id} members={members} people={people} departments={activeDepartments} canShare={can.share} canManage={can.manage} />
        </section>
        <div className="space-y-6">
          {can.manage && (
            <section className="card px-5 py-4" aria-labelledby="details">
              <h2 id="details" className="mb-3 font-semibold">
                Details and privacy
              </h2>
              <ProjectForm
                values={{
                  id: project.id,
                  name: project.name,
                  description: project.description ?? "",
                  color: project.color,
                  privacy: project.privacy,
                  departmentId: project.departmentId,
                  defaultAccessRole: project.defaultAccessRole,
                  defaultView: project.defaultView,
                  startOn: project.startOn ?? "",
                  dueOn: project.dueOn ?? "",
                }}
                departments={activeDepartments}
                myDepartmentId={viewer.departmentId}
              />
            </section>
          )}
          {can.edit && (
            <section className="card px-5 py-4" aria-labelledby="fields">
              <h2 id="fields" className="mb-1 font-semibold">
                Fields
              </h2>
              <p className="mb-3 text-caption text-ink-muted">Your own columns for the tasks of this project (text, number, choice or date), shown in the List and on each task.</p>
              <FieldsManager projectId={project.id} fields={fields.map((field) => ({ id: field.id, name: field.name, kind: field.kind, options: field.options }))} />
            </section>
          )}
          {can.edit && (
            <section className="card space-y-4 px-5 py-4" aria-labelledby="reuse">
              <h2 id="reuse" className="font-semibold">
                Reuse this project
              </h2>
              <SaveTemplateForm projectId={project.id} name={project.name} />
              <div className="border-t border-line pt-4">
                <h3 className="mb-2 text-label font-semibold">Copy it as a new project</h3>
                <FromTemplateForm copyFrom={project.id} departments={activeDepartments} defaultName={`${project.name} (copy)`} />
              </div>
            </section>
          )}
          <section className="card space-y-3 px-5 py-4" aria-labelledby="lifecycle">
            <h2 id="lifecycle" className="font-semibold">
              Project
            </h2>
            <div className="flex flex-wrap gap-2">
              {isMember && <ProjectCommandButton projectId={project.id} command="LEAVE" label="Leave project" />}
              {can.manage && (project.archivedAt ? <ProjectCommandButton projectId={project.id} command="UNARCHIVE" label="Unarchive" /> : <ProjectCommandButton projectId={project.id} command="ARCHIVE" label="Archive" />)}
              {can.manage && <ProjectCommandButton projectId={project.id} command="DELETE" label="Delete project" danger confirmText="Its tasks stay; they just leave this project. You can restore it for 30 days." />}
            </div>
            {!can.manage && <p className="text-caption text-ink-muted">Only owners can change the details, archive or delete the project.</p>}
          </section>
          <section className="card px-5 py-4" aria-labelledby="history">
            <h2 id="history" className="mb-2 font-semibold">
              History
            </h2>
            <ol className="space-y-1 text-label">
              {events.map((event) => (
                <li key={event.id}>
                  <span className="text-ink-muted">{indiaDateTimeText(event.createdAt)}</span> · {event.actorName ?? "System"}: {EVENT_WORD[event.type] ?? event.type}
                </li>
              ))}
            </ol>
          </section>
        </div>
      </div>
    </>
  );
}
