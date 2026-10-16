import type { Metadata } from "next";
import { MetricsScreen } from "@/features/analytics/MetricsScreen";

// WEB-05 (v1.10.0): a plain, non-confidential browser title.
export const metadata: Metadata = { title: "Metric dictionary" };

export const dynamic = "force-dynamic";

// The metric dictionary (Addendum A, D-122).
export default function Page() {
  return <MetricsScreen base="/users/analytics" />;
}
