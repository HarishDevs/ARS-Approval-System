import { ModuleTypeDetailScreen } from "@/features/admin/ModuleTypeScreens";

export const dynamic = "force-dynamic";

// v1.9.0 (D-144): one type: draft editor, versions, history.
export default async function Page({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ view?: string }> }) {
  const [{ id }, { view }] = await Promise.all([params, searchParams]);
  return <ModuleTypeDetailScreen module="TASK" id={id} view={view} />;
}
