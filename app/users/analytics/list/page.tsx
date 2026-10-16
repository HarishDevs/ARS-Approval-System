import type { Metadata } from "next";
import { AnalyticsListScreen } from "@/features/analytics/AnalyticsListScreen";

// WEB-05 (v1.10.0): a plain, non-confidential browser title.
export const metadata: Metadata = { title: "Analytics: requests" };

export const dynamic = "force-dynamic";

// The requests behind an Analytics number (v1.7.0, B01).
export default async function Page({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  return <AnalyticsListScreen searchParams={await searchParams} base="/users/analytics" />;
}
