// Builds docs/IMPLEMENTATION_STATUS_REGISTER.md from the owner's unified
// master prompt (docs/requirements/UNIFIED_MASTER_PROMPT.md) and the status
// file (docs/register/status.json). Every list item in a requirement section
// becomes one atomic row with a stable ID, so no requirement is skipped.
//   node scripts/docs/build-register.mjs          write the register
//   node scripts/docs/build-register.mjs --ids    list rows without a status entry
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

import { fileURLToPath } from "node:url";
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const prompt = readFileSync(path.join(root, "docs/requirements/UNIFIED_MASTER_PROMPT.md"), "utf8").split(/\r?\n/);
const statusFile = path.join(root, "docs/register/status.json");
const statuses = JSON.parse(readFileSync(statusFile, "utf8"));

// Sections that explain how to work rather than what to build.
const SKIP = [/^3\.1 Exact status values/, /^Implemented$/, /^Yet to do$/, /^Not feasible$/, /^Partial implementations$/, /^Status and build behavior$/, /^24\. Phased Implementation Plan/, /^Phase \d/, /^25\. Claude Code Execution/, /^Step \d/, /^Non-negotiable final rules/, /^6\. Unified Execution Order/, /^6\.1 Required final response/, /^6\.2 Final completion gate/, /^IMPLEMENTATION PHASES/, /^14\\?\. Balanced implementation order/, /^Phase [A-F] /, /^17\\?\. Final reporting requirements/, /^18\\?\. Start execution/, /^Mandatory execution principles/, /^2\\?\. Mandatory Implementation Rules/, /^2\. Mandatory Audit-First Execution/, /^2\.3 Audit deliverables/, /^3\.2 Initial feature-group confirmation matrix/, /^1\.2 Preserve the existing product/];

const rows = [];
let section = "Preamble";
let sectionId = "P";
let skip = false;
let counters = new Map();
let part = "M"; // M = main prompt, A = Addendum A (analytics), B = Addendum B

function setSection(title, id) {
  section = title.replace(/\\\./g, ".").trim();
  sectionId = /^(FN|B[A-K]$)/.test(id) ? id : `${part}${id}`;
  skip = SKIP.some((pattern) => pattern.test(section));
}

