import { AnalyticsListScreen } from "@/features/analytics/AnalyticsListScreen";

export const dynamic = "force-dynamic";

// The requests behind an Analytics number (v1.7.0, B01).
export default async function Page({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  return <AnalyticsListScreen searchParams={await searchParams} base="/users/analytics" />;
}
