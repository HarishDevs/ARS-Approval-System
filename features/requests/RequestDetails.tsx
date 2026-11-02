import Link from "next/link";
import {
  AtSign,
  Briefcase,
  Building2,
  Calculator,
  CalendarDays,
  CheckSquare,
  ClipboardList,
  FileText,
  Flag,
  Hash,
  IndianRupee,
  Link2,
  List,
  ListChecks,
  Mail,
  MessageSquareText,
  Paperclip,
  Phone,
  Search,
  Table2,
  Type,
  User,
  UserCheck,
  Workflow,
  type LucideIcon,
} from "lucide-react";
import { Hint } from "@/features/ui/Hint";
import { Email, SafeText } from "@/features/ui/SafeText";
import { ChoicePill, ChoicePills } from "@/features/ui/ChoicePill";
import { AttachmentList, type AttachmentRow } from "@/features/requests/AttachmentList";
import { fieldIconKind, type FieldIconKind } from "@/features/requests/request-page";
import { formatPaise } from "@/server/forms/dynamic";
import type { RequestView } from "@/server/approvals/view";

// v1.49 (owner's layout, 2 Nov 2026): the "Request details" card. Two
// columns of icon + label + value rows: who raised it (D-263: name and
// department first), then the request's own form fields, each with an icon
// for its kind. Confidential values arrive already hidden from the server
// (A8); an empty value is "—".
const FIELD_ICON: Record<FieldIconKind, LucideIcon> = {
  text: Type,
  longText: MessageSquareText,
  number: Hash,
  money: IndianRupee,
  date: CalendarDays,
  link: Link2,
  person: User,
  department: Building2,
  priority: Flag,
  choice: List,
  check: CheckSquare,
  file: Paperclip,
  table: Table2,
  lookup: Search,
  calc: Calculator,
  email: Mail,
  phone: Phone,
};

// dl > div > (dt, dd) only (axe definition-list): the icon sits in the dt.
function Row({ icon: Icon, label, children, wide = false, testId }: { icon: LucideIcon; label: string; children: React.ReactNode; wide?: boolean; testId?: string }) {
  return (
    <div className={`request-row min-w-0 border-b border-line py-2 ${wide ? "sm:col-span-2" : "grid grid-cols-[minmax(0,9.5rem)_minmax(0,1fr)] items-start gap-x-3"}`} data-testid={testId}>
      <dt className="flex items-start gap-2 text-label text-ink-muted">
        <Icon aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0" />
        <span className="min-w-0 break-words">{label}</span>
      </dt>
      <dd className={`min-w-0 break-words font-medium ${wide ? "mt-1" : ""}`}>{children}</dd>
    </div>
  );
}

const GRID = "grid gap-x-8 sm:grid-cols-2";

export interface RequesterProfile {
  name: string | null;
  loginId: string | null;
  departmentName: string | null;
  designationName: string | null;
  email: string | null;
  managerName: string | null;
  managerDesignation: string | null;
}

type Field = RequestView["fields"][number];

