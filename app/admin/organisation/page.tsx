import Link from "next/link";
import { PageHeader } from "@/features/shell/PageHeader";
import { DepartmentForm, DesignationForm } from "@/features/admin/OrganisationForms";
import { requireArea } from "@/server/authorization/guards";
import { listDepartments, listDesignations } from "@/lib/db/repositories/organisation.repository";
import { listActiveUserOptions } from "@/lib/db/repositories/admin-users.repository";

// P1-01 / S2-03a. The HOD set here is who "requester's department HOD" and
// "department HOD" resolve to in workflows.
export default async function OrganisationPage() {
  await requireArea("admin");
  const [departments, designations, people] = await Promise.all([listDepartments(), listDesignations(), listActiveUserOptions()]);
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
          <div className="px-5 py-4">
            <h2 className="font-semibold">Departments</h2>
            <p className="text-label text-ink-muted">Codes are short and unique, e.g. FIN, HR, SCM. Inactive departments can&apos;t be picked for new users.</p>
          </div>
          {departments.map((department) => (
            <DepartmentForm key={department.id} department={department} people={options} />
          ))}
          <DepartmentForm people={options} />
        </section>

        <section className="card divide-y divide-line">
          <div className="px-5 py-4">
            <h2 className="font-semibold">Designations</h2>
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
