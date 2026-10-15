import Link from "next/link";
import { notFound } from "next/navigation";
import { requireArea } from "@/server/authorization/guards";
import { PageHeader } from "@/features/shell/PageHeader";
import { Breadcrumbs } from "@/features/ui/Display";
import { PageRuleForm } from "@/features/superadmin/PageRuleForm";
import { listAccessRules } from "@/lib/db/repositories/page-access.repository";
import { listActiveUserOptions } from "@/lib/db/repositories/admin-users.repository";
import { listDepartments } from "@/lib/db/repositories/organisation.repository";
import { PAGE } from "@/server/authorization/pages";

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
        <h2 id="everyone" className="mb-2 font-semibold">
          For everyone
        </h2>
        <PageRuleForm pageKey={page.key} scope="EVERYONE" level={everyone} neverHidden={page.neverHidden} label="For everyone" removable={everyone !== null} />
        {page.neverHidden && <p className="mt-2 text-caption text-ink-muted">The first page of a space can be view-only but not hidden, so nobody lands on an error after signing in.</p>}
      </section>
      <section className="card mb-6 space-y-3 px-5 py-4" aria-labelledby="departments">
        <h2 id="departments" className="font-semibold">
          By department <span className="font-normal text-ink-muted">(the raiser&apos;s own department in their profile)</span>
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
        <PageRuleForm pageKey={page.key} scope="USER" level={null} neverHidden={page.neverHidden} label="Level" choices={people.filter((person) => !byPerson.some((rule) => rule.scopeId === person.id)).map((person) => ({ id: person.id, label: `${person.name} (${person.loginId})` }))} />
      </section>
    </>
  );
}
