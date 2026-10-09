import { requireArea } from "@/server/authorization/guards";
import { ProfileTabs } from "@/features/shell/ProfileTabs";
import { PageHeader } from "@/features/shell/PageHeader";
import { DelegationForm } from "@/features/requests/DelegationForms";
import { DelegationList } from "@/features/requests/DelegationList";
import { indiaToday, listDelegationsInvolving } from "@/lib/db/repositories/collab.repository";
import { listApproverOptions } from "@/lib/db/repositories/approvers.repository";

// F-30 out of office: the delegate sees and decides your approvals while
// it's active; every decision records both names.
export default async function DelegationPage() {
  const { user } = await requireArea("users");
  const [items, people, today] = await Promise.all([listDelegationsInvolving(user.id), listApproverOptions(), indiaToday()]);
  const options = people.filter((person) => person.id !== user.id).map((person) => ({ id: person.id, label: `${person.name} (${person.loginId})` }));
  return (
    <>
      <PageHeader
        title="Out of office"
        description="Name someone to approve for you while you're away (up to 90 days). They act on your behalf and both names are recorded. They can't approve their own requests."
      />
      <ProfileTabs />
      <div className="grid gap-6 xl:grid-cols-2">
        <section className="card">
          <h2 className="border-b border-line px-5 py-4 font-semibold">Set out of office</h2>
          <DelegationForm people={options} today={today} />
        </section>
        <section className="card">
          <h2 className="border-b border-line px-5 py-4 font-semibold">Yours and the ones you cover</h2>
          <DelegationList items={items} personId={user.id} canEnd />
        </section>
      </div>
    </>
  );
}
