import "server-only";
import { filesFrom, prepareFiles } from "@/server/attachments/service";
import { MAX_FILES_PER_UPLOAD } from "@/server/attachments/files";
import { discardStaged, stageFiles, type StagedFile } from "@/server/modules/files";
import { reportStorageFailure, STORAGE_USER_MESSAGE } from "@/server/attachments/storage";

// v1.9.0: reads, checks and stages the files of a task or information form.
// Server-only (never a Server Action itself): callers check access first.
// Files: general ones under "attachments", attachment fields under "file:<key>".
export async function readFiles(formData: FormData, fieldKeys: readonly string[]): Promise<{ ok: true; staged: StagedFile[] } | { ok: false; message: string }> {
  const groups: { key: string | null; files: File[] }[] = [{ key: null, files: filesFrom(formData, "attachments") }, ...fieldKeys.map((key) => ({ key, files: filesFrom(formData, `file:${key}`) }))];
  const total = groups.reduce((sum, group) => sum + group.files.length, 0);
  if (total > MAX_FILES_PER_UPLOAD * Math.max(1, fieldKeys.length + 1)) return { ok: false, message: "Too many files at once." };
  const staged: StagedFile[] = [];
  for (const group of groups) {
    if (group.files.length === 0) continue;
    if (group.files.length > MAX_FILES_PER_UPLOAD) {
      await discardStaged(staged);
      return { ok: false, message: `Attach at most ${MAX_FILES_PER_UPLOAD} files at a time.` };
    }
    const prepared = await prepareFiles(group.files);
    if (!prepared.ok) {
      await discardStaged(staged);
      return { ok: false, message: prepared.message };
    }
    try {
      staged.push(...(await stageFiles(prepared.files, group.key)));
    } catch (error) {
      // v1.12.4 (D-163): a storage failure is said plainly, not as a lost connection.
      await discardStaged(staged);
      await reportStorageFailure(error);
      return { ok: false, message: STORAGE_USER_MESSAGE };
    }
  }
  return { ok: true, staged };
}

