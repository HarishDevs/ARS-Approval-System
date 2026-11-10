import "server-only";
import { withTransaction } from "@/lib/db/transaction";
import { afterResponse } from "@/lib/http/after-response";
import { recordAudit } from "@/lib/db/repositories/audit.repository";
import { insertOutbox } from "@/lib/db/repositories/outbox.repository";
import { nextRequestNumber } from "@/lib/db/repositories/approvals.repository";
import { loadFieldLookups } from "@/lib/db/repositories/lookups.repository";
import { findLiveType, versionWithType } from "@/lib/db/repositories/module-types.repository";
import { listPeopleFacts, personFacts } from "@/lib/db/repositories/tasks.repository";
import { acknowledge, appendInfoEvent, deleteDraftInfo, findInfo, findRecipient, insertInfo, insertRecipients, listRecipients, loadTargets, replaceTargets, updateInfo, type InfoRecord, type InfoTargets } from "@/lib/db/repositories/info.repository";
import { discardStaged, insertRecordFiles, RecordFileError, type StagedFile } from "@/server/modules/files";
import { infoMessages } from "@/server/modules/messages";
import { INFO_PRIORITIES, mayCreate, parseInfoSettings, type InfoPriority, type InfoSettings } from "@/server/modules/settings";
import { allowedInfoActions, canSeeInfo, MAX_RECIPIENTS, resolveAck, resolveRecipients, targetProblems, type InfoAction, type InfoViewer } from "@/server/modules/info-rules";
import { parseFormSubmission, type FormField } from "@/server/forms/fields";
import { withFileCounts, isAdminActor, type TaskActor } from "@/server/modules/tasks";
import { deliverOutbox } from "@/server/approvals/service";

// v1.9.0 (D-143, D-145): Information Management. Drafts are private to the
// sender; publishing fixes the recipient list and tells each recipient.
// Reading (opening) and acknowledging (a button) are recorded separately and
// never approve or complete anything.
export type InfoActor = TaskActor;
export type InfoResult<T = undefined> = { ok: true; value: T } | { ok: false; message: string; fieldErrors?: Record<string, string> };

export const indiaToday = (now = new Date()) => new Date(now.getTime() + 330 * 60_000).toISOString().slice(0, 10);
const ISO = /^\d{4}-\d{2}-\d{2}$/;
const addDays = (dayText: string, days: number) => new Date(Date.parse(`${dayText}T00:00:00Z`) + days * 86_400_000).toISOString().slice(0, 10);
// The first messages go straight away; the rest (large audiences) go with the next job run.
const SEND_NOW = 25;

async function send(ids: number[]) {
  if (ids.length) await afterResponse("information messages", () => deliverOutbox(ids.slice(0, SEND_NOW)));
}

export async function loadInfoFor(id: number, actor: { id: number; roles: readonly string[] }) {
  const item = await findInfo(id);
  if (!item) return null;
  const recipient = await findRecipient(item.id, actor.id);
  const viewer: InfoViewer = { id: actor.id, isAdmin: isAdminActor(actor), recipient };
  if (!canSeeInfo(item, viewer)) return null;
  const ctx = await versionWithType(item.typeVersionId);
  if (!ctx) return null;
  const settings = parseInfoSettings(ctx.version.settings);
  return { item, settings, form: ctx.version.form, versionNo: ctx.version.versionNo, viewer, actions: allowedInfoActions(item, viewer, settings, indiaToday()) };
}

export interface SaveInfoInput {
  infoId: number | null; // null = new
  typeId: number;
  rowVersion: number | null;
  title: string;
  body: string;
  priority: string;
  askAck: boolean;
  effectiveOn: string;
  expiresOn: string;
  targets: InfoTargets;
  fields: Record<string, string | undefined>;
  files: StagedFile[];
  publish: boolean;
}

