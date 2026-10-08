import "server-only";
import { withTransaction } from "@/lib/db/transaction";
import {
  applyTemplateVerdict,
  findActiveTemplate,
  listTemplateVersions,
  markTemplateSubmitted,
  nameTakenElsewhere,
  saveTemplateDraft,
  tryConsumeWhatsAppRateLimit,
  versionsFor,
  type TemplateVersion,
} from "@/lib/db/repositories/whatsapp.repository";
import { recordAudit } from "@/lib/db/repositories/audit.repository";
import { CeoitboxError, createTemplate, listTemplates, sendTemplateMessage, syncTemplatesFromMeta, type TemplateCategory } from "@/server/integrations/ceoitbox/client";
import { getWhatsAppConfig } from "@/server/settings/values";
import { checkFooter, checkTemplateName, compileNamedBody, outcomeOf, versionedName } from "@/server/notifications/template-authoring";
import { findTemplateEntry, WHATSAPP_TEMPLATES, whatsappValue, type TemplateEntry } from "@/server/notifications/templates";

// WhatsApp template creator (S7, D-076, F-42b). Super Admin only: every
// function re-checks the role. CEOITBox errors are shown only here (this
// area is Super Admin only, D-016); the API key never is.
export interface RegistryActor {
  id: number;
  roles: readonly string[];
  sessionId: string | null;
}

export type RegistryResult<T = null> = { ok: true; value: T; message: string } | { ok: false; message: string; fieldErrors?: Record<string, string> };

const NOT_FOUND = { ok: false as const, message: "Not found." };
const isSuperAdmin = (actor: RegistryActor) => actor.roles.includes("SUPER_ADMIN");

function providerMessage(error: unknown): string {
  if (error instanceof CeoitboxError) return error.message;
  return "Something went wrong talking to CEOITBox. See the server log.";
}

export interface BoardEntry {
  entry: TemplateEntry;
  versions: TemplateVersion[];
  live: TemplateVersion | null; // what notify() sends now
  latest: TemplateVersion | null;
}

export async function loadTemplateBoard(): Promise<BoardEntry[]> {
  const versions = await listTemplateVersions();
  return WHATSAPP_TEMPLATES.map((entry) => {
    const mine = versions.filter((version) => version.code === entry.code);
    const live = [...mine].reverse().find((version) => version.status === "ACTIVE" && version.approvalStatus === "APPROVED" && version.providerName) ?? null;
    return { entry, versions: mine, live, latest: mine.at(-1) ?? null };
  });
}

export interface DraftInput {
  name: string;
  category: TemplateCategory;
  body: string; // named placeholders
  footer: string;
}

// Save the wording as a draft. An unsent draft is updated in place; once a
// version is submitted, a change becomes the next version with its own name.
export async function saveDraft(code: string, input: DraftInput, actor: RegistryActor): Promise<RegistryResult<{ version: number; name: string }>> {
  const entry = findTemplateEntry(code);
  if (!isSuperAdmin(actor) || !entry) return NOT_FOUND;
  const fieldErrors: Record<string, string> = {};
  const nameProblem = checkTemplateName(input.name);
  if (nameProblem) fieldErrors.name = nameProblem;
  const footer = input.footer.trim();
  const footerProblem = checkFooter(footer);
  if (footerProblem) fieldErrors.footer = footerProblem;
  const compiled = compileNamedBody(input.body, entry.variables);
  if (!compiled.ok) fieldErrors.body = compiled.errors.join(" ");
  if (!["UTILITY", "MARKETING"].includes(input.category)) fieldErrors.category = "Choose Utility (recommended) or Marketing.";
  if (Object.keys(fieldErrors).length || !compiled.ok) return { ok: false, message: "Check the highlighted fields.", fieldErrors };

  const versions = await versionsFor(code);
  const latest = versions.at(-1) ?? null;
  const editable = latest && !latest.submittedAt ? latest : null;
  const version = editable ? editable.version : (latest?.version ?? 0) + 1;
  // A submitted name can't be reused for new wording.
  const usedNames = new Set(versions.filter((item) => item.submittedAt).map((item) => item.providerName));
  const name = usedNames.has(input.name) ? versionedName(input.name, version) : input.name;
  if (await nameTakenElsewhere(name, editable?.id ?? null)) return { ok: false, message: "Check the highlighted fields.", fieldErrors: { name: "Another template already uses this name. Pick a different one." } };

  await withTransaction(async (db) => {
    await saveTemplateDraft(
      {
        existingId: editable?.id ?? null,
        code,
        eventType: entry.eventType,
        version,
        providerName: name,
        category: input.category,
        body: compiled.value.body,
        footer: footer || null,
        variables: compiled.value.variables,
      },
      actor.id,
      db,
    );
    await recordAudit({ actorUserId: actor.id, action: "WHATSAPP_TEMPLATE_DRAFTED", entityType: "WHATSAPP_TEMPLATE", entityId: code, sessionId: actor.sessionId, metadata: { version, name } }, db);
  });
  const renamed = name !== input.name ? ` It was saved as ${name}, because ${input.name} was already sent to Meta.` : "";
  return { ok: true, value: { version, name }, message: `Draft version ${version} saved.${renamed} Submit it when it's ready.` };
}

