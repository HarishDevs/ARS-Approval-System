import "server-only";
import { z } from "zod";
import { withTransaction } from "@/lib/db/transaction";
import { recordAudit } from "@/lib/db/repositories/audit.repository";
import {
  deleteDraftVersion,
  findModuleType,
  findModuleTypeByCode,
  findVersionByStatus,
  insertModuleType,
  insertTypeVersion,
  publishDraftVersion,
  setModuleTypeActive,
  updateDraftVersion,
  updateModuleTypeDetails,
} from "@/lib/db/repositories/module-types.repository";
import { formFieldSchema, type FormField } from "@/server/forms/fields";
import { checkTypeDraft, DEFAULT_INFO_SETTINGS, DEFAULT_TASK_SETTINGS, infoSettingsSchema, taskSettingsSchema, type InfoSettings, type ModuleKind, type TaskSettings } from "@/server/modules/settings";

// v1.9.0 (D-144): IT keeps Task types and Information types. Every change
// is checked on the server, done in a transaction and audited with what it
// was before and after. A published version is never changed in place.
export interface ConfigActor {
  id: number;
  roles: readonly string[];
  sessionId?: string;
  ipAddress?: string | null;
}
type Outcome<T = undefined> = { ok: true; value: T } | { ok: false; message: string };

const isAdmin = (actor: ConfigActor) => actor.roles.includes("IT_ADMIN") || actor.roles.includes("SUPER_ADMIN");
const ENTITY: Record<ModuleKind, string> = { TASK: "TASK_TYPE", INFO: "INFO_TYPE" };

export const STARTER_FORM: Record<ModuleKind, FormField[]> = { TASK: [], INFO: [] };

export function settingsSchemaFor(module: ModuleKind) {
  return module === "TASK" ? taskSettingsSchema : infoSettingsSchema;
}

export function defaultSettings(module: ModuleKind): TaskSettings | InfoSettings {
  return module === "TASK" ? DEFAULT_TASK_SETTINGS : DEFAULT_INFO_SETTINGS;
}

const detailsSchema = z.object({
  code: z
    .string()
    .trim()
    .toUpperCase()
    .regex(/^[A-Z][A-Z0-9_]{1,39}$/, "The code uses capital letters, numbers and _ (2–40), e.g. IT_SUPPORT."),
  name: z.string().trim().min(3, "Give it a name of at least 3 characters.").max(120),
  description: z.string().trim().max(500).optional(),
});

function audit(actor: ConfigActor, module: ModuleKind, action: string, typeId: number, metadata: Record<string, unknown>, db?: Parameters<typeof recordAudit>[1]) {
  return recordAudit({ actorUserId: actor.id, action, entityType: ENTITY[module], entityId: typeId, sessionId: actor.sessionId, ipAddress: actor.ipAddress ?? null, metadata }, db);
}

export async function createModuleType(module: ModuleKind, input: { code: string; name: string; description?: string }, actor: ConfigActor): Promise<Outcome<{ id: number }>> {
  if (!isAdmin(actor)) return { ok: false, message: "Not found." };
  const parsed = detailsSchema.safeParse(input);
  if (!parsed.success) return { ok: false, message: parsed.error.issues[0]?.message ?? "Check the details." };
  if (await findModuleTypeByCode(module, parsed.data.code)) return { ok: false, message: `The code ${parsed.data.code} is already used. Choose another.` };
  try {
    const id = await withTransaction(async (connection) => {
      const typeId = await insertModuleType({ module, code: parsed.data.code, name: parsed.data.name, description: parsed.data.description || null }, actor.id, connection);
      const version = await insertTypeVersion(typeId, STARTER_FORM[module], defaultSettings(module), actor.id, connection);
      await audit(actor, module, "MODULE_TYPE_CREATED", typeId, { code: parsed.data.code, name: parsed.data.name, draftVersion: version.versionNo }, connection);
      return typeId;
    });
    return { ok: true, value: { id } };
  } catch (error) {
    if ((error as { code?: string }).code === "ER_DUP_ENTRY") return { ok: false, message: `The code ${parsed.data.code} is already used. Choose another.` };
    throw error;
  }
}

// Save the draft: details, form and settings. Problems are returned as
// warnings (a draft may be incomplete); publishing refuses them.
export async function saveTypeDraft(
  module: ModuleKind,
  typeId: number,
  input: { name: string; description?: string; form: unknown; settings: unknown },
  actor: ConfigActor,
): Promise<Outcome<{ problems: string[] }>> {
  if (!isAdmin(actor)) return { ok: false, message: "Not found." };
  const form = formFieldSchema.array().max(60).safeParse(input.form);
  if (!form.success) return { ok: false, message: form.error.issues[0]?.message ?? "Check the fields." };
  const settings = settingsSchemaFor(module).safeParse(input.settings);
  if (!settings.success) return { ok: false, message: `Check the options: ${settings.error.issues[0]?.message ?? "invalid"}.` };
  const details = detailsSchema.pick({ name: true, description: true }).safeParse({ name: input.name, description: input.description });
  if (!details.success) return { ok: false, message: details.error.issues[0]?.message ?? "Check the name." };
  return withTransaction(async (connection) => {
    const type = await findModuleType(typeId, connection, true);
    if (!type || type.module !== module) return { ok: false, message: "Not found." } as const;
    const draft = await findVersionByStatus(typeId, "DRAFT", connection);
    if (!draft) return { ok: false, message: "There's no draft to save. Start a new draft first." } as const;
    await updateDraftVersion(draft.id, form.data, settings.data, connection);
    await updateModuleTypeDetails(typeId, { name: details.data.name, description: details.data.description || null }, connection);
    await audit(actor, module, "MODULE_TYPE_DRAFT_SAVED", typeId, {
      version: draft.versionNo,
      nameBefore: type.name,
      nameAfter: details.data.name,
      fieldsBefore: draft.form.map((field) => `${field.key}:${field.type}`),
      fieldsAfter: form.data.map((field) => `${field.key}:${field.type}`),
      settingsBefore: draft.settings,
      settingsAfter: settings.data,
    }, connection);
    return { ok: true, value: { problems: checkTypeDraft(module, form.data, settings.data) } } as const;
  });
}

