import "server-only";
import { createHash, randomBytes } from "node:crypto";
import { mkdir, readFile, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import { withTransaction } from "@/lib/db/transaction";
import { appendEvents, findRequest, isParticipant, type RequestRecord } from "@/lib/db/repositories/approvals.repository";
import { countAttachments, findAttachment, insertAttachment, type AttachmentRecord } from "@/lib/db/repositories/attachments.repository";
import { recordAudit } from "@/lib/db/repositories/audit.repository";
import { getEnv } from "@/config/environment";
import { checkCount, checkFile, SNIFF_BYTES } from "@/server/attachments/files";
import type { Actor, Result } from "@/server/approvals/service";

// Attachments on requests (S6-05, F-18, D-072). Files are checked before
// anything is saved, written outside the web root under a random name, and
// recorded with the timeline entry in one transaction. Never deleted.
export interface PreparedFile {
  name: string;
  contentType: string;
  bytes: Buffer;
}

const OPEN = new Set(["IN_PROGRESS", "ON_HOLD", "CHANGES_REQUIRED"]);
const isAdmin = (actor: Actor) => actor.roles.includes("IT_ADMIN") || actor.roles.includes("SUPER_ADMIN");

export function uploadRoot(): string {
  return path.resolve(getEnv().UPLOAD_DIR ?? path.join(process.cwd(), "storage", "uploads"));
}

// The same record-level rule as the request page (D-057).
export async function canSeeRequest(request: RequestRecord, viewer: Actor): Promise<boolean> {
  return request.requesterId === viewer.id || isAdmin(viewer) || (await isParticipant(request.id, viewer.id));
}

// An empty file input arrives as a 0-byte entry named "" (browser) or
// "blob" (after the Server Action round trip): ignore those.
export function filesFrom(formData: FormData, field = "attachments"): File[] {
  return formData
    .getAll(field)
    .filter((value): value is File => typeof value === "object" && value !== null && "arrayBuffer" in value && !(value.size === 0 && (value.name === "" || value.name === "blob")));
}

export async function prepareFiles(files: readonly File[]): Promise<{ ok: true; files: PreparedFile[] } | { ok: false; message: string }> {
  const prepared: PreparedFile[] = [];
  for (const file of files) {
    const head = new Uint8Array(await file.slice(0, SNIFF_BYTES).arrayBuffer());
    const check = checkFile({ name: file.name, size: file.size, head });
    if (!check.ok) return { ok: false, message: check.message };
    prepared.push({ name: check.name, contentType: check.contentType, bytes: Buffer.from(await file.arrayBuffer()) });
  }
  return { ok: true, files: prepared };
}

export async function addAttachments(
  requestId: number,
  files: readonly PreparedFile[],
  actor: Actor,
  options: { requesterOnly?: boolean } = {},
): Promise<Result<{ count: number }>> {
  if (files.length === 0) return { ok: true, value: { count: 0 } };
  const request = await findRequest(requestId);
  if (!request || !(await canSeeRequest(request, actor)) || (options.requesterOnly && request.requesterId !== actor.id)) {
    return { ok: false, code: "NOT_FOUND", message: "Not found." };
  }
  if (!OPEN.has(request.status)) return { ok: false, code: "CLOSED", message: "Files can only be added while the request is open." };
  const tooMany = checkCount(await countAttachments(requestId), files.length);
  if (tooMany) return { ok: false, code: "TOO_MANY", message: tooMany };

  const root = uploadRoot();
  const now = new Date();
  const folder = `${now.getUTCFullYear()}/${String(now.getUTCMonth() + 1).padStart(2, "0")}`;
  await mkdir(path.join(root, folder), { recursive: true });
  const written: string[] = [];
  try {
    const saved: (PreparedFile & { storedPath: string; sha256: string })[] = [];
    for (const file of files) {
      const storedPath = `${folder}/${randomBytes(16).toString("hex")}`;
      await writeFile(path.join(root, storedPath), file.bytes, { flag: "wx" });
      written.push(path.join(root, storedPath));
      saved.push({ ...file, storedPath, sha256: createHash("sha256").update(file.bytes).digest("hex") });
    }
    await withTransaction(async (connection) => {
      for (const file of saved) {
        await insertAttachment(
          { requestId, uploadedBy: actor.id, round: request.round, name: file.name, storedPath: file.storedPath, contentType: file.contentType, sizeBytes: file.bytes.length, sha256: file.sha256 },
          connection,
        );
      }
      const names = saved.map((file) => file.name);
      await appendEvents(requestId, [{ type: "ATTACHMENTS_ADDED", actorId: actor.id, names }], actor.id, connection);
      await recordAudit({ actorUserId: actor.id, action: "REQUEST_FILES_ADDED", entityType: "REQUEST", entityId: requestId, metadata: { names, sha256: saved.map((file) => file.sha256) } }, connection);
    });
  } catch (error) {
    await Promise.all(written.map((file) => unlink(file).catch(() => undefined)));
    throw error;
  }
  return { ok: true, value: { count: files.length } };
}

// For the download route: the record and its bytes, or null (the same 404
// for "doesn't exist" and "not yours"; denials are audited).
export async function openAttachment(id: number, viewer: Actor): Promise<{ record: AttachmentRecord; bytes: Buffer } | null> {
  const record = await findAttachment(id);
  const request = record ? await findRequest(record.requestId) : null;
  if (!record || !request) return null;
  if (!(await canSeeRequest(request, viewer))) {
    await recordAudit({ actorUserId: viewer.id, action: "ATTACHMENT_ACCESS_DENIED", entityType: "ATTACHMENT", entityId: id, result: "FAILURE" });
    return null;
  }
  const root = uploadRoot();
  const file = path.resolve(root, record.storedPath);
  if (!file.startsWith(root + path.sep)) return null;
  return { record, bytes: await readFile(file) };
}
