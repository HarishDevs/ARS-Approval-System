import Link from "next/link";
import { EmptyState, PageHeader } from "@/features/shell/PageHeader";
import { requireArea } from "@/server/authorization/guards";
import { listUsersForAdmin } from "@/lib/db/repositories/admin-users.repository";
import { Email } from "@/features/ui/SafeText";

const PAGE_SIZE = 50;
const ROLE_LABEL = { USER: "User", IT_ADMIN: "IT Admin", SUPER_ADMIN: "Super Admin" } as const;

// F-06 user list. Search and filter are plain GET parameters.
export default async function UsersPage({ searchParams }: { searchParams: Promise<{ q?: string; status?: string; page?: string }> }) {
  await requireArea("admin");
  const params = await searchParams;
  const search = (params.q ?? "").trim().slice(0, 100);
  const status = params.status === "inactive" || params.status === "all" ? params.status : "active";
  const page = Math.max(1, Number(params.page) || 1);
  const { items, total } = await listUsersForAdmin({ search: search || undefined, status }, { limit: PAGE_SIZE, offset: (page - 1) * PAGE_SIZE });
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const link = (next: number) => `/admin/users?${new URLSearchParams({ ...(search ? { q: search } : {}), status, page: String(next) })}`;

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
        <button type="submit" className="btn-secondary btn-compact h-11">
          Apply
        </button>
      </form>

      {items.length === 0 ? (
        <EmptyState title="No users found" body={search ? "Try a different search." : "Add the first user to get started."} />
      ) : (
        <div className="card overflow-x-auto">
          <table className="data-table">
            <thead>
              <tr>
                <th>Name</th>
                <th>User ID</th>
                <th>Department</th>
                <th>Sign-in</th>
                <th>Roles</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {items.map((user) => (
                <tr key={user.id}>
                  <td>
                    <Link href={`/admin/users/${user.id}`} className="link">
                      {user.name}
                    </Link>
                    <p className="text-caption text-ink-muted"><Email address={user.email} /></p>
                  </td>
                  <td>{user.loginId}</td>
                  <td>{user.departmentName ?? <span className="text-ink-faint">—</span>}</td>
                  <td>{user.signInMethod === "GOOGLE" ? "Google" : "Password + WhatsApp"}</td>
                  <td>{user.roles.filter((role) => role !== "USER").map((role) => ROLE_LABEL[role]).join(", ") || "User"}</td>
                  <td className="space-x-1 whitespace-nowrap">
                    <span className={`badge ${user.active ? "bg-success-50 text-success-600" : "bg-surface-muted text-ink-muted"}`}>{user.active ? "Active" : "Inactive"}</span>
                    {user.locked && <span className="badge bg-danger-50 text-danger-600">Locked</span>}
                    {user.isBreakGlass && <span className="badge bg-warning-50 text-warning-600">Break-glass</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

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
