"use server";

import { requireApiArea } from "@/server/authorization/guards";
import { cleanDraftContent, isEmptyDraft, parseDraftKey } from "@/server/drafts/rules";
import { deleteDraft, saveDraft } from "@/lib/db/repositories/drafts.repository";
import { findPublishedVersion, findWorkflow } from "@/lib/db/repositories/approvals.repository";
import { logError } from "@/lib/logging/logger";

// Autosave for the raise-a-request and custom approval forms (#3, D-108).
// Called by the form itself, not by a submit. Nothing here creates a
// request or tells anyone.
export type DraftSaveResult =
  | { ok: true; version: number; savedAt: string }
  | { ok: false; reason: "CONFLICT"; message: string }
  | { ok: false; reason: "SIGNED_OUT" | "INVALID" | "FAILED"; message: string };

async function owner(): Promise<number | null> {
  try {
    return (await requireApiArea("users")).user.id;
  } catch {
    return null;
  }
}

async function draftable(key: ReturnType<typeof parseDraftKey>): Promise<boolean> {
  if (!key) return false;
  if (key.kind === "CUSTOM") return true;
  const workflow = await findWorkflow(key.workflowId);
  return Boolean(workflow && workflow.active && workflow.kind === "PREDEFINED" && (await findPublishedVersion(workflow.id)));
}

export async function saveDraftAction(input: { key: string; title?: string; fields?: Record<string, string>; version: number | null }): Promise<DraftSaveResult> {
  const userId = await owner();
  if (!userId) return { ok: false, reason: "SIGNED_OUT", message: "Your session has ended, so the draft wasn't saved. Copy anything important, then sign in again." };
  const key = parseDraftKey(input?.key);
  const content = cleanDraftContent({ title: input?.title, fields: input?.fields });
  const version = input?.version === null || (Number.isInteger(input?.version) && Number(input.version) > 0) ? input.version : undefined;
  if (!key || !content || version === undefined || !(await draftable(key))) return { ok: false, reason: "INVALID", message: "This draft can't be saved." };
  try {
    if (isEmptyDraft(content) && version === null) return { ok: true, version: 0, savedAt: new Date().toISOString() };
    const saved = await saveDraft(userId, key.key, content, version || null);
    if (!saved.ok) return { ok: false, reason: "CONFLICT", message: "This draft was changed in another tab or window. Reload the page to see the latest; this tab's changes aren't saved." };
    return { ok: true, version: saved.version, savedAt: saved.updatedAt.toISOString() };
  } catch (error) {
    logError("saveDraftAction failed", error);
    return { ok: false, reason: "FAILED", message: "Couldn't save the draft. Keep this tab open; it will try again when you type." };
  }
}

export async function discardDraftAction(input: { key: string }): Promise<{ ok: boolean; message: string }> {
  const userId = await owner();
  const key = parseDraftKey(input?.key);
  if (!userId || !key) return { ok: false, message: "Not found." };
  try {
    await deleteDraft(userId, key.key);
    return { ok: true, message: "Draft discarded." };
  } catch (error) {
    logError("discardDraftAction failed", error);
    return { ok: false, message: "Couldn't discard the draft. Please try again." };
  }
}
