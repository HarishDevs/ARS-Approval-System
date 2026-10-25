import type { Metadata } from "next";
import Link from "next/link";
import { PageHeader } from "@/features/shell/PageHeader";
import { Hint } from "@/features/ui/Hint";
import { DepartmentForm, DesignationForm } from "@/features/admin/OrganisationForms";
import { requireArea } from "@/server/authorization/guards";
import { listDepartments, listDesignations } from "@/lib/db/repositories/organisation.repository";
import { listApproverOptions } from "@/lib/db/repositories/approvers.repository";

// WEB-05 (v1.10.0): a plain, non-confidential browser title.
export const metadata: Metadata = { title: "Departments & designations" };

// P1-01 / S2-03a. The HOD set here is who "requester's department HOD" and
// "department HOD" resolve to in workflows.
export default async function OrganisationPage() {
  await requireArea("admin");
  const [departments, designations] = await Promise.all([listDepartments(), listDesignations()]);
  // D-085: a HOD must be an approver; each department's current HOD stays listed.
  const people = await listApproverOptions(departments.map((department) => department.hodUserId));
  const options = people.map((person) => ({ id: person.id, label: `${person.name} (${person.loginId})` }));

  return (
    <>
      <PageHeader title="Departments" description="Departments and their heads (HOD) drive who approves at the HOD level. Designations are job titles.">
        <Link href="/admin/import?kind=departments" className="btn-secondary btn-compact">
          Import departments or designations
        </Link>
      </PageHeader>
      <div className="space-y-6">
        <section className="card divide-y divide-line">
          <div className="flex items-center gap-1.5 px-5 py-4">
            <h2 className="font-semibold">Departments</h2>
            <Hint text="Codes are short and unique, e.g. FIN, HR, SCM. Inactive departments can't be picked for new users." align="start" />
          </div>
          {departments.map((department) => (
            <DepartmentForm key={department.id} department={department} people={options} />
          ))}
          <DepartmentForm people={options} />
        </section>

        <section className="card divide-y divide-line">
          <div className="flex items-center gap-1.5 px-5 py-4">
            <h2 className="font-semibold">Designations</h2>
            <Hint
              text="Tick Approver for Manager and above. Only people whose designation is ticked can be chosen as approvers, group members, HODs, reporting managers or out-of-office delegates. Choices already saved stay valid until changed."
              align="start"
            />
          </div>
          {designations.map((designation) => (
            <DesignationForm key={designation.id} designation={designation} />
          ))}
          <DesignationForm />
        </section>
      </div>
    </>
  );
}
