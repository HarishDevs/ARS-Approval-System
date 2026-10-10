import { requireArea } from "@/server/authorization/guards";
import { AppShell } from "@/features/shell/AppShell";
import { enabledFeatures } from "@/server/settings/features";

export const dynamic = "force-dynamic";

export default async function UsersLayout({ children }: { children: React.ReactNode }) {
  const { user } = await requireArea("users");
  const features = await enabledFeatures(user);
  return (
    <AppShell
      area="users"
      user={user}
      nav={[
        { href: "/users", label: "My work" },
        { href: "/users/queue", label: "Waiting for me" },
        { href: "/users/requests", label: "My requests" },
        { href: "/users/new", label: "New request" },
        { href: "/users/custom", label: "Custom approval" },
        { href: "/users/search", label: "Search" },
        ...(features.analytics ? [{ href: "/users/analytics", label: "Analytics" }] : []),
        ...(features.reports ? [{ href: "/users/reports", label: "Reports" }] : []),
        { href: "/users/help", label: "Help" },
        { href: "/users/profile", label: "Profile", also: ["/users/notifications", "/users/delegation", "/users/security"] },
      ]}
    >
      {children}
    </AppShell>
  );
}
