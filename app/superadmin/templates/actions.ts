"use server";

import { revalidatePath } from "next/cache";
import { requireApiArea } from "@/server/authorization/guards";
import { saveDraft, sendTemplateTest, submitDraft, syncStatuses } from "@/server/notifications/template-registry";
import { logError } from "@/lib/logging/logger";
import type { ActionResult } from "@/lib/http/action-result";
import type { TemplateCategory } from "@/server/integrations/ceoitbox/client";

// /superadmin/templates (S7, D-076, F-42b): the WhatsApp template creator.
// Super Admin only; the service checks the role again.
const NOT_FOUND: ActionResult = { ok: false, message: "Not found." };

async function superAdmin() {
  try {
    const session = await requireApiArea("superadmin");
    return { id: session.user.id, roles: session.user.roles, sessionId: session.sessionId, whatsappNumber: session.user.whatsappNumber };
  } catch {
    return null;
  }
}

const codeOf = (formData: FormData) => String(formData.get("code") ?? "");

function done(code: string) {
  revalidatePath("/superadmin/templates");
  if (code) revalidatePath(`/superadmin/templates/${code}`);
}

export async function saveTemplateDraftAction(_previous: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const actor = await superAdmin();
  if (!actor) return NOT_FOUND;
  const code = codeOf(formData);
  try {
    const result = await saveDraft(
      code,
      {
        name: String(formData.get("name") ?? "").trim(),
        category: String(formData.get("category") ?? "UTILITY") as TemplateCategory,
        body: String(formData.get("body") ?? ""),
        footer: String(formData.get("footer") ?? ""),
      },
      actor,
    );
    if (!result.ok) return { ok: false, message: result.message, fieldErrors: result.fieldErrors };
    done(code);
    return { ok: true, message: result.message };
  } catch (error) {
    logError("saveTemplateDraftAction failed", error);
    return { ok: false, message: "Couldn't save. Please try again." };
  }
}

export async function submitTemplateAction(_previous: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const actor = await superAdmin();
  if (!actor) return NOT_FOUND;
  const code = codeOf(formData);
  try {
    const result = await submitDraft(code, actor);
    done(code);
    return { ok: result.ok, message: result.message };
  } catch (error) {
    logError("submitTemplateAction failed", error);
    return { ok: false, message: "Couldn't submit. Please try again." };
  }
}

export async function syncTemplatesAction(): Promise<ActionResult> {
  const actor = await superAdmin();
  if (!actor) return NOT_FOUND;
  try {
    const result = await syncStatuses(actor);
    done("");
    return { ok: result.ok, message: result.message };
  } catch (error) {
    logError("syncTemplatesAction failed", error);
    return { ok: false, message: "Couldn't sync. Please try again." };
  }
}

export async function testTemplateAction(_previous: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const actor = await superAdmin();
  if (!actor) return NOT_FOUND;
  try {
    const result = await sendTemplateTest(codeOf(formData), actor);
    return { ok: result.ok, message: result.message };
  } catch (error) {
    logError("testTemplateAction failed", error);
    return { ok: false, message: "Couldn't send the test. Please try again." };
  }
}
