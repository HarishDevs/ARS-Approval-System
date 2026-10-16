import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { requireArea } from "@/server/authorization/guards";
import { canUseReports } from "@/server/settings/features";

// WEB-05 (v1.10.0): a plain, non-confidential browser title.
export const metadata: Metadata = { title: "Reports" };

// v1.7.1: Reports live in the Admin space (IT and Super Admin only). Old
// links and bookmarks still work for them; everyone else gets a 404.
export default async function OldReportsPage() {
  const { user } = await requireArea("users");
  if (!(await canUseReports(user))) notFound();
  redirect("/admin/reports");
}
