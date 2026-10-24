import type { Metadata } from "next";
import { PageHeader } from "@/features/shell/PageHeader";
import { requireAiPage } from "@/features/ai/guard";
import { NotConnectedYet } from "@/features/ai/AiParts";

export const metadata: Metadata = { title: "Business Intelligence" };

// D-168 (AI module branch): Business Intelligence. Every figure is calculated by approved queries.
export default async function Page() {
  await requireAiPage();
  return (
    <>
      <PageHeader title="Business Intelligence" description="Governed comparisons: periods, regions, dealers and products, trends, variances and reconciliation." />
      <NotConnectedYet what="Period and region comparisons, dealer and product analysis, trends, variance breakdowns, data-quality checks and cross-system reconciliation, all calculated from the data, not estimated." next="It fills in as Salesforce and Oracle ERP are connected (Data Sources)." />
    </>
  );
}
