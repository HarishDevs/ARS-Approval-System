import type { Metadata } from "next";
import { RecordsRegister } from "@/features/admin/RecordsRegister";
import { requireArea } from "@/server/authorization/guards";

export const metadata: Metadata = { title: "Records: Tasks" };
export const dynamic = "force-dynamic";

// D-191: every record of this kind, whoever raised it (Admin area).
export default async function Page({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  // D-244 (audit SEC-02): the page checks its own area too (not only the
  // screen it renders, nor the layout).
  await requireArea("admin");
  return <RecordsRegister kind="tasks" searchParams={await searchParams} />;
}
