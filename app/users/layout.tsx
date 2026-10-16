import { requireArea } from "@/server/authorization/guards";
import { AppShell } from "@/features/shell/AppShell";
import { enabledFeatures } from "@/server/settings/features";

export const dynamic = "force-dynamic";

export default async function UsersLayout({ children }: { children: React.ReactNode }) {
  const { user } = await requireArea("users");
  const features = await enabledFeatures(user);
  return (
    <AppShell
      area="users"
      user={user}
      // v1.9.2 (owner): Overview; My Approvals, Tasks and Information as
      // collapsible groups; then Search, Calendar and Analytics.
      nav={[
        { href: "/users", label: "Overview" },
        { href: "/users/new", label: "New request", section: "My Approvals" },
        { href: "/users/custom", label: "Custom approval", section: "My Approvals" },
        { href: "/users/queue", label: "Waiting for me", section: "My Approvals" },
        { href: "/users/requests", label: "My requests", section: "My Approvals" },
        { href: "/users/approved", label: "My approved requests", section: "My Approvals" },
        { href: "/users/approved-by-me", label: "Approved by me", section: "My Approvals" },
        { href: "/users/collaborating", label: "Collaborating", section: "My Approvals" },
        ...(features.tasks
          ? [
              { href: "/users/tasks", label: "My tasks", section: "Tasks" },
              { href: "/users/tasks/assigned", label: "Assigned by me", section: "Tasks" },
              { href: "/users/tasks/team", label: "Team tasks", section: "Tasks" },
              { href: "/users/tasks/new", label: "New task", section: "Tasks" },
            ]
          : []),
        ...(features.information
          ? [
              { href: "/users/information", label: "Information inbox", section: "Information" },
              { href: "/users/information/sent", label: "Sent by me", section: "Information" },
              { href: "/users/information/new", label: "New information", section: "Information" },
            ]
          : []),
        { href: "/users/search", label: "Search" },
        { href: "/users/calendar", label: "Calendar" },
        ...(features.analytics ? [{ href: "/users/analytics", label: "Analytics" }] : []),
      ]}
    >
      {children}
    </AppShell>
  );
}
