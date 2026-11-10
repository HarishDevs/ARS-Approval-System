import type { Metadata } from "next";
import { requireArea } from "@/server/authorization/guards";
import { NoAccess } from "@/features/shell/NoAccess";

export const metadata: Metadata = { title: "No access" };

// v1.50.3: where a page refused by page access or modules lands (requireArea).
export default async function UsersNoAccessPage({ searchParams }: { searchParams: Promise<{ page?: string; why?: string }> }) {
  await requireArea("users");
  const query = await searchParams;
  return <NoAccess pageKey={query.page} why={query.why} home="/users" />;
}
