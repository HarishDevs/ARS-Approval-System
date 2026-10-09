import "server-only";
import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";
import { pipeline } from "node:stream/promises";
import { Readable } from "node:stream";
import type { RowDataPacket } from "mysql2/promise";
import { getDbPool } from "@/lib/db/client";
import { getEnv } from "@/config/environment";

// Backups (P0-21, D-104). A gzipped, plain-SQL copy of the whole database
// (tables, data, triggers), importable with scripts/database/restore.js or
// phpMyAdmin, plus a copy of the attachments folder (files are never changed
// once stored, so only new ones are copied). Old database files are deleted
// after `keepDays`. Run once a day by the job runner, or by Super Admin →
// "Back up now".

export interface BackupReport {
  file: string;
  tables: number;
  rows: number;
  bytes: number;
  attachmentsCopied: number;
  deletedOldFiles: number;
}

export function backupDir(): string {
  return path.resolve(getEnv().BACKUP_DIR ?? path.join(process.cwd(), "storage", "backups"));
}

const quoteId = (name: string) => `\`${name.replace(/`/g, "``")}\``;

// One SQL literal. JSON columns come back as objects; dates as Date (UTC,
// the pool runs in "Z"); binary as Buffer.
export function sqlValue(value: unknown): string {
  if (value === null || value === undefined) return "NULL";
  if (typeof value === "number") return Number.isFinite(value) ? String(value) : "NULL";
  if (typeof value === "bigint") return value.toString();
  if (typeof value === "boolean") return value ? "1" : "0";
  if (value instanceof Date) return `'${value.toISOString().slice(0, 23).replace("T", " ")}'`;
  if (Buffer.isBuffer(value)) return `X'${value.toString("hex")}'`;
  const text = typeof value === "string" ? value : JSON.stringify(value);
  return `'${text.replace(/\\/g, "\\\\").replace(/'/g, "\\'").replace(/\0/g, "\\0").replace(/\n/g, "\\n").replace(/\r/g, "\\r").replace(/\x1a/g, "\\Z")}'`;
}

// Everything is read inside one READ ONLY transaction with a consistent
// snapshot, so requests saved while the backup runs can't make it show a
// row twice or half a change. Rows are paged by primary key, not OFFSET.
async function* dumpStatements(stats: { tables: number; rows: number }): AsyncGenerator<string> {
  const db = await getDbPool().getConnection();
  try {
    await db.query("SET SESSION TRANSACTION ISOLATION LEVEL REPEATABLE READ");
    await db.query("START TRANSACTION WITH CONSISTENT SNAPSHOT, READ ONLY");
    yield* dumpWith(db, stats);
    await db.query("COMMIT");
  } finally {
    db.release();
  }
}

async function* dumpWith(db: Awaited<ReturnType<ReturnType<typeof getDbPool>["getConnection"]>>, stats: { tables: number; rows: number }): AsyncGenerator<string> {
  const [tables] = await db.query<RowDataPacket[]>("SHOW FULL TABLES WHERE Table_type = 'BASE TABLE'");
  const names = tables.map((row) => String(Object.values(row)[0])).sort();
  yield `-- ARS Approvals database backup, ${new Date().toISOString()}\n-- Restore: node scripts/database/restore.js <this file> (see DEPLOYMENT Part P)\n`;
  yield "SET NAMES utf8mb4;\nSET time_zone = '+00:00';\nSET FOREIGN_KEY_CHECKS = 0;\nSET UNIQUE_CHECKS = 0;\n\n";
  for (const name of names) {
    stats.tables += 1;
    const [create] = await db.query<RowDataPacket[]>(`SHOW CREATE TABLE ${quoteId(name)}`);
    yield `DROP TABLE IF EXISTS ${quoteId(name)};\n${String(create[0]!["Create Table"])};\n`;
    const [columns] = await db.query<RowDataPacket[]>(`SHOW COLUMNS FROM ${quoteId(name)}`);
    // Computed (VIRTUAL/STORED GENERATED) columns can't be inserted. Note:
    // "DEFAULT_GENERATED" only means a DEFAULT CURRENT_TIMESTAMP, which is kept.
    const insertable = columns.filter((column) => !/(VIRTUAL|STORED) GENERATED/i.test(String(column.Extra ?? ""))).map((column) => String(column.Field));
    const columnList = insertable.map(quoteId).join(", ");
    // Paged by the primary key (all of its columns), so each row is read once.
    const keyColumns = columns.filter((column) => column.Key === "PRI").map((column) => String(column.Field));
    const order = (keyColumns.length ? keyColumns : insertable).map(quoteId).join(", ");
    let after: unknown[] | null = null;
    for (;;) {
      const where: string = after && keyColumns.length ? `WHERE (${keyColumns.map(quoteId).join(", ")}) > (${keyColumns.map(() => "?").join(", ")})` : "";
      const [rows]: [RowDataPacket[], unknown] = await db.query<RowDataPacket[]>(`SELECT ${columnList} FROM ${quoteId(name)} ${where} ORDER BY ${order} LIMIT 500`, after ?? []);
      if (rows.length === 0) break;
      stats.rows += rows.length;
      yield `INSERT INTO ${quoteId(name)} (${columnList}) VALUES\n${rows.map((row: RowDataPacket) => `(${insertable.map((column) => sqlValue(row[column])).join(", ")})`).join(",\n")};\n`;
      if (rows.length < 500 || keyColumns.length === 0) break;
      const last: RowDataPacket = rows[rows.length - 1]!;
      after = keyColumns.map((column) => last[column]);
    }
    yield "\n";
  }
  // Triggers (append-only audit, timeline and comments, D-012), without the
  // DEFINER so they restore under any MySQL account.
  const [triggers] = await db.query<RowDataPacket[]>("SHOW TRIGGERS");
  for (const trigger of triggers) {
    const [shown] = await db.query<RowDataPacket[]>(`SHOW CREATE TRIGGER ${quoteId(String(trigger.Trigger))}`);
    const statement = String(shown[0]!["SQL Original Statement"]).replace(/^CREATE\s+DEFINER\s*=\s*\S+\s+TRIGGER/i, "CREATE TRIGGER");
    yield `DROP TRIGGER IF EXISTS ${quoteId(String(trigger.Trigger))};\nDELIMITER $$\n${statement}$$\nDELIMITER ;\n`;
  }
  yield "\nSET FOREIGN_KEY_CHECKS = 1;\nSET UNIQUE_CHECKS = 1;\n";
}

