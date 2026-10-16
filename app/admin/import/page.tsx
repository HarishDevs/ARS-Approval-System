import type { Metadata } from "next";
import { requireArea } from "@/server/authorization/guards";
import { ImportScreen } from "@/features/admin/ImportScreen";

// WEB-05 (v1.10.0): a plain, non-confidential browser title.
export const metadata: Metadata = { title: "Import data" };

// Bulk import in the Admin space (S10, F-59).
export default async function AdminImportPage({ searchParams }: { searchParams: Promise<{ kind?: string }> }) {
  await requireArea("admin");
  const { kind } = await searchParams;
  return <ImportScreen kind={kind} />;
}
