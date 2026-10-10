import "server-only";
import { createHash, randomBytes } from "node:crypto";
import { mkdir, readFile, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import { withTransaction } from "@/lib/db/transaction";
import type { RowDataPacket } from "mysql2/promise";
import { appendEvents, findRequest, isParticipant, lockRequest, type RequestRecord } from "@/lib/db/repositories/approvals.repository";
import { findAttachment, insertAttachment, type AttachmentRecord } from "@/lib/db/repositories/attachments.repository";
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

// An empty file input still sends a 0-byte entry, and its name depends on
// the runtime: "" in the browser, "blob" on Node 24, "undefined" on Node 22
// (CI and GoDaddy). Any 0-byte entry is ignored: there's nothing to attach.
export function filesFrom(formData: FormData, field = "attachments"): File[] {
  return formData
    .getAll(field)
    .filter((value): value is File => typeof value === "object" && value !== null && "arrayBuffer" in value && value.size > 0);
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

class AttachError extends Error {
  constructor(
    readonly code: string,
    message: string,
  ) {
    super(message);
  }
}

// The checks run under the request-row lock (D-QA-03), so two uploads at
// the same moment can't pass the 20-file limit together, and a file that is
// already on the request (same sha256, e.g. a retried upload) isn't stored
// again.
export async function addAttachments(
  requestId: number,
  files: readonly PreparedFile[],
  actor: Actor,
  options: { requesterOnly?: boolean; fieldKey?: string } = {},
): Promise<Result<{ count: number; duplicates: string[] }>> {
  if (files.length === 0) return { ok: true, value: { count: 0, duplicates: [] } };
  const request = await findRequest(requestId);
  if (!request || !(await canSeeRequest(request, actor)) || (options.requesterOnly && request.requesterId !== actor.id)) {
    return { ok: false, code: "NOT_FOUND", message: "Not found." };
  }

  const hashed = files.map((file) => ({ ...file, sha256: createHash("sha256").update(file.bytes).digest("hex") }));
  const root = uploadRoot();
  const now = new Date();
  const folder = `${now.getUTCFullYear()}/${String(now.getUTCMonth() + 1).padStart(2, "0")}`;
  await mkdir(path.join(root, folder), { recursive: true });
  const written: string[] = [];
  try {
    const outcome = await withTransaction(async (connection) => {
      const locked = await lockRequest(requestId, connection);
      if (!locked || !OPEN.has(locked.status)) throw new AttachError("CLOSED", "Files can only be added while the request is open.");
      const [existing] = await connection.query<(RowDataPacket & { sha256: string })[]>("SELECT sha256 FROM request_attachments WHERE request_id = ?", [requestId]);
      const known = new Set(existing.map((row) => row.sha256));
      const fresh: typeof hashed = [];
      const duplicates: string[] = [];
      for (const file of hashed) {
        if (known.has(file.sha256)) duplicates.push(file.name);
        else {
          known.add(file.sha256);
          fresh.push(file);
        }
      }
      const tooMany = checkCount(existing.length, fresh.length);
      if (tooMany) throw new AttachError("TOO_MANY", tooMany);
      for (const file of fresh) {
        const storedPath = `${folder}/${randomBytes(16).toString("hex")}`;
        await writeFile(path.join(root, storedPath), file.bytes, { flag: "wx" });
        written.push(path.join(root, storedPath));
        await insertAttachment(
          { requestId, uploadedBy: actor.id, round: locked.round, fieldKey: options.fieldKey ?? null, name: file.name, storedPath, contentType: file.contentType, sizeBytes: file.bytes.length, sha256: file.sha256 },
          connection,
        );
      }
      if (fresh.length) {
        const names = fresh.map((file) => file.name);
        await appendEvents(requestId, [{ type: "ATTACHMENTS_ADDED", actorId: actor.id, names }], actor.id, connection);
        await recordAudit({ actorUserId: actor.id, action: "REQUEST_FILES_ADDED", entityType: "REQUEST", entityId: requestId, metadata: { names, sha256: fresh.map((file) => file.sha256) } }, connection);
      }
      return { count: fresh.length, duplicates };
    });
    return { ok: true, value: outcome };
  } catch (error) {
    await Promise.all(written.map((file) => unlink(file).catch(() => undefined)));
    if (error instanceof AttachError) return { ok: false, code: error.code, message: error.message };
    throw error;
  }
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
