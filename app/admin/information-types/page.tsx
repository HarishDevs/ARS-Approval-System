import { ModuleTypesListScreen } from "@/features/admin/ModuleTypeScreens";

export const dynamic = "force-dynamic";

// v1.9.0 (D-144): Admin → information-types. The screen checks the admin area itself.
export default async function Page() {
  return <ModuleTypesListScreen module="INFO" />;
}
