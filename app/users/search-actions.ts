"use server";

import { revalidatePath } from "next/cache";
import { requireApiArea } from "@/server/authorization/guards";
import { parseSearchFilters, searchQuery } from "@/server/search/filters";
import { createSavedView, deleteSavedView, listSavedViews, renameSavedView, setDefaultSavedView } from "@/lib/db/repositories/search.repository";
import { logError } from "@/lib/logging/logger";
import type { ActionResult } from "@/lib/http/action-result";

// Saved views (#4): a person's own named searches. Every change is scoped to
// the signed-in person in the repository.
async function me(): Promise<number | null> {
  try {
    return (await requireApiArea("users")).user.id;
  } catch {
    return null;
  }
}

const cleanName = (value: FormDataEntryValue | null) => (typeof value === "string" ? value.replace(/\s+/g, " ").trim().slice(0, 80) : "");
const viewId = (value: FormDataEntryValue | null) => (typeof value === "string" && /^\d{1,10}$/.test(value) ? Number(value) : null);

export async function saveViewAction(_previous: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const userId = await me();
  if (!userId) return { ok: false, message: "Not found." };
  const name = cleanName(formData.get("name"));
  if (name.length < 2) return { ok: false, message: "Give the view a name.", fieldErrors: { name: "Use 2 to 80 characters." } };
  let raw: Record<string, unknown> = {};
  try {
    raw = JSON.parse(String(formData.get("query") ?? "{}")) as Record<string, unknown>;
  } catch {
    return { ok: false, message: "This search couldn't be saved. Reload and try again." };
  }
  const { page: _page, ...query } = searchQuery(parseSearchFilters(raw));
  void _page;
  try {
    const result = await createSavedView(userId, name, query);
    if (result === "DUPLICATE") return { ok: false, message: "You already have a view with that name.", fieldErrors: { name: "Choose another name." } };
    if (result === "TOO_MANY") return { ok: false, message: "You have 50 views already. Delete one first." };
  } catch (error) {
    logError("saveViewAction failed", error);
    return { ok: false, message: "Couldn't save. Please try again." };
  }
  revalidatePath("/users/search");
  return { ok: true, message: `Saved as "${name}".` };
}

export async function manageViewAction(_previous: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const userId = await me();
  const id = viewId(formData.get("id"));
  const command = String(formData.get("command") ?? "");
  if (!userId || id === null) return { ok: false, message: "Not found." };
  let removed: { name: string; query: Record<string, string>; isDefault: boolean } | null = null;
  try {
    if (command === "delete") {
      // FB-03: what was removed comes back, so "Undo" can put it back.
      const view = (await listSavedViews(userId)).find((item) => item.id === id);
      if (!view || !(await deleteSavedView(userId, id))) return { ok: false, message: "Not found." };
      removed = { name: view.name, query: view.query, isDefault: view.isDefault };
    } else if (command === "default") {
      if (!(await setDefaultSavedView(userId, id))) return { ok: false, message: "Not found." };
    } else if (command === "undefault") {
      await setDefaultSavedView(userId, null);
    } else if (command === "rename") {
      const name = cleanName(formData.get("name"));
      if (name.length < 2) return { ok: false, message: "Use 2 to 80 characters." };
      const result = await renameSavedView(userId, id, name);
      if (result === "DUPLICATE") return { ok: false, message: "You already have a view with that name." };
      if (result === "NOT_FOUND") return { ok: false, message: "Not found." };
    } else {
      return { ok: false, message: "Not found." };
    }
  } catch (error) {
    logError("manageViewAction failed", error);
    return { ok: false, message: "Couldn't save. Please try again." };
  }
  revalidatePath("/users/search");
  return { ok: true, message: command === "delete" ? "Deleted." : "Saved.", data: removed ? { removed } : undefined };
}

// Undo of a deleted view: the same name, filters and default flag.
export async function restoreViewAction(_previous: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const userId = await me();
  if (!userId) return { ok: false, message: "Not found." };
  const name = cleanName(formData.get("name"));
  let raw: Record<string, unknown> = {};
  try {
    raw = JSON.parse(String(formData.get("query") ?? "{}")) as Record<string, unknown>;
  } catch {
    return { ok: false, message: "Couldn't undo." };
  }
  const { page: _page, ...query } = searchQuery(parseSearchFilters(raw));
  void _page;
  if (name.length < 2) return { ok: false, message: "Couldn't undo." };
  try {
    const created = await createSavedView(userId, name, query);
    if (created !== "OK") return { ok: false, message: created === "DUPLICATE" ? "A view with that name exists again." : "You have 50 views already." };
    if (formData.get("isDefault") === "1") {
      const view = (await listSavedViews(userId)).find((item) => item.name === name);
      if (view) await setDefaultSavedView(userId, view.id);
    }
  } catch (error) {
    logError("restoreViewAction failed", error);
    return { ok: false, message: "Couldn't undo. Please try again." };
  }
  revalidatePath("/users/search");
  return { ok: true, message: "Restored." };
}
