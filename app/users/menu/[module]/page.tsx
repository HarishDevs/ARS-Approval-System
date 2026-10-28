import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { requireArea } from "@/server/authorization/guards";
import { getUserSetting } from "@/lib/db/repositories/user-settings.repository";
import { parseWorkspaceView, WORKSPACE_VIEW_SETTING } from "@/server/ui/workspace-view";
import { ClassicModuleMenu } from "@/features/shell/ClassicScreens";

export const metadata: Metadata = { title: "Menu" };
export const dynamic = "force-dynamic";

// D-210: a module's menu in the Classic view (Approval Management, Tasks
// Management, Information Management). In the Compact view the sidebar does
// this job, so the address opens the Overview.
export default async function ModuleMenuPage({ params }: { params: Promise<{ module: string }> }) {
  const { user } = await requireArea("users");
  const { module } = await params;
  if (!/^[a-z-]{1,40}$/.test(module)) notFound();
  if (parseWorkspaceView(await getUserSetting(user.id, WORKSPACE_VIEW_SETTING).catch(() => null)) !== "CLASSIC") redirect("/users");
  const menu = await ClassicModuleMenu({ user, moduleKey: module });
  if (!menu) notFound();
  return menu;
}