function validate(input: SaveInfoInput, form: readonly FormField[], settings: InfoSettings, active: ReadonlySet<number>, lookups: Awaited<ReturnType<typeof loadFieldLookups>>) {
  const errors: Record<string, string> = {};
  const title = input.title.trim();
  if (title.length < 3 || title.length > 200) errors.title = "Give it a subject of 3 to 200 characters.";
  const body = input.body.trim();
  if (body.length < 1) errors.body = "Write the message.";
  else if (body.length > 20000) errors.body = "Use 20,000 characters or fewer.";
  const priority = (INFO_PRIORITIES as readonly string[]).includes(input.priority) ? (input.priority as InfoPriority) : settings.defaultPriority;
  const effectiveOn = ISO.test(input.effectiveOn) ? input.effectiveOn : null;
  let expiresOn = ISO.test(input.expiresOn) ? input.expiresOn : null;
  if (!expiresOn && settings.expiryDays) expiresOn = addDays(indiaToday(), settings.expiryDays);
  if (expiresOn && expiresOn < indiaToday()) errors.expires_on = "The expiry date can't be in the past.";
  if (expiresOn && effectiveOn && expiresOn < effectiveOn) errors.expires_on = "It can't expire before it takes effect.";
  const problems = targetProblems(input.targets, settings);
  // A draft may have no recipients yet; publishing needs them.
  const relevant = input.publish ? problems : problems.filter((problem) => !problem.startsWith("Choose who"));
  if (relevant.length) errors.recipients = relevant.join(" ");
  const fields = withFileCounts(form, input.fields, input.files);
  const parsed = parseFormSubmission(form, fields, active, lookups);
  if (!parsed.ok) Object.assign(errors, parsed.errors);
  return { errors, title, body, priority, effectiveOn, expiresOn, data: parsed.data, ackRequired: resolveAck(settings.ack, input.askAck) };
}

function audience(people: Awaited<ReturnType<typeof listPeopleFacts>>) {
  const active = new Map(people.map((person) => [person.id, { departmentId: person.departmentId }]));
  const groupMembers = new Map<number, number[]>();
  for (const person of people) for (const group of person.groupIds) groupMembers.set(group, [...(groupMembers.get(group) ?? []), person.id]);
  return { active, groupMembers };
}

// Publish inside the caller's transaction; returns the outbox ids.
async function publishLocked(item: InfoRecord, targets: InfoTargets, directory: ReturnType<typeof audience>, actor: InfoActor, connection: Parameters<typeof insertOutbox>[2]): Promise<{ outbox: number[]; recipients: number } | { error: string }> {
  const recipients = resolveRecipients(targets, directory, item.createdBy);
  if (recipients.size === 0) return { error: "Nobody to send it to: the chosen people or groups have no other active members." };
  if (recipients.size > MAX_RECIPIENTS) return { error: `That's ${recipients.size} people; the most at once is ${MAX_RECIPIENTS}.` };
  await insertRecipients(item.id, recipients, connection);
  if (!(await updateInfo(item.id, item.rowVersion, { status: "PUBLISHED", published_at: new Date() }, connection))) return { error: "It changed while you were looking. Reload and try again." };
  const bySource: Record<string, number> = {};
  for (const source of recipients.values()) bySource[source] = (bySource[source] ?? 0) + 1;
  await appendInfoEvent(item.id, { actorId: actor.id, type: "PUBLISHED", payload: { recipients: recipients.size, bySource, targets } }, connection);
  await recordAudit({ actorUserId: actor.id, action: "INFO_PUBLISHED", entityType: "INFO", entityId: item.id, sessionId: actor.sessionId, ipAddress: actor.ipAddress ?? null, metadata: { infoNo: item.infoNo, recipients: recipients.size, targets } }, connection);
  const summary = { id: item.id, infoNo: item.infoNo, title: item.title, ackRequired: item.ackRequired };
  const outbox = await insertOutbox(null, [...recipients.keys()].map((userId) => infoMessages.published(summary, userId, actor.name)), connection);
  return { outbox, recipients: recipients.size };
}

