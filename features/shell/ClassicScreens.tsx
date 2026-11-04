import "server-only";
import Link from "next/link";
import type { AuthenticatedUser } from "@/types/auth";
import { ClassicMenu } from "@/features/shell/Classic";
import { classicModules, extraHotkeys, type ClassicModule } from "@/features/shell/classic-modules";
import { areasForUser } from "@/server/authorization/policy";
import type { MenuEntry } from "@/features/shell/Classic";
import { usersNav } from "@/features/shell/users-nav";
import { classicCounts, type ClassicCounts } from "@/lib/db/repositories/classic.repository";
import { isHiddenHref, navAccess } from "@/server/authorization/page-access";

// D-210 (owner sketch, Tally as reference): the Classic view's Gateway (the
// first screen after sign-in) and each module's menu with its summary boxes.
interface Box {
  label: string;
  value: number;
  href: string;
  alert?: boolean;
}

function boxesFor(key: string, counts: ClassicCounts, approver: boolean): Box[] {
  if (key === "approvals")
    return [
      // v1.49.5: a requester has no Waiting for me page in the navigation, so no box either.
      ...(approver ? [{ label: "Waiting for me", value: counts.waiting, href: "/users/queue", alert: counts.waiting > 0 }] : []),
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
            <span className={`mt-1 block text-[length:calc(28px*var(--text-scale,1))] font-bold leading-tight ${box.alert ? "text-danger-600" : "text-ink"}`}>{box.value}</span>
          </Link>
        </li>
      ))}
    </ul>
  );
}

async function load(user: AuthenticatedUser): Promise<{ modules: ClassicModule[]; counts: ClassicCounts; approver: boolean }> {
  // As in the sidebar: pages this person may not open (their modules, page access) are left out.
  const [nav, counts, access] = await Promise.all([usersNav(user), classicCounts(user.id), navAccess(user)]);
  const visible = nav.filter((item) => !isHiddenHref(item.href, access.hidden));
  return { modules: classicModules(visible.map((item) => (item.href === "/users/queue" ? { ...item, count: counts.waiting } : item))), counts, approver: !isHiddenHref("/users/queue", access.hidden) };
}

const noteFor = (entry: ClassicModule, counts: ClassicCounts) =>
  entry.key === "approvals" && counts.waiting ? `${counts.waiting} waiting` : entry.key === "tasks" && counts.myOpenTasks ? `${counts.myOpenTasks} open` : entry.key === "information" && counts.infoUnread ? `${counts.infoUnread} unread` : undefined;

// Page 2 of the owner's sketch: one box, the Central Management System,
// listing the modules.
export async function ClassicGateway({ user }: { user: AuthenticatedUser }) {
  const { modules, counts } = await load(user);
  // D-214: ways out, as in Tally: the person's other spaces, then Quit (sign out).
  const SPACE_NAME = { admin: "Admin space", superadmin: "Super Admin space" } as const;
  const others = areasForUser(user).filter((area): area is "admin" | "superadmin" => area !== "users");
  const extraLabels = [...others.map((area) => SPACE_NAME[area]), "Quit (sign out)"];
  const extraKeys = extraHotkeys(extraLabels, modules.map((entry) => entry.hotkey));
  const entries: MenuEntry[] = [
    ...modules.map((entry) => ({ href: entry.href, label: entry.label, hotkey: entry.hotkey, note: noteFor(entry, counts) })),
    ...others.map((area, index) => ({ href: `/${area}`, label: SPACE_NAME[area], hotkey: extraKeys[index] ?? "" })),
    { href: "/login", label: "Quit (sign out)", hotkey: extraKeys.at(-1) ?? "", action: "signout" as const },
  ];
  return (
    <div className="mx-auto max-w-md space-y-2 pt-4 sm:pt-10" data-testid="classic-gateway">
      <h1 className="sr-only">Central Management System</h1>
      <ClassicMenu title="Central Management System" testId="gateway-menu" entries={entries} />
      <p className="text-center text-caption text-ink-faint">↑ ↓ to move, Enter to open, or press the highlighted letter. Esc goes back.</p>
    </div>
  );
}

// Page 3 of the sketch: the module (its pages are the tabs above, from
// ClassicBar) and its boxes.
export async function ClassicModuleMenu({ user, moduleKey }: { user: AuthenticatedUser; moduleKey: string }) {
  const { modules, counts, approver } = await load(user);
  const entry = modules.find((item) => item.key === moduleKey && item.pages.length > 1);
  if (!entry) return null;
  return (
    <div className="space-y-6" data-testid="classic-module">
      <h1 className="text-title font-semibold">{entry.label}</h1>
      <Boxes boxes={boxesFor(entry.key, counts, approver)} />
      <p className="text-caption text-ink-faint">Choose a page above, or press its highlighted letter. Esc goes back.</p>
    </div>
  );
}