// Send the latest draft to CEOITBox, which passes it to Meta for review.
export async function submitDraft(code: string, actor: RegistryActor): Promise<RegistryResult> {
  const entry = findTemplateEntry(code);
  if (!isSuperAdmin(actor) || !entry) return NOT_FOUND;
  const latest = (await versionsFor(code)).at(-1);
  if (!latest || latest.submittedAt || !latest.body || !latest.providerName) return { ok: false, message: "Save a draft first; there is nothing new to submit." };
  const examples = latest.variableKeys.map((key) => entry.variables.find((variable) => variable.key === key)?.sample ?? "-");
  try {
    const result = await createTemplate(
      await getWhatsAppConfig(),
      { name: latest.providerName, language: "en", category: latest.category as TemplateCategory, body: latest.body, examples, footer: latest.footer },
      { fetch },
    );
    await withTransaction(async (db) => {
      await markTemplateSubmitted(latest.id, actor.id, db);
      await recordAudit({ actorUserId: actor.id, action: "WHATSAPP_TEMPLATE_SUBMITTED", entityType: "WHATSAPP_TEMPLATE", entityId: code, sessionId: actor.sessionId, metadata: { version: latest.version, name: latest.providerName } }, db);
    });
    return { ok: true, value: null, message: `${result.message} Meta usually decides within minutes to a day; press "Sync status" to check.` };
  } catch (error) {
    await recordAudit({ actorUserId: actor.id, action: "WHATSAPP_TEMPLATE_SUBMIT_FAILED", entityType: "WHATSAPP_TEMPLATE", entityId: code, sessionId: actor.sessionId, result: "FAILURE", metadata: { code: error instanceof CeoitboxError ? error.code : "UNEXPECTED" } });
    return { ok: false, message: providerMessage(error) };
  }
}

export interface SyncReport {
  approved: number;
  pending: number;
  rejected: number;
  paused: number;
  notFound: string[];
}

// Pull the latest status from Meta through CEOITBox and apply it to every
// version that has a name (submitted here, or created in the CEOITBox
// dashboard and named here).
export async function syncStatuses(actor: RegistryActor): Promise<RegistryResult<SyncReport>> {
  if (!isSuperAdmin(actor)) return NOT_FOUND;
  try {
    const config = await getWhatsAppConfig();
    await syncTemplatesFromMeta(config, { fetch });
    const provider = await listTemplates(config, { fetch });
    const byName = new Map(provider.filter((item) => item.language.toLowerCase().startsWith("en")).map((item) => [item.name, item]));
    const report: SyncReport = { approved: 0, pending: 0, rejected: 0, paused: 0, notFound: [] };
    const codes = new Set(WHATSAPP_TEMPLATES.map((entry) => entry.code));
    const rows = (await listTemplateVersions()).filter((row) => codes.has(row.code) && row.providerName && row.status !== "RETIRED");
    await withTransaction(async (db) => {
      for (const row of rows) {
        const found = byName.get(row.providerName!);
        if (!found) {
          if (row.submittedAt) report.notFound.push(row.providerName!);
          continue;
        }
        const outcome = outcomeOf(found.status);
        report[outcome === "APPROVED" ? "approved" : outcome === "REJECTED" ? "rejected" : outcome === "PAUSED" ? "paused" : "pending"] += 1;
        await applyTemplateVerdict(row, { outcome, metaStatus: found.status, reason: found.rejectedReason }, db);
      }
      await recordAudit({ actorUserId: actor.id, action: "WHATSAPP_TEMPLATES_SYNCED", entityType: "WHATSAPP_TEMPLATE", entityId: "all", sessionId: actor.sessionId, metadata: { ...report } }, db);
    });
    const parts = [`${report.approved} approved (live)`, `${report.pending} waiting`, `${report.rejected} rejected`, ...(report.paused ? [`${report.paused} paused by Meta`] : [])];
    const missing = report.notFound.length ? ` Not found at CEOITBox yet: ${report.notFound.join(", ")}.` : "";
    return { ok: true, value: report, message: `Synced with Meta: ${parts.join(", ")}.${missing}` };
  } catch (error) {
    return { ok: false, message: providerMessage(error) };
  }
}

// Send the live version to the Super Admin's own WhatsApp number, with the
// sample values. Never to anyone else.
export async function sendTemplateTest(code: string, actor: RegistryActor & { whatsappNumber: string | null }): Promise<RegistryResult> {
  const entry = findTemplateEntry(code);
  if (!isSuperAdmin(actor) || !entry) return NOT_FOUND;
  if (!actor.whatsappNumber) return { ok: false, message: "Your account has no WhatsApp number. Add it in Admin → Users first." };
  const template = await findActiveTemplate(entry.eventType);
  if (!template) return { ok: false, message: "This message has no approved version yet. Submit it and sync first." };
  const samples = new Map(entry.variables.map((variable) => [variable.key, variable.sample]));
  try {
    await sendTemplateMessage(
      await getWhatsAppConfig(),
      { to: actor.whatsappNumber, templateName: template.providerName, language: template.language, templateVariables: template.variableKeys.map((key) => whatsappValue(samples.get(key) ?? "")), userMessageId: `ars-test-${code.toLowerCase()}` },
      { fetch, tryConsumeRateLimit: tryConsumeWhatsAppRateLimit },
    );
    await recordAudit({ actorUserId: actor.id, action: "WHATSAPP_TEMPLATE_TEST_SENT", entityType: "WHATSAPP_TEMPLATE", entityId: code, sessionId: actor.sessionId, metadata: { name: template.providerName } });
    return { ok: true, value: null, message: `Sent ${template.providerName} to your WhatsApp.` };
  } catch (error) {
    return { ok: false, message: providerMessage(error) };
  }
}
