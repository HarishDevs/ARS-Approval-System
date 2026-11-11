import { readdirSync, statSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

// v1.6.0 finding (KNOWN_ISSUES V6-D06): on Next 15.5 a route-level
// loading.tsx (1) turns a later notFound() into a 200, and (2) makes the
// page miss its refresh after a Server Action now and then. So skeletons
// are only on read-only pages that never call notFound(). A new
// loading.tsx must be checked against both rules and added here.
const ALLOWED = [
  "app/admin/(home)/loading.tsx",
  // D-233: read-only registers and AI analytics (GET filters only, no notFound()).
  "app/admin/ai-analytics/loading.tsx",
  "app/admin/records/information/loading.tsx",
  "app/admin/records/requests/loading.tsx",
  "app/admin/records/tasks/loading.tsx",
  "app/admin/dashboards/loading.tsx",
  "app/admin/doa/loading.tsx",
  "app/admin/import/loading.tsx", // results come back in the action's answer, not a refresh
  "app/admin/insights/loading.tsx",
  "app/admin/users/(list)/loading.tsx",
  "app/admin/workload/loading.tsx",
  "app/superadmin/audit/loading.tsx",
  "app/superadmin/import/loading.tsx",
  "app/superadmin/logins/loading.tsx",
  "app/superadmin/requests/loading.tsx", // delete redirects
  "app/superadmin/templates/(list)/loading.tsx",
  "app/users/help/loading.tsx",
  "app/users/new/(list)/loading.tsx",
  "app/users/profile/loading.tsx", // the theme choice doesn't need a refresh
];

function find(dir: string, root: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = path.join(dir, name);
    if (statSync(full).isDirectory()) return find(full, root);
    return name === "loading.tsx" ? [path.relative(root, full).split(path.sep).join("/")] : [];
  });
}

describe("loading skeletons", () => {
  it("exist only on the reviewed read-only pages", () => {
    const root = path.resolve(__dirname, "../..");
    expect(find(path.join(root, "app"), root).sort()).toEqual([...ALLOWED].sort());
  });
});
