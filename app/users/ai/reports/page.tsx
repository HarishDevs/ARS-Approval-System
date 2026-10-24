import type { Metadata } from "next";
import { PageHeader } from "@/features/shell/PageHeader";
import { requireAiPage } from "@/features/ai/guard";
import { NotConnectedYet } from "@/features/ai/AiParts";

export const metadata: Metadata = { title: "AI Reports" };

// D-168 (AI module branch): AI Reports. Exports stay within the person's permissions.
export default async function Page() {
  await requireAiPage();
  return (
    <>
      <PageHeader title="AI Reports" description="Reports you create and review, with periods, filters and comparisons, within your permissions." />
      <NotConnectedYet what="Reports will say clearly whether their data is live, a scheduled snapshot, cached or sample data." next="Available once the assistant and the data sources are connected." />
    </>
  );
}