for (const raw of prompt) {
  const line = raw.trim();
  let match;
  if ((match = /^#{1,4}\s+(.*)$/.exec(line))) {
    const title = match[1].replace(/\*\*/g, "");
    const number = /^(\d+(?:\.\d+)*)\.?\s/.exec(title);
    const addendum = /^Addendum ([AB])/.exec(title);
    if (addendum) part = addendum[1];
    if (/^6\. Unified Execution Order/.test(title)) part = "M";
    setSection(title, addendum ? "" : number ? number[1] : title.slice(0, 12).replace(/\W+/g, ""));
    continue;
  }
  // Addendum B's second part uses plain "14\. Title" lines as headings.
  if ((match = /^(\d+)\\\. (.+)$/.exec(line)) && line.length < 90) {
    // Inside a function ("3\. Purpose", "13\. Mandatory Requirement") the
    // function stays the section; after the last one they are top-level.
    if (/^FN/.test(sectionId) && /^(Purpose|Mandatory Requirement)$/.test(match[2])) continue;
    setSection(`${match[1]}. ${match[2]}`, `P${match[1]}`);
    continue;
  }
  if ((match = /^FUNCTION (\d+) — (.*)$/.exec(line))) {
    setSection(`Function ${match[1]}: ${match[2]}`, `FN${match[1]}`);
    continue;
  }
  if ((match = /^([A-K])\. (.+)$/.exec(line)) && line.length < 80) {
    setSection(`Addendum B-${match[1]}: ${match[2]}`, `B${match[1]}`);
    continue;
  }
  if ((match = /^(\d+)\.(\d+) (.+)$/.exec(line)) && line.length < 80) {
    const parent = /^FN(\d+)/.exec(sectionId)?.[1] ?? /^FN(\d+)/.exec(sectionId.split("-")[0])?.[1];
    setSection(`${section.split(" › ")[0]} › ${match[3]}`, parent ? `FN${parent}-${match[1]}.${match[2]}` : `X${match[1]}.${match[2]}`);
    continue;
  }
  if (skip) continue;
  if ((match = /^(?:-|\d+\.)\s+(.+)$/.exec(line))) {
    const text = match[1].replace(/\*\*/g, "").trim();
    if (text.length < 3) continue;
    const n = (counters.get(sectionId) ?? 0) + 1;
    counters.set(sectionId, n);
    const id = `${sectionId}-${String(n).padStart(2, "0")}`;
    rows.push({ id, section, text });
  }
}

if (process.argv.includes("--ids")) {
  for (const row of rows) if (!statuses[row.id]) console.log(`${row.id}\t${row.section}\t${row.text}`);
  console.log(`${rows.length} rows, ${rows.filter((row) => !statuses[row.id]).length} without a status entry`);
  process.exit(0);
}

const ALLOWED = new Set(["Implemented", "Yet to do", "Not feasible"]);
const counts = { Implemented: 0, "Yet to do": 0, "Not feasible": 0 };
const cell = (text) => String(text ?? "").replace(/\|/g, "\\|").replace(/\n/g, " ");
const bySection = new Map();
const notFeasible = [];
for (const row of rows) {
  const entry = statuses[row.id] ?? statuses[`${row.id.replace(/-\d+$/, "")}-*`] ?? { status: "Yet to do", action: "Not yet assessed" };
  if (!ALLOWED.has(entry.status)) throw new Error(`${row.id}: status must be Implemented, Yet to do or Not feasible`);
  counts[entry.status] += 1;
  const full = { ...row, ...entry };
  if (entry.status === "Not feasible") notFeasible.push(full);
  else bySection.set(row.section, [...(bySection.get(row.section) ?? []), full]);
}

const out = [];
out.push("# Implementation status register");
out.push("");
out.push("Generated by `node scripts/docs/build-register.mjs` from the owner's unified master prompt (`docs/requirements/UNIFIED_MASTER_PROMPT.md`) and the statuses in `docs/register/status.json`. **Do not edit this file by hand**: change the status file and rebuild.");
out.push("");
out.push("Each list item in a requirement section of the prompt is one row (ID = section + position). Status values are exactly **Implemented**, **Yet to do** or **Not feasible**. *Implemented* needs evidence (code and a test or a verified run); *Not feasible* rows are listed separately at the end with the reason and the way forward.");
out.push("");
out.push(`**Totals:** ${rows.length} requirements: **${counts.Implemented} Implemented**, **${counts["Yet to do"]} Yet to do**, **${counts["Not feasible"]} Not feasible**.`);
out.push("");
for (const [title, items] of bySection) {
  out.push(`## ${title}`);
  out.push("");
  out.push("| Requirement ID | Feature / Requirement | Confirmation Status | Evidence / Code Reference | Action Required | Test Evidence / Result | Blocker / Feasibility Reason |");
  out.push("|---|---|---|---|---|---|---|");
  for (const item of items) out.push(`| ${item.id} | ${cell(item.text)} | ${item.status} | ${cell(item.evidence)} | ${cell(item.action ?? (item.status === "Implemented" ? "None" : ""))} | ${cell(item.test)} | ${cell(item.blocker)} |`);
  out.push("");
}
out.push("## Not feasible (separate, with reasons)");
out.push("");
out.push("| Requirement ID | Section | Feature / Requirement | Reason and evidence | Missing prerequisite / owner | Safe alternative or future path |");
out.push("|---|---|---|---|---|---|");
for (const item of notFeasible) out.push(`| ${item.id} | ${cell(item.section)} | ${cell(item.text)} | ${cell(item.blocker)} | ${cell(item.prerequisite)} | ${cell(item.alternative)} |`);
out.push("");
writeFileSync(path.join(root, "docs/IMPLEMENTATION_STATUS_REGISTER.md"), out.join("\n"));
console.log(`register: ${rows.length} rows (${counts.Implemented} implemented, ${counts["Yet to do"]} yet to do, ${counts["Not feasible"]} not feasible)`);
