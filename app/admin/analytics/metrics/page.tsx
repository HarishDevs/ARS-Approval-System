import { MetricsScreen } from "@/features/analytics/MetricsScreen";

export const dynamic = "force-dynamic";

// The metric dictionary (Addendum A, D-122).
export default function Page() {
  return <MetricsScreen base="/admin/analytics" />;
}
