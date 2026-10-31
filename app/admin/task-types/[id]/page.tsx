import type { Metadata } from "next";
import { ModuleTypeDetailScreen } from "@/features/admin/ModuleTypeScreens";
import { requireArea } from "@/server/authorization/guards";

// WEB-05 (v1.10.0): a plain, non-confidential browser title.
export const metadata: Metadata = { title: "Task type" };

export const dynamic = "force-dynamic";

// v1.9.0 (D-144): one type: draft editor, versions, history.
export default async function Page({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ view?: string }> }) {
  // D-244 (audit SEC-02): the page checks its own area too (not only the
  // screen it renders, nor the layout).
  await requireArea("admin");
  const [{ id }, { view }] = await Promise.all([params, searchParams]);
  return <ModuleTypeDetailScreen module="TASK" id={id} view={view} />;
}
