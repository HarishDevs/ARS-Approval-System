import type { Metadata } from "next";
import { RecordsRegister } from "@/features/admin/RecordsRegister";

export const metadata: Metadata = { title: "Records: Approval requests" };
export const dynamic = "force-dynamic";

// D-191: every record of this kind, whoever raised it (Admin area).
export default async function Page({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  return <RecordsRegister kind="requests" searchParams={await searchParams} />;
}
