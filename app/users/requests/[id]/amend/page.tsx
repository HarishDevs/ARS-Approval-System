import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Breadcrumbs } from "@/features/ui/Display";
import { requireArea } from "@/server/authorization/guards";
import { PageHeader } from "@/features/shell/PageHeader";
import { RequestForm } from "@/features/requests/RequestForm";
import { listActiveUserOptions } from "@/lib/db/repositories/admin-users.repository";
import { listApproverOptions } from "@/lib/db/repositories/approvers.repository";
import { approverFieldKeys } from "@/server/approvals/approver-rules";
import { loadFieldLookups } from "@/lib/db/repositories/lookups.repository";
import { amendmentPlan, rawOf } from "@/server/approvals/amendments";
import { findDraft } from "@/lib/db/repositories/drafts.repository";

// WEB-05 (v1.10.0): a plain, non-confidential browser title.
export const metadata: Metadata = { title: "Amend request" };

// FN5: amend an approved request (D-120). Only the fields the approval type
// allows can change; the amendment is approved through the steps again.
export default async function AmendRequestPage({ params }: { params: Promise<{ id: string }> }) {
  const { user } = await requireArea("users");
  const { id } = await params;
  if (!/^\d{1,10}$/.test(id)) notFound();
  const planned = await amendmentPlan(Number(id), { id: user.id, roles: user.roles });
  if (!planned.ok && planned.reason === "Not found.") notFound();
  const back = (
    <Link href={`/users/requests/${id}`} className="link text-label">
      ← Back to the request
    </Link>
  );
  if (!planned.ok) {
    return (
      <>
        <PageHeader title="Amend request">{back}</PageHeader>
        <p role="status" className="max-w-2xl rounded-md bg-warning-50 px-3 py-2 text-label text-warning-600">
          {planned.reason}
        </p>
      </>
    );
  }
  const { plan } = planned;
  const version = plan.version;
  const needsPeople = version.form.some((field) => field.type === "PERSON");
  const people = needsPeople ? (await listActiveUserOptions()).map((person) => ({ id: person.id, label: `${person.name} (${person.loginId})` })) : [];
  const approverFields = approverFieldKeys(version.definition);
  const lookups = version.form.some((field) => field.type === "LOOKUP") ? await loadFieldLookups() : undefined;
  const approverPeople = approverFields.length ? (await listApproverOptions()).map((person) => ({ id: person.id, label: `${person.name} (${person.loginId})` })) : undefined;
  // A11: the requester's own amendment draft. Only amendable fields and the
  // reason come back from it; everything else is the effective value.
  const draftKey = `AM:${plan.original.id}`;
  const draft = await findDraft(user.id, draftKey);
  const allowed = new Set([...plan.amendable.map((field) => field.key), ...plan.amendable.map((field) => `${field.key}__lines`), "amendReason"]);
  const initial = { ...rawOf(plan.effective), ...Object.fromEntries(Object.entries(draft?.fields ?? {}).filter(([key]) => allowed.has(key))) };

  return (
    <>
      <Breadcrumbs items={[{ href: "/users", label: "Overview" }, { href: `/users/requests/${plan.original.id}`, label: plan.original.requestNo }, { label: "Amend" }]} />
      <PageHeader title={`Amend ${plan.original.requestNo}`} description="Change what the approval type allows. The approval steps run again on the new values; the original approval stays on record.">
        {back}
      </PageHeader>
      {plan.inProgress ? (
        <p role="status" className="max-w-2xl rounded-md bg-warning-50 px-3 py-2 text-label text-warning-600">
          Amendment{" "}
          <Link href={`/users/requests/${plan.inProgress.amendmentId}`} className="link">
            {plan.inProgress.requestNo}
          </Link>{" "}
          is still in progress. Wait for its decision, or withdraw it, before raising another.
        </p>
      ) : (
        <div className="max-w-2xl">
          <RequestForm
            mode="submit"
            workflowId={plan.workflow.id}
            fields={version.form}
            people={people}
            approverPeople={approverPeople}
            approverFields={approverFields}
            lookups={lookups}
            initial={initial}
            draft={{ key: draftKey, version: draft?.version ?? null, savedAt: draft ? draft.updatedAt.toISOString() : null }}
            amendment={{ originalId: plan.original.id, originalNo: plan.original.requestNo, title: plan.original.title, amendable: plan.amendable.map((field) => field.key) }}
          />
        </div>
      )}
    </>
  );
}
