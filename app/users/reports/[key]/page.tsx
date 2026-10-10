import { notFound, redirect } from "next/navigation";
import { requireArea } from "@/server/authorization/guards";
import { canUseReports } from "@/server/settings/features";

// v1.7.1: old report links go to the Admin space (IT and Super Admin only).
export default async function OldReportPage({ params, searchParams }: { params: Promise<{ key: string }>; searchParams: Promise<Record<string, string | undefined>> }) {
  const { user } = await requireArea("users");
  if (!(await canUseReports(user))) notFound();
  const { key } = await params;
  if (!/^[a-z_]{3,60}$/.test(key)) notFound();
  const query = new URLSearchParams(Object.entries(await searchParams).filter((entry): entry is [string, string] => typeof entry[1] === "string")).toString();
  redirect(`/admin/reports/${key}${query ? `?${query}` : ""}`);
}
