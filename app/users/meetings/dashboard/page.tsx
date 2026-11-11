import { redirect } from "next/navigation";
import { requireArea } from "@/server/authorization/guards";

export const dynamic = "force-dynamic";

// v1.51.1 (owner): the meeting dashboard lives on Home → Meetings (Meeting
// Overview). This address stays for old links and keeps the chosen period.
export default async function MeetingDashboardPage({ searchParams }: { searchParams: Promise<{ period?: string; from?: string; to?: string }> }) {
  await requireArea("users");
  const query = await searchParams;
  const keep = new URLSearchParams({ home: "meetings" });
  for (const key of ["period", "from", "to"] as const) {
    const value = query[key];
    if (value && /^[\w-]{1,12}$/.test(value)) keep.set(key, value);
  }
  redirect(`/users?${keep}`);
}
