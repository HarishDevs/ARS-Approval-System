import type { Metadata } from "next";
import { Smartphone } from "lucide-react";
import { requireArea } from "@/server/authorization/guards";
import { PageHeader } from "@/features/shell/PageHeader";
import { ProfileTabs } from "@/features/shell/ProfileTabs";
import { AppDevicesPanel } from "@/features/pwa/AppDevicesPanel";
import { listDevicesForUser } from "@/lib/db/repositories/push.repository";
import { sessionExpiry } from "@/lib/db/repositories/sessions.repository";
import { getPushConfig, pushReady } from "@/server/push/service";
import { formatIndiaTime } from "@/server/notifications/security-messages";

export const metadata: Metadata = { title: "App & devices" };
export const dynamic = "force-dynamic";

// v1.41.0 (D-250, D-251, D-252): Profile → App & devices. Install the app,
// turn notifications on for this device, see and remove the devices that get
// your notifications, and how long this sign-in lasts.
export default async function AppDevicesPage() {
  const { user, sessionId } = await requireArea("users");
  const [devices, config, expiry] = await Promise.all([listDevicesForUser(user.id), getPushConfig(), sessionExpiry(sessionId)]);
  return (
    <>
      <PageHeader title="App & devices" icon={Smartphone} description="Install ARS-CMS, get notifications on your phone or computer, and see which devices get them." />
      <ProfileTabs />
      <div className="space-y-6">
        <AppDevicesPanel
          pushOn={pushReady(config)}
          devices={devices.map((device) => ({
            id: device.id,
            deviceType: device.deviceType,
            browser: device.browser,
            operatingSystem: device.operatingSystem,
            installed: device.installed,
            status: device.status,
            service: device.endpointHost,
            added: formatIndiaTime(device.createdAt),
            lastUsed: device.lastUsedAt ? formatIndiaTime(device.lastUsedAt) : null,
            endpointHash: device.endpointHash,
          }))}
        />
        {expiry && (
          <section className="card px-5 py-4" aria-labelledby="this-sign-in" data-testid="session-policy">
            <h2 id="this-sign-in" className="font-semibold">
              This sign-in
            </h2>
            <p className="mt-1 text-label text-ink-muted">
              {expiry.daily
                ? `You stay signed in on this device until midnight (${formatIndiaTime(expiry.expiresAt)}, India time), even if you close the app or lock the screen. Then you sign in again; notifications keep coming meanwhile.`
                : `On this computer you're signed out after a while without activity, and at the latest at ${formatIndiaTime(expiry.expiresAt)}. Phones, tablets and the installed app stay signed in until midnight.`}
            </p>
          </section>
        )}
      </div>
    </>
  );
}
