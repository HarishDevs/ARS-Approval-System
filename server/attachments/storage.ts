import "server-only";
import { randomBytes } from "node:crypto";
import { mkdir, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import { getEnv } from "@/config/environment";
import { uploadRoot } from "@/server/attachments/service";
import { logError } from "@/lib/logging/logger";
import { alertSuperAdmin } from "@/server/ops/alerts";

// v1.12.4 (D-163): file uploads failed on the host because files couldn't be
// written to UPLOAD_DIR, and the screens only said "couldn't reach the
// server" or "files couldn't be saved". This names the cause, for the logs,
// the Super Admin overview and the health check.
export type StorageProblem = "NOT_SET" | "NO_PERMISSION" | "MISSING" | "READ_ONLY" | "FULL" | "OTHER";

export const STORAGE_PROBLEM_TEXT: Record<StorageProblem, string> = {
  NOT_SET: "UPLOAD_DIR isn't set, so files go inside the app folder, which the host may not allow writing to and which a redeploy wipes. Set UPLOAD_DIR to the Private Storage path (DEPLOYMENT Part C, e.g. /private/uploads).",
  NO_PERMISSION: "The app isn't allowed to write to the upload folder. Check UPLOAD_DIR points to Private Storage the app can write to (DEPLOYMENT Part C).",
  MISSING: "The upload folder's parent doesn't exist. Check UPLOAD_DIR: File Manager → Private Storage → (i) shows the real absolute path; use that plus /uploads.",
  READ_ONLY: "The upload folder is on a read-only disk. Point UPLOAD_DIR at Private Storage (DEPLOYMENT Part C).",
  FULL: "The disk for uploads is full. Free space or raise the hosting storage.",
  OTHER: "Files can't be written to the upload folder. See the server log for the error code.",
};

// What users see when their files can't be stored (their form stays as it was).
export const STORAGE_USER_MESSAGE = "Your files couldn't be stored on the server, so nothing was saved. Your form is still here; tell IT (file storage needs fixing), or try again without the files.";

export function classifyStorageError(error: unknown): StorageProblem {
  const code = (error as { code?: string } | null)?.code;
  if (code === "EACCES" || code === "EPERM") return "NO_PERMISSION";
  if (code === "ENOENT" || code === "ENOTDIR") return "MISSING";
  if (code === "EROFS") return "READ_ONLY";
  if (code === "ENOSPC" || code === "EDQUOT") return "FULL";
  return "OTHER";
}

export function isStorageError(error: unknown): boolean {
  const code = (error as { code?: string } | null)?.code;
  return typeof code === "string" && /^E[A-Z]+$/.test(code);
}

export interface StorageCheck {
  ok: boolean;
  root: string;
  configured: boolean;
  problem: StorageProblem | null;
  code: string | null;
}

// Creates the folder if needed, writes and removes a small probe file.
export async function checkStorage(): Promise<StorageCheck> {
  const root = uploadRoot();
  const configured = Boolean(getEnv().UPLOAD_DIR);
  try {
    await mkdir(root, { recursive: true });
    const probe = path.join(root, `.probe-${randomBytes(6).toString("hex")}`);
    await writeFile(probe, "ok", { flag: "wx" });
    await unlink(probe);
    return { ok: true, root, configured, problem: null, code: null };
  } catch (error) {
    const problem = configured ? classifyStorageError(error) : "NOT_SET";
    return { ok: false, root, configured, problem, code: (error as { code?: string } | null)?.code ?? null };
  }
}

// Log the cause and tell the Super Admin (at most once a day; the alert
// itself is rate-limited). Never throws.
export async function reportStorageFailure(error: unknown, context: Record<string, unknown> = {}): Promise<void> {
  const problem = classifyStorageError(error);
  logError("file storage write failed", error, { ...context, problem });
  await alertSuperAdmin("FILE_STORAGE_FAILED", problem).catch(() => undefined);
}
