import "server-only";
import { enabledFeatures } from "@/server/settings/features";
import type { NavItem } from "@/features/shell/SideNav";

// The My approvals space's pages, in the owner's order. Used by the sidebar
// (Compact view) and by the Gateway and module menus (Classic view, D-210).
export async function usersNav(user: { roles: readonly string[] }): Promise<NavItem[]> {
  const features = await enabledFeatures(user);
  return [
    // v1.9.2 (owner): Overview; My Approvals, Tasks and Information as
    // collapsible groups; then Search, Calendar and Analytics.
    { href: "/users", label: "Overview" },
    // D-207 (owner): this order; "My requests" is "My pending requests" here.
    { href: "/users/custom", label: "New request", section: "My Approvals" },
    { href: "/users/requests", label: "My pending requests", section: "My Approvals" },
    { href: "/users/approved", label: "My approved requests", section: "My Approvals" },
    { href: "/users/queue", label: "Waiting for me", section: "My Approvals" },
    { href: "/users/approved-by-me", label: "Approved by me", section: "My Approvals" },
    { href: "/users/collaborating", label: "Collaborating", section: "My Approvals" },
    { href: "/users/new", label: "Request templates", section: "My Approvals" },
    ...(features.tasks
      ? [
          // D-206 (owner): New task first.
          { href: "/users/tasks/new", label: "New task", section: "Tasks" },
          { href: "/users/tasks", label: "My tasks", section: "Tasks" },
          { href: "/users/tasks/assigned", label: "Assigned by me", section: "Tasks" },
          { href: "/users/tasks/team", label: "Team tasks", section: "Tasks" },
        ]
      : []),
    ...(features.information
      ? [
          { href: "/users/information", label: "Information inbox", section: "Information" },
          { href: "/users/information/sent", label: "Sent by me", section: "Information" },
          { href: "/users/information/new", label: "New information", section: "Information" },
        ]
      : []),
    // D-168: the fourth module. D-180 (owner): the assistant only; its
    // group lists the person's chats with a search (SideNav).
    ...(features.ai ? [{ href: "/users/ai/assistant", label: "AI Assistant", section: "AI Assistant", chats: true }] : []),
    { href: "/users/search", label: "Search" },
    { href: "/users/calendar", label: "Calendar" },
    ...(features.analytics ? [{ href: "/users/analytics", label: "Analytics" }] : []),
  ];
}
