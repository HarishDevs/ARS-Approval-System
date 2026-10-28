import "server-only";
import Link from "next/link";
import type { AuthenticatedUser } from "@/types/auth";
import { ClassicMenu } from "@/features/shell/Classic";
import { classicModules, pageHotkeys, type ClassicModule } from "@/features/shell/classic-modules";
import { usersNav } from "@/features/shell/users-nav";
import { classicCounts, type ClassicCounts } from "@/lib/db/repositories/classic.repository";
import { countUnread } from "@/lib/db/repositories/collab.repository";
import { isHiddenHref, navAccess } from "@/server/authorization/page-access";
import { displayName } from "@/features/shell/AppShell";

// D-210 (owner sketch, Tally as reference): the Classic view's Gateway (the
// first screen after sign-in) and each module's menu with its summary boxes.
const today = () => new Intl.DateTimeFormat("en-IN", { timeZone: "Asia/Kolkata", weekday: "long", day: "numeric", month: "long", year: "numeric" }).format(new Date());

interface Box {
  label: string;
  value: number;
  href: string;
  alert?: boolean;
}

function boxesFor(key: string, counts: ClassicCounts): Box[] {
  if (key === "approvals")
    return [
      { label: "Waiting for me", value: counts.waiting, href: "/users/queue", alert: counts.waiting > 0 },
      { label: "My pending requests", value: counts.myOpenRequests, href: "/users/requests?status=IN_PROGRESS" },
      { label: "Changes asked of me", value: counts.changesAsked, href: "/users/requests?status=CHANGES_REQUIRED", alert: counts.changesAsked > 0 },
    ];
  if (key === "tasks")
    return [
      { label: "My open tasks", value: counts.myOpenTasks, href: "/users/tasks" },
      { label: "My overdue tasks", value: counts.myOverdueTasks, href: "/users/tasks", alert: counts.myOverdueTasks > 0 },
      { label: "Assigned by me, open", value: counts.assignedByMeOpen, href: "/users/tasks/assigned" },
    ];
  if (key === "information")
    return [
      { label: "Unread", value: counts.infoUnread, href: "/users/information", alert: counts.infoUnread > 0 },
      { label: "Waiting for my acknowledgement", value: counts.infoAwaitingAck, href: "/users/information", alert: counts.infoAwaitingAck > 0 },
    ];
  return [];
}

function Boxes({ boxes }: { boxes: Box[] }) {
  if (!boxes.length) return null;
  return (
    <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3" data-testid="classic-boxes">
      {boxes.map((box) => (
        <li key={box.label}>
          <Link href={box.href} className="block rounded-md border border-line bg-surface px-4 py-3 hover:border-primary-600">
            <span className="block text-label text-ink-muted">{box.label}</span>
            <span className={`mt-1 block text-[28px] font-bold leading-tight ${box.alert ? "text-danger-600" : "text-ink"}`}>{box.value}</span>
          </Link>
        </li>
      ))}
    </ul>
  );
}

async function load(user: AuthenticatedUser): Promise<{ modules: ClassicModule[]; counts: ClassicCounts }> {
  // As in the sidebar: pages this person may not open (their modules, page access) are left out.
  const [nav, counts, access] = await Promise.all([usersNav(user), classicCounts(user.id), navAccess(user)]);
  const visible = nav.filter((item) => !isHiddenHref(item.href, access.hidden));
  return { modules: classicModules(visible.map((item) => (item.href === "/users/queue" ? { ...item, count: counts.waiting } : item))), counts };
}

const noteFor = (entry: ClassicModule, counts: ClassicCounts) =>
  entry.key === "approvals" && counts.waiting ? `${counts.waiting} waiting` : entry.key === "tasks" && counts.myOpenTasks ? `${counts.myOpenTasks} open` : entry.key === "information" && counts.infoUnread ? `${counts.infoUnread} unread` : undefined;

export async function ClassicGateway({ user }: { user: AuthenticatedUser }) {
  const [{ modules, counts }, unread] = await Promise.all([load(user), countUnread(user.id).catch(() => 0)]);
  return (
    <div className="mx-auto grid max-w-6xl gap-6 lg:grid-cols-[1fr_minmax(340px,440px)_1fr]" data-testid="classic-gateway">
      <section aria-label="Company" className="space-y-3 rounded-md border border-line bg-surface px-5 py-4 text-label">
        <p className="text-caption font-semibold uppercase tracking-wider text-ink-faint">Current company</p>
        <p className="text-body font-semibold">ARS Steels &amp; Alloy International Pvt. Ltd.</p>
        <p className="text-caption font-semibold uppercase tracking-wider text-ink-faint">Signed in as</p>
        <p className="text-body">{displayName(user.name)}</p>
        <p className="text-caption font-semibold uppercase tracking-wider text-ink-faint">Today</p>
        <p className="text-body">{today()}</p>
      </section>
      <div className="space-y-2">
        <h1 className="sr-only">Gateway of ARS-CMS</h1>
        <ClassicMenu title="Gateway of ARS-CMS" testId="gateway-menu" entries={modules.map((entry) => ({ href: entry.href, label: entry.label, hotkey: entry.hotkey, note: noteFor(entry, counts) }))} />
        <p className="text-center text-caption text-ink-faint">↑ ↓ to move, Enter to open, or press the highlighted letter. Esc goes back.</p>
      </div>
      <section aria-label="At a glance" className="space-y-2 rounded-md border border-line bg-surface px-5 py-4 text-label">
        <p className="text-caption font-semibold uppercase tracking-wider text-ink-faint">At a glance</p>
        {[
          { label: "Waiting for me", value: counts.waiting, href: "/users/queue" },
          { label: "My pending requests", value: counts.myOpenRequests, href: "/users/requests" },
          { label: "My open tasks", value: counts.myOpenTasks, href: "/users/tasks" },
          { label: "Unread information", value: counts.infoUnread, href: "/users/information" },
          { label: "Unread notifications", value: unread, href: "/users/notifications" },
        ].map((item) => (
          <Link key={item.label} href={item.href} className="flex items-center justify-between rounded px-2 py-1 hover:bg-surface-muted">
            <span>{item.label}</span>
            <span className={`font-semibold ${item.value ? "text-ink" : "text-ink-faint"}`}>{item.value}</span>
          </Link>
        ))}
      </section>
    </div>
  );
}

export async function ClassicModuleMenu({ user, moduleKey }: { user: AuthenticatedUser; moduleKey: string }) {
  const { modules, counts } = await load(user);
  const entry = modules.find((item) => item.key === moduleKey && item.pages.length > 1);
  if (!entry) return null;
  const keys = pageHotkeys(entry.pages);
  return (
    <div className="mx-auto max-w-5xl space-y-6" data-testid="classic-module">
      <h1 className="sr-only">{entry.label}</h1>
      <div className="grid gap-6 md:grid-cols-[minmax(300px,380px)_1fr]">
        <ClassicMenu title={entry.label} testId="module-menu" entries={entry.pages.map((page, index) => ({ href: page.href, label: page.label, hotkey: keys[index] ?? "", note: page.count ? `${page.count}` : undefined }))} />
        <Boxes boxes={boxesFor(entry.key, counts)} />
      </div>
    </div>
  );
}
