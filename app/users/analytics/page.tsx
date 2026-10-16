import type { Metadata } from "next";
import { AnalyticsScreen } from "@/features/analytics/AnalyticsScreen";

// WEB-05 (v1.10.0): a plain, non-confidential browser title.
export const metadata: Metadata = { title: "Analytics" };

export const dynamic = "force-dynamic";

// Analytics (Addendum A, D-122; v1.7.0 list B). The screen is shared by both spaces.
export default async function Page({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  return <AnalyticsScreen searchParams={await searchParams} base="/users/analytics" />;
}
