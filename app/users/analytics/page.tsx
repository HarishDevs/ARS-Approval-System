import { AnalyticsScreen } from "@/features/analytics/AnalyticsScreen";

export const dynamic = "force-dynamic";

// Analytics (Addendum A, D-122; v1.7.0 list B). The screen is shared by both spaces.
export default async function Page({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  return <AnalyticsScreen searchParams={await searchParams} base="/users/analytics" />;
}
