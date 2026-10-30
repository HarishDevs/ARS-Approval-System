import { WorkRail } from "@/features/work/WorkRail";
import { inboxUnread, listVisibleProjects } from "@/lib/db/repositories/work.repository";
import { workPage } from "@/server/work/page-context";

// D-215 / D-219: the Tasks area looks like Asana: its own left bar (Create,
// Home, My Tasks, Inbox, Periodic, Search, starred and all projects) beside
// the page, with the area's keyboard.
export default async function WorkLayout({ children }: { children: React.ReactNode }) {
  const { user, viewer } = await workPage();
  const [unread, projects] = await Promise.all([inboxUnread(user.id).catch(() => 0), listVisibleProjects(viewer)]);
  return (
    <div className="lg:grid lg:grid-cols-[220px_minmax(0,1fr)] lg:items-start lg:gap-6">
      <WorkRail
        unread={unread}
        projects={projects.slice(0, 80).map((project) => ({ id: project.id, name: project.name, color: project.color, starred: project.starred, department: project.departmentName }))}
      />
      <div className="min-w-0">{children}</div>
    </div>
  );
}
