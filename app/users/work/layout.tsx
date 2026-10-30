import { WorkNav } from "@/features/work/WorkNav";
import { inboxUnread } from "@/lib/db/repositories/work.repository";
import { workPage } from "@/server/work/page-context";

// D-215: Task & Project Management pages share their tabs and keyboard
// (D-218: and the inbox's unread count).
export default async function WorkLayout({ children }: { children: React.ReactNode }) {
  const { user } = await workPage();
  const unread = await inboxUnread(user.id).catch(() => 0);
  return (
    <>
      <WorkNav unread={unread} />
      {children}
    </>
  );
}
