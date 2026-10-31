import { redirect } from "next/navigation";
import { workPage } from "@/server/work/page-context";

export const dynamic = "force-dynamic";

// D-237 (owner): the Task inbox is part of the one Inbox (its Tasks view).
export default async function TaskInboxPage({ searchParams }: { searchParams: Promise<{ tab?: string; unread?: string }> }) {
  await workPage();
  const params = await searchParams;
  const query = new URLSearchParams({ type: "tasks" });
  if (params.tab === "bookmarks" || params.tab === "archive") query.set("state", params.tab);
  if (params.unread === "1") query.set("unread", "1");
  redirect(`/users/inbox?${query}`);
}
