import type { Metadata } from "next";
import { NewProjectWizard } from "@/features/work/NewProjectWizard";
import { listTemplates } from "@/lib/db/repositories/work.repository";
import { listDepartments } from "@/lib/db/repositories/organisation.repository";
import { countTemplateTasks, parseTemplate } from "@/server/work/more-rules";
import { workPage } from "@/server/work/page-context";

export const metadata: Metadata = { title: "New project" };
export const dynamic = "force-dynamic";

// D-220: create a project step by step, blank or from a template.
export default async function NewProjectPage({ searchParams }: { searchParams: Promise<{ template?: string }> }) {
  const { viewer } = await workPage();
  const params = await searchParams;
  const [templates, departments] = await Promise.all([listTemplates(viewer), listDepartments()]);
  const shaped = templates.map((template) => {
    const body = parseTemplate(template.body);
    return { id: template.id, name: template.name, tasks: countTemplateTasks(body?.tasks ?? []), sections: body?.sections ?? [] };
  });
  const startTemplate = /^\d{1,10}$/.test(params.template ?? "") && shaped.some((item) => String(item.id) === params.template) ? Number(params.template) : null;
  return (
    <NewProjectWizard
      templates={shaped}
      departments={departments.filter((department) => department.active).map((department) => ({ id: department.id, name: department.name }))}
      myDepartmentId={viewer.departmentId}
      startTemplate={startTemplate}
    />
  );
}