export async function saveInformation(input: SaveInfoInput, actor: InfoActor): Promise<InfoResult<{ id: number; infoNo: string; published: number | null }>> {
  const fail = (message: string, fieldErrors?: Record<string, string>): InfoResult<{ id: number; infoNo: string; published: number | null }> => ({ ok: false, message, fieldErrors });
  try {
    const type = await findLiveType("INFO", input.typeId);
    let form: FormField[];
    let settings: InfoSettings;
    let versionId: number;
    if (input.infoId) {
      // Editing a draft keeps the type version it was started with.
      const existing = await findInfo(input.infoId);
      if (!existing || existing.createdBy !== actor.id || existing.status !== "DRAFT") return fail("Not found.");
      const ctx = await versionWithType(existing.typeVersionId);
      if (!ctx) return fail("Not found.");
      form = ctx.version.form;
      settings = parseInfoSettings(ctx.version.settings);
      versionId = existing.typeVersionId;
    } else {
      if (!type) return fail("That information type isn't available.");
      form = type.form;
      settings = parseInfoSettings(type.settings);
      versionId = type.versionId;
    }
    const me = await personFacts(actor.id);
    if (!me || !mayCreate(settings.access, { id: actor.id, departmentId: me.departmentId })) return fail("You can't send information of this type.");
    const people = await listPeopleFacts();
    const checked = validate(input, form, settings, new Set(people.map((person) => person.id)), await loadFieldLookups());
    if (Object.keys(checked.errors).length) {
      await discardStaged(input.files);
      return fail("Check the highlighted fields.", checked.errors);
    }
    const directory = audience(people);
    const outcome = await withTransaction(async (connection) => {
      let item: InfoRecord | null;
      let itemId = input.infoId;
      const values = { title: checked.title, body: checked.body, priority: checked.priority, ackRequired: checked.ackRequired, effectiveOn: checked.effectiveOn, expiresOn: checked.expiresOn, formData: checked.data };
      if (input.infoId) {
        item = await findInfo(input.infoId, connection, true);
        if (!item || item.status !== "DRAFT" || item.createdBy !== actor.id) return { error: "Not found." } as const;
        if (input.rowVersion !== null && input.rowVersion !== item.rowVersion) return { error: "It changed while you were looking. Reload and try again." } as const;
        await updateInfo(item.id, item.rowVersion, { title: values.title, body: values.body, priority: values.priority, ack_required: values.ackRequired, effective_on: values.effectiveOn, expires_on: values.expiresOn, form_data_json: values.formData }, connection);
        await appendInfoEvent(item.id, { actorId: actor.id, type: "DRAFT_SAVED" }, connection);
      } else {
        const infoNo = await nextRequestNumber("INF", connection);
        const id = await insertInfo({ ...values, infoNo, typeVersionId: versionId, createdBy: actor.id }, connection);
        itemId = id;
        await appendInfoEvent(id, { actorId: actor.id, type: "CREATED" }, connection);
        await recordAudit({ actorUserId: actor.id, action: "INFO_CREATED", entityType: "INFO", entityId: id, sessionId: actor.sessionId, ipAddress: actor.ipAddress ?? null, metadata: { infoNo, typeVersionId: versionId } }, connection);
      }
      item = await findInfo(itemId!, connection, true);
      if (!item) return { error: "Not found." } as const;
      await replaceTargets(item.id, input.targets, connection);
      await insertRecordFiles("INFO", item.id, input.files, actor.id, "GENERAL", connection);
      if (!input.publish) return { id: item.id, infoNo: item.infoNo, outbox: [] as number[], published: null } as const;
      const published = await publishLocked(item, input.targets, directory, actor, connection);
      if ("error" in published) throw new PublishError(published.error);
      return { id: item.id, infoNo: item.infoNo, outbox: published.outbox, published: published.recipients } as const;
    });
    if ("error" in outcome) {
      await discardStaged(input.files);
      return fail(outcome.error ?? "Not found.");
    }
    await send(outcome.outbox);
    return { ok: true, value: { id: outcome.id, infoNo: outcome.infoNo, published: outcome.published } };
  } catch (error) {
    await discardStaged(input.files);
    if (error instanceof PublishError || error instanceof RecordFileError) return fail(error.message, error instanceof PublishError ? { recipients: error.message } : undefined);
    throw error;
  }
}

