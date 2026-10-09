import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import mysql from "mysql2/promise";
import { afterAll, describe, expect, it } from "vitest";
import { getDbPool } from "@/lib/db/client";
import { createBackup, sqlValue } from "@/server/ops/backup";
import { recordAudit } from "@/lib/db/repositories/audit.repository";
import { createUser } from "./helpers";

// Restore drill (P0-21, GL-04, D-104): back up the test database, restore it
// into a fresh one, and prove every table came back byte for byte.
const host = process.env.TEST_DB_HOST ?? "127.0.0.1";
const port = Number(process.env.TEST_DB_PORT ?? 3307);
const appUser = process.env.TEST_DB_USER ?? "ars_dev";
const appPassword = process.env.TEST_DB_PASSWORD ?? "ars_dev_password";
const rootPassword = process.env.TEST_DB_ROOT_PASSWORD ?? "ars_root_password";
const target = "ars_restore_drill_test";
const work = fs.mkdtempSync(path.join(os.tmpdir(), "ars-backup-"));

const root = () => mysql.createConnection({ host, port, user: "root", password: rootPassword });

afterAll(async () => {
  const connection = await root();
  if (!process.env.KEEP_DRILL_DB) await connection.query(`DROP DATABASE IF EXISTS \`${target}\``);
  await connection.end();
  await getDbPool().end();
  fs.rmSync(work, { recursive: true, force: true });
});

describe("SQL literals", () => {
  it("escape quotes, backslashes, new lines and binary; JSON as text; dates in UTC", () => {
    expect(sqlValue("it's a \\ path\nnext")).toBe("'it\\'s a \\\\ path\\nnext'");
    expect(sqlValue({ a: "b" })).toBe(`'{"a":"b"}'`);
    expect(sqlValue(new Date("2026-10-09T10:11:12.345Z"))).toBe("'2026-10-09 10:11:12.345'");
    expect(sqlValue(Buffer.from([1, 255]))).toBe("X'01ff'");
    expect(sqlValue(null)).toBe("NULL");
    expect(sqlValue(true)).toBe("1");
  });
});

describe("backup and restore drill", () => {
  it("restores every table exactly, with the append-only triggers working", async () => {
    // Awkward data on purpose.
    const userId = await createUser({ name: "O'Brien \\ Śrī ✓ \"quotes\"\nnew line" });
    await recordAudit({ actorUserId: userId, action: "DRILL", entityType: "TEST", metadata: { emoji: "✅", text: "a;b\nc", nested: { list: [1, 2] } } });
    const uploads = path.join(work, "uploads", "2026", "10");
    fs.mkdirSync(uploads, { recursive: true });
    fs.writeFileSync(path.join(uploads, "quote.pdf"), "%PDF-1.4 drill");

    const report = await createBackup({ dir: path.join(work, "backups"), uploadDir: path.join(work, "uploads"), keepDays: 14 });
    expect(report.tables).toBeGreaterThan(25);
    expect(report.attachmentsCopied).toBe(1);
    expect(fs.existsSync(path.join(work, "backups", "attachments", "2026", "10", "quote.pdf"))).toBe(true);
    // A second run copies no attachment again.
    expect((await createBackup({ dir: path.join(work, "backups"), uploadDir: path.join(work, "uploads") })).attachmentsCopied).toBe(0);

    const connection = await root();
    await connection.query(`DROP DATABASE IF EXISTS \`${target}\``);
    await connection.query(`CREATE DATABASE \`${target}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`);
    await connection.query(`GRANT ALL PRIVILEGES ON \`${target}\`.* TO ?@'%'`, [appUser]);
    const env = { ...process.env, DB_HOST: host, DB_PORT: String(port), DB_NAME: target, DB_USER: appUser, DB_PASSWORD: appPassword };
    const script = path.resolve(__dirname, "../../scripts/database/restore.js");

    // Refuses without naming the database.
    expect(() => execFileSync(process.execPath, [script, report.file], { env, stdio: "pipe" })).toThrow();
    try {
      execFileSync(process.execPath, [script, report.file, `--confirm-database=${target}`], { env, stdio: "pipe" });
    } catch (error) {
      // Keep the file for a look (test-results is git-ignored).
      fs.mkdirSync("test-results", { recursive: true });
      fs.copyFileSync(report.file, path.join("test-results", "failed-restore.sql.gz"));
      throw new Error(`restore failed: ${(error as { stderr?: Buffer }).stderr?.toString() ?? String(error)}`);
    }

    const source = await mysql.createConnection({ host, port, user: appUser, password: appPassword, database: "ars_approvals_test" });
    const restored = await mysql.createConnection({ host, port, user: appUser, password: appPassword, database: target });
    try {
      const [tables] = await source.query<mysql.RowDataPacket[]>("SHOW FULL TABLES WHERE Table_type = 'BASE TABLE'");
      const names = tables.map((row) => String(Object.values(row)[0]));
      const differences: string[] = [];
      for (const name of names) {
        const [[a]] = await source.query<mysql.RowDataPacket[]>(`CHECKSUM TABLE \`${name}\``);
        const [[b]] = await restored.query<mysql.RowDataPacket[]>(`CHECKSUM TABLE \`${name}\``);
        if (String(a!.Checksum) !== String(b!.Checksum)) differences.push(name);
      }
      // Rows written while the backup ran would differ; the drill has none.
      expect(differences).toEqual([]);
      const [[triggersA]] = await source.query<mysql.RowDataPacket[]>("SELECT COUNT(*) AS n FROM information_schema.triggers WHERE trigger_schema = DATABASE()");
      const [[triggersB]] = await restored.query<mysql.RowDataPacket[]>("SELECT COUNT(*) AS n FROM information_schema.triggers WHERE trigger_schema = DATABASE()");
      expect(Number(triggersB!.n)).toBe(Number(triggersA!.n));
      await expect(restored.query("UPDATE audit_logs SET action = 'X' WHERE action = 'DRILL'")).rejects.toThrow();
      const [[name]] = await restored.query<mysql.RowDataPacket[]>("SELECT name FROM users WHERE id = ?", [userId]);
      expect(name!.name).toBe("O'Brien \\ Śrī ✓ \"quotes\"\nnew line");
    } finally {
      await source.end();
      await restored.end();
      await connection.end();
    }
  });
});
