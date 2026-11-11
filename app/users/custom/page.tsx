import type { Metadata } from "next";
import { FilePlus2 } from "lucide-react";
import Link from "next/link";
import { requireArea } from "@/server/authorization/guards";
import { PageHeader } from "@/features/shell/PageHeader";
import { CustomApprovalForm } from "@/features/requests/CustomApprovalForm";
import { loadBuilderOptions } from "@/features/admin/workflow-options";
import { findDraft } from "@/lib/db/repositories/drafts.repository";
import { listActiveUserOptions } from "@/lib/db/repositories/admin-users.repository";
import { loadCustomConfig } from "@/server/approvals/custom-config";
import { loadFieldLookups } from "@/lib/db/repositories/lookups.repository";
import { findRequest, findWorkflowVersion } from "@/lib/db/repositories/approvals.repository";
import { personProfile } from "@/lib/db/repositories/profile.repository";
import { loadRequestView } from "@/server/approvals/view";
import { followUpSource, followUpValues } from "@/server/approvals/follow-up";
import { formatIndiaTime } from "@/server/notifications/security-messages";
import { personLabel } from "@/lib/people/label";

// WEB-05 (v1.10.0): a plain, non-confidential browser title.
export const metadata: Metadata = { title: "New request" };

// F-33: any user, whenever needed (D-026, D-040).
export default async function CustomApprovalPage({ searchParams }: { searchParams: Promise<{ from?: string; followUp?: string }> }) {
  const { user } = await requireArea("users");
  const query = await searchParams;
  const options = await loadBuilderOptions();
  const draft = await findDraft(user.id, "CUSTOM");
  const everyone = (await listActiveUserOptions()).map((person) => ({ id: person.id, label: personLabel(person), detail: person.departmentName ?? undefined }));
  const collaboratorOptions = everyone.filter((person) => person.id !== user.id);
  // v1.8.0: the fields and step options IT set up (Admin → Custom approval).
  const config = await loadCustomConfig();
  const lookups = config.form.some((field) => field.type === "LOOKUP") ? await loadFieldLookups() : undefined;
  // D-234 (Tesler, Working memory): "Raise again like this" on a custom
  // request the person raised: its title, details and approvers come back
  // (never files or decisions); the server checks everything again on submit.
  let again: { title: string; fields: Record<string, string>; requestNo: string } | null = null;
  const fromId = /^\d{1,10}$/.test(query.from ?? "") ? Number(query.from) : null;
  if (fromId) {
    const view = await loadRequestView(fromId, { id: user.id, roles: user.roles } as Parameters<typeof loadRequestView>[1]);
    if (view && view.requesterId === user.id && view.isCustom) {
      const record = await findRequest(fromId);
      const version = record ? await findWorkflowVersion(record.workflowVersionId) : null;
      if (version?.builder) {
        const copyable = new Set(config.form.filter((field) => field.type !== "ATTACHMENT" && field.type !== "SECTION").flatMap((field) => [field.key, `${field.key}__lines`]));
        const fields = Object.fromEntries(Object.entries(view.rawFields).filter(([key]) => copyable.has(key)));
        again = { title: view.title, fields: { ...fields, spec: JSON.stringify({ stages: version.builder.stages }) }, requestNo: view.requestNo };
      }
    }
  }
  // v1.50.3 (owner: "raise a follow-up is not working"): a follow-up can be
  // raised as a new request: matching details are copied in, and on submit it
  // is linked to the approved request (the server checks access again).
  const followUpId = /^\d{1,10}$/.test(query.followUp ?? "") ? Number(query.followUp) : null;
  const followUp = followUpId ? await followUpSource(followUpId, { id: user.id, roles: user.roles }) : null;
  const followUpInitial = followUp ? { title: `Follow-up: ${followUp.title}`.slice(0, 200), fields: followUpValues(config.form, followUp) } : null;
  // D-234 (Default effect): a new request starts with the reporting manager
  // as the first approver, when they may approve (easy to change).
  const managerId = (await personProfile(user.id).catch(() => null))?.managerId ?? null;
  const defaultApproverId = managerId && managerId !== user.id && options.people.some((person) => person.id === managerId) ? managerId : null;
  return (
    <>
      <PageHeader title="New request" icon={FilePlus2} description="You choose who approves and in what order. For a standard approval type, use Request templates.">
        <Link href="/users/new" className="link text-label">
          Request templates
        </Link>
      </PageHeader>
      {again && (
        <p role="status" className="mb-4 rounded-md bg-primary-50 px-4 py-2 text-label text-primary-700" data-testid="raised-again">
          Started from your request {again.requestNo}: the title, details and approvers were copied. Check them, and add any files again, before you submit.
        </p>
      )}
      {followUp && (
        <p role="status" className="mb-4 rounded-md bg-primary-50 px-4 py-2 text-label text-primary-700" data-testid="follow-up-of">
          Raising a follow-up to {followUp.requestNo}. Matching details were copied; it goes through its own approval and is linked to {followUp.requestNo}.
        </p>
      )}
      <CustomApprovalForm
        key={followUp ? `follow-${followUp.id}` : again ? `again-${fromId}` : "new"}
        followUpOf={followUp?.id}
        expiredSource={followUp?.expired && followUp.validUntil ? { requestNo: followUp.requestNo, expiredOn: formatIndiaTime(followUp.validUntil) } : undefined}
        defaultApproverId={defaultApproverId}
        options={options}
        collaboratorOptions={collaboratorOptions}
        fields={config.form}
        policy={config.policy}
        lookups={lookups}
        people={everyone}
        initial={followUpInitial ?? (again ? { title: again.title, fields: again.fields } : draft ? { title: draft.title, fields: draft.fields } : undefined)}
        draft={followUp ? undefined : { key: "CUSTOM", version: draft?.version ?? null, savedAt: draft ? draft.updatedAt.toISOString() : null }}
      />
    </>
  );
}
