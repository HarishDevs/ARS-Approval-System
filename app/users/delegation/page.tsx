import type { Metadata } from "next";
import { requireArea } from "@/server/authorization/guards";
import { ProfileTabs } from "@/features/shell/ProfileTabs";
import { PageHeader } from "@/features/shell/PageHeader";
import { Hint } from "@/features/ui/Hint";
import { DelegationForm } from "@/features/requests/DelegationForms";
import { DelegationList } from "@/features/requests/DelegationList";
import { indiaToday, listDelegationsInvolving } from "@/lib/db/repositories/collab.repository";
import { listApproverOptions } from "@/lib/db/repositories/approvers.repository";
import { listPendingTasksFor } from "@/lib/db/repositories/approvals.repository";
import Link from "next/link";
import { personLabel } from "@/lib/people/label";

// WEB-05 (v1.10.0): a plain, non-confidential browser title.
export const metadata: Metadata = { title: "Out of office" };

const HOW_IT_WORKS =
  "Your delegate (Manager or above) decides your approvals between these dates, India time. Never your own requests. End it early any time.";

// F-30 out of office: the delegate sees and decides your approvals while
// it's active; every decision records both names.
export default async function DelegationPage() {
  const { user } = await requireArea("users");
  const [items, people, today, pending] = await Promise.all([listDelegationsInvolving(user.id), listApproverOptions(), indiaToday(), listPendingTasksFor(user.id, { limit: 200, offset: 0 })]);
  // #8 preview: your own waiting approvals the delegate would see.
  const mine = pending.filter((item) => item.forName === null);
  const options = people.filter((person) => person.id !== user.id).map((person) => ({ id: person.id, label: personLabel(person), detail: person.departmentName ?? undefined }));
  return (
    <>
      <PageHeader
        title="Out of office"
        description="Pick someone to approve for you while you're away (up to 90 days)."
      />
      <ProfileTabs />
      <section className="card mb-6 px-5 py-4 text-label" aria-labelledby="ooo-how">
        {/* D-179: "how it works" is a hover hint on the heading. */}
        <h2 id="ooo-how" className="flex items-center gap-1.5 font-semibold">
          Waiting for you now
          <Hint text={HOW_IT_WORKS} align="start" />
        </h2>
        <p className="mt-2">
          {mine.length === 0 ? (
            "Nothing is waiting for you right now."
          ) : (
            <>
              {mine.length} approval{mine.length === 1 ? " is" : "s are"} waiting for you now and would be visible to your delegate
              {mine.length > 5 ? ", including:" : ":"}
            </>
          )}
        </p>
        {mine.length > 0 && (
          <ul className="mt-1 space-y-0.5">
            {mine.slice(0, 5).map((item) => (
              <li key={`${item.requestId}:${item.taskKey}`}>
                <Link href={`/users/requests/${item.requestId}`} className="link">
                  {item.requestNo}
                </Link>{" "}
                · {item.title} · {item.nodeLabel}
              </li>
            ))}
          </ul>
        )}
      </section>
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
