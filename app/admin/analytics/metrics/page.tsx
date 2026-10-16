import type { Metadata } from "next";
import { requireArea } from "@/server/authorization/guards";
import { MetricsScreen } from "@/features/analytics/MetricsScreen";

// WEB-05 (v1.10.0): a plain, non-confidential browser title.
export const metadata: Metadata = { title: "Metric dictionary (Admin)" };

export const dynamic = "force-dynamic";

// The metric dictionary (Addendum A, D-122).
export default async function Page() {
  await requireArea("admin"); // G-1 (v1.10.0): a layout check alone is not enough
  return <MetricsScreen base="/admin/analytics" />;
}
