"use server";

import { revalidatePath } from "next/cache";
import { requireApiArea } from "@/server/authorization/guards";
import { SETTING_DEFINITIONS, type SettingDefinition } from "@/server/settings/definitions";
import { saveSettingsGroup } from "@/server/settings/save";
import { sendTestEmail, sendTestWhatsApp } from "@/server/settings/test-send";
import { getActionContext } from "@/lib/http/request-context";
import { logError } from "@/lib/logging/logger";
import type { ActionResult } from "@/lib/http/action-result";
import { clearPushConfigCache, generateVapidKeys } from "@/server/push/service";
import { getSettingValue } from "@/server/settings/values";

// Server Actions for /superadmin/settings (F-52). Each re-checks the Super
// Admin area on the server; Next.js also rejects cross-site calls by
// comparing Origin and Host (D-048).
const GROUPS = new Set<SettingDefinition["group"]>(["GENERAL", "AUTHENTICATION", "EMAIL", "WHATSAPP", "FEATURES", "RETENTION", "AI", "AI_DATA", "BACKUP", "PUSH"]);
const NOT_FOUND: ActionResult = { ok: false, message: "Not found." };

export async function saveSettingsAction(_previous: ActionResult | null, formData: FormData): Promise<ActionResult> {
  let session;
  try {
    session = await requireApiArea("superadmin");
  } catch {
    return NOT_FOUND;
  }
  const group = String(formData.get("group") ?? "") as SettingDefinition["group"];
  if (!GROUPS.has(group)) return { ok: false, message: "Unknown settings group." };

  const inputs: Record<string, string | undefined> = {};
  const clears = new Set<string>();
  for (const definition of SETTING_DEFINITIONS.filter((item) => item.group === group)) {
    const value = formData.get(definition.key);
    if (typeof value === "string") inputs[definition.key] = value;
    if (definition.encrypted && formData.get(`${definition.key}__clear`) === "on") clears.add(definition.key);
  }

  try {
    const { ipAddress } = await getActionContext();
    const result = await saveSettingsGroup(group, inputs, clears, { userId: session.user.id, sessionId: session.sessionId, ipAddress });
    if (Object.keys(result.errors).length > 0) {
      return { ok: false, message: "Some values need attention.", fieldErrors: result.errors };
    }
    revalidatePath("/superadmin", "layout");
    revalidatePath("/users/ai", "layout");
    return { ok: true, message: result.changed.length ? `Saved ${result.changed.length} change${result.changed.length === 1 ? "" : "s"}.` : "No changes to save." };
  } catch (error) {
    logError("saveSettingsAction failed", error);
    return { ok: false, message: "Couldn't save. Please try again." };
  }
}

export async function testSendAction(_previous: ActionResult | null, formData: FormData): Promise<ActionResult> {
  let session;
  try {
    session = await requireApiArea("superadmin");
  } catch {
    return NOT_FOUND;
  }
  const channel = formData.get("channel");
  try {
    const result =
      channel === "EMAIL"
        ? await sendTestEmail(session.user, session.sessionId)
        : channel === "WHATSAPP"
          ? await sendTestWhatsApp(session.user, session.sessionId)
          : { ok: false, message: "Unknown channel." };
    revalidatePath("/superadmin/deliveries");
    return result.ok ? { ok: true, message: result.message } : { ok: false, message: result.message };
  } catch (error) {
    logError("testSendAction failed", error);
    return { ok: false, message: "Couldn't run the test. Please try again." };
  }
}

// D-252: make the VAPID key pair for Web Push. The private key is saved
// encrypted and never shown. Replacing keys makes every browser register
// again (the app does it by itself on the next visit), so it asks first.
export async function generatePushKeysAction(_previous: ActionResult | null, formData: FormData): Promise<ActionResult> {
  let session;
  try {
    session = await requireApiArea("superadmin");
  } catch {
    return NOT_FOUND;
  }
  const existing = await getSettingValue("push.vapid_public_key").catch(() => null);
  if (existing && formData.get("replace") !== "yes") return { ok: false, message: "Keys exist already. Tick \"Replace the keys\" to make new ones (every device then registers again by itself)." };
  try {
    const keys = generateVapidKeys();
    const { ipAddress } = await getActionContext();
    const result = await saveSettingsGroup("PUSH", { "push.vapid_public_key": keys.publicKey, "push.vapid_private_key": keys.privateKey }, new Set(), { userId: session.user.id, sessionId: session.sessionId, ipAddress });
    if (Object.keys(result.errors).length) return { ok: false, message: "Couldn't save the keys." };
    clearPushConfigCache();
    revalidatePath("/superadmin/settings");
    return { ok: true, message: existing ? "New keys saved. Devices register again on their next visit." : "Keys saved. People can now turn on notifications in Profile → App & devices." };
  } catch (error) {
    logError("generatePushKeysAction failed", error);
    return { ok: false, message: "Couldn't make the keys. Please try again." };
  }
}
