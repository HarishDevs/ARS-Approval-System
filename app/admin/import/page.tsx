import { requireArea } from "@/server/authorization/guards";
import { ImportScreen } from "@/features/admin/ImportScreen";

// Bulk import in the Admin space (S10, F-59).
export default async function AdminImportPage({ searchParams }: { searchParams: Promise<{ kind?: string }> }) {
  await requireArea("admin");
  const { kind } = await searchParams;
  return <ImportScreen kind={kind} />;
}