function FieldValue({ field, view, files }: { field: Field; view: RequestView; files: AttachmentRow[] }) {
  if (field.lines?.length) {
    return (
      <div className="overflow-x-auto rounded-md border border-line">
        <table className="data-table">
          <caption className="sr-only">{field.label}</caption>
          <thead>
            <tr>
              <th scope="col">Description</th>
              <th scope="col" className="text-right">
                Qty
              </th>
              <th scope="col" className="text-right">
                Rate
              </th>
              <th scope="col" className="text-right">
                GST %
              </th>
              <th scope="col" className="text-right">
                Total
              </th>
            </tr>
          </thead>
          <tbody>
            {field.lines.map((line, index) => (
              <tr key={index}>
                <td>
                  <SafeText text={line.description} />
                </td>
                <td className="text-right tabular-nums">{line.quantity}</td>
                <td className="text-right tabular-nums">{formatPaise(Math.round(Number(line.rate) * 100))}</td>
                <td className="text-right tabular-nums">{line.gst}</td>
                <td className="text-right tabular-nums">{formatPaise(line.totalPaise)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="border-t border-line px-4 py-2 text-right font-semibold tabular-nums">Total {field.value}</p>
      </div>
    );
  }
  if (field.files) {
    return field.files.length ? (
      <div className="font-normal">
        <AttachmentList files={files.filter((file) => field.files!.includes(file.id))} />
      </div>
    ) : (
      <span className="text-ink-muted">No files</span>
    );
  }
  // The Priority field wears its colour (v1.47.0), unless hidden for this viewer.
  if (field.key.toLowerCase() === "priority" && view.priority && !view.priority.hidden && field.value !== "—") {
    return view.priority.color ? (
      <ChoicePill label={view.priority.label} color={view.priority.color} className="text-caption" />
    ) : (
      <span className="inline-flex rounded-full border border-line px-2 py-px text-caption font-semibold text-ink-muted">{view.priority.label}</span>
    );
  }
  if (field.pills) return <ChoicePills values={field.pills} />;
  if (!field.value.trim()) return <span className="text-ink-muted">—</span>;
  return (
    <span className="whitespace-pre-wrap">
      <SafeText text={field.value} />
    </span>
  );
}

export function RequestDetails({ view, requester, raisedOn, files }: { view: RequestView; requester: RequesterProfile | null; raisedOn: string | null; files: AttachmentRow[] }) {
  const typeOf = new Map(view.form.map((field) => [field.key, field.type]));
  return (
    <section className="card px-5 py-4" aria-labelledby="request-details">
      <h2 id="request-details" className="mb-2 flex items-center gap-2 font-semibold">
        <ClipboardList aria-hidden="true" className="h-4 w-4 shrink-0 text-primary-600" />
        Request details
        {view.confidentialHidden && <Hint text="Some values are confidential: only the requester, the approvers and IT see them." align="start" />}
      </h2>
      <div data-testid="requester-details">
        {/* Owner (D-263): the requester's name and department first, side by side. */}
        <dl className={GRID} data-testid="requester-headline">
          <Row icon={User} label="Requested by">
            <Link href={`/users/people/${view.requesterId}`} className="link">
              {requester?.name ?? view.requesterName}
            </Link>
            {requester?.loginId && <span className="ml-1.5 inline-flex rounded-full border border-line bg-surface-muted px-2 py-px align-middle text-caption font-normal text-ink-muted">{requester.loginId}</span>}
          </Row>
          <Row icon={Building2} label="Department">
            {requester?.departmentName ?? "—"}
          </Row>
        </dl>
        <dl className={GRID}>
          <Row icon={Briefcase} label="Designation">
            {requester?.designationName ?? "—"}
          </Row>
          <Row icon={AtSign} label="Email">
            {requester?.email ? (
              // A long address wraps on a phone instead of pushing the page sideways.
              <span className="break-all [&>span]:whitespace-normal">
                <Email address={requester.email} />
              </span>
            ) : (
              "—"
            )}
          </Row>
          <Row icon={UserCheck} label="Reporting manager">
            {requester?.managerName ? `${requester.managerName}${requester.managerDesignation ? ` (${requester.managerDesignation})` : ""}` : "—"}
          </Row>
          <Row icon={Hash} label="Request no.">
            {view.requestNo}
          </Row>
          <Row icon={CalendarDays} label="Raised on">
            {raisedOn ?? "—"}
          </Row>
          <Row icon={Workflow} label="Approval type">
            {view.workflowName}
          </Row>
          <Row icon={FileText} label="Subject">
            <SafeText text={view.title} />
          </Row>
        </dl>
      </div>
      {view.fields.length > 0 && (
        <dl className={GRID} data-testid="request-fields">
          {view.fields.map((field) => {
            const kind = fieldIconKind({ type: typeOf.get(field.key), key: field.key, label: field.label });
            return (
              <Row key={field.key} icon={field.pills && kind === "choice" ? ListChecks : FIELD_ICON[kind]} label={field.label} wide={Boolean(field.lines?.length || field.files?.length)}>
                <FieldValue field={field} view={view} files={files} />
              </Row>
            );
          })}
        </dl>
      )}
    </section>
  );
}
