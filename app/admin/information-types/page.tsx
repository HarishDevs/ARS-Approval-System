import type { Metadata } from "next";
import { ModuleTypesListScreen } from "@/features/admin/ModuleTypeScreens";

// WEB-05 (v1.10.0): a plain, non-confidential browser title.
export const metadata: Metadata = { title: "Information types" };

export const dynamic = "force-dynamic";

// v1.9.0 (D-144): Admin → information-types. The screen checks the admin area itself.
export default async function Page() {
  return <ModuleTypesListScreen module="INFO" />;
}
