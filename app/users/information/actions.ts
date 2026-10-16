"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireApiArea } from "@/server/authorization/guards";
import { featureOn } from "@/server/settings/features";
import { getActionContext } from "@/lib/http/request-context";
import { readFiles } from "@/server/modules/upload";
import { actOnInfo, saveInformation, type InfoActor } from "@/server/modules/information";
import { INFO_ACTIONS, type InfoAction } from "@/server/modules/info-rules";
import { findLiveType, versionWithType } from "@/lib/db/repositories/module-types.repository";
import { findInfo } from "@/lib/db/repositories/info.repository";
import { logError } from "@/lib/logging/logger";
import type { ActionResult } from "@/lib/http/action-result";

// v1.9.0 (D-143, D-145): Information actions. Session and page access are
// checked first; the service checks the rules for this person under a lock.
async function actor(): Promise<InfoActor | null> {
  try {
    const session = await requireApiArea("users");
    if (!(await featureOn("information", session.user))) return null;
    const { ipAddress } = await getActionContext();
    return { id: session.user.id, name: session.user.name, roles: session.user.roles, sessionId: session.sessionId, ipAddress };
  } catch {
    return null;
  }
}

const text = (formData: FormData, name: string) => {
  const value = formData.get(name);
  return typeof value === "string" ? value : "";
};
const idOf = (value: string) => (/^\d{1,10}$/.test(value) ? Number(value) : null);
const ids = (formData: FormData, name: string) => [...new Set(formData.getAll(name).filter((value): value is string => typeof value === "string" && /^\d{1,10}$/.test(value)).map(Number))].slice(0, 2000);

export async function saveInformationAction(_previous: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const me = await actor();
  if (!me) return { ok: false, message: "Not found." };
  const infoId = idOf(text(formData, "infoId"));
  const typeId = idOf(text(formData, "type"));
  // The form the record uses: its own version when editing a draft, else the live one.
  let form;
  if (infoId) {
    const existing = await findInfo(infoId);
    const ctx = existing ? await versionWithType(existing.typeVersionId) : null;
    if (!existing || !ctx) return { ok: false, message: "Not found." };
    form = ctx.version.form;
  } else {
    const type = typeId ? await findLiveType("INFO", typeId) : null;
    if (!type) return { ok: false, message: "That information type isn't available." };
    form = type.form;
  }
  const files = await readFiles(
    formData,
    form.filter((field) => field.type === "ATTACHMENT").map((field) => field.key),
  );
  if (!files.ok) return { ok: false, message: files.message };
  const fields: Record<string, string | undefined> = {};
  for (const field of form) fields[field.key] = formData.has(field.key) ? text(formData, field.key) : undefined;
  const publish = text(formData, "intent") === "publish";
  let saved: { id: number; infoNo: string; published: number | null };
  try {
    const result = await saveInformation(
      {
        infoId,
        typeId: typeId ?? 0,
        rowVersion: idOf(text(formData, "rowVersion")),
        title: text(formData, "title"),
        body: text(formData, "body"),
        priority: text(formData, "priority"),
        askAck: text(formData, "ack") === "yes",
        effectiveOn: text(formData, "effective_on"),
        expiresOn: text(formData, "expires_on"),
        targets: { people: ids(formData, "people"), departments: ids(formData, "departments"), groups: ids(formData, "groups"), everyone: text(formData, "everyone") === "yes" },
        fields,
        files: files.staged,
        publish,
      },
      me,
    );
    if (!result.ok) return { ok: false, message: result.message, fieldErrors: result.fieldErrors };
    saved = result.value;
  } catch (error) {
    logError("saveInformationAction failed", error);
    return { ok: false, message: "Couldn't save. Please try again." };
  }
  revalidatePath("/users/information");
  redirect(`/users/information/${saved.id}?${saved.published !== null ? `published=${saved.published}` : "saved=1"}`);
}

export async function informationAction(_previous: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const me = await actor();
  if (!me) return { ok: false, message: "Not found." };
  const infoId = idOf(text(formData, "infoId"));
  const action = text(formData, "action") as InfoAction;
  if (!infoId || !(INFO_ACTIONS as readonly string[]).includes(action) || action === "EDIT_DRAFT") return { ok: false, message: "Not found." };
  const fields: Record<string, string | undefined> = {};
  for (const [name, value] of formData.entries()) if (name.startsWith("field:") && typeof value === "string") fields[name.slice(6)] = value;
  let deleted = false;
  try {
    const result = await actOnInfo({ infoId, action, rowVersion: idOf(text(formData, "rowVersion")), reason: text(formData, "reason"), fields, expiresOn: text(formData, "expires_on") }, me);
    if (!result.ok) return { ok: false, message: result.message, fieldErrors: result.fieldErrors };
    deleted = Boolean(result.value.deleted);
    if (!deleted) {
      revalidatePath(`/users/information/${infoId}`);
      revalidatePath("/users/information");
      return { ok: true, message: result.value.message };
    }
  } catch (error) {
    logError("informationAction failed", error, { action });
    return { ok: false, message: "Couldn't do that. Please try again." };
  }
  revalidatePath("/users/information/sent");
  redirect("/users/information/sent?tab=drafts");
}
