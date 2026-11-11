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
    // D-236 (owner): Overview and Task home are one page, "Home".
    { href: "/users", label: "Home" },
    // D-237 (owner): one Inbox (notifications and the task inbox).
    { href: "/users/inbox", label: "Inbox" },
    // D-207 (owner): this order; "My requests" is "My pending requests" here.
    { href: "/users/custom", label: "New request", section: "My Approvals" },
    { href: "/users/requests", label: "My pending requests", section: "My Approvals" },
    { href: "/users/approved", label: "My approved requests", section: "My Approvals" },
    { href: "/users/queue", label: "Waiting for me", section: "My Approvals" },
    { href: "/users/approved-by-me", label: "Approved by me", section: "My Approvals" },
    { href: "/users/collaborating", label: "Collaborating", section: "My Approvals" },
    { href: "/users/new", label: "Approval templates", section: "My Approvals" },
    ...(features.tasks
      ? [
          // D-206 (owner): New task first. D-215: My tasks opens My Tasks (its
          // sections, board and calendar; the filtered table is one click
          // away), then the owner's order, then projects, home and search.
          { href: "/users/tasks/new", label: "New task", section: "Tasks" },
          { href: "/users/work/my-tasks", label: "My tasks", section: "Tasks" },
          { href: "/users/tasks/assigned", label: "Assigned by me", section: "Tasks" },
          { href: "/users/tasks/team", label: "Team tasks", section: "Tasks" },
          { href: "/users/work/projects", label: "Projects", section: "Projects" },
          { href: "/users/work/search", label: "Task search", section: "Tasks" },
          // D-219: repeating tasks have their own list.
          { href: "/users/work/periodic", label: "Periodic tasks", section: "Tasks" },
        ]
      : []),
    ...(features.information
      ? [
          { href: "/users/information", label: "Information inbox", section: "Information" },
          { href: "/users/information/sent", label: "Sent by me", section: "Information" },
          { href: "/users/information/new", label: "New information", section: "Information" },
        ]
      : []),
    // v1.51.0 (D-300): Meeting Management (the MEETING module; page access hides it otherwise).
    { href: "/users/meetings/new", label: "Schedule meeting", section: "Meetings" },
    { href: "/users/meetings", label: "Meetings", section: "Meetings" },
    { href: "/users/meetings/follow-ups", label: "Follow-ups", section: "Meetings" },
    // D-168: the fourth module. D-180 (owner): the assistant only; its
    // group lists the person's chats with a search (SideNav).
    ...(features.ai ? [{ href: "/users/ai/assistant", label: "AI Assistant", section: "AI Assistant", chats: true }] : []),
    // D-236 (owner): no Search in the sidebar; the header search covers it.
    { href: "/users/calendar", label: "Calendar" },
    ...(features.analytics ? [{ href: "/users/analytics", label: "Analytics" }] : []),
  ];
}
