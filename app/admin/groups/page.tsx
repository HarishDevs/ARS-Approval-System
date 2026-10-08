import Link from "next/link";
import { PageHeader } from "@/features/shell/PageHeader";
import { GroupEditor, NewGroupForm } from "@/features/admin/GroupForms";
import { requireArea } from "@/server/authorization/guards";
import { listGroups } from "@/lib/db/repositories/groups.repository";
import { listApproverOptions } from "@/lib/db/repositories/approvers.repository";

export default async function GroupsPage() {
  await requireArea("admin");
  const [groups, people] = await Promise.all([listGroups(), listApproverOptions()]);
  const options = people.map((person) => ({ id: person.id, label: `${person.name} (${person.loginId})` }));
  return (
    <>
      <PageHeader title="Approver groups" description="A group can be an approver on any step, e.g. any one of the Finance checkers. Changes apply to steps that start after the change.">
        <Link href="/admin/import?kind=groups" className="btn-secondary btn-compact">
          Import
        </Link>
      </PageHeader>
      <section className="card divide-y divide-line">
        {groups.map((group) => (
          <GroupEditor key={group.id} group={group} people={options} />
        ))}
        <NewGroupForm />
      </section>
    </>
  );
}
