import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { requireArea } from "@/server/authorization/guards";
import { PageHeader } from "@/features/shell/PageHeader";
import { Breadcrumbs } from "@/features/ui/Display";
import { Hint } from "@/features/ui/Hint";
import { PageRuleForm } from "@/features/superadmin/PageRuleForm";
import { listAccessRules } from "@/lib/db/repositories/page-access.repository";
import { listActiveUserOptions } from "@/lib/db/repositories/admin-users.repository";
import { listDepartments } from "@/lib/db/repositories/organisation.repository";
import { PAGE } from "@/server/authorization/pages";
import { personLabel } from "@/lib/people/label";

// WEB-05 (v1.10.0): a plain, non-confidential browser title.
export const metadata: Metadata = { title: "Page access rule" };

export const dynamic = "force-dynamic";

// v1.8.0: one page's access rules: for everyone, by department, by person.
export default async function PageRulesPage({ params }: { params: Promise<{ key: string }> }) {
  await requireArea("superadmin");
  const { key } = await params;
  const page = PAGE[decodeURIComponent(key)];
  if (!page) notFound();
  const [rules, people, departments] = await Promise.all([listAccessRules(), listActiveUserOptions(), listDepartments()]);
  const mine = rules.filter((rule) => rule.pageKey === page.key);
  const everyone = mine.find((rule) => rule.scope === "EVERYONE")?.level ?? null;
  const byDepartment = mine.filter((rule) => rule.scope === "DEPARTMENT");
  const byPerson = mine.filter((rule) => rule.scope === "USER");
  return (
    <>
      <Breadcrumbs items={[{ href: "/superadmin", label: "Super Admin" }, { href: "/superadmin/pages", label: "Page access" }, { label: page.label }]} />
      <PageHeader title={page.label} description={`${page.what} A person's rule beats their department's, which beats the rule for everyone. No rule = Full.`}>
        <Link href="/superadmin/pages" className="link text-label">
          ← All pages
        </Link>
      </PageHeader>
      <section className="card mb-6 px-5 py-4" aria-labelledby="everyone">
        <h2 id="everyone" className="mb-2 flex items-center gap-1.5 font-semibold">
          For everyone
          {page.neverHidden && <Hint text="The first page of a space can be view-only but not hidden, so nobody lands on an error after signing in." align="start" />}
        </h2>
        <PageRuleForm pageKey={page.key} scope="EVERYONE" level={everyone} neverHidden={page.neverHidden} label="For everyone" removable={everyone !== null} />
      </section>
      <section className="card mb-6 space-y-3 px-5 py-4" aria-labelledby="departments">
        <h2 id="departments" className="flex items-center gap-1.5 font-semibold">
          By department
          <Hint text="The raiser's own department in their profile." align="start" />
        </h2>
        {byDepartment.length === 0 && <p className="text-label text-ink-muted">No department rules.</p>}
        {byDepartment.map((rule) => (
          <div key={rule.id} className="flex flex-wrap items-center gap-3 border-b border-line pb-2">
            <span className="min-w-48 font-medium">{rule.scopeName ?? `Department #${rule.scopeId}`}</span>
            <PageRuleForm pageKey={page.key} scope="DEPARTMENT" scopeId={rule.scopeId} level={rule.level} neverHidden={page.neverHidden} label={`${rule.scopeName ?? "Department"}: level`} removable />
          </div>
        ))}
        <PageRuleForm pageKey={page.key} scope="DEPARTMENT" level={null} neverHidden={page.neverHidden} label="Level" choices={departments.filter((department) => department.active && !byDepartment.some((rule) => rule.scopeId === department.id)).map((department) => ({ id: department.id, label: department.name }))} />
      </section>
      <section className="card mb-6 space-y-3 px-5 py-4" aria-labelledby="people">
        <h2 id="people" className="font-semibold">
          By person
        </h2>
        {byPerson.length === 0 && <p className="text-label text-ink-muted">No rules for single people.</p>}
        {byPerson.map((rule) => (
          <div key={rule.id} className="flex flex-wrap items-center gap-3 border-b border-line pb-2">
            <span className="min-w-48 font-medium">{rule.scopeName ?? `Person #${rule.scopeId}`}</span>
            <PageRuleForm pageKey={page.key} scope="USER" scopeId={rule.scopeId} level={rule.level} neverHidden={page.neverHidden} label={`${rule.scopeName ?? "Person"}: level`} removable />
          </div>
        ))}
        <PageRuleForm pageKey={page.key} scope="USER" level={null} neverHidden={page.neverHidden} label="Level" choices={people.filter((person) => !byPerson.some((rule) => rule.scopeId === person.id)).map((person) => ({ id: person.id, label: personLabel(person), detail: person.departmentName ?? undefined }))} />
      </section>
    </>
  );
}
