"use server";

import { randomBytes } from "node:crypto";
import { mkdir, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import { revalidatePath } from "next/cache";
import { requireApiArea } from "@/server/authorization/guards";
import { uploadRoot } from "@/server/attachments/service";
import { setAboutMe, setPhoto } from "@/lib/db/repositories/profile.repository";
import { recordAudit } from "@/lib/db/repositories/audit.repository";
import { logError } from "@/lib/logging/logger";
import { checkPhoto } from "@/server/profile/photo";
import { STORAGE_USER_MESSAGE } from "@/server/attachments/storage";
import type { ActionResult } from "@/lib/http/action-result";

// D-230: the person's own photo and "About me". Everything else on the
// profile is IT's (Admin → Users). Files go to the upload folder under a
// random name, like attachments; the old photo is removed once replaced.
async function me() {
  try {
    return (await requireApiArea("users")).user;
  } catch {
    return null;
  }
}
const PHOTO_DIR = "profile-photos";

async function removeFile(stored: string | null) {
  if (!stored) return;
  const root = uploadRoot();
  const file = path.resolve(root, stored);
  if (file.startsWith(root + path.sep)) await unlink(file).catch(() => undefined);
}

export async function uploadPhotoAction(_previous: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const user = await me();
  if (!user) return { ok: false, message: "Not found." };
  const file = formData.get("photo");
  if (!(file instanceof File) || file.size === 0) return { ok: false, message: "Choose a photo first." };
  const check = checkPhoto(file.size, new Uint8Array(await file.slice(0, 16).arrayBuffer()));
  if (!check.ok) return { ok: false, message: check.message };
  const stored = `${PHOTO_DIR}/u${user.id}-${randomBytes(12).toString("hex")}.${check.extension}`;
  try {
    await mkdir(path.join(uploadRoot(), PHOTO_DIR), { recursive: true });
    await writeFile(path.join(uploadRoot(), stored), Buffer.from(await file.arrayBuffer()), { flag: "wx" });
  } catch (error) {
    logError("profile photo: could not store", error, { userId: user.id });
    return { ok: false, message: STORAGE_USER_MESSAGE };
  }
  const previous = await setPhoto(user.id, { path: stored, type: check.contentType });
  await removeFile(previous);
  await recordAudit({ actorUserId: user.id, action: "PROFILE_PHOTO_CHANGED", entityType: "USER", entityId: user.id, result: "SUCCESS" });
  revalidatePath("/users", "layout");
  return { ok: true, message: "Photo saved." };
}

export async function removePhotoAction(): Promise<ActionResult> {
  const user = await me();
  if (!user) return { ok: false, message: "Not found." };
  const previous = await setPhoto(user.id, null);
  await removeFile(previous);
  await recordAudit({ actorUserId: user.id, action: "PROFILE_PHOTO_REMOVED", entityType: "USER", entityId: user.id, result: "SUCCESS" });
  revalidatePath("/users", "layout");
  return { ok: true, message: "Photo removed." };
}

export async function aboutMeAction(_previous: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const user = await me();
  if (!user) return { ok: false, message: "Not found." };
  const about = String(formData.get("about") ?? "")
    .replace(/\r\n/g, "\n")
    .trim();
  if (about.length > 1000) return { ok: false, message: "Keep About me under 1,000 characters." };
  await setAboutMe(user.id, about || null);
  revalidatePath("/users/profile");
  return { ok: true, message: "Saved." };
}
