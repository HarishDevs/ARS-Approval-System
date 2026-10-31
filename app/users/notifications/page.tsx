import { redirect } from "next/navigation";
import { requireArea } from "@/server/authorization/guards";

// D-237 (owner): Notifications is now the Inbox (/users/inbox). Old links in
// emails and WhatsApp keep their view and page.
export default async function NotificationsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  await requireArea("users");
  const params = await searchParams;
  const keep = Object.entries(params).filter((entry): entry is [string, string] => typeof entry[1] === "string" && ["type", "before", "state", "unread"].includes(entry[0]));
  const query = new URLSearchParams(keep).toString();
  redirect(`/users/inbox${query ? `?${query}` : ""}`);
}
