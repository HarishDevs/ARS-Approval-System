import { Email } from "@/features/ui/SafeText";
import type { Metadata } from "next";
import Link from "next/link";
import { PageHeader } from "@/features/shell/PageHeader";
import { DataTable } from "@/features/ui/DataTable";
import { Badge } from "@/features/ui/Display";
import { requireArea } from "@/server/authorization/guards";
import { listUsersForAdmin } from "@/lib/db/repositories/admin-users.repository";
import { listDepartments } from "@/lib/db/repositories/organisation.repository";
import { checkCanEdit } from "@/server/admin/user-rules";
import { UserRowMenu } from "@/features/admin/UserRowMenu";
import { USERS_BULK_FORM, UsersBulkActions } from "@/features/admin/UsersBulkActions";
import { RowSelectBox } from "@/features/ui/BulkSelect";
import { ROLE_LABEL } from "@/features/ui/labels";
import { MODULE_LABEL, MODULES, type ModuleCode } from "@/server/modules/modules";
import { SIGN_IN_LABEL } from "@/types/auth";

// WEB-05 (v1.10.0): a plain, non-confidential browser title.
export const metadata: Metadata = { title: "Users & roles" };

const PAGE_SIZE = 50;

// F-06 user list. Search and filter are plain GET parameters.
export default async function UsersPage({ searchParams }: { searchParams: Promise<{ q?: string; status?: string; page?: string; module?: string; dept?: string }> }) {
  const { user: actor } = await requireArea("admin");
  const params = await searchParams;
  const search = (params.q ?? "").trim().slice(0, 100);
  const status = params.status === "inactive" || params.status === "all" ? params.status : "active";
  const page = Math.max(1, Number(params.page) || 1);
  // D-168: filter by module (anything else is ignored).
  const moduleFilter = (MODULES as readonly string[]).includes(params.module ?? "") ? (params.module as ModuleCode) : undefined;
  // v1.49.3 (owner): by department ("none": people without one).
  const departments = await listDepartments();
  const deptParam = params.dept ?? "";
  const departmentFilter = deptParam === "none" ? null : departments.some((item) => String(item.id) === deptParam) ? Number(deptParam) : undefined;
  const { items, total } = await listUsersForAdmin({ search: search || undefined, status, module: moduleFilter, departmentId: departmentFilter }, { limit: PAGE_SIZE, offset: (page - 1) * PAGE_SIZE });
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const link = (next: number) => `/admin/users?${new URLSearchParams({ ...(search ? { q: search } : {}), status, ...(moduleFilter ? { module: moduleFilter } : {}), ...(departmentFilter !== undefined ? { dept: deptParam } : {}), page: String(next) })}`;

  return (
    <>
      <PageHeader title="Users & roles" description="Only people added here can sign in. People are made inactive, never deleted, so their history stays.">
        <Link href="/admin/import?kind=users" className="btn-secondary btn-compact">
          Import
        </Link>
        <Link href="/admin/users/new" className="btn-primary btn-compact">
          Add user
        </Link>
      </PageHeader>

      <form method="get" className="mb-4 flex flex-wrap items-end gap-3">
        <div className="w-full max-w-sm">
          <label htmlFor="q" className="field-label">
            Search
          </label>
          <input id="q" name="q" defaultValue={search} placeholder="Name, email or User ID" className="field-input" />
        </div>
        <div>
          <label htmlFor="status" className="field-label">
            Status
          </label>
          <select id="status" name="status" defaultValue={status} className="field-input w-40">
            <option value="active">Active</option>
            <option value="inactive">Inactive</option>
            <option value="all">All</option>
          </select>
        </div>
        <div>
          <label htmlFor="module" className="field-label">
            Module
          </label>
          <select id="module" name="module" defaultValue={moduleFilter ?? ""} className="field-input w-40">
            <option value="">Any</option>
            {MODULES.map((module) => (
              <option key={module} value={module}>
                {MODULE_LABEL[module]}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="dept" className="field-label">
            Department
          </label>
          <select id="dept" name="dept" defaultValue={departmentFilter === undefined ? "" : deptParam} className="field-input w-52">
            <option value="">Any</option>
            {departments.map((item) => (
              <option key={item.id} value={item.id}>
                {item.name}
                {item.active ? "" : " (inactive)"}
              </option>
            ))}
            <option value="none">No department</option>
          </select>
        </div>
        <button type="submit" className="btn-secondary btn-compact h-11">
          Apply
        </button>
      </form>

      {/* v1.49.6 (owner): tick users, then one action for all of them. */}
      {items.length > 0 && <UsersBulkActions />}
      <DataTable
        caption="Users"
        storageKey="admin-users"
        empty={{ title: "No users found", body: search ? "Try a different search." : "Add the first user to get started." }}
        initialSort={{ key: "name", direction: "asc" }}
        columns={[
          { key: "name", header: "Name", sortable: true },
          { key: "login", header: "User ID", sortable: true },
          { key: "department", header: "Department", sortable: true, optional: true },
          { key: "signIn", header: "Sign-in", optional: true },
          { key: "roles", header: "Roles", optional: true },
          { key: "modules", header: "Modules", optional: true },
          { key: "status", header: "Status", sortable: true },
          { key: "actions", header: "Actions" },
        ]}
        rows={items.map((user) => {
          const canEdit = user.id !== actor.id && checkCanEdit(actor, { id: user.id, roles: user.roles, active: user.active, isBreakGlass: user.isBreakGlass }).ok;
          return {
          id: user.id,
          sort: { name: user.name, login: user.loginId, department: user.departmentName, status: user.active ? 0 : 1 },
          cells: {
            name: (
              <>
                <span className="flex items-center gap-2">
                  {/* Only people you may change can be ticked (not yourself; another IT Admin only by the Super Admin). */}
                  {canEdit && <RowSelectBox formId={USERS_BULK_FORM} value={user.id} label={`Select ${user.name}`} testId="select-user" />}
                  <Link href={`/admin/users/${user.id}`} className="link">
                    {user.name}
                  </Link>
                </span>
                <span className="block text-caption text-ink-muted">
                  <Email address={user.email} />
                </span>
              </>
            ),
            login: user.loginId,
            department: user.departmentName ?? <span className="text-ink-faint">—</span>,
            signIn: SIGN_IN_LABEL[user.signInMethod],
            roles: user.roles.filter((role) => role !== "USER").map((role) => ROLE_LABEL[role]).join(", ") || "User",
            modules: user.roles.includes("SUPER_ADMIN") ? "All" : user.modules.map((module) => MODULE_LABEL[module]).join(", ") || <span className="text-ink-faint">None</span>,
            status: (
              <span className="inline-flex flex-wrap gap-1">
                <Badge tone={user.active ? "success" : "neutral"}>{user.active ? "Active" : "Inactive"}</Badge>
                {user.locked && <Badge tone="danger">Locked</Badge>}
                {user.isBreakGlass && <Badge tone="warning">Break-glass</Badge>}
              </span>
            ),
            // v1.49.3 (owner): Re-invite, set-password link, Deactivate / Activate in a three-dot menu.
            actions: (
              <UserRowMenu
                id={user.id}
                name={user.name}
                active={user.active}
                signInMethod={user.signInMethod}
                hasPassword={user.hasPassword}
                canEdit={canEdit}
              />
            ),
          },
          };
        })}
      />

      {pages > 1 && (
        <div className="mt-4 flex items-center gap-4 text-label">
          {page > 1 && (
            <Link className="link" href={link(page - 1)}>
              ← Previous
            </Link>
          )}
          <span className="text-ink-muted">
            Page {page} of {pages} · {total} users
          </span>
          {page < pages && (
            <Link className="link" href={link(page + 1)}>
              Next →
            </Link>
          )}
        </div>
      )}
    </>
  );
}
