import type { Metadata } from "next";
import Link from "next/link";
import { PageHeader } from "@/features/shell/PageHeader";
import { Hint } from "@/features/ui/Hint";
import { requireArea } from "@/server/authorization/guards";
import { listDemoPeople } from "@/server/demo/service";
import { DEMO_GROUPS, PURCHASE_DOA_BANDS } from "@/server/demo/demo-data";
import { LoadDemoForm, RetireDemoForm, TryAsButton } from "@/features/superadmin/DemoForms";

// WEB-05 (v1.10.0): a plain, non-confidential browser title.
export const metadata: Metadata = { title: "Demo data" };

const lakh = (value: number) => `₹${(value / 100_000).toLocaleString("en-IN")} lakh`;

// F-57 / D-071: stand-in staff and the first approval types, until the
// owner's staff list arrives.
export default async function DemoPage() {
  await requireArea("superadmin");
  const people = await listDemoPeople();
  const active = people.filter((person) => person.active);
  return (
    <>
      <PageHeader
        title="Demo data"
        description="Stand-in staff and the first approval types, so the whole app can be tried before the real staff list arrives. Demo people are marked (demo). Their emails go to the IT mailbox (itadmin+demo…), and they have no WhatsApp number."
      />
      <div className="mb-6 grid gap-4 lg:grid-cols-2">
        <section className="card space-y-3 px-5 py-4">
          <h2 className="flex items-center gap-1.5 font-semibold">
            1. Load
            <Hint
              text={`Creates 7 departments, 20 demo people (with managers and HODs), ${DEMO_GROUPS.length} approver groups, and 12 published approval types: MD, ED, Finance (controller and head), Purchase & SCM, Director, HR / Admin, Recruitment, Finance Internal, IT Internal, Price Realisation, and Department (Manager → HOD). Safe to press twice: anything that already exists is left alone.`}
              align="start"
            />
          </h2>
          <p className="flex items-center gap-1.5 text-label">
            <Link href="/admin/doa" className="link">
              DoA example
            </Link>
            <Hint
              text={`Purchase & SCM: up to ${lakh(PURCHASE_DOA_BANDS.finance)} the SCM head only; above that the Finance head too; above ${lakh(PURCHASE_DOA_BANDS.ed)} the ED as well; above ${lakh(PURCHASE_DOA_BANDS.md)} the MD as well.`}
              align="start"
            />
          </p>
          <LoadDemoForm />
        </section>
        <section className="card space-y-3 px-5 py-4">
          <h2 className="flex items-center gap-1.5 font-semibold">
            2. When the real staff arrive
            <Hint
              text="1. Add the real people in Admin → Users. 2. In Admin → Groups, swap the demo members for the real ones (MD office, ED office, Finance desks…). 3. In Admin → Organisation, set the real HOD on each department. 4. Then retire the demo staff. The approval types keep working, because they pick approvers by group and HOD, not by name."
              align="start"
            />
          </h2>
          <RetireDemoForm />
        </section>
      </div>
      <section className="card overflow-x-auto">
        <div className="flex items-center gap-1.5 border-b border-line px-5 py-4">
          <h2 className="font-semibold">Demo people ({active.length} active)</h2>
          <Hint text="“Try as” continues as that person, to raise or approve requests. It ends your Super Admin session; sign in again to come back. Every switch is in the audit log." align="start" />
        </div>
        {people.length === 0 ? (
          <p className="px-5 py-4 text-label text-ink-muted">Nothing loaded yet.</p>
        ) : (
          <table className="data-table">
            <thead>
              <tr>
                <th>Name</th>
                <th>User ID</th>
                <th>Department</th>
                <th>Designation</th>
                <th>Waiting with them</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {people.map((person) => (
                <tr key={person.id} className={person.active ? undefined : "text-ink-faint"}>
                  <td>{person.name}</td>
                  <td className="font-mono">{person.loginId}</td>
                  <td>{person.department ?? "—"}</td>
                  <td>{person.designation ?? "—"}</td>
                  <td>{person.pendingTasks}</td>
                  <td>{person.active ? <TryAsButton userId={person.id} name={person.name} /> : "Retired"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </>
  );
}
