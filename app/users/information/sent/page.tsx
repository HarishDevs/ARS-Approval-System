import type { Metadata } from "next";
import { InfoListScreen } from "@/features/modules/InfoListScreen";

// WEB-05 (v1.10.0): a plain, non-confidential browser title.
export const metadata: Metadata = { title: "Information sent by me" };

export const dynamic = "force-dynamic";

// v1.9.0 (D-143): an information list; the screen checks access itself.
export default async function Page({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  return <InfoListScreen base="SENT" query={await searchParams} />;
}
