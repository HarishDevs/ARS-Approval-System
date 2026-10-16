import type { Metadata } from "next";
import { requireArea } from "@/server/authorization/guards";
import { ImportScreen } from "@/features/admin/ImportScreen";

// WEB-05 (v1.10.0): a plain, non-confidential browser title.
export const metadata: Metadata = { title: "Import data (Super Admin)" };

// Bulk import in the Super Admin space (S10, F-59): the same screen, so the
// Super Admin needn't switch space. Super Admin-only rules (granting the
// Super Admin role) apply because the caller is the Super Admin.
export default async function SuperAdminImportPage({ searchParams }: { searchParams: Promise<{ kind?: string }> }) {
  await requireArea("superadmin");
  const { kind } = await searchParams;
  return <ImportScreen kind={kind} />;
}
