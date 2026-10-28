"use server";

import { revalidatePath } from "next/cache";
import { getAdminActor } from "@/server/admin/actor";
import { deleteRule, findRule, insertRule, setRuleActive, updateRule } from "@/lib/db/repositories/notification-rules.repository";
import { recordAudit } from "@/lib/db/repositories/audit.repository";
import { ruleSchema } from "@/server/notifications/rule-model";
import { previewRule } from "@/server/notifications/rule-runner";
import { logError } from "@/lib/logging/logger";
import type { ActionResult } from "@/lib/http/action-result";

// D-209: Admin → Reminders & escalations (IT Admin and Super Admin). Every
// change is checked by the rule schema and audited.
const NOT_FOUND: ActionResult = { ok: false, message: "Not found." };
const PAGE = "admin.reminders";

function readRule(formData: FormData) {
  try {
    return ruleSchema.safeParse(JSON.parse(String(formData.get("rule") ?? "{}")));
  } catch {
    return ruleSchema.safeParse(null);
  }
}

export async function saveRuleAction(_previous: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const actor = await getAdminActor(PAGE);
  if (!actor) return NOT_FOUND;
  const parsed = readRule(formData);
  if (!parsed.success) return { ok: false, message: parsed.error.issues.map((issue) => issue.message).slice(0, 3).join(" ") };
  const id = Number(formData.get("id") ?? 0);
  try {
    if (id) {
      const before = await findRule(id);
      if (!before) return NOT_FOUND;
      await updateRule(id, parsed.data, actor.id);
      await recordAudit({ actorUserId: actor.id, action: "NOTIFICATION_RULE_CHANGED", entityType: "NOTIFICATION_RULE", entityId: id, sessionId: actor.sessionId, ipAddress: actor.ipAddress, metadata: { name: parsed.data.name, kind: parsed.data.kind, module: parsed.data.module, active: parsed.data.active } });
    } else {
      const created = await insertRule(parsed.data, actor.id);
      await recordAudit({ actorUserId: actor.id, action: "NOTIFICATION_RULE_CREATED", entityType: "NOTIFICATION_RULE", entityId: created, sessionId: actor.sessionId, ipAddress: actor.ipAddress, metadata: { name: parsed.data.name, kind: parsed.data.kind, module: parsed.data.module, active: parsed.data.active } });
      revalidatePath("/admin/reminders");
      return { ok: true, message: "Saved. The rule runs from the next job run (about every 5 minutes).", data: { id: created } };
    }
    revalidatePath("/admin/reminders");
    return { ok: true, message: "Saved. The rule runs from the next job run (about every 5 minutes).", data: { id } };
  } catch (error) {
    logError("saveRuleAction failed", error);
    return { ok: false, message: "Couldn't save. Please try again." };
  }
}

export async function ruleCommandAction(_previous: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const actor = await getAdminActor(PAGE);
  if (!actor) return NOT_FOUND;
  const id = Number(formData.get("id") ?? 0);
  const command = String(formData.get("command") ?? "");
  const rule = id ? await findRule(id) : null;
  if (!rule) return NOT_FOUND;
  try {
    if (command === "on" || command === "off") {
      await setRuleActive(id, command === "on", actor.id);
      await recordAudit({ actorUserId: actor.id, action: command === "on" ? "NOTIFICATION_RULE_ON" : "NOTIFICATION_RULE_OFF", entityType: "NOTIFICATION_RULE", entityId: id, sessionId: actor.sessionId, ipAddress: actor.ipAddress, metadata: { name: rule.name } });
      revalidatePath("/admin/reminders");
      return { ok: true, message: command === "on" ? `"${rule.name}" is on.` : `"${rule.name}" is off. Nothing more is sent from it.` };
    }
    if (command === "delete") {
      await deleteRule(id);
      await recordAudit({ actorUserId: actor.id, action: "NOTIFICATION_RULE_DELETED", entityType: "NOTIFICATION_RULE", entityId: id, sessionId: actor.sessionId, ipAddress: actor.ipAddress, metadata: { name: rule.name, kind: rule.kind, module: rule.module } });
      revalidatePath("/admin/reminders");
      return { ok: true, message: `"${rule.name}" was deleted.` };
    }
    return NOT_FOUND;
  } catch (error) {
    logError("ruleCommandAction failed", error);
    return { ok: false, message: "Couldn't do that. Please try again." };
  }
}

// What the rule (as it stands in the editor, saved or not) would do now.
export async function previewRuleAction(_previous: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const actor = await getAdminActor(PAGE);
  if (!actor) return NOT_FOUND;
  const parsed = readRule(formData);
  if (!parsed.success) return { ok: false, message: parsed.error.issues.map((issue) => issue.message).slice(0, 3).join(" ") };
  try {
    const preview = await previewRule(parsed.data);
    const examples = preview.examples.map((item) => `${item.ref} · ${item.title}${item.stage ? ` (stage ${item.stage} due now)` : ""}`);
    const what = parsed.data.module === "APPROVAL" ? "pending approval steps" : "open tasks";
    return {
      ok: true,
      message: `${preview.matching} ${what} match the conditions now; ${preview.dueNow} would get a message on the next run if the rule is on.${examples.length ? ` For example: ${examples.join("; ")}.` : ""}`,
    };
  } catch (error) {
    logError("previewRuleAction failed", error);
    return { ok: false, message: "Couldn't test the rule. Please try again." };
  }
}
