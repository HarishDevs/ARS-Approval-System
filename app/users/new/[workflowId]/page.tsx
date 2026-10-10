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
import { followUpSource, followUpValues } from "@/server/approvals/follow-up";
import { prefill, SOURCE_LABEL } from "@/server/approvals/autofill";
import { listTemplates } from "@/lib/db/repositories/templates.repository";
import { TemplatePicker } from "@/features/requests/Templates";
import { featureOn } from "@/server/settings/features";

export default async function RaiseRequestPage({ params, searchParams }: { params: Promise<{ workflowId: string }>; searchParams: Promise<{ followUp?: string; template?: string; from?: string; refresh?: string }> }) {
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
  // v1.6.1: anyone active can be a collaborator (not the requester).
  const collaboratorOptions = (await listActiveUserOptions()).filter((person) => person.id !== user.id).map((person) => ({ id: person.id, label: `${person.name} (${person.loginId})` }));
  const approverPeople = approverFields.length ? (await listApproverOptions()).map((person) => ({ id: person.id, label: `${person.name} (${person.loginId})` })) : undefined;
  // #3: the person's own draft for this type, if any (scoped by user id).
  const draftKey = `WF:${workflow.id}`;
  const draft = await findDraft(user.id, draftKey);
  // EN-08: a follow-up of an approved request (access-checked again here).
  const query = await searchParams;
  const idOf = (value: string | undefined) => (value && /^\d{1,10}$/.test(value) ? Number(value) : null);
  const raw = query.followUp;
  const source = await followUpSource(idOf(raw), { id: user.id, roles: user.roles });
  const followUpInitial = source ? followUpValues(version.form, source) : null;
  // FN4: a template or an earlier request the person chose explicitly wins
  // over the draft; otherwise the draft (their own typing) wins. Profile
  // values only fill fields that are still empty.
  const templatesOn = await featureOn("templates", user);
  const explicit = templatesOn && (idOf(query.template) !== null || idOf(query.from) !== null);
  const filled = await prefill({ user: { id: user.id, roles: user.roles }, workflowId: workflow.id, form: version.form, templateId: templatesOn ? idOf(query.template) : null, fromRequestId: templatesOn ? idOf(query.from) : null });
  const templates = templatesOn ? await listTemplates(user.id, workflow.id) : [];
  const base: Record<string, string> = explicit ? filled.values : { ...(followUpInitial ?? draft?.fields ?? {}) };
  const sources: Record<string, string> = explicit ? { ...filled.sources } : Object.fromEntries(Object.keys(followUpInitial ?? {}).map((key) => [key, "follow-up"]));
  // A11: "Refresh from profile" puts the profile's current values back, even
  // over a draft or a copied value.
  const refresh = query.refresh === "profile";
  for (const [key, value] of Object.entries(filled.values)) {
    if (filled.sources[key] === "profile" && (refresh || !base[key])) {
      base[key] = value;
      sources[key] = "profile";
    }
  }
  const profileFields = version.form.some((field) => field.type === "LOOKUP" && (field.source === "DEPARTMENT" || field.source === "DESIGNATION"));
  const refreshHref = `/users/new/${workflow.id}?${new URLSearchParams({ ...(query.template ? { template: query.template } : {}), ...(query.from ? { from: query.from } : {}), ...(query.followUp ? { followUp: query.followUp } : {}), refresh: "profile" }).toString()}`;

  return (
    <>
      <Breadcrumbs items={[{ href: "/users", label: "Overview" }, { href: "/users/new", label: "New request" }, { label: workflow.name }]} />
      <PageHeader title={workflow.name} description="Fill in the details. Approvers are chosen automatically from the rules IT has set.">
        <Link href="/users/new" className="link text-label">
          ← All types
        </Link>
      </PageHeader>
      {source && (
        <p role="status" className="mb-4 max-w-2xl rounded-md bg-primary-50 px-3 py-2 text-label text-primary-700">
          Follow-up to {source.requestNo}. Matching details were copied in; check them before you submit. It gets its own number and approvals, and the two are linked.
        </p>
      )}
      {explicit && filled.origin && (
        <p role="status" className="mb-4 max-w-2xl rounded-md bg-primary-50 px-3 py-2 text-label text-primary-700">
          Started from {filled.origin}. Check every value before you submit.
          {filled.dropped > 0 ? ` ${filled.dropped} value${filled.dropped === 1 ? "" : "s"} no longer match the form and ${filled.dropped === 1 ? "was" : "were"} left out.` : ""}
        </p>
      )}
      {profileFields && (
        <p className="mb-3 max-w-2xl text-label text-ink-muted">
          Department or designation changed?{" "}
          <Link href={refreshHref} className="link" data-testid="refresh-profile">
            Refresh from profile
          </Link>
          {refresh ? " · refreshed from your current profile." : ""}
        </p>
      )}
      {templates.length > 0 && <TemplatePicker workflowId={workflow.id} templates={templates.map((template) => ({ id: template.id, name: template.name }))} />}
      <div className="max-w-2xl">
        <RequestForm
          // Remount when the starting point changes (template / earlier request):
          // the editors take their starting values only once.
          key={`${query.template ?? ""}:${query.from ?? ""}:${query.followUp ?? ""}:${query.refresh ?? ""}`}
          followUpOf={source?.id}
          mode="submit"
          workflowId={workflow.id}
          fields={version.form}
          people={people}
          approverPeople={approverPeople}
          approverFields={approverFields}
          lookups={lookups}
          collaboratorOptions={collaboratorOptions}
          initial={base}
          sources={Object.fromEntries(Object.entries(sources).map(([key, value]) => [key, SOURCE_LABEL[value as keyof typeof SOURCE_LABEL] ?? ""]))}
          initialTitle={explicit ? (filled.title ?? undefined) : source ? `Follow-up: ${source.title}`.slice(0, 200) : draft?.title}
          draft={{ key: draftKey, version: draft?.version ?? null, savedAt: draft ? draft.updatedAt.toISOString() : null }}
        />
      </div>
    </>
  );
}
