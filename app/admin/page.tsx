import Link from "next/link";
import type { RowDataPacket } from "mysql2/promise";
import { PageHeader } from "@/features/shell/PageHeader";
import { requireArea } from "@/server/authorization/guards";
import { getDbPool } from "@/lib/db/client";

// Admin space overview (S9-13): every module is live, so each card links to
// it with a live count. Equal heights; 3 columns on wide screens.
async function counts(): Promise<Record<string, number>> {
  const [rows] = await getDbPool().query<(RowDataPacket & Record<string, number>)[]>(
    `SELECT
       (SELECT COUNT(*) FROM workflow_definitions d JOIN workflow_versions v ON v.workflow_id = d.id AND v.status = 'PUBLISHED'
         WHERE d.kind = 'PREDEFINED' AND d.active = TRUE) AS live_types,
       (SELECT COUNT(DISTINCT d.id) FROM workflow_definitions d JOIN workflow_versions v ON v.workflow_id = d.id AND v.status = 'DRAFT'
         WHERE d.kind = 'PREDEFINED') AS drafts,
       (SELECT COUNT(*) FROM users WHERE active = TRUE AND is_break_glass = FALSE) AS users,
       (SELECT COUNT(*) FROM approver_groups WHERE active = TRUE) AS groups_n,
       (SELECT COUNT(*) FROM departments WHERE active = TRUE) AS departments,
       (SELECT COUNT(*) FROM holidays WHERE holiday_on >= CURRENT_DATE) AS holidays,
       (SELECT COUNT(*) FROM approval_requests WHERE status IN ('IN_PROGRESS','ON_HOLD','CHANGES_REQUIRED')) AS open_requests`,
  );
  return rows[0] ?? {};
}

const n = (value: unknown) => Number(value ?? 0).toLocaleString("en-IN");

export default async function AdminHome() {
  // Pages re-check the space themselves: a layout check alone does not stop
  // a page from rendering in the App Router.
  await requireArea("admin");
  const c = await counts();
  const modules = [
    { title: "Approval types & workflows", href: "/admin/workflows", stat: `${n(c.live_types)} live`, extra: Number(c.drafts) ? `${n(c.drafts)} with a draft` : null, body: "Forms and levels for each predefined approval: sequential, parallel, any-one, any-N and choices, tested before publishing." },
    { title: "Approval authority (DoA)", href: "/admin/doa", stat: "Matrix view", extra: null, body: "Which levels each amount needs, read straight from every live approval type's DoA matrix." },
    { title: "Users & roles", href: "/admin/users", stat: `${n(c.users)} active`, extra: null, body: "Add or deactivate people, set how they sign in, their manager and department, and their roles." },
    { title: "Approver groups", href: "/admin/groups", stat: `${n(c.groups_n)} groups`, extra: null, body: "Desks such as MD office or Finance checkers, so approvers can change without editing workflows." },
    { title: "Departments", href: "/admin/organisation", stat: `${n(c.departments)} departments`, extra: null, body: "Departments with their HOD, and designations." },
    { title: "Working calendar", href: "/admin/calendar", stat: `${n(c.holidays)} upcoming holidays`, extra: null, body: "Working days and holidays used for response times, reminders and escalation." },
    { title: "Insights", href: "/admin/insights", stat: `${n(c.open_requests)} open requests`, extra: null, body: "Where requests wait, how long each level takes, and what is overdue." },
  ];
  return (
    <>
      <PageHeader title="Admin" description="Where the IT team builds and maintains the approval types, people and rules." />
      <div className="grid auto-rows-fr gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {modules.map((module) => (
          <Link key={module.href} href={module.href} className="card-link flex flex-col p-5">
            <div className="flex items-start justify-between gap-3">
              <h2 className="font-semibold">{module.title}</h2>
              <span aria-hidden="true" className="text-ink-faint">→</span>
            </div>
            <p className="mt-2 flex-1 text-label text-ink-muted">{module.body}</p>
            <p className="mt-4 flex flex-wrap items-center gap-2 text-caption">
              <span className="rounded-full bg-primary-50 px-2.5 py-0.5 font-semibold text-primary-700">{module.stat}</span>
              {module.extra && <span className="rounded-full bg-surface-muted px-2.5 py-0.5 text-ink-muted">{module.extra}</span>}
            </p>
          </Link>
        ))}
      </div>
    </>
  );
}