function copyNewFiles(from: string, to: string): number {
  if (!fs.existsSync(from)) return 0;
  let copied = 0;
  for (const entry of fs.readdirSync(from, { withFileTypes: true })) {
    const source = path.join(from, entry.name);
    const target = path.join(to, entry.name);
    if (entry.isDirectory()) {
      copied += copyNewFiles(source, target);
    } else if (entry.isFile() && !fs.existsSync(target)) {
      fs.mkdirSync(to, { recursive: true });
      fs.copyFileSync(source, target);
      copied += 1;
    }
  }
  return copied;
}

export async function createBackup(options: { dir?: string; keepDays?: number; uploadDir?: string } = {}): Promise<BackupReport> {
  const dir = options.dir ?? backupDir();
  const keepDays = options.keepDays ?? 14;
  fs.mkdirSync(dir, { recursive: true });
  const stamp = new Date().toISOString().replace(/[-:]/g, "").replace("T", "-").slice(0, 15);
  const file = path.join(dir, `ars-db-${stamp}.sql.gz`);
  const partial = `${file}.part`;
  const stats = { tables: 0, rows: 0 };
  await pipeline(Readable.from(dumpStatements(stats)), zlib.createGzip({ level: 6 }), fs.createWriteStream(partial));
  fs.renameSync(partial, file); // a half-written file never looks like a backup

  let deletedOldFiles = 0;
  const cutoff = Date.now() - keepDays * 86_400_000;
  for (const name of fs.readdirSync(dir)) {
    if (!/^ars-db-\d{8}-\d{6}\.sql\.gz$/.test(name)) continue;
    const full = path.join(dir, name);
    if (full !== file && fs.statSync(full).mtimeMs < cutoff) {
      fs.rmSync(full);
      deletedOldFiles += 1;
    }
  }
  const uploads = options.uploadDir ?? path.resolve(getEnv().UPLOAD_DIR ?? path.join(process.cwd(), "storage", "uploads"));
  const attachmentsCopied = copyNewFiles(uploads, path.join(dir, "attachments"));
  return { file, tables: stats.tables, rows: stats.rows, bytes: fs.statSync(file).size, attachmentsCopied, deletedOldFiles };
}

export interface BackupStatus {
  latest: { name: string; bytes: number; at: Date } | null;
  count: number;
  dir: string;
}

export function backupStatus(dir = backupDir()): BackupStatus {
  if (!fs.existsSync(dir)) return { latest: null, count: 0, dir };
  const files = fs
    .readdirSync(dir)
    .filter((name) => /^ars-db-\d{8}-\d{6}\.sql\.gz$/.test(name))
    .map((name) => ({ name, stat: fs.statSync(path.join(dir, name)) }))
    .sort((a, b) => b.stat.mtimeMs - a.stat.mtimeMs);
  const latest = files[0];
  return { latest: latest ? { name: latest.name, bytes: latest.stat.size, at: latest.stat.mtime } : null, count: files.length, dir };
}

// The job runner calls this every 5 minutes; it backs up at most once a day.
export async function runDailyBackup(): Promise<{ backup: "DONE" | "NOT_DUE" | "FAILED" }> {
  const latest = backupStatus().latest;
  if (latest && Date.now() - latest.at.getTime() < 23 * 3_600_000) return { backup: "NOT_DUE" };
  await createBackup({ keepDays: getEnv().BACKUP_KEEP_DAYS ?? 14 });
  return { backup: "DONE" };
}
