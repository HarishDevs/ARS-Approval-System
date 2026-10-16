import type { Metadata } from "next";
import { requireArea } from "@/server/authorization/guards";
import { AnalyticsListScreen } from "@/features/analytics/AnalyticsListScreen";

// WEB-05 (v1.10.0): a plain, non-confidential browser title.
export const metadata: Metadata = { title: "Analytics: requests (Admin)" };

export const dynamic = "force-dynamic";

// The requests behind an Analytics number (v1.7.0, B01).
export default async function Page({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  await requireArea("admin"); // G-1 (v1.10.0): a layout check alone is not enough
  return <AnalyticsListScreen searchParams={await searchParams} base="/admin/analytics" />;
}
