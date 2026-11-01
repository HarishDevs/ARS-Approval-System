// QA: builds qa/APPLICATION_ROUTE_INVENTORY.md from the code (pages, API
// routes, server actions) with the guard each one calls. Re-run after changes:
//   node scripts/qa/route-inventory.mjs
import { readdirSync, readFileSync, statSync, writeFileSync, mkdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const app = path.join(root, "app");
const walk = (dir) => readdirSync(dir).flatMap((name) => {
  const full = path.join(dir, name);
  return statSync(full).isDirectory() ? walk(full) : [full];
});
const files = walk(app);
const rel = (file) => path.relative(root, file).split(path.sep).join("/");
const urlOf = (file) => "/" + path.relative(app, path.dirname(file)).split(path.sep).filter((part) => part && !/^\(.*\)$/.test(part)).join("/");
const read = (file) => readFileSync(file, "utf8");

// A page's guard: its own call, or the nearest layout's.
const layoutGuard = (dir) => {
  for (let d = dir; d.startsWith(app); d = path.dirname(d)) {
    const layout = path.join(d, "layout.tsx");
    try {
      const m = read(layout).match(/requireArea\("(\w+)"\)/);
      if (m) return `layout: requireArea("${m[1]}")`;
    } catch {}
  }
  return null;
};
const guardOf = (text) => {
  const found = [];
  for (const [re, label] of [[/requireArea\("(\w+)"[^)]*\)/g, (m) => `requireArea("${m[1]}")`], [/requireApiArea\("(\w+)"[^)]*\)/g, (m) => `requireApiArea("${m[1]}")`], [/workPage\(/g, () => "workPage() (users + Tasks)"], [/requireAiPage\(/g, () => "requireAiPage()"], [/notFound\(\)/g, () => "notFound() on no access"], [/loadRequestView\(/g, () => "loadRequestView (record check)"], [/featureOn\(/g, () => "featureOn (feature switch)"], [/navAccess\(|isHiddenHref\(/g, () => "page access (hidden pages)"]]) {
    for (const m of text.matchAll(re)) found.push(label(m));
  }
  return [...new Set(found)];
};

const pages = files.filter((f) => f.endsWith(`${path.sep}page.tsx`)).map((file) => {
  const text = read(file);
  const guards = guardOf(text);
  const inherited = layoutGuard(path.dirname(file));
  return { url: urlOf(file), file: rel(file), area: urlOf(file).split("/")[1] || "(public root)", guards: guards.length ? guards : inherited ? [inherited] : ["none (public)"] };
});
const apis = files.filter((f) => f.endsWith(`${path.sep}route.ts`)).map((file) => {
  const text = read(file);
  const methods = [...text.matchAll(/export (?:async )?function (GET|POST|PUT|PATCH|DELETE)/g)].map((m) => m[1]);
  const auth = [...new Set([...text.matchAll(/(requireApiArea\("\w+"[^)]*\)|readSession|currentSession|verifyJobSecret|JOB_RUNNER_SECRET|isAdmin\(|requireUser|getSessionUser|sessionFrom|authenticate\w*\(|loadRequestView|canSee\w*|cronAuth|webhook\w*Secret|timingSafeEqual)/g)].map((m) => m[1]))];
  return { url: urlOf(file), file: rel(file), methods, auth };
});
const actions = files.filter((f) => /actions?\.ts$/.test(f) || /-actions\.ts$/.test(f)).flatMap((file) => {
  const text = read(file);
  if (!text.includes('"use server"')) return [];
  // Guard helpers: imported ones that call requireApiArea, and this file's own functions that call a guard.
  const known = ["requireArea", "requireApiArea", "getAdminActor", "getSuperAdminActor", "getSuperActor", "workActor", "currentUser", "readSession"];
  // Non-exported functions in this file: name and body (up to the next top-level declaration).
  const helpers = [...text.matchAll(/^(?:async function|function|const) (\w+)/gm)].map((m) => {
    const end = text.slice(m.index + 1).search(/\n(?:export |async function|function|const )/);
    return { name: m[1], body: text.slice(m.index, end === -1 ? undefined : m.index + 1 + end) };
  });
  // A helper is a guard if it calls a known guard or another guard helper (followed until nothing changes).
  const guards = [...known];
  for (let changed = true; changed; ) {
    changed = false;
    const calls = new RegExp(`\\b(${guards.join("|")})\\(`);
    for (const helper of helpers) {
      if (guards.includes(helper.name) || !calls.test(helper.body)) continue;
      guards.push(helper.name);
      changed = true;
    }
  }
  const callsGuard = new RegExp(`\\b(${guards.join("|")})\\(`);
  return [...text.matchAll(/export async function (\w+)/g)].map((m) => {
    const start = m.index;
    const body = text.slice(start, text.indexOf("\nexport ", start + 10) === -1 ? undefined : text.indexOf("\nexport ", start + 10));
    const auth = callsGuard.test(body);
    return { name: m[1], file: rel(file), auth };
  });
});

const by = (list, key) => list.reduce((acc, item) => ((acc[item[key]] ??= []).push(item), acc), {});
let md = `# Application route inventory\n\nGenerated from the code by \`scripts/qa/route-inventory.mjs\` on ${new Date().toISOString().slice(0, 10)} (ARS-CMS v${JSON.parse(read(path.join(root, "package.json"))).version}).\nEvery protection check runs on the server; "guard" lists the checks the file itself calls (or its layout's).\n\n## Summary\n\n| Kind | Count |\n|---|---|\n| Pages | ${pages.length} |\n| API routes | ${apis.length} |\n| Server actions | ${actions.length} |\n\n`;
md += "## Pages\n\n";
for (const [area, list] of Object.entries(by(pages, "area")).sort()) {
  md += `### ${area} (${list.length})\n\n| Route | Guard | File |\n|---|---|---|\n`;
  for (const page of list.sort((a, b) => a.url.localeCompare(b.url))) md += `| \`${page.url}\` | ${page.guards.join("; ")} | ${page.file} |\n`;
  md += "\n";
}
md += "## API routes\n\n| Route | Methods | Auth checks found | File |\n|---|---|---|---|\n";
for (const api of apis.sort((a, b) => a.url.localeCompare(b.url))) md += `| \`${api.url}\` | ${api.methods.join(", ")} | ${api.auth.join("; ") || "**none found in file (review)**"} | ${api.file} |\n`;
md += `\n## Server actions (${actions.length})\n\n| Action | Session check in body | File |\n|---|---|---|\n`;
for (const action of actions.sort((a, b) => a.file.localeCompare(b.file) || a.name.localeCompare(b.name))) md += `| ${action.name} | ${action.auth ? "yes" : "**not found in body (review: may use a wrapper)**"} | ${action.file} |\n`;
mkdirSync(path.join(root, "qa"), { recursive: true });
writeFileSync(path.join(root, "qa/APPLICATION_ROUTE_INVENTORY.md"), md);
const flagged = { pagesPublic: pages.filter((p) => p.guards[0] === "none (public)").map((p) => p.url), apiNoAuth: apis.filter((a) => !a.auth.length).map((a) => a.url), actionsNoAuth: actions.filter((a) => !a.auth).map((a) => `${a.file}#${a.name}`) };
console.log(JSON.stringify({ pages: pages.length, apis: apis.length, actions: actions.length, ...flagged }, null, 1));
