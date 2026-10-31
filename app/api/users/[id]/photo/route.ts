import { readFile } from "node:fs/promises";
import path from "node:path";
import { requireApiArea } from "@/server/authorization/guards";
import { uploadRoot } from "@/server/attachments/service";
import { photoOf } from "@/lib/db/repositories/profile.repository";
import { apiError } from "@/lib/http/api-response";

// D-230: a person's profile photo, for anyone signed in (like their name in
// the app). Only active people; the address carries a version, so the
// browser may keep it for a day.
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    await requireApiArea("users");
  } catch {
    return apiError("NOT_FOUND", "Not found.", 404);
  }
  const { id } = await params;
  if (!/^\d{1,10}$/.test(id)) return apiError("NOT_FOUND", "Not found.", 404);
  const photo = await photoOf(Number(id));
  if (!photo) return apiError("NOT_FOUND", "Not found.", 404);
  const root = uploadRoot();
  const file = path.resolve(root, photo.path);
  if (!file.startsWith(root + path.sep)) return apiError("NOT_FOUND", "Not found.", 404);
  const bytes = await readFile(file).catch(() => null);
  if (!bytes) return apiError("NOT_FOUND", "Not found.", 404);
  return new Response(new Uint8Array(bytes), {
    headers: { "Content-Type": photo.type, "Cache-Control": "private, max-age=86400", "X-Content-Type-Options": "nosniff", "Content-Security-Policy": "default-src 'none'" },
  });
}
