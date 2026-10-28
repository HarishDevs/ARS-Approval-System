import type { Metadata } from "next";
import Link from "next/link";
import { requireArea } from "@/server/authorization/guards";
import { PageHeader } from "@/features/shell/PageHeader";
import { CommandButton } from "@/features/integrations/CalendarForms";
import { listRules } from "@/lib/db/repositories/notification-rules.repository";
import { describeStage, KIND_LABEL, MODULE_LABEL, OPERATOR_LABEL, STANDARD_FIELDS } from "@/server/notifications/rule-model";
import { formatIndiaTime } from "@/server/notifications/security-messages";
import { ruleCommandAction } from "./actions";

export const metadata: Metadata = { title: "Reminders & escalations" };
export const dynamic = "force-dynamic";

// D-209 (owner): reminders and escalations for approvals and tasks, on any
// field and value, at any level. The fixed response-time reminders set on
// each approval step keep working alongside these rules.
export default async function RemindersPage() {
  await requireArea("admin");
  const rules = await listRules();
  const fieldLabel = (module: "APPROVAL" | "TASK", key: string) => STANDARD_FIELDS[module].find((field) => field.key === key)?.label ?? key.replace(/^form\./, "Form: ");
  return (
    <>
      <PageHeader title="Reminders & escalations" description="Rules that remind people about pending approvals and open tasks, and escalate late ones by email, on any field and value. They run with the job runner, about every 5 minutes. The response times set on approval steps keep their own reminders.">
        <Link href="/admin/reminders/new" className="btn-primary btn-compact">
          New rule
        </Link>
      </PageHeader>
      {rules.length === 0 ? (
        <p className="card px-5 py-6 text-ink-muted">No rules yet. Create one to remind people or escalate late work.</p>
      ) : (
        <ul className="space-y-3" data-testid="rules-list">
          {rules.map((rule) => (
            <li key={rule.id} className="card space-y-2 px-5 py-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="min-w-0">
                  <Link href={`/admin/reminders/${rule.id}`} className="font-semibold text-primary-700 hover:underline">
                    {rule.name}
                  </Link>
                  <p className="text-label text-ink-muted">
                    {KIND_LABEL[rule.kind]} · {MODULE_LABEL[rule.module]} · {rule.email ? "inbox and email" : "inbox only"} · {rule.active ? "On" : "Off"}
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <CommandButton action={ruleCommandAction} fields={{ id: rule.id, command: rule.active ? "off" : "on" }} label={rule.active ? "Turn off" : "Turn on"} />
                  <CommandButton action={ruleCommandAction} fields={{ id: rule.id, command: "delete" }} label="Delete" danger confirm={`Delete "${rule.name}"? Nothing more is sent from it.`} confirmLabel="Yes, delete" />
                </div>
              </div>
              <p className="text-label">
                <span className="text-ink-muted">When: </span>
                {rule.conditions.length === 0 ? "every record" : rule.conditions.map((condition) => `${fieldLabel(rule.module, condition.field)} ${OPERATOR_LABEL[condition.op]}${condition.value ? ` "${condition.value}"` : ""}`).join(rule.match === "ANY" ? " or " : " and ")}
              </p>
              <ol className="list-decimal pl-5 text-label">
                {rule.stages.map((stage, index) => (
                  <li key={index}>{describeStage(stage)}</li>
                ))}
              </ol>
              <p className="text-caption text-ink-faint">
                Changed {formatIndiaTime(rule.updatedAt)}
                {rule.updatedByName ? ` by ${rule.updatedByName}` : ""}
              </p>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