class PublishError extends Error {}

export interface InfoActionInput {
  infoId: number;
  action: InfoAction;
  rowVersion: number | null;
  reason: string;
  fields: Record<string, string | undefined>;
  expiresOn: string;
}

export async function actOnInfo(input: InfoActionInput, actor: InfoActor): Promise<InfoResult<{ message: string; deleted?: boolean }>> {
  const fail = (message: string, fieldErrors?: Record<string, string>): InfoResult<{ message: string; deleted?: boolean }> => ({ ok: false, message, fieldErrors });
  const reason = input.reason.trim();
  if (input.action === "WITHDRAW" && reason.length < 3) return fail("Give a short reason.", { reason: "Give a short reason (3 characters or more)." });
  if (reason.length > 500) return fail("Use 500 characters or fewer.", { reason: "Use 500 characters or fewer." });
  const people = input.action === "PUBLISH" || input.action === "EDIT_PUBLISHED" ? await listPeopleFacts() : [];
  const lookups = input.action === "EDIT_PUBLISHED" ? await loadFieldLookups() : undefined;
  const outcome = await withTransaction(async (connection) => {
    const item = await findInfo(input.infoId, connection, true);
    if (!item) return { error: "Not found." } as const;
    const recipient = await findRecipient(item.id, actor.id, connection);
    const ctx = await versionWithType(item.typeVersionId, connection);
    if (!ctx) return { error: "Not found." } as const;
    const settings = parseInfoSettings(ctx.version.settings);
    const allowed = allowedInfoActions(item, { id: actor.id, isAdmin: isAdminActor(actor), recipient }, settings, indiaToday());
    if (!allowed.has(input.action)) return { error: allowed.size || recipient || item.createdBy === actor.id ? "That can't be done now. Reload to see the latest state." : "Not found." } as const;
    if (input.rowVersion !== null && input.rowVersion !== item.rowVersion && input.action !== "ACKNOWLEDGE") return { error: "It changed while you were looking. Reload and try again." } as const;
    const summary = { id: item.id, infoNo: item.infoNo, title: item.title, ackRequired: item.ackRequired };
    const audit = (action: string, metadata: Record<string, unknown> = {}) =>
      recordAudit({ actorUserId: actor.id, action, entityType: "INFO", entityId: item.id, sessionId: actor.sessionId, ipAddress: actor.ipAddress ?? null, metadata: { infoNo: item.infoNo, ...metadata } }, connection);
    switch (input.action) {
      case "ACKNOWLEDGE": {
        if (!(await acknowledge(item.id, actor.id, connection))) return { message: "Already acknowledged.", outbox: [] as number[] } as const;
        await appendInfoEvent(item.id, { actorId: actor.id, type: "ACKNOWLEDGED" }, connection);
        await audit("INFO_ACKNOWLEDGED");
        return { message: "Acknowledged. Thank you.", outbox: [] as number[] } as const;
      }
      case "PUBLISH": {
        const targets = await loadTargets(item.id, connection);
        const problems = targetProblems(targets, settings);
        if (problems.length) return { error: problems.join(" ") } as const;
        const published = await publishLocked(item, targets, audience(people), actor, connection);
        if ("error" in published) return { error: published.error } as const;
        return { message: `Published to ${published.recipients} ${published.recipients === 1 ? "person" : "people"}.`, outbox: published.outbox } as const;
      }
      case "DELETE_DRAFT": {
        await deleteDraftInfo(item.id, connection);
        await audit("INFO_DRAFT_DELETED");
        return { message: "Draft deleted.", outbox: [] as number[], deleted: true } as const;
      }
      case "WITHDRAW": {
        if (!(await updateInfo(item.id, item.rowVersion, { status: "WITHDRAWN", withdrawn_by: actor.id, withdrawn_at: new Date(), withdraw_reason: reason }, connection))) return { error: "It changed while you were looking. Reload and try again." } as const;
        await appendInfoEvent(item.id, { actorId: actor.id, type: "WITHDRAWN", body: reason }, connection);
        await audit("INFO_WITHDRAWN", { reason });
        const recipients = await listRecipients(item.id, connection);
        const outbox = await insertOutbox(null, recipients.map((row) => infoMessages.withdrawn(summary, row.userId, actor.name)), connection);
        return { message: "Withdrawn. Recipients were told.", outbox } as const;
      }
      case "ARCHIVE": {
        if (!(await updateInfo(item.id, item.rowVersion, { status: "ARCHIVED", archived_at: new Date() }, connection))) return { error: "It changed while you were looking. Reload and try again." } as const;
        await appendInfoEvent(item.id, { actorId: actor.id, type: "ARCHIVED", body: reason || null }, connection);
        await audit("INFO_ARCHIVED");
        return { message: "Archived. It stays readable in the history.", outbox: [] as number[] } as const;
      }
      case "EDIT_PUBLISHED": {
        const editable = ctx.version.form.filter((field) => field.editable && field.type !== "ATTACHMENT" && field.type !== "CALC");
        const raw: Record<string, string | undefined> = {};
        for (const field of ctx.version.form) raw[field.key] = editable.includes(field) ? input.fields[field.key] : stored(item.formData[field.key]);
        const parsed = parseFormSubmission(ctx.version.form, raw, new Set(people.map((person) => person.id)), lookups);
        const errors: Record<string, string> = {};
        if (!parsed.ok) for (const field of editable) if (parsed.errors[field.key]) errors[field.key] = parsed.errors[field.key]!;
        const expiresOn = ISO.test(input.expiresOn) ? input.expiresOn : null;
        if (expiresOn && expiresOn < indiaToday()) errors.expires_on = "The expiry date can't be in the past.";
        if (Object.keys(errors).length) return { error: "Check the highlighted fields.", fields: errors } as const;
        const formData = { ...item.formData };
        for (const field of editable) {
          if (parsed.data[field.key] === undefined) delete formData[field.key];
          else formData[field.key] = parsed.data[field.key];
        }
        if (!(await updateInfo(item.id, item.rowVersion, { form_data_json: formData, expires_on: expiresOn }, connection))) return { error: "It changed while you were looking. Reload and try again." } as const;
        const before = Object.fromEntries(editable.map((field) => [field.key, item.formData[field.key] ?? null]));
        const after = Object.fromEntries(editable.map((field) => [field.key, formData[field.key] ?? null]));
        await appendInfoEvent(item.id, { actorId: actor.id, type: "UPDATED", payload: { before: { ...before, expiresOn: item.expiresOn }, after: { ...after, expiresOn } } }, connection);
        await audit("INFO_UPDATED", { before, after, expiresBefore: item.expiresOn, expiresAfter: expiresOn });
        const recipients = await listRecipients(item.id, connection);
        const outbox = await insertOutbox(null, recipients.map((row) => infoMessages.updated(summary, row.userId, actor.name)), connection);
        return { message: "Updated. Recipients were told.", outbox } as const;
      }
      default:
        return { error: "Not found." } as const;
    }
  });
  if ("error" in outcome) return fail(outcome.error!, "fields" in outcome ? outcome.fields : undefined);
  await send(outcome.outbox);
  return { ok: true, value: { message: outcome.message, deleted: "deleted" in outcome ? outcome.deleted : undefined } };
}

function stored(value: unknown): string | undefined {
  if (value === undefined || value === null) return undefined;
  if (Array.isArray(value)) return JSON.stringify(value);
  return String(value);
}
