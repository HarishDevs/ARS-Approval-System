import "server-only";
import crypto from "node:crypto";
import type { RowDataPacket } from "mysql2/promise";
import { getDbPool } from "@/lib/db/client";
import { findWorkflow, listVersions, type WorkflowRecord } from "@/lib/db/repositories/approvals.repository";
import { addDraftVersion, checkWorkflow, createWorkflow, type Actor } from "@/server/approvals/service";
import { recordAudit } from "@/lib/db/repositories/audit.repository";
import { diffVersions, type VersionDiff } from "@/server/workflows/version-diff";
import { formSchema, type FormField } from "@/server/forms/fields";
import { builderSpecSchema, type BuilderSpec } from "@/server/workflows/builder";
import type { WorkflowDefinition } from "@/server/engine";
import { getEnv } from "@/config/environment";

// Configuration promotion (unified prompt FN9, D-125): move an approval
// type's configuration between environments (test → live) as a file.
// Export turns environment-specific ids (people, groups, departments,
// designations) into portable references; import resolves them back,
// refuses anything it can't resolve, and only ever creates a DRAFT version:
// publishing stays a separate, checked step. Live submission checks of an
// existing type are never changed by an import.
export const FORMAT = "ars-approval-type@1";

export interface PromotionPackage {
  format: typeof FORMAT;
  exportedAt: string;
  source: string;
  type: { code: string; name: string; description: string | null; requestPrefix: string; settings: unknown };
  version: { versionNo: number; status: string; definition: unknown; builder: unknown; form: unknown };
  checksum: string;
}

const canonical = (value: unknown): string => JSON.stringify(value, (_key, item) => (item && typeof item === "object" && !Array.isArray(item) ? Object.fromEntries(Object.entries(item).sort(([a], [b]) => a.localeCompare(b))) : item));
export const checksumOf = (pkg: Omit<PromotionPackage, "checksum">) => crypto.createHash("sha256").update(canonical(pkg)).digest("hex");

type Lookup = { users: Map<number, string>; groups: Map<number, string>; departments: Map<number, string>; designations: Map<number, string> };
type Reverse = { users: Map<string, number>; groups: Map<string, number>; departments: Map<string, number>; designations: Map<string, number> };

async function directory(): Promise<{ forward: Lookup; reverse: Reverse }> {
  const db = getDbPool();
  const [users] = await db.query<RowDataPacket[]>("SELECT id, login_id AS ref FROM users WHERE active = TRUE");
  const [groups] = await db.query<RowDataPacket[]>("SELECT id, code AS ref FROM approver_groups WHERE active = TRUE");
  const [departments] = await db.query<RowDataPacket[]>("SELECT id, code AS ref FROM departments WHERE active = TRUE");
  const [designations] = await db.query<RowDataPacket[]>("SELECT id, code AS ref FROM designations WHERE active = TRUE");
  const pair = (rows: RowDataPacket[]) => ({ f: new Map(rows.map((row) => [Number(row.id), String(row.ref)])), r: new Map(rows.map((row) => [String(row.ref).toLowerCase(), Number(row.id)])) });
  const [u, g, d, s] = [pair(users), pair(groups), pair(departments), pair(designations)];
  return { forward: { users: u.f, groups: g.f, departments: d.f, designations: s.f }, reverse: { users: u.r, groups: g.r, departments: d.r, designations: s.r } };
}

const ID_FIELDS: { field: string; ref: string; kind: keyof Lookup }[] = [
  { field: "userId", ref: "userRef", kind: "users" },
  { field: "groupId", ref: "groupRef", kind: "groups" },
  { field: "departmentId", ref: "departmentRef", kind: "departments" },
  { field: "designationId", ref: "designationRef", kind: "designations" },
];

// Deep copy, swapping ids for references (export) or back (import).
function walk(value: unknown, swap: (node: Record<string, unknown>) => void): unknown {
  if (Array.isArray(value)) return value.map((item) => walk(item, swap));
  if (value && typeof value === "object") {
    const copy = Object.fromEntries(Object.entries(value as Record<string, unknown>).map(([key, item]) => [key, walk(item, swap)]));
    swap(copy);
    return copy;
  }
  return value;
}

export async function exportApprovalType(workflowId: number, actor: Actor): Promise<PromotionPackage | null> {
  const workflow = await findWorkflow(workflowId);
  if (!workflow || workflow.kind !== "PREDEFINED" || !(actor.roles.includes("IT_ADMIN") || actor.roles.includes("SUPER_ADMIN"))) return null;
  const versions = await listVersions(workflow.id);
  const version = versions.find((item) => item.status === "PUBLISHED") ?? versions[0];
  if (!version) return null;
  const { forward } = await directory();
  const missing: string[] = [];
  const toRefs = (node: Record<string, unknown>) => {
    for (const { field, ref, kind } of ID_FIELDS) {
      if (typeof node[field] === "number") {
        const value = forward[kind].get(node[field] as number);
        if (value) node[ref] = value;
        else missing.push(`${kind} #${node[field]}`);
        delete node[field];
      }
    }
  };
  const body: Omit<PromotionPackage, "checksum"> = {
    format: FORMAT,
    exportedAt: new Date().toISOString(),
    source: getEnv().APP_BASE_URL ?? "unknown",
    type: { code: workflow.code, name: workflow.name, description: workflow.description ?? null, requestPrefix: workflow.requestPrefix, settings: workflow.settings ?? null },
    version: { versionNo: version.versionNo, status: version.status, definition: walk(version.definition, toRefs), builder: walk(version.builder, toRefs), form: version.form },
  };
  if (missing.length) throw new Error(`Inactive or missing ${missing.join(", ")} can't be exported; fix the workflow first.`);
  await recordAudit({ actorUserId: actor.id, action: "WORKFLOW_EXPORTED", entityType: "WORKFLOW", entityId: workflow.id, metadata: { versionNo: version.versionNo } });
  return { ...body, checksum: checksumOf(body) };
}

