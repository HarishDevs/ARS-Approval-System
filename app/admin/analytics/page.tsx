import type { Metadata } from "next";
import { requireArea } from "@/server/authorization/guards";
import { AnalyticsScreen } from "@/features/analytics/AnalyticsScreen";

// WEB-05 (v1.10.0): a plain, non-confidential browser title.
export const metadata: Metadata = { title: "Analytics (Admin)" };

export const dynamic = "force-dynamic";

// Analytics (Addendum A, D-122; v1.7.0 list B). The screen is shared by both spaces.
export default async function Page({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  await requireArea("admin"); // G-1 (v1.10.0): a layout check alone is not enough
  return <AnalyticsScreen searchParams={await searchParams} base="/admin/analytics" />;
}
