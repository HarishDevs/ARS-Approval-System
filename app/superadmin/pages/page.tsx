import type { Metadata } from "next";
import Link from "next/link";
import { requireArea } from "@/server/authorization/guards";
import { PageHeader } from "@/features/shell/PageHeader";
import { Hint } from "@/features/ui/Hint";
import { PageRuleForm } from "@/features/superadmin/PageRuleForm";
import { listAccessRules, rulesForPerson } from "@/lib/db/repositories/page-access.repository";
import { listActiveUserOptions } from "@/lib/db/repositories/admin-users.repository";
import { PersonSelect } from "@/features/ui/PersonSelect";
import { personLabel } from "@/lib/people/label";
import { effectiveLevel, LEVEL_LABEL, PAGES } from "@/server/authorization/pages";
import { getDbPool } from "@/lib/db/client";
import type { RowDataPacket } from "mysql2/promise";

// WEB-05 (v1.10.0): a plain, non-confidential browser title.
export const metadata: Metadata = { title: "Page access" };

export const dynamic = "force-dynamic";

// v1.8.0 (owner): page access, managed by the Super Admin only. Each page of
// My approvals and the Admin space: Full, View only or Hidden, for everyone,
// a department or a person (the most specific rule wins). The Super Admin
// is never limited, and the Super Admin pages aren't on this list.
export default async function PageAccessPage({ searchParams }: { searchParams: Promise<{ person?: string }> }) {
  await requireArea("superadmin");
  const { person } = await searchParams;
  const [rules, people] = await Promise.all([listAccessRules(), listActiveUserOptions()]);
  const personId = /^\d{1,10}$/.test(person ?? "") ? Number(person) : null;
  let checked: { name: string; levels: Map<string, string>; roles: string[] } | null = null;
  if (personId) {
    const [[row]] = await getDbPool().query<RowDataPacket[]>(
      "SELECT u.name, u.department_id, (SELECT GROUP_CONCAT(r.code) FROM user_roles ur JOIN roles r ON r.id = ur.role_id WHERE ur.user_id = u.id) AS roles FROM users u WHERE u.id = ?",
      [personId],
    );
    if (row) {
      const own = await rulesForPerson(personId, row.department_id ?? null);
      checked = {
        name: String(row.name),
        roles: String(row.roles ?? "").split(",").filter(Boolean),
        levels: new Map(PAGES.map((page) => [page.key, effectiveLevel(page.key, own, { id: personId, departmentId: row.department_id ?? null })])),
      };
    }
  }
  const everyone = (key: string) => rules.find((rule) => rule.pageKey === key && rule.scope === "EVERYONE")?.level ?? null;
  const count = (key: string, scope: "DEPARTMENT" | "USER") => rules.filter((rule) => rule.pageKey === key && rule.scope === scope).length;
  const tone = (level: string) => (level === "HIDDEN" ? "text-danger-600" : level === "VIEW" ? "text-warning-600" : "text-success-600");

  return (
    <>
      <PageHeader title="Page access" description="Who can open each page of My approvals and the Admin space, and who can only look. Set it for everyone, then for a department or a person: the most specific rule wins. The Super Admin is never limited." />

      <form method="get" className="card mb-6 flex flex-wrap items-end gap-3 px-4 py-3" aria-label="Check a person">
        <div>
          <label htmlFor="person" className="field-label">
            Check what a person can open
          </label>
          <PersonSelect
            id="person"
            name="person"
            options={people.map((item) => ({ id: item.id, label: personLabel(item), detail: item.departmentName ?? undefined }))}
            defaultValue={personId ?? null}
            emptyLabel="Choose a person…"
            className="w-72"
          />
        </div>
        <button type="submit" className="btn-secondary btn-compact h-10">
          Check
        </button>
        {checked && (
          <Link href="/superadmin/pages" className="link text-label">
            Clear
          </Link>
        )}
      </form>
      {checked && (
        <section aria-label={`What ${checked.name} can open`} className="card mb-6 px-5 py-4">
          <h2 className="mb-2 font-semibold">What {checked.name} can open</h2>
          {checked.roles.includes("SUPER_ADMIN") ? (
            <p className="text-label text-ink-muted">A Super Admin: never limited.</p>
          ) : (
            <ul className="grid gap-1 text-label sm:grid-cols-2 lg:grid-cols-3" data-testid="effective-access">
              {PAGES.filter((page) => page.area === "users" || checked!.roles.includes("IT_ADMIN")).map((page) => {
                const level = checked!.levels.get(page.key) ?? "FULL";
                return (
                  <li key={page.key} className="flex justify-between gap-2 border-b border-line py-1">
                    <span>{page.label}</span>
                    <span className={`font-medium ${tone(level)}`}>{LEVEL_LABEL[level as "FULL"]}</span>
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      )}

      {(["users", "admin"] as const).map((area) => (
        <section key={area} aria-labelledby={`area-${area}`} className="card mb-6 overflow-x-auto">
          <h2 id={`area-${area}`} className="border-b border-line px-5 py-3 font-semibold">
            {area === "users" ? "My approvals (everyone)" : "Admin space (IT team)"}
          </h2>
          <table className="data-table">
            <thead>
              <tr>
                <th scope="col">Page</th>
                <th scope="col">For everyone</th>
                <th scope="col">Departments and people</th>
              </tr>
            </thead>
            <tbody>
              {PAGES.filter((page) => page.area === area).map((page) => (
                <tr key={page.key}>
                  <td className="max-w-80">
                    <span className="flex items-center gap-1.5 font-medium">
                      {page.label}
                      <Hint text={page.what} align="start" />
                    </span>
                  </td>
                  <td>
                    <PageRuleForm pageKey={page.key} scope="EVERYONE" level={everyone(page.key)} neverHidden={page.neverHidden} label={`${page.label}: for everyone`} />
                  </td>
                  <td className="whitespace-nowrap text-label">
                    <Link href={`/superadmin/pages/${encodeURIComponent(page.key)}`} className="link">
                      {count(page.key, "DEPARTMENT")} department{count(page.key, "DEPARTMENT") === 1 ? "" : "s"}, {count(page.key, "USER")} {count(page.key, "USER") === 1 ? "person" : "people"}
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      ))}
    </>
  );
}
