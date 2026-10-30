import "server-only";
import { notFound } from "next/navigation";
import { requireArea } from "@/server/authorization/guards";
import { featureOn } from "@/server/settings/features";
import { listActiveUserOptions } from "@/lib/db/repositories/admin-users.repository";
import { workViewer } from "@/server/work/task-access";

// D-215: what every Task & Project Management page starts with: the signed-in
// person (access to the page is checked by requireArea), the Tasks switch,
// and the person as a project viewer.
export async function workPage() {
  const { user } = await requireArea("users");
  if (!(await featureOn("tasks", user))) notFound();
  const viewer = await workViewer(user);
  return { user, viewer };
}

export async function peopleOptions(): Promise<{ id: number; label: string }[]> {
  return (await listActiveUserOptions()).map((person) => ({ id: person.id, label: person.name }));
}
