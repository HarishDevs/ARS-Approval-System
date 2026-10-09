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
        { href: "/users/queue", label: "Waiting for me" },
        { href: "/users/requests", label: "My requests" },
        { href: "/users/new", label: "New request" },
        { href: "/users/custom", label: "Custom approval" },
        { href: "/users/search", label: "Search" },
        { href: "/users/profile", label: "Profile", also: ["/users/notifications", "/users/delegation", "/users/security"] },
      ]}
    >
      {children}
    </AppShell>
  );
}
