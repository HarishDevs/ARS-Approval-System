import { requireArea } from "@/server/authorization/guards";
import { AppShell } from "@/features/shell/AppShell";
import { usersNav } from "@/features/shell/users-nav";
import { HolidayPrompt } from "@/features/work/client";
import { TaskCreator } from "@/features/work/TaskCreator";
import { featureOn } from "@/server/settings/features";
import { hasModule } from "@/server/modules/modules";
import { listVisibleProjects } from "@/lib/db/repositories/work.repository";
import { peopleOptions } from "@/server/work/page-context";
import { workViewer } from "@/server/work/task-access";
import { chatAccess } from "@/server/ai/policy";
import { PushKeeper } from "@/features/pwa/PushKeeper";

export const dynamic = "force-dynamic";

export default async function UsersLayout({ children }: { children: React.ReactNode }) {
  const { user } = await requireArea("users");
  // D-221: "Create → Task" works on every page (the Draft task panel).
  const creator =
    hasModule(user, "TASK") && (await featureOn("tasks", user))
      ? await Promise.all([listVisibleProjects(await workViewer(user)), peopleOptions()])
          .then(([projects, people]) => ({ projects: projects.slice(0, 200).map((project) => ({ id: project.id, name: project.name, color: project.color })), people }))
          .catch(() => null)
      : null;
  // D-238: the Draft task's sparkle shows only for people Pico Bot answers.
  const ai =
    creator && (await featureOn("ai", user))
      ? await chatAccess(user)
          .then((access) => !access.policy.emergencyStop && access.modes.length > 0)
          .catch(() => false)
      : false;
  return (
    <AppShell area="users" user={user} nav={await usersNav(user)}>
      {children}
      <HolidayPrompt />
      <PushKeeper userId={user.id} />
      {creator && <TaskCreator projects={creator.projects} people={creator.people} meId={user.id} ai={ai} />}
    </AppShell>
  );
}
