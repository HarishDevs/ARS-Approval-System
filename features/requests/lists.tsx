import Link from "next/link";
import { RequestStatusPill } from "@/features/requests/StatusPill";
import { EmptyState } from "@/features/shell/PageHeader";
import { formatIndiaTime } from "@/server/notifications/security-messages";
import type { MyRequestItem, QueueItem } from "@/lib/db/repositories/approvals.repository";
import { SafeText } from "@/features/ui/SafeText";

export function QueueTable({ items }: { items: QueueItem[] }) {
  if (items.length === 0) return <EmptyState title="Nothing waiting for you" body="Requests that need your approval, and work given to you, appear here." />;
  return (
    <div className="card overflow-x-auto">
      <table className="data-table">
        <thead>
          <tr>
            <th>Request</th>
            <th>From</th>
            <th>Your step</th>
            <th>Waiting since</th>
            <th>Due</th>
          </tr>
        </thead>
        <tbody>
          {items.map((item) => (
            <tr key={item.taskKey + item.requestId}>
              <td>
                <Link href={`/users/requests/${item.requestId}`} className="link">
                  <SafeText text={item.title} />
                </Link>
                <p className="text-caption text-ink-muted">{item.requestNo}</p>
              </td>
              <td>{item.requesterName}</td>
              <td>
                {item.work && <span className="mr-1.5 rounded-full bg-primary-50 px-2 py-px text-caption font-semibold text-primary-700">To do</span>}
                {item.nodeLabel}
                {item.forName && <p className="text-caption text-ink-muted">for {item.forName} (you&apos;re covering)</p>}
              </td>
              <td className="whitespace-nowrap">{formatIndiaTime(item.createdAt)}</td>
              <td className="whitespace-nowrap">
                {item.dueAt ? (
                  <span className={item.overdue ? "font-semibold text-danger-600" : ""}>
                    {item.overdue ? "Overdue · " : ""}
                    {formatIndiaTime(item.dueAt)}
                  </span>
                ) : (
                  <span className="text-ink-faint">—</span>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function MyRequestsTable({ items }: { items: MyRequestItem[] }) {
  if (items.length === 0) {
    return <EmptyState title="No requests yet" body="Raise a request and follow every level of approval here." />;
  }
  return (
    <div className="card overflow-x-auto">
      <table className="data-table">
        <thead>
          <tr>
            <th>Request</th>
            <th>Type</th>
            <th>Status</th>
            <th>Waiting for</th>
            <th>Raised</th>
          </tr>
        </thead>
        <tbody>
          {items.map((item) => (
            <tr key={item.id}>
              <td>
                <Link href={`/users/requests/${item.id}`} className="link">
                  <SafeText text={item.title} />
                </Link>
                <p className="text-caption text-ink-muted">{item.requestNo}</p>
              </td>
              <td>{item.workflowName}</td>
              <td>
                <RequestStatusPill status={item.status} />
              </td>
              <td className="text-ink-muted">{item.status === "IN_PROGRESS" || item.status === "ON_HOLD" ? (item.pendingWith ?? "—") : "—"}</td>
              <td className="whitespace-nowrap">{formatIndiaTime(item.submittedAt)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
