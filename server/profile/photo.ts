// D-230: profile photos. Pure checks (unit-tested): JPEG, PNG or WebP by
// their first bytes (the name and the browser's type are not trusted), at
// most 3 MB.
export const PHOTO_MAX_BYTES = 3 * 1024 * 1024;
export const PHOTO_ACCEPT = "image/jpeg,image/png,image/webp";

export type PhotoCheck = { ok: true; contentType: "image/jpeg" | "image/png" | "image/webp"; extension: "jpg" | "png" | "webp" } | { ok: false; message: string };

export function checkPhoto(size: number, head: Uint8Array): PhotoCheck {
  if (size <= 0) return { ok: false, message: "Choose a photo first." };
  if (size > PHOTO_MAX_BYTES) return { ok: false, message: "That photo is larger than 3 MB. Choose a smaller one." };
  const at = (index: number) => head[index] ?? -1;
  if (at(0) === 0xff && at(1) === 0xd8 && at(2) === 0xff) return { ok: true, contentType: "image/jpeg", extension: "jpg" };
  if (at(0) === 0x89 && at(1) === 0x50 && at(2) === 0x4e && at(3) === 0x47) return { ok: true, contentType: "image/png", extension: "png" };
  const text = (from: number, to: number) => String.fromCharCode(...head.slice(from, to));
  if (text(0, 4) === "RIFF" && text(8, 12) === "WEBP") return { ok: true, contentType: "image/webp", extension: "webp" };
  return { ok: false, message: "Use a JPEG, PNG or WebP photo." };
}

// The address of a person's photo; the version makes a new photo show at once.
export function photoUrl(userId: number, updatedAt: Date | string | null | undefined): string | null {
  if (!updatedAt) return null;
  return `/api/users/${userId}/photo?v=${new Date(updatedAt).getTime().toString(36)}`;
}
