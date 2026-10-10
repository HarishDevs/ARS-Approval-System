import { requireArea } from "@/server/authorization/guards";
import { AppShell } from "@/features/shell/AppShell";

export const dynamic = "force-dynamic";

// IT team area (D-039): predefined approvals, forms, workflows, DoA,
// users and roles. The role check runs here on the server; without the
// IT_ADMIN or SUPER_ADMIN role the visitor gets a plain 404.
export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const { user } = await requireArea("admin");
  return (
    <AppShell
      area="admin"
      user={user}
      nav={[
        { href: "/admin", label: "Overview" },
        { href: "/admin/attention", label: "Needs attention" },
        { href: "/admin/insights", label: "Insights" },
        { href: "/admin/dashboards", label: "Dashboards" },
        { href: "/admin/workload", label: "Workload" },
        { href: "/admin/workflows", label: "Approval types & workflows" },
        { href: "/admin/groups", label: "Approver groups" },
        { href: "/admin/doa", label: "Approval authority (DoA)" },
        { href: "/admin/budgets", label: "Budgets" },
        { href: "/admin/calendar", label: "Working calendar" },
        { href: "/admin/users", label: "Users & roles" },
        { href: "/admin/organisation", label: "Departments" },
        { href: "/admin/import", label: "Import data" },
      ]}
    >
      {children}
    </AppShell>
  );
}
