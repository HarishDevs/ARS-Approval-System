import { requireArea } from "@/server/authorization/guards";
import { AppShell } from "@/features/shell/AppShell";
import { after } from "next/server";
import { checkJobRunnerStopped } from "@/server/ops/alerts";
import { canUseReports, featureOn } from "@/server/settings/features";

export const dynamic = "force-dynamic";

// IT team area (D-039): predefined approvals, forms, workflows, DoA,
// users and roles. The role check runs here on the server; without the
// IT_ADMIN or SUPER_ADMIN role the visitor gets a plain 404.
export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const { user } = await requireArea("admin");
  // A5: a stopped job runner is noticed when IT opens a page (after it renders).
  after(() => checkJobRunnerStopped().then(() => undefined));
  const analytics = await featureOn("analytics", user);
  const reports = await canUseReports(user);
  return (
    <AppShell
      area="admin"
      user={user}
      nav={[
        { href: "/admin", label: "Overview" },
        { href: "/admin/attention", label: "Needs attention" },
        ...(analytics ? [{ href: "/admin/analytics", label: "Analytics" }] : []),
        ...(reports ? [{ href: "/admin/reports", label: "Reports" }] : []),
        { href: "/admin/insights", label: "Insights" },
        { href: "/admin/dashboards", label: "Dashboards" },
        { href: "/admin/workload", label: "Workload" },
        { href: "/admin/workflows", label: "Approval types & workflows", section: "Approval set-up" },
        { href: "/admin/custom-approval", label: "Custom approval", section: "Approval set-up" },
        { href: "/admin/groups", label: "Approver groups", section: "Approval set-up" },
        { href: "/admin/doa", label: "Approval authority (DoA)", section: "Approval set-up" },
        { href: "/admin/budgets", label: "Budgets", section: "Approval set-up" },
        // v1.9.0 (D-144): Task and Information set-up.
        { href: "/admin/task-types", label: "Task types", section: "Task set-up" },
        { href: "/admin/information-types", label: "Information types", section: "Information set-up" },
        { href: "/admin/calendar", label: "Working calendar", section: "Organisation" },
        { href: "/admin/users", label: "Users & roles", section: "Organisation" },
        { href: "/admin/organisation", label: "Departments", section: "Organisation" },
        { href: "/admin/import", label: "Import data", section: "Organisation" },
      ]}
    >
      {children}
    </AppShell>
  );
}
