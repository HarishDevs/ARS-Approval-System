import Link from "next/link";
import { Breadcrumbs } from "@/features/ui/Display";
import { notFound } from "next/navigation";
import { requireArea } from "@/server/authorization/guards";
import { PageHeader } from "@/features/shell/PageHeader";
import { RequestForm } from "@/features/requests/RequestForm";
import { findPublishedVersion, findWorkflow } from "@/lib/db/repositories/approvals.repository";
import { listActiveUserOptions } from "@/lib/db/repositories/admin-users.repository";
import { listApproverOptions } from "@/lib/db/repositories/approvers.repository";
import { approverFieldKeys } from "@/server/approvals/approver-rules";
import { loadFieldLookups } from "@/lib/db/repositories/lookups.repository";
import { findDraft } from "@/lib/db/repositories/drafts.repository";

export default async function RaiseRequestPage({ params }: { params: Promise<{ workflowId: string }> }) {
  const { user } = await requireArea("users");
  const { workflowId } = await params;
  if (!/^\d+$/.test(workflowId)) notFound();
  const workflow = await findWorkflow(Number(workflowId));
  if (!workflow || !workflow.active || workflow.kind !== "PREDEFINED") notFound();
  const version = await findPublishedVersion(workflow.id);
  if (!version) notFound();
  const needsPeople = version.form.some((field) => field.type === "PERSON");
  const people = needsPeople ? (await listActiveUserOptions()).map((person) => ({ id: person.id, label: `${person.name} (${person.loginId})` })) : [];
  const approverFields = approverFieldKeys(version.definition);
  const lookups = version.form.some((field) => field.type === "LOOKUP") ? await loadFieldLookups() : undefined;
  const approverPeople = approverFields.length ? (await listApproverOptions()).map((person) => ({ id: person.id, label: `${person.name} (${person.loginId})` })) : undefined;
  // #3: the person's own draft for this type, if any (scoped by user id).
  const draftKey = `WF:${workflow.id}`;
  const draft = await findDraft(user.id, draftKey);

  return (
    <>
      <Breadcrumbs items={[{ href: "/users", label: "My work" }, { href: "/users/new", label: "New request" }, { label: workflow.name }]} />
      <PageHeader title={workflow.name} description="Fill in the details. Approvers are chosen automatically from the rules IT has set.">
        <Link href="/users/new" className="link text-label">
          ← All types
        </Link>
      </PageHeader>
      <div className="max-w-2xl">
        <RequestForm
          mode="submit"
          workflowId={workflow.id}
          fields={version.form}
          people={people}
          approverPeople={approverPeople}
          approverFields={approverFields}
          lookups={lookups}
          initial={draft?.fields}
          initialTitle={draft?.title}
          draft={{ key: draftKey, version: draft?.version ?? null, savedAt: draft ? draft.updatedAt.toISOString() : null }}
        />
      </div>
    </>
  );
}