export interface ImportPreview {
  ok: boolean;
  problems: string[];
  existing: WorkflowRecord | null;
  diff: VersionDiff | null;
  settingsDiffer: boolean;
  resolved?: { definition: WorkflowDefinition | null; builder: BuilderSpec | null; form: FormField[] };
}

export async function previewImport(raw: unknown): Promise<ImportPreview> {
  const problems: string[] = [];
  const pkg = raw as PromotionPackage;
  if (!pkg || typeof pkg !== "object" || pkg.format !== FORMAT) return { ok: false, problems: ["This isn't an approval-type file from this app."], existing: null, diff: null, settingsDiffer: false };
  const { checksum, ...body } = pkg;
  if (checksumOf(body) !== checksum) return { ok: false, problems: ["The file has been changed since it was exported (checksum doesn't match)."], existing: null, diff: null, settingsDiffer: false };
  if (!/^[A-Z0-9_]{2,40}$/.test(String(pkg.type?.code ?? ""))) problems.push("The type code in the file isn't valid.");
  const { reverse } = await directory();
  const unresolved: string[] = [];
  const toIds = (node: Record<string, unknown>) => {
    for (const { field, ref, kind } of ID_FIELDS) {
      if (typeof node[ref] === "string") {
        const id = reverse[kind].get((node[ref] as string).toLowerCase());
        if (id) node[field] = id;
        else unresolved.push(`${kind.replace(/s$/, "")} "${node[ref]}"`);
        delete node[ref];
      }
    }
  };
  const definition = pkg.version?.definition ? (walk(pkg.version.definition, toIds) as WorkflowDefinition) : null;
  const builderRaw = pkg.version?.builder ? walk(pkg.version.builder, toIds) : null;
  const form = formSchema.safeParse(pkg.version?.form);
  const builder = builderRaw ? builderSpecSchema.safeParse(builderRaw) : null;
  if (!form.success) problems.push("The form in the file isn't valid.");
  if (builder && !builder.success) problems.push("The workflow layout in the file isn't valid.");
  if (unresolved.length) problems.push(`Not found here (create them first, with the same login id or code): ${[...new Set(unresolved)].join(", ")}.`);
  if (definition && form.success && !builder) {
    const validation = await checkWorkflow(definition, form.data.map((field) => field.key));
    for (const issue of validation.errors) problems.push(issue.message);
  }
  const [rows] = await getDbPool().query<(RowDataPacket & { id: number })[]>("SELECT id FROM workflow_definitions WHERE code = ?", [pkg.type.code]);
  const existing = rows[0] ? await findWorkflow(rows[0].id) : null;
  if (existing && existing.kind !== "PREDEFINED") problems.push("A custom approval already uses this code here.");
  const latest = existing ? (await listVersions(existing.id))[0] : null;
  const diff = latest && definition && form.success ? diffVersions(latest, { definition, form: form.data }) : null;
  return {
    ok: problems.length === 0,
    problems,
    existing,
    diff,
    settingsDiffer: Boolean(existing && canonical(existing.settings ?? null) !== canonical(pkg.type.settings ?? null)),
    resolved: form.success ? { definition, builder: builder?.success ? builder.data : null, form: form.data } : undefined,
  };
}

export async function applyImport(raw: unknown, actor: Actor): Promise<{ ok: true; workflowId: number; versionNo: number; created: boolean } | { ok: false; message: string }> {
  const preview = await previewImport(raw);
  if (!preview.ok || !preview.resolved) return { ok: false, message: preview.problems[0] ?? "The file can't be imported." };
  const pkg = raw as PromotionPackage;
  const content = preview.resolved.builder ? { builder: preview.resolved.builder, form: preview.resolved.form } : { definition: preview.resolved.definition!, form: preview.resolved.form };
  let workflowId: number;
  let versionNo: number;
  let created = false;
  if (preview.existing) {
    const draft = await addDraftVersion(preview.existing.id, content, actor);
    if (!draft.ok) return { ok: false, message: draft.message };
    workflowId = preview.existing.id;
    versionNo = draft.value.versionNo;
  } else {
    const made = await createWorkflow({ code: pkg.type.code, name: pkg.type.name, description: pkg.type.description ?? undefined, kind: "PREDEFINED", requestPrefix: pkg.type.requestPrefix, ...content }, actor);
    if (!made.ok) return { ok: false, message: made.message };
    workflowId = made.value.workflowId;
    versionNo = 1;
    created = true;
    // A brand-new type isn't live yet, so its submission checks can come too.
    if (pkg.type.settings) {
      const { typeSettingsSchema } = await import("@/server/workflows/type-settings");
      const { updateWorkflowSettings } = await import("@/lib/db/repositories/approvals.repository");
      const parsed = typeSettingsSchema.safeParse(pkg.type.settings);
      if (parsed.success) await updateWorkflowSettings(workflowId, parsed.data);
    }
  }
  await recordAudit({ actorUserId: actor.id, action: "WORKFLOW_IMPORTED", entityType: "WORKFLOW", entityId: workflowId, metadata: { code: pkg.type.code, source: pkg.source, exportedAt: pkg.exportedAt, sourceVersion: pkg.version.versionNo, draftVersion: versionNo, created, checksum: pkg.checksum } });
  return { ok: true, workflowId, versionNo, created };
}
