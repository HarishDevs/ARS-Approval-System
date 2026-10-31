import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import zlib from "node:zlib";
import crypto from "node:crypto";
import { createRequire } from "node:module";
import { describe, expect, it } from "vitest";
import { BACKUP_NAME, encryptBackup } from "@/server/ops/backup";

// D-246 (audit OPS-09): what the app writes, the restore tools read: the
// .sha256 is checked and an encrypted backup needs the right key.
const require = createRequire(import.meta.url);
const { readBackup } = require("../../scripts/database/backup-file.js") as { readBackup: (file: string, key?: Buffer | null) => string };

describe("backup files", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "ars-backup-"));
  const key = crypto.randomBytes(32);
  const sql = "CREATE TABLE t (id INT);\nINSERT INTO t VALUES (1);\n";
  const write = (name: string, body: Buffer) => {
    const file = path.join(dir, name);
    fs.writeFileSync(file, body);
    fs.writeFileSync(`${file}.sha256`, `${crypto.createHash("sha256").update(body).digest("hex")}  ${name}\n`);
    return file;
  };

  it("names: plain and encrypted backups are recognised; anything else isn't", () => {
    expect(BACKUP_NAME.test("ars-db-20261101-020000.sql.gz")).toBe(true);
    expect(BACKUP_NAME.test("ars-db-20261101-020000.sql.gz.enc")).toBe(true);
    expect(BACKUP_NAME.test("ars-db-20261101-020000.sql.gz.sha256")).toBe(false);
  });

  it("a plain backup reads back, and a changed one is refused by its hash", () => {
    const file = write("ars-db-20261101-020000.sql.gz", zlib.gzipSync(sql));
    expect(readBackup(file)).toBe(sql);
    fs.appendFileSync(file, Buffer.from([0]));
    expect(() => readBackup(file)).toThrow(/doesn't match its \.sha256/);
  });

  it("an encrypted backup needs its key; a wrong key or no key is refused", () => {
    const file = write("ars-db-20261101-030000.sql.gz.enc", encryptBackup(zlib.gzipSync(sql), key));
    expect(readBackup(file, key)).toBe(sql);
    expect(() => readBackup(file, crypto.randomBytes(32))).toThrow(/can't be decrypted/);
    expect(() => readBackup(file, null)).toThrow(/BACKUP_ENCRYPTION_KEY/);
    expect(fs.readFileSync(file).includes(Buffer.from("CREATE TABLE"))).toBe(false);
  });
});
