import { requireArea } from "@/server/authorization/guards";
import { ImportScreen } from "@/features/admin/ImportScreen";

// Bulk import in the Super Admin space (S10, F-59): the same screen, so the
// Super Admin needn't switch space. Super Admin-only rules (granting the
// Super Admin role) apply because the caller is the Super Admin.
export default async function SuperAdminImportPage({ searchParams }: { searchParams: Promise<{ kind?: string }> }) {
  await requireArea("superadmin");
  const { kind } = await searchParams;
  return <ImportScreen kind={kind} />;
}
