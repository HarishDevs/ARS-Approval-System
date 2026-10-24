import type { Metadata } from "next";
import Link from "next/link";
import { PageHeader } from "@/features/shell/PageHeader";
import { Badge } from "@/features/ui/Display";
import { requireAiPage } from "@/features/ai/guard";
import { DASHBOARD_SECTIONS, sourceName } from "@/features/ai/sources";
import { ProviderNotice } from "@/features/ai/AiParts";
import { approvalsWaitingFor, myInformationSummary, myRequestsSummary, myTasksSummary } from "@/lib/db/repositories/ai-data.repository";
import { listConversations, listProposalsToDecide } from "@/lib/db/repositories/ai.repository";
import { loadAiSettings, routeFor } from "@/server/ai/config";
import { hasModule } from "@/server/modules/modules";
import { formatIndiaTime } from "@/server/notifications/security-messages";

export const metadata: Metadata = { title: "AI Dashboard" };
export const dynamic = "force-dynamic";

// D-169 (AI module branch): the AI dashboard. The person's own ARS figures
// are calculated here by code (never by the AI), for the modules they have,
// with their source and time. Business sections that need Salesforce or
// Oracle ERP say so until those are connected; nothing is invented.
export default async function AiDashboardPage() {
  const { user } = await requireAiPage();
  const isItAdmin = user.roles.includes("IT_ADMIN") || user.roles.includes("SUPER_ADMIN");
  const [settings, waiting, requests, tasks, info, toDecide, recent] = await Promise.all([
    loadAiSettings(),
    hasModule(user, "APPROVAL") ? approvalsWaitingFor(user.id) : null,
    hasModule(user, "APPROVAL") ? myRequestsSummary(user.id, 30) : null,
    hasModule(user, "TASK") ? myTasksSummary(user.id) : null,
    hasModule(user, "INFORMATION") ? myInformationSummary(user.id) : null,
    listProposalsToDecide(user.id, isItAdmin),
    listConversations(user.id, 3),
  ]);
  const readAt = formatIndiaTime(new Date());
  const tiles = [
    waiting && { label: "Approvals waiting for you", value: waiting.pending, sub: `${waiting.overdue} overdue`, href: "/users/queue" },
    requests && { label: "Requests you raised (30 days)", value: requests.submitted, sub: requests.averageHoursToClose === null ? "None closed yet" : `${requests.averageHoursToClose} h average to close`, href: "/users/requests" },
    tasks && { label: "Your open tasks", value: tasks.open + tasks.inProgress + tasks.blocked, sub: `${tasks.overdue} overdue · ${tasks.dueWithin7Days} due within 7 days`, href: "/users/tasks" },
    info && { label: "Unread information", value: info.unread, sub: `${info.awaitingMyAcknowledgement} to acknowledge`, href: "/users/information" },
    { label: "Suggestions waiting for your decision", value: toDecide.length, sub: "From the AI, for a person to decide", href: "/users/ai/insights" },
  ].filter(Boolean) as { label: string; value: number; sub: string; href: string }[];

  return (
    <>
      <PageHeader title="AI Dashboard" description="Your figures from ARS, business sections as sources connect, and the AI's suggestions. Each figure shows where it came from.">
        <Link href="/users/ai/assistant" className="btn-primary btn-compact">
          Ask the assistant
        </Link>
      </PageHeader>
      {routeFor(settings, false).length === 0 && (
        <div className="mb-4">
          <ProviderNotice isSuperAdmin={user.roles.includes("SUPER_ADMIN")} />
        </div>
      )}
      <section aria-labelledby="ars-live" className="mb-8">
        <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
          <h2 id="ars-live" className="text-card-title font-semibold">
            From ARS Approvals
          </h2>
          <span className="text-caption text-ink-muted">Live · read {readAt}</span>
        </div>
        <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3" data-testid="ai-live-tiles">
          {tiles.map((tile) => (
            <li key={tile.label}>
              <Link href={tile.href} className="card-link block px-5 py-4">
                <span className="block text-label text-ink-muted">{tile.label}</span>
                <span className="block text-2xl font-bold tabular-nums">{tile.value}</span>
                <span className="block text-caption text-ink-muted">{tile.sub}</span>
              </Link>
            </li>
          ))}
        </ul>
      </section>
      <section aria-labelledby="ai-business" className="mb-8">
        <h2 id="ai-business" className="mb-3 text-card-title font-semibold">
          Business performance
        </h2>
        <ul className="grid gap-3 md:grid-cols-2 xl:grid-cols-3" data-testid="ai-dashboard">
          {DASHBOARD_SECTIONS.filter((section) => section.needs.some((need) => need !== "ars")).map((section) => (
            <li key={section.title} className="card flex flex-col gap-2 px-5 py-4">
              <div className="flex items-start justify-between gap-2">
                <h3 className="font-semibold">{section.title}</h3>
                <Badge tone="neutral">No data yet</Badge>
              </div>
              <p className="text-label text-ink-muted">Needs: {section.needs.filter((need) => need !== "ars").map(sourceName).join(", ")}.</p>
            </li>
          ))}
        </ul>
        <p className="mt-3 text-label text-ink-muted">
          See <Link href="/users/ai/data-sources" className="link">Data Sources</Link> for what each source needs before it can be connected.
        </p>
      </section>
      {recent.length > 0 && (
        <section aria-labelledby="ai-recent">
          <h2 id="ai-recent" className="mb-3 text-card-title font-semibold">
            Your recent conversations
          </h2>
          <ul className="card divide-y divide-line">
            {recent.map((conversation) => (
              <li key={conversation.id} className="flex flex-wrap items-baseline justify-between gap-2 px-5 py-3">
                <Link href={`/users/ai/assistant?c=${conversation.id}`} className="link min-w-0 break-words">
                  {conversation.title}
                </Link>
                <span className="text-caption text-ink-muted">{formatIndiaTime(conversation.updatedAt)}</span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </>
  );
}
