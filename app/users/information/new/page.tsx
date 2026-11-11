import type { Metadata } from "next";
import { Megaphone } from "lucide-react";
import { featureOn } from "@/server/settings/features";
import Link from "next/link";
import { notFound } from "next/navigation";
import { requireArea } from "@/server/authorization/guards";
import { EmptyState, PageHeader } from "@/features/shell/PageHeader";
import { Breadcrumbs } from "@/features/ui/Display";
import { InfoForm } from "@/features/modules/InfoForms";
import { listLiveTypes, versionWithType } from "@/lib/db/repositories/module-types.repository";
import { listPeopleFacts, personFacts } from "@/lib/db/repositories/tasks.repository";
import { findInfo, loadTargets } from "@/lib/db/repositories/info.repository";
import { loadFieldLookups } from "@/lib/db/repositories/lookups.repository";
import { listDepartments } from "@/lib/db/repositories/organisation.repository";
import { listGroups } from "@/lib/db/repositories/groups.repository";
import { mayCreate, parseInfoSettings, type InfoSettings } from "@/server/modules/settings";
import type { FormField } from "@/server/forms/fields";
import { personLabel } from "@/lib/people/label";

// WEB-05 (v1.10.0): a plain, non-confidential browser title.
export const metadata: Metadata = { title: "New information" };

export const dynamic = "force-dynamic";

// v1.9.0 (D-143): New information (or continue a draft with ?draft=ID).
export default async function NewInformationPage({ searchParams }: { searchParams: Promise<{ type?: string; draft?: string }> }) {
  const { user } = await requireArea("users");
  if (!(await featureOn("information", user))) notFound();
  const query = await searchParams;
  const me = await personFacts(user.id);
  let typeId: number;
  let typeName: string;
  let description: string | null = null;
  let form: FormField[];
  let settings: InfoSettings;
  let draft: Awaited<ReturnType<typeof findInfo>> = null;

  if (query.draft) {
    if (!/^\d{1,10}$/.test(query.draft)) notFound();
    draft = await findInfo(Number(query.draft));
    if (!draft || draft.createdBy !== user.id || draft.status !== "DRAFT") notFound();
    const ctx = await versionWithType(draft.typeVersionId);
    if (!ctx) notFound();
    typeId = ctx.type.id;
    typeName = ctx.type.name;
    form = ctx.version.form;
    settings = parseInfoSettings(ctx.version.settings);
  } else {
    const types = await listLiveTypes("INFO");
    const allowed = types.filter((type) => mayCreate(parseInfoSettings(type.settings).access, { id: user.id, departmentId: me?.departmentId ?? null }));
    const chosen = query.type && /^\d+$/.test(query.type) ? allowed.find((type) => type.typeId === Number(query.type)) : allowed.length === 1 ? allowed[0] : undefined;
    if (!chosen) {
      return (
        <>
          <PageHeader title="New information" icon={Megaphone} description="Choose the kind of information. Each has its own form, recipients and acknowledgement rules, set by IT." />
          {allowed.length === 0 ? (
            <EmptyState title="No information types for you yet" body="IT sets up the kinds of information in Admin → Information types. Ask them if you need one." />
          ) : (
            <ul className="grid gap-4 md:grid-cols-2 lg:grid-cols-3" data-testid="info-types">
              {allowed.map((type) => (
                <li key={type.typeId}>
                  <Link href={`/users/information/new?type=${type.typeId}`} className="card block h-full px-5 py-4 hover:border-primary-600">
                    <span className="font-semibold">{type.name}</span>
                    {type.description && <span className="mt-1 block text-label text-ink-muted">{type.description}</span>}
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </>
      );
    }
    typeId = chosen.typeId;
    typeName = chosen.name;
    description = chosen.description;
    form = chosen.form;
    settings = parseInfoSettings(chosen.settings);
  }

  const [people, departments, groups, lookups, targets] = await Promise.all([listPeopleFacts(), listDepartments(), listGroups(), loadFieldLookups(), draft ? loadTargets(draft.id) : Promise.resolve(null)]);
  const values = draft ? Object.fromEntries(Object.entries(draft.formData).map(([key, value]) => [key, Array.isArray(value) ? JSON.stringify(value) : String(value ?? "")])) : {};
  return (
    <>
      <Breadcrumbs items={[{ href: "/users/information", label: "Information" }, { href: "/users/information/new", label: "New information" }, { label: typeName }]} />
      <PageHeader title={draft ? `Draft ${draft.infoNo}: ${typeName}` : `New information: ${typeName}`} description={description ?? "Write it, choose who receives it, then publish (or save a draft)."} />
      <InfoForm
        typeId={typeId}
        infoId={draft?.id ?? null}
        rowVersion={draft?.rowVersion ?? null}
        form={form}
        people={people.filter((person) => person.id !== user.id).map((person) => ({ id: person.id, label: personLabel(person), detail: person.departmentName ?? undefined }))}
        departments={departments.filter((department) => department.active).map((department) => ({ id: department.id, label: department.name }))}
        groups={groups.filter((group) => group.active).map((group) => ({ id: group.id, label: group.name }))}
        lookups={lookups}
        allow={{ people: settings.allowPeople, departments: settings.allowDepartments, groups: settings.allowGroups, everyone: settings.allowEveryone }}
        ack={settings.ack}
        defaults={{
          title: draft?.title ?? "",
          body: draft?.body ?? "",
          priority: draft?.priority ?? settings.defaultPriority,
          askAck: draft?.ackRequired ?? false,
          effectiveOn: draft?.effectiveOn ?? "",
          expiresOn: draft?.expiresOn ?? "",
          people: targets?.people ?? [],
          departments: targets?.departments ?? [],
          groups: targets?.groups ?? [],
          everyone: targets?.everyone ?? false,
          values,
        }}
      />
    </>
  );
}
