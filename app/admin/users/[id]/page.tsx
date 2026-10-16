import type { Metadata } from "next";
import Link from "next/link";
import { Breadcrumbs } from "@/features/ui/Display";
import { notFound } from "next/navigation";
import { PageHeader } from "@/features/shell/PageHeader";
import { UserForm } from "@/features/admin/UserForm";
import { UserCommands } from "@/features/admin/UserCommands";
import { loadUserFormOptions } from "@/features/admin/user-options";
import { requireArea } from "@/server/authorization/guards";
import { checkCanEdit } from "@/server/admin/user-rules";
import { getUserForAdmin } from "@/lib/db/repositories/admin-users.repository";
import { formatIndiaTime } from "@/server/notifications/security-messages";
import { HandoverForm } from "@/features/admin/HandoverForm";
import { DelegationForm } from "@/features/requests/DelegationForms";
import { DelegationList } from "@/features/requests/DelegationList";
import { countPendingTasks } from "@/server/approvals/service";
import { indiaToday, listDelegationsInvolving } from "@/lib/db/repositories/collab.repository";
import { pendingCountsByApprover } from "@/lib/db/repositories/workload.repository";
import { suggestHandover } from "@/server/workload/summary";

// WEB-05 (v1.10.0): a plain, non-confidential browser title.
export const metadata: Metadata = { title: "User" };

export default async function UserDetailPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ created?: string }> }) {
  const { user: actor } = await requireArea("admin");
  const { id } = await params;
  if (!/^\d+$/.test(id)) notFound();
  const user = await getUserForAdmin(Number(id));
  if (!user) notFound();
  const created = (await searchParams).created === "1";
  const canEdit = checkCanEdit(actor, { id: user.id, roles: user.roles, active: user.active, isBreakGlass: user.isBreakGlass }).ok;
  const [options, pending, delegations, today] = await Promise.all([loadUserFormOptions(user.id, user.reportingManagerId), countPendingTasks(user.id), listDelegationsInvolving(user.id), indiaToday()]);

  return (
    <>
      <Breadcrumbs items={[{ href: "/admin", label: "Admin" }, { href: "/admin/users", label: "Users & roles" }, { label: user.name }]} />
      <PageHeader title={user.name} description={`${user.loginId} · ${user.email}`}>
        <Link href="/admin/users" className="link text-label">
          ← All users
        </Link>
      </PageHeader>
      {created && (
        <p role="status" className="mb-4 rounded-md bg-success-50 px-3 py-2 text-label text-success-600">
          User created.{user.signInMethod === "PASSWORD" ? " Send the set-password link so they can sign in." : " They can now sign in with Google."}
        </p>
      )}
      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_340px]">
        <UserForm
          mode="edit"
          values={{
            id: user.id,
            loginId: user.loginId,
            name: user.name,
            email: user.email,
            whatsappNumber: user.whatsappNumber,
            departmentId: user.departmentId,
            designationId: user.designationId,
            reportingManagerId: user.reportingManagerId,
            signInMethod: user.signInMethod,
            roles: user.roles,
          }}
          {...options}
          canGrantSuperAdmin={actor.roles.includes("SUPER_ADMIN")}
          readOnly={!canEdit}
        />
        <div className="space-y-6">
          <section className="card px-5 py-4 text-label">
            <h2 className="mb-3 font-semibold">Status</h2>
            <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2">
              <dt className="text-ink-muted">Account</dt>
              <dd>
                {user.active ? "Active" : "Inactive"}
                {user.locked && <span className="badge ml-2 bg-danger-50 text-danger-600">Locked</span>}
              </dd>
              <dt className="text-ink-muted">Sign-in</dt>
              <dd>
                {user.signInMethod === "GOOGLE"
                  ? user.googleLinked
                    ? "Google (linked)"
                    : "Google (links on first sign-in)"
                  : user.hasPassword
                    ? "Password set"
                    : "No password yet"}
              </dd>
              <dt className="text-ink-muted">Last sign-in</dt>
              <dd>{user.lastLoginAt ? formatIndiaTime(user.lastLoginAt) : "Never"}</dd>
              <dt className="text-ink-muted">Open sessions</dt>
              <dd>{user.openSessionCount}</dd>
              <dt className="text-ink-muted">Added</dt>
              <dd>{formatIndiaTime(user.createdAt)}</dd>
            </dl>
          </section>
          <UserCommands
            id={user.id}
            name={user.name}
            active={user.active}
            locked={user.locked}
            signInMethod={user.signInMethod}
            openSessionCount={user.openSessionCount}
            canEdit={canEdit && user.id !== actor.id}
          />
          {canEdit && (
            <section className="card">
              <HandoverForm
                id={user.id}
                name={user.name}
                pending={pending}
                people={options.managers}
                suggestions={pending > 0 ? suggestHandover(options.managers, await pendingCountsByApprover(), user.id) : []}
              />
            </section>
          )}
          {canEdit && user.active && (
            <section className="card">
              <h2 className="border-b border-line px-5 py-4 font-semibold">Out of office</h2>
              <DelegationList items={delegations} personId={user.id} canEnd={false} />
              <DelegationForm people={options.managers} today={today} userId={user.id} />
            </section>
          )}
        </div>
      </div>
    </>
  );
}
