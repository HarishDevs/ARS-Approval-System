import type { Metadata } from "next";
import { PagedRows } from "@/features/ui/PagedRows";
import { Send } from "lucide-react";
import { requireArea } from "@/server/authorization/guards";
import { PageHeader } from "@/features/shell/PageHeader";
import { BroadcastForm } from "@/features/admin/BroadcastForm";
import { listActiveUserOptions } from "@/lib/db/repositories/admin-users.repository";
import { listDepartments } from "@/lib/db/repositories/organisation.repository";
import { listRoleCodes } from "@/lib/db/repositories/groups.repository";
import { CATEGORY_TEXT, listAllDevices, listBroadcasts, pushOverview } from "@/server/notifications/broadcast";
import { getPushConfig, pushReady } from "@/server/push/service";
import { formatIndiaTime } from "@/server/notifications/security-messages";

export const metadata: Metadata = { title: "Notifications" };
export const dynamic = "force-dynamic";

const TABS = [
  { key: "send", label: "Send" },
  { key: "history", label: "History" },
  { key: "devices", label: "Devices" },
] as const;

// D-252 (owner: "Notification Management Dashboard"): what IT sends to
// people's Inbox and devices, what happened to it, and which devices are
// registered. Push "accepted" means the push service took it, not that the
// person saw it.
export default async function AdminNotificationsPage({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  await requireArea("admin");
  const wanted = (await searchParams).tab;
  const tab = TABS.find((item) => item.key === wanted)?.key ?? "send";
  const [overview, config] = await Promise.all([pushOverview(), getPushConfig()]);
  const cards = [
    { label: "Registered devices", value: overview.devices, help: "Every device people turned notifications on for (expired ones included)." },
    { label: "Active devices", value: overview.activeDevices, help: "Devices a notification can reach now." },
    { label: "People with a device", value: overview.peopleWithDevices, help: "People with at least one active device." },
    { label: "Pushes (30 days)", value: overview.sent30, help: "Phone and desktop notifications queued in the last 30 days." },
    { label: "Accepted by push services", value: overview.accepted30, help: "Taken by the browser's push service. It doesn't prove the person saw it." },
    { label: "Failed", value: overview.failed30, help: "Refused or gone after the retries. The message is still in the person's Inbox." },
  ];

  return (
    <>
      <PageHeader title="Notifications" icon={Send} description="Send a notification to people's Inbox and their phones and computers, and see what happened to it." />
      {!pushReady(config) && (
        <p className="mb-4 rounded-md border border-warning-600/40 bg-warning-50 px-4 py-3 text-label" role="status">
          Phone and desktop notifications are off or have no keys yet (Super Admin → Settings → Phone & desktop notifications). Notices still reach everyone&apos;s Inbox.
        </p>
      )}
      <ul className="mb-6 grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6" data-testid="push-overview">
        {cards.map((card) => (
          <li key={card.label} className="card px-4 py-3" title={card.help}>
            <p className="text-caption text-ink-muted">{card.label}</p>
            <p className="mt-1 text-title font-semibold tabular-nums">{card.value.toLocaleString("en-IN")}</p>
          </li>
        ))}
      </ul>
      <nav aria-label="Notifications" className="scroll-hint -mx-4 mb-6 overflow-x-auto border-b border-line px-4 sm:mx-0 sm:px-0">
        <ul className="flex min-w-max gap-1">
          {TABS.map((item) => (
            <li key={item.key}>
              <a
                href={`/admin/notifications?tab=${item.key}`}
                aria-current={tab === item.key ? "page" : undefined}
                className={`-mb-px block border-b-2 px-3 py-2.5 text-label ${tab === item.key ? "border-primary-600 font-semibold text-primary-700" : "border-transparent text-ink-muted hover:text-ink"}`}
              >
                {item.label}
              </a>
            </li>
          ))}
        </ul>
      </nav>
      {tab === "send" && <SendTab />}
      {tab === "history" && <HistoryTab />}
      {tab === "devices" && <DevicesTab />}
    </>
  );
}

async function SendTab() {
  const [people, departments, roles] = await Promise.all([listActiveUserOptions(), listDepartments(), listRoleCodes()]);
  return (
    <section className="card px-5 py-5">
      <BroadcastForm
        people={people.map((person) => ({ id: person.id, label: `${person.name} (${person.loginId})` }))}
        departments={departments.filter((department) => department.active).map((department) => ({ id: department.id, name: department.name }))}
        roles={roles}
      />
    </section>
  );
}

async function HistoryTab() {
  const rows = await listBroadcasts(100);
  if (!rows.length) return <p className="card px-5 py-4 text-label text-ink-muted">Nothing sent yet.</p>;
  return (
    <div className="card overflow-x-auto" data-testid="broadcast-history">
      <table className="w-full min-w-[760px] text-left text-label">
        <thead className="border-b border-line text-caption text-ink-muted">
          <tr>
            <th className="px-4 py-2 font-medium">Notification</th>
            <th className="px-4 py-2 font-medium">Audience</th>
            <th className="px-4 py-2 font-medium">Sent</th>
            <th className="px-4 py-2 text-right font-medium">Inbox</th>
            <th className="px-4 py-2 font-medium">Devices</th>
          </tr>
        </thead>
        <PagedRows colSpan={5}>
          {rows.map((row) => (
            <tr key={row.id}>
              <td className="px-4 py-3">
                <p className="font-medium">{row.title}</p>
                <p className="text-caption text-ink-muted">
                  {CATEGORY_TEXT[row.category]}
                  {row.priority === "HIGH" ? " · High" : ""}
                </p>
              </td>
              <td className="px-4 py-3 text-ink-muted">{row.audienceText}</td>
              <td className="px-4 py-3 whitespace-nowrap">
                {formatIndiaTime(row.createdAt)}
                <p className="text-caption text-ink-muted">by {row.createdBy}</p>
              </td>
              <td className="px-4 py-3 text-right tabular-nums">
                {row.inboxed} / {row.recipients}
              </td>
              <td className="px-4 py-3 text-caption">
                <span className="text-success-600">{row.pushSent} accepted</span>
                {row.pushQueued > 0 && <span> · {row.pushQueued} waiting</span>}
                {row.pushFailed > 0 && <span className="text-danger-600"> · {row.pushFailed} failed</span>}
                {row.pushGone > 0 && <span className="text-ink-muted"> · {row.pushGone} device gone</span>}
                {row.failureCodes && <p className="text-ink-muted">{row.failureCodes}</p>}
              </td>
            </tr>
          ))}
        </PagedRows>
      </table>
    </div>
  );
}

async function DevicesTab() {
  const rows = await listAllDevices(300);
  if (!rows.length) return <p className="card px-5 py-4 text-label text-ink-muted">No device registered yet. People turn notifications on in Profile → App & devices.</p>;
  return (
    <div className="card overflow-x-auto" data-testid="admin-devices">
      <table className="w-full min-w-[760px] text-left text-label">
        <thead className="border-b border-line text-caption text-ink-muted">
          <tr>
            <th className="px-4 py-2 font-medium">Person</th>
            <th className="px-4 py-2 font-medium">Device</th>
            <th className="px-4 py-2 font-medium">Push service</th>
            <th className="px-4 py-2 font-medium">Status</th>
            <th className="px-4 py-2 font-medium">Added</th>
            <th className="px-4 py-2 font-medium">Last accepted</th>
          </tr>
        </thead>
        <PagedRows colSpan={6}>
          {rows.map((row) => (
            <tr key={row.id}>
              <td className="px-4 py-3">
                {row.person}
                <p className="text-caption text-ink-muted">{row.loginId}</p>
              </td>
              <td className="px-4 py-3">
                {[row.browser, row.operatingSystem].filter(Boolean).join(" on ") || "A browser"} · {row.deviceType.toLowerCase()}
                {row.installed ? " · app" : ""}
              </td>
              <td className="px-4 py-3 text-ink-muted">{row.service}</td>
              <td className="px-4 py-3">
                {row.status === "ACTIVE" ? "Active" : "Expired"}
                {row.lastFailureCode && <p className="text-caption text-ink-muted">{row.lastFailureCode}</p>}
              </td>
              <td className="px-4 py-3 whitespace-nowrap">{formatIndiaTime(row.createdAt)}</td>
              <td className="px-4 py-3 whitespace-nowrap">{row.lastUsedAt ? formatIndiaTime(row.lastUsedAt) : "Not yet"}</td>
            </tr>
          ))}
        </PagedRows>
      </table>
    </div>
  );
}
