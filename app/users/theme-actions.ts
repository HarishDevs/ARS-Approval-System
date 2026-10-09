"use server";

import { cookies } from "next/headers";
import { requireApiArea } from "@/server/authorization/guards";
import { setUserSetting } from "@/lib/db/repositories/user-settings.repository";
import { THEME_COOKIE, THEME_SETTING, parseTheme } from "@/server/ui/theme";
import { logError } from "@/lib/logging/logger";
import type { ActionResult } from "@/lib/http/action-result";

// UI-02: saves the theme on the account and in a cookie for the first paint.
export async function saveThemeAction(_previous: ActionResult | null, formData: FormData): Promise<ActionResult> {
  let session;
  try {
    session = await requireApiArea("users");
  } catch {
    return { ok: false, message: "Not found." };
  }
  const theme = parseTheme(String(formData.get("theme") ?? ""));
  try {
    await setUserSetting(session.user.id, THEME_SETTING, theme);
  } catch (error) {
    logError("saveThemeAction failed", error);
    return { ok: false, message: "Couldn't save. Please try again." };
  }
  (await cookies()).set(THEME_COOKIE, theme, { path: "/", sameSite: "lax", secure: process.env.NODE_ENV === "production", maxAge: 60 * 60 * 24 * 400, httpOnly: false });
  return { ok: true, message: "Saved.", data: { theme } };
}
