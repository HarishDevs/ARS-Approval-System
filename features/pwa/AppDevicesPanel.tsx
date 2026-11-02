"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import { useRouter } from "next/navigation";
import { BellOff, BellRing, CheckCircle2, Download, Laptop, Smartphone, Tablet } from "lucide-react";
import {
  canPromptInstall,
  currentEndpoint,
  disablePushHere,
  enablePush,
  isDesktopSafari,
  isStandalone,
  notificationPermission,
  platform,
  promptInstall,
  pushSupport,
  subscribeInstall,
} from "@/features/pwa/browser";
import { InstallSteps } from "@/features/pwa/InstallInvite";
import { useToast } from "@/features/ui/Toast";
import { ConfirmDialog } from "@/features/ui/Dialog";

export interface DeviceRow {
  id: number;
  deviceType: "PHONE" | "TABLET" | "DESKTOP";
  browser: string | null;
  operatingSystem: string | null;
  installed: boolean;
  status: "ACTIVE" | "EXPIRED" | "REMOVED";
  service: string;
  added: string;
  lastUsed: string | null;
  endpointHash: string; // sha256, to recognise this browser without sending its endpoint
}

const ICON = { PHONE: Smartphone, TABLET: Tablet, DESKTOP: Laptop } as const;

async function sha256(text: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

// How to allow notifications again after "Block", per browser.
function UnblockSteps() {
  const where = platform();
  if (where === "ios")
    return <p className="text-label text-ink-muted">iPhone/iPad: Settings → Notifications → ARS CMS → Allow Notifications.</p>;
  if (where === "android")
    return <p className="text-label text-ink-muted">Android: tap the lock (or ⋮ → Settings → Site settings) beside the address → Notifications → Allow. In the installed app: long-press its icon → App info → Notifications.</p>;
  if (isDesktopSafari()) return <p className="text-label text-ink-muted">Safari: Settings → Websites → Notifications → set ARS CMS to Allow.</p>;
  return <p className="text-label text-ink-muted">Chrome or Edge: click the icon left of the address → Site settings (or Permissions) → Notifications → Allow, then reload this page.</p>;
}

export function AppDevicesPanel({ devices, pushOn }: { devices: DeviceRow[]; pushOn: boolean }) {
  const router = useRouter();
  const showToast = useToast();
  const toast = { show: (title: string, tone: "success" | "error") => showToast({ title, tone }) };
  const promptReady = useSyncExternalStore(subscribeInstall, canPromptInstall, () => false);
  const [standalone, setStandalone] = useState(false);
  const [where, setWhere] = useState<"ios" | "android" | "desktop">("desktop");
  const [permission, setPermission] = useState<string>("default");
  const [support, setSupport] = useState<string>("supported");
  const [hereHash, setHereHash] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [removing, setRemoving] = useState<DeviceRow | null>(null);

  const refreshLocal = async () => {
    setStandalone(isStandalone());
    setWhere(platform());
    setPermission(notificationPermission());
    setSupport(pushSupport());
    const endpoint = await currentEndpoint().catch(() => null);
    setHereHash(endpoint ? await sha256(endpoint) : null);
  };
  useEffect(() => {
    void refreshLocal();
  }, []);

  const hereRow = devices.find((device) => device.endpointHash === hereHash && device.status === "ACTIVE") ?? null;

  const turnOn = async () => {
    setBusy("on");
    const result = await enablePush().catch(() => ({ ok: false, message: "Couldn't turn notifications on. Please try again." }));
    setBusy(null);
    toast.show(result.message, result.ok ? "success" : "error");
    await refreshLocal();
    router.refresh();
  };
  const turnOff = async () => {
    setBusy("off");
    await disablePushHere().catch(() => undefined);
    setBusy(null);
    toast.show("Notifications are off for this device. Everything is still in your Inbox.", "success");
    await refreshLocal();
    router.refresh();
  };
  const test = async () => {
    setBusy("test");
    const response = await fetch("/api/push/test", { method: "POST" }).catch(() => null);
    setBusy(null);
    const body = response?.ok ? ((await response.json()) as { devices: number; queued: boolean }) : null;
    toast.show(body?.queued ? `Test sent to ${body.devices} device${body.devices === 1 ? "" : "s"}. It should appear within a minute.` : "No device is registered for notifications yet.", body?.queued ? "success" : "error");
  };
  const remove = async (device: DeviceRow) => {
    const response = await fetch(`/api/push/subscriptions/${device.id}`, { method: "DELETE" }).catch(() => null);
    setRemoving(null);
    toast.show(response?.ok ? "Device removed. It gets no more notifications." : "Couldn't remove it. Please try again.", response?.ok ? "success" : "error");
    router.refresh();
  };
  const install = async () => {
    setBusy("install");
    const outcome = await promptInstall();
    setBusy(null);
    if (outcome === "accepted") toast.show("ARS CMS is installed. Open it from your home screen or apps.", "success");
  };

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <section className="card px-5 py-4" aria-labelledby="install-app" data-testid="install-section">
        <h2 id="install-app" className="flex items-center gap-2 font-semibold">
          <Download className="h-4 w-4 text-ink-muted" aria-hidden="true" /> Install the app
        </h2>
        {standalone ? (
          <p className="mt-2 flex items-center gap-2 text-label text-success-600" data-testid="installed-here">
            <CheckCircle2 className="h-4 w-4" aria-hidden="true" /> You&apos;re using the installed app on this device.
          </p>
        ) : (
          <>
            <p className="mt-1 text-label text-ink-muted">Opens in its own window from your home screen, dock or start menu, and lets your phone show ARS notifications.</p>
            {promptReady ? (
              <button type="button" className="btn-primary mt-3 inline-flex items-center gap-1.5" onClick={() => void install()} disabled={busy === "install"}>
                <Download className="h-4 w-4" aria-hidden="true" /> {busy === "install" ? "Opening…" : "Install app"}
              </button>
            ) : where === "ios" ? (
              <InstallSteps mode="ios" />
            ) : isDesktopSafari() ? (
              <InstallSteps mode="mac-safari" />
            ) : (
              <div className="mt-2 text-label text-ink-muted" data-testid="manual-install">
                <p>If your browser doesn&apos;t offer it here:</p>
                <ul className="mt-1 list-disc space-y-1 pl-5">
                  <li>Chrome or Edge on a computer: the install icon at the right of the address bar, or ⋮ / … → Install ARS CMS (Edge: Apps → Install this site as an app).</li>
                  <li>Android Chrome: ⋮ → Add to Home screen → Install.</li>
                  <li>Firefox can&apos;t install web apps; use Chrome or Edge.</li>
                </ul>
              </div>
            )}
          </>
        )}
      </section>

      <section className="card px-5 py-4" aria-labelledby="push-here" data-testid="push-section">
        <h2 id="push-here" className="flex items-center gap-2 font-semibold">
          <BellRing className="h-4 w-4 text-ink-muted" aria-hidden="true" /> Notifications on this device
        </h2>
        <p className="mt-1 text-label text-ink-muted">
          Approvals waiting for you, tasks, reminders, information and notices from IT, as alerts on this phone or computer, even when ARS CMS is closed or you&apos;re signed out. Choose which kinds in Profile → Notifications.
        </p>
        {!pushOn ? (
          <p className="mt-3 text-label text-ink-muted" data-testid="push-off">IT hasn&apos;t switched on phone and desktop notifications yet. Everything still comes to your Inbox.</p>
        ) : support === "needs-install" ? (
          <p className="mt-3 text-label" data-testid="push-needs-install">
            On iPhone and iPad, notifications work only in the installed app (iOS 16.4 or later). Add ARS CMS to your Home Screen (left), open it from there, and come back to this page.
          </p>
        ) : support === "unsupported" ? (
          <p className="mt-3 text-label text-ink-muted">This browser can&apos;t show notifications from websites. Try Chrome, Edge, Firefox or Safari.</p>
        ) : permission === "denied" ? (
          <div className="mt-3 space-y-2" data-testid="push-denied">
            <p className="flex items-center gap-2 text-label font-medium text-warning-600">
              <BellOff className="h-4 w-4" aria-hidden="true" /> Blocked in this browser.
            </p>
            <UnblockSteps />
          </div>
        ) : hereRow ? (
          <div className="mt-3 flex flex-wrap items-center gap-2" data-testid="push-on">
            <span className="badge bg-success-50 text-success-600">On for this device</span>
            <button type="button" className="btn-secondary" onClick={() => void test()} disabled={busy !== null}>
              {busy === "test" ? "Sending…" : "Send a test"}
            </button>
            <button type="button" className="btn-secondary" onClick={() => void turnOff()} disabled={busy !== null}>
              {busy === "off" ? "Turning off…" : "Turn off here"}
            </button>
          </div>
        ) : (
          <button type="button" className="btn-primary mt-3 inline-flex items-center gap-1.5" onClick={() => void turnOn()} disabled={busy !== null} data-testid="push-enable">
            <BellRing className="h-4 w-4" aria-hidden="true" /> {busy === "on" ? "Turning on…" : "Turn on notifications on this device"}
          </button>
        )}
      </section>

      <section className="card lg:col-span-2" aria-labelledby="my-devices" data-testid="device-list">
        <h2 id="my-devices" className="border-b border-line px-5 py-4 font-semibold">
          Devices that get your notifications
        </h2>
        {devices.length === 0 ? (
          <p className="px-5 py-4 text-label text-ink-muted">No device yet. Turn notifications on above, on each phone or computer you use.</p>
        ) : (
          <ul className="divide-y divide-line">
            {devices.map((device) => {
              const Icon = ICON[device.deviceType];
              const here = device.endpointHash === hereHash;
              return (
                <li key={device.id} className="flex flex-wrap items-center gap-3 px-5 py-3" data-testid="device-row">
                  <Icon className="h-5 w-5 shrink-0 text-ink-muted" aria-hidden="true" />
                  <div className="min-w-0 flex-1">
                    <p className="font-medium">
                      {[device.browser, device.operatingSystem].filter(Boolean).join(" on ") || "A browser"}
                      {device.installed && <span className="badge ml-2 bg-primary-50 text-primary-700">App</span>}
                      {here && <span className="badge ml-2 bg-surface-muted text-ink-muted">This device</span>}
                    </p>
                    <p className="text-caption text-ink-muted">
                      Added {device.added}
                      {device.lastUsed ? ` · last notification ${device.lastUsed}` : ""}
                      {device.status === "EXPIRED" ? " · expired: open ARS CMS on that device to renew it" : ""}
                    </p>
                  </div>
                  {device.status === "EXPIRED" ? <span className="badge bg-warning-50 text-warning-600">Expired</span> : <span className="badge bg-success-50 text-success-600">Active</span>}
                  <button type="button" className="btn-secondary" onClick={() => setRemoving(device)} aria-label={`Remove ${device.browser ?? "device"}`}>
                    Remove
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </section>
      <ConfirmDialog
        open={removing !== null}
        title="Remove this device?"
        body="It stops getting ARS notifications. You can turn them on again from that device."
        confirmLabel="Remove device"
        tone="danger"
        onConfirm={() => removing && void remove(removing)}
        onCancel={() => setRemoving(null)}
      />
    </div>
  );
}
