import type { Metadata } from "next";
import Link from "next/link";
import { requireArea } from "@/server/authorization/guards";
import { PageHeader } from "@/features/shell/PageHeader";
import { ProfileTabs } from "@/features/shell/ProfileTabs";
import { NotificationCenter } from "@/features/shell/NotificationCenter";
import { CHANNELS, channelWanted, DND_SETTING, dndHolds, EVENT_GROUPS, eventLabel, parseDnd } from "@/server/notifications/preferences";
import { loadOptOuts } from "@/lib/db/repositories/preferences.repository";
import { getUserSetting } from "@/lib/db/repositories/user-settings.repository";

// WEB-05 (v1.10.0): a plain, non-confidential browser title.
export const metadata: Metadata = { title: "Notifications" };

// #6 (D-110) → D-231: the notification control centre for the whole app.
export default async function NotificationSettingsPage() {
  const { user } = await requireArea("users");
  const [off, digest, dndRaw] = await Promise.all([loadOptOuts(user.id), getUserSetting(user.id, "work.digest"), getUserSetting(user.id, DND_SETTING)]);
  const groups = EVENT_GROUPS.map((group) => ({
    key: group.key,
    label: group.label,
    help: group.help,
    mandatory: group.mandatory,
    events: group.events
      .filter((event) => !["SUPER_ADMIN_SIGNIN", "BREAK_GLASS_USED"].includes(event) || user.roles.includes("SUPER_ADMIN"))
      .map((event) => ({ key: event, label: eventLabel(event), on: Object.fromEntries(CHANNELS.map((channel) => [channel, channelWanted(event, channel, off)])) as Record<(typeof CHANNELS)[number], boolean> })),
  }));
  const dnd = parseDnd(dndRaw);
  const now = new Date();
  const paused = dnd.pausedUntil && Date.parse(dnd.pausedUntil) > now.getTime() ? dnd.pausedUntil : null;
  const pausedText = paused ? new Date(paused).toLocaleString("en-IN", { weekday: "short", day: "numeric", month: "short", hour: "numeric", minute: "2-digit", timeZone: "Asia/Kolkata" }) : null;
  return (
    <>
      <PageHeader title="Notifications" description="Choose what reaches you in the app, by email and on WhatsApp, kind by kind; pause them when you need quiet. Everything is always kept in your Inbox.">
        <Link href="/users/inbox" className="link text-label">
          Open the Inbox
        </Link>
      </PageHeader>
      <ProfileTabs />
      {dndHolds(dnd, now) && (
        <p role="status" className="mb-4 max-w-3xl rounded-md bg-warning-50 px-4 py-2 text-label text-warning-600">
          Do not disturb is on right now: email and WhatsApp wait (sign-in and security messages still come).
        </p>
      )}
      <div className="max-w-3xl">
        <NotificationCenter groups={groups} channels={[...CHANNELS]} digest={digest !== "OFF"} dnd={{ pausedUntil: paused, pausedText, quiet: dnd.quiet, daysOff: dnd.daysOff }} />
      </div>
    </>
  );
}
