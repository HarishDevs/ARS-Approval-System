import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import type { RowDataPacket } from "mysql2/promise";
import { getDbPool } from "@/lib/db/client";
import { checkStorage, classifyStorageError, STORAGE_USER_MESSAGE } from "@/server/attachments/storage";
import { readFiles } from "@/server/modules/upload";

// v1.12.4 (D-163): uploads failed on the host because files couldn't be
// written. Reproduced here with an upload folder that can't be created
// (its "parent" is a file): the cause is named, the person gets a plain
// message (not "couldn't reach the server"), and the Super Admin is alerted.
const dir = fs.mkdtempSync(path.join(os.tmpdir(), "ars-storage-"));
const blocker = path.join(dir, "not-a-folder");
fs.writeFileSync(blocker, "x");
process.env.UPLOAD_DIR = path.join(blocker, "uploads");

afterAll(() => fs.rmSync(dir, { recursive: true, force: true }));

describe("file storage that can't be written", () => {
  it("the check names the cause", async () => {
    const check = await checkStorage();
    expect(check).toMatchObject({ ok: false, configured: true });
    expect(["MISSING", "NO_PERMISSION", "OTHER"]).toContain(check.problem);
    expect(check.code).toBeTruthy();
  });

  it("an upload returns a plain storage message and alerts the Super Admin once a day", async () => {
    await getDbPool().query("DELETE FROM audit_logs WHERE action = 'OPS_ALERT_SENT' AND entity_id = 'FILE_STORAGE_FAILED'").catch(() => undefined);
    const form = new FormData();
    form.append("attachments", new File([Buffer.from("%PDF-1.4\n%test\n")], "quote.pdf", { type: "application/pdf" }));
    const result = await readFiles(form, []);
    expect(result).toEqual({ ok: false, message: STORAGE_USER_MESSAGE });
    const [rows] = await getDbPool().query<RowDataPacket[]>("SELECT COUNT(*) AS n FROM audit_logs WHERE action = 'OPS_ALERT_SENT' AND entity_id = 'FILE_STORAGE_FAILED'");
    expect(Number(rows[0]!.n)).toBe(1);
  });

  it("classifies the usual operating-system errors", () => {
    expect(classifyStorageError({ code: "EACCES" })).toBe("NO_PERMISSION");
    expect(classifyStorageError({ code: "ENOENT" })).toBe("MISSING");
    expect(classifyStorageError({ code: "EROFS" })).toBe("READ_ONLY");
    expect(classifyStorageError({ code: "ENOSPC" })).toBe("FULL");
  });
});
