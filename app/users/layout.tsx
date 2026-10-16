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
      nav={[
        { href: "/users", label: "Overview" },
        { href: "/users/queue", label: "Waiting for me", section: "Approvals" },
        { href: "/users/requests", label: "My requests", section: "Approvals" },
        { href: "/users/collaborating", label: "Collaborating", section: "Approvals" },
        { href: "/users/approved", label: "My approved requests", section: "Approvals" },
        { href: "/users/approved-by-me", label: "Approved by me", section: "Approvals" },
        { href: "/users/new", label: "New request", section: "Approvals" },
        { href: "/users/custom", label: "Custom approval", section: "Approvals" },
        { href: "/users/search", label: "Search", section: "Approvals" },
        { href: "/users/calendar", label: "Calendar", section: "Approvals" },
        ...(features.analytics ? [{ href: "/users/analytics", label: "Analytics", section: "Approvals" }] : []),
        // v1.9.0 (D-143): the Task and Information modules.
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
      ]}
    >
      {children}
    </AppShell>
  );
}