// A new draft, copied from the live version (or the latest one).
export async function startTypeDraft(module: ModuleKind, typeId: number, actor: ConfigActor): Promise<Outcome<{ versionNo: number }>> {
  if (!isAdmin(actor)) return { ok: false, message: "Not found." };
  return withTransaction(async (connection) => {
    const type = await findModuleType(typeId, connection, true);
    if (!type || type.module !== module) return { ok: false, message: "Not found." } as const;
    if (await findVersionByStatus(typeId, "DRAFT", connection)) return { ok: false, message: "A draft already exists. Edit it or discard it first." } as const;
    const live = await findVersionByStatus(typeId, "PUBLISHED", connection);
    const version = await insertTypeVersion(typeId, live?.form ?? STARTER_FORM[module], live?.settings ?? defaultSettings(module), actor.id, connection);
    await audit(actor, module, "MODULE_TYPE_DRAFT_STARTED", typeId, { version: version.versionNo, from: live?.versionNo ?? null }, connection);
    return { ok: true, value: { versionNo: version.versionNo } } as const;
  });
}

export async function discardTypeDraft(module: ModuleKind, typeId: number, actor: ConfigActor): Promise<Outcome> {
  if (!isAdmin(actor)) return { ok: false, message: "Not found." };
  return withTransaction(async (connection) => {
    const type = await findModuleType(typeId, connection, true);
    if (!type || type.module !== module) return { ok: false, message: "Not found." } as const;
    const draft = await findVersionByStatus(typeId, "DRAFT", connection);
    if (!draft) return { ok: false, message: "There's no draft." } as const;
    if (!(await findVersionByStatus(typeId, "PUBLISHED", connection)) && draft.versionNo === 1) return { ok: false, message: "This is the type's first version; retire the type instead." } as const;
    await deleteDraftVersion(draft.id, connection);
    await audit(actor, module, "MODULE_TYPE_DRAFT_DISCARDED", typeId, { version: draft.versionNo }, connection);
    return { ok: true, value: undefined } as const;
  });
}

// Publish: the draft must pass every check. New records use it; earlier
// records keep the version they were made with.
export async function publishTypeDraft(module: ModuleKind, typeId: number, actor: ConfigActor): Promise<Outcome<{ versionNo: number }>> {
  if (!isAdmin(actor)) return { ok: false, message: "Not found." };
  return withTransaction(async (connection) => {
    const type = await findModuleType(typeId, connection, true);
    if (!type || type.module !== module) return { ok: false, message: "Not found." } as const;
    const draft = await findVersionByStatus(typeId, "DRAFT", connection);
    if (!draft) return { ok: false, message: "There's no draft to publish." } as const;
    const settings = settingsSchemaFor(module).safeParse(draft.settings);
    if (!settings.success) return { ok: false, message: "The draft's options are incomplete. Open and save them again." } as const;
    const problems = checkTypeDraft(module, draft.form, settings.data);
    if (problems.length) return { ok: false, message: `Fix these first: ${problems.join(" ")}` } as const;
    const live = await findVersionByStatus(typeId, "PUBLISHED", connection);
    await publishDraftVersion(typeId, draft.id, actor.id, connection);
    await audit(actor, module, "MODULE_TYPE_PUBLISHED", typeId, { version: draft.versionNo, replaced: live?.versionNo ?? null, fields: draft.form.map((field) => field.key) }, connection);
    return { ok: true, value: { versionNo: draft.versionNo } } as const;
  });
}

// Retire: no new records; existing ones stay readable and workable.
export async function setTypeActive(module: ModuleKind, typeId: number, active: boolean, actor: ConfigActor): Promise<Outcome> {
  if (!isAdmin(actor)) return { ok: false, message: "Not found." };
  return withTransaction(async (connection) => {
    const type = await findModuleType(typeId, connection, true);
    if (!type || type.module !== module) return { ok: false, message: "Not found." } as const;
    if (!(await setModuleTypeActive(typeId, active, connection))) return { ok: false, message: active ? "It's already active." : "It's already retired." } as const;
    await audit(actor, module, active ? "MODULE_TYPE_REACTIVATED" : "MODULE_TYPE_RETIRED", typeId, { code: type.code }, connection);
    return { ok: true, value: undefined } as const;
  });
}
