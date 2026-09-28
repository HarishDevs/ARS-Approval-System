import { requireArea } from "@/server/authorization/guards";
import { AppShell } from "@/features/shell/AppShell";

export const dynamic = "force-dynamic";

export default async function UsersLayout({ children }: { children: React.ReactNode }) {
  const { user } = await requireArea("users");
  return (
    <AppShell
      area="users"
      user={user}
      nav={[
        { href: "/users", label: "Overview" },
        { href: "/users/requests", label: "My requests", soon: true },
        { href: "/users/queue", label: "Waiting for me", soon: true },
        { href: "/users/new", label: "New request", soon: true },
        { href: "/users/security", label: "Sign-in & devices" },
      ]}
    >
      {children}
    </AppShell>
  );
}
