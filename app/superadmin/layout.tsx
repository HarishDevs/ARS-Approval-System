import { requireArea } from "@/server/authorization/guards";
import { AppShell } from "@/features/shell/AppShell";

export const dynamic = "force-dynamic";

// Super Admin only (itadmin@, D-039): providers, security, integrations,
// system health, audit export, break-glass. 404 for everyone else.
export default async function SuperAdminLayout({ children }: { children: React.ReactNode }) {
  const { user } = await requireArea("superadmin");
  return (
    <AppShell
      area="superadmin"
      user={user}
      nav={[
        { href: "/superadmin", label: "Overview" },
        { href: "/superadmin/settings", label: "Providers & security", soon: true },
        { href: "/superadmin/templates", label: "WhatsApp templates", soon: true },
        { href: "/superadmin/deliveries", label: "Message deliveries", soon: true },
        { href: "/superadmin/audit", label: "Audit log", soon: true },
      ]}
    >
      {children}
    </AppShell>
  );
}
