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
import { getEmailConfig, getSettingValue } from "@/server/settings/values";
import { testDriveAccess } from "@/server/ops/gdrive-backup";
import { runEmailDiagnostics, reportAsText, safeAddress } from "@/server/integrations/email/diagnostics";
import { countRecentActions, recordAudit } from "@/lib/db/repositories/audit.repository";
import { maskEmail } from "@/server/auth/errors";
import nodemailerPackage from "nodemailer/package.json";
const NODEMAILER_VERSION = String((nodemailerPackage as { version?: string }).version ?? "unknown");

// Server Actions for /superadmin/settings (F-52). Each re-checks the Super
// Admin area on the server; Next.js also rejects cross-site calls by
// comparing Origin and Host (D-048).
const GROUPS = new Set<SettingDefinition["group"]>(["GENERAL", "AUTHENTICATION", "EMAIL", "WHATSAPP", "FEATURES", "RETENTION", "AI", "AI_DATA", "BACKUP", "GDRIVE_BACKUP", "PUSH"]);
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

// v1.54.14 (owner's email delivery audit): run the email diagnostic on the
// live server. Super Admin only, at most 6 runs an hour, audited; one real
// test message at most per run, to the address the Super Admin enters.
export async function emailDiagnosticAction(_previous: ActionResult | null, formData: FormData): Promise<ActionResult> {
  let session;
  try {
    session = await requireApiArea("superadmin");
  } catch {
    return NOT_FOUND;
  }
  const recipient = safeAddress(String(formData.get("recipient") ?? ""));
  if (!recipient) return { ok: false, message: "Enter a valid email address.", fieldErrors: { recipient: "Enter a valid email address." } };
  const sendVia = String(formData.get("sendVia") ?? "none");
  if (sendVia !== "localhost" && sendVia !== "relay" && sendVia !== "none") return { ok: false, message: "Choose a route." };
  if ((await countRecentActions(session.user.id, "EMAIL_DIAGNOSTIC_RUN", 60).catch(() => 0)) >= 6) return { ok: false, message: "The diagnostic was run 6 times in the last hour. Please wait before running it again." };
  try {
    const report = await runEmailDiagnostics(await getEmailConfig(), { recipient, sendVia }, NODEMAILER_VERSION);
    const { ipAddress } = await getActionContext();
    await recordAudit({
      actorUserId: session.user.id,
      action: "EMAIL_DIAGNOSTIC_RUN",
      entityType: "PROVIDER",
      entityId: "EMAIL",
      ipAddress,
      sessionId: session.sessionId,
      metadata: {
        id: report.id,
        recipient: maskEmail(recipient),
        sendVia,
        ports: report.ports.map((port) => `${port.host}:${port.port}=${port.connected ? "ok" : (port.error ?? "no").slice(0, 40)}`),
        accepted: report.dialogs.map((dialog) => `${dialog.host}:${dialog.messageAccepted ?? dialog.recipientAccepted ?? "-"}${dialog.queueId ? `:${dialog.queueId}` : ""}`),
      },
    });
    return { ok: true, message: `Diagnostic ${report.id} finished in ${(report.durationMs / 1000).toFixed(1)} s.`, data: { text: reportAsText(report), findings: report.findings, id: report.id } };
  } catch (error) {
    logError("emailDiagnosticAction failed", error);
    return { ok: false, message: "Couldn't run the diagnostic. Please try again." };
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

// DR-08: check the saved Google Drive backup settings (sign-in as the
// service account, then the folder's details). Uploads nothing; audited.
export async function testDriveBackupAction(): Promise<ActionResult> {
  let session;
  try {
    session = await requireApiArea("superadmin");
  } catch {
    return NOT_FOUND;
  }
  try {
    const result = await testDriveAccess();
    const { ipAddress } = await getActionContext();
    await recordAudit({ actorUserId: session.user.id, action: "GDRIVE_BACKUP_TESTED", entityType: "SETTINGS", entityId: "GDRIVE_BACKUP", result: result.ok ? "SUCCESS" : "FAILURE", ipAddress, sessionId: session.sessionId });
    return { ok: result.ok, message: result.message };
  } catch (error) {
    logError("testDriveBackupAction failed", error);
    return { ok: false, message: "Couldn't run the test. Please try again." };
  }
}
