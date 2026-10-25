"use server";

import { createHash } from "node:crypto";
import { revalidatePath } from "next/cache";
import { getAdminActor } from "@/server/admin/actor";
import { RULE_SCOPES, saveAiRule, type RuleScope } from "@/lib/db/repositories/ai-rules.repository";
import { recordAudit } from "@/lib/db/repositories/audit.repository";
import { MAX_RULES_CHARS } from "@/server/ai/assistant";
import { logError } from "@/lib/logging/logger";
import type { ActionResult } from "@/lib/http/action-result";

// D-187: save one chat's AI Rules (IT Admin and Super Admin). Audited with
// the size and a fingerprint of the text before and after.
const NOT_FOUND: ActionResult = { ok: false, message: "Not found." };
const fingerprint = (text: string | null) => (text === null ? null : createHash("sha256").update(text).digest("hex").slice(0, 12));

export async function saveAiRuleAction(_previous: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const actor = await getAdminActor("admin.ai_rules");
  if (!actor) return NOT_FOUND;
  const scope = String(formData.get("scope") ?? "");
  if (!(RULE_SCOPES as readonly string[]).includes(scope)) return NOT_FOUND;
  const content = String(formData.get("content") ?? "").replace(/\r\n?/g, "\n").trim();
  if (content.length > MAX_RULES_CHARS) return { ok: false, message: `Keep the rules under ${MAX_RULES_CHARS.toLocaleString("en-IN")} characters; every question sends them to the AI.` };
  try {
    const before = await saveAiRule(scope as RuleScope, content, actor.id);
    await recordAudit({ actorUserId: actor.id, action: "AI_RULES_CHANGED", entityType: "AI_RULES", entityId: scope, sessionId: actor.sessionId, ipAddress: actor.ipAddress, metadata: { before: fingerprint(before), after: fingerprint(content), length: content.length } });
    revalidatePath("/admin/ai-rules");
    return { ok: true, message: "Saved. Pico Bot follows these rules from the next question." };
  } catch (error) {
    logError("saveAiRuleAction failed", error);
    return { ok: false, message: "Couldn't save. Please try again." };
  }
}
