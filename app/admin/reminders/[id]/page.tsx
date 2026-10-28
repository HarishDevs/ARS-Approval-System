import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { requireArea } from "@/server/authorization/guards";
import { PageHeader } from "@/features/shell/PageHeader";
import { NotificationRuleEditor } from "@/features/admin/NotificationRuleEditor";
import { NEW_RULE } from "@/server/notifications/rule-model";
import { findRule, formFieldOptions } from "@/lib/db/repositories/notification-rules.repository";
import { listActiveUserOptions } from "@/lib/db/repositories/admin-users.repository";

export const metadata: Metadata = { title: "Reminder or escalation rule" };
export const dynamic = "force-dynamic";

// D-209: create ("new") or change one rule.
export default async function RuleEditorPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<Record<string, string | undefined>> }) {
  await requireArea("admin");
  const { id: raw } = await params;
  const id = raw === "new" ? null : /^\d{1,12}$/.test(raw) ? Number(raw) : NaN;
  if (Number.isNaN(id)) notFound();
  const rule = id === null ? null : await findRule(id);
  if (id !== null && !rule) notFound();
  const [approvalFields, taskFields, people] = await Promise.all([formFieldOptions("APPROVAL"), formFieldOptions("TASK"), listActiveUserOptions()]);
  const initial = rule ? { name: rule.name, kind: rule.kind, module: rule.module, active: rule.active, match: rule.match, conditions: rule.conditions, stages: rule.stages, email: rule.email, subject: rule.subject, body: rule.body } : NEW_RULE;
  return (
    <>
      <PageHeader title={rule ? rule.name : "New rule"} description="Choose what it applies to, the conditions, when and to whom it goes, and the message. Test it before turning it on.">
        <Link href="/admin/reminders" className="link text-label">
          All rules
        </Link>
      </PageHeader>
      {/* A new rule moves to its own address after saving; the confirmation comes along. */}
      {(await searchParams).saved === "1" && (
        <p role="status" className="mb-4 rounded-md bg-success-50 px-3 py-2 text-label text-success-600">
          Saved. The rule runs from the next job run (about every 5 minutes).
        </p>
      )}
      <NotificationRuleEditor id={id} initial={initial} formFields={{ APPROVAL: approvalFields, TASK: taskFields }} people={people.map((person) => ({ id: person.id, label: `${person.name} (${person.loginId})` }))} />
    </>
  );
}
