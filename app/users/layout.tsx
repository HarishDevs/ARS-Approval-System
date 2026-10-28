import { requireArea } from "@/server/authorization/guards";
import { AppShell } from "@/features/shell/AppShell";
import { usersNav } from "@/features/shell/users-nav";

export const dynamic = "force-dynamic";

export default async function UsersLayout({ children }: { children: React.ReactNode }) {
  const { user } = await requireArea("users");
  return (
    <AppShell area="users" user={user} nav={await usersNav(user)}>
      {children}
    </AppShell>
  );
}
