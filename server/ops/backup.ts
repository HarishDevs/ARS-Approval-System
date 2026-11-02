import "server-only";
import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";
import crypto from "node:crypto";
import { pipeline } from "node:stream/promises";
import { Readable } from "node:stream";
import type { RowDataPacket } from "mysql2/promise";
import { getDbPool } from "@/lib/db/client";
import { getEnv } from "@/config/environment";
import { loadOffsiteConfig, uploadOffsite } from "@/server/ops/offsite";
import { logError } from "@/lib/logging/logger";

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

// Where backups go: BACKUP_DIR, else a "backups" folder beside the uploads
// (on GoDaddy that is Private Storage, /private/backups, kept across
// deploys), else storage/backups in the app folder (local development).
export function backupDir(): string {
  const env = getEnv();
  if (env.BACKUP_DIR) return path.resolve(env.BACKUP_DIR);
  if (env.UPLOAD_DIR) return path.join(path.dirname(path.resolve(env.UPLOAD_DIR)), "backups");
  return path.resolve(path.join(process.cwd(), "storage", "backups"));
}

// Why a backup failed, in plain words for the Super Admin (no secrets: a
// folder path, an error code, a database error name).
export function explainBackupError(error: unknown, dir = backupDir()): string {
  const err = error as { code?: string; message?: string; sqlMessage?: string };
  const code = err?.code ?? "";
  if (code === "EACCES" || code === "EPERM" || code === "EROFS") return `The app isn't allowed to write to the backup folder ${dir}. On GoDaddy the app can only write to Private Storage: set BACKUP_DIR to /private/backups (GoDaddy → the app → Secrets), then Publish.`;
  if (code === "ENOENT" || code === "ENOTDIR") return `The backup folder ${dir} can't be created (a part of the path doesn't exist where the app runs). On GoDaddy the app can only write to Private Storage: set BACKUP_DIR to /private/backups (GoDaddy → the app → Secrets), then Publish.`;
  if (code === "ENOSPC" || code === "EDQUOT") return `There's no space left for the backup in ${dir}. Free up space (old backups, logs) in cPanel.`;
  if (code.startsWith("ER_")) return `The database refused part of the backup (${code}${err.sqlMessage ? `: ${err.sqlMessage}` : ""}). The database user may lack a permission such as SHOW VIEW or TRIGGER.`;
  return `The backup failed (${code || "error"}${err?.message ? `: ${String(err.message).slice(0, 160)}` : ""}). Backup folder: ${dir}.`;
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
  yield `-- ARS CMS database backup, ${new Date().toISOString()}\n-- Restore: node scripts/database/restore.js <this file> (see DEPLOYMENT Part P)\n`;
  yield "SET NAMES utf8mb4;\nSET time_zone = '+00:00';\nSET FOREIGN_KEY_CHECKS = 0;\nSET UNIQUE_CHECKS = 0;\n\n";
  for (const name of names) {
    stats.tables += 1;
    const [create] = await db.query<RowDataPacket[]>(`SHOW CREATE TABLE ${quoteId(name)}`);
    const createSql = String(create[0]!["Create Table"]);
    yield `DROP TABLE IF EXISTS ${quoteId(name)};\n${createSql};\n`;
    // Computed columns, read from the CREATE TABLE text itself: SHOW COLUMNS'
    // "Extra" came back empty for one in a busy run, and the restore then
    // failed ("value specified for generated column … is not allowed").
    const computed = new Set([...createSql.matchAll(/^\s*`([^`]+)`[^\n]*\bGENERATED ALWAYS AS\b/gm)].map((match) => match[1]));
    const [columns] = await db.query<RowDataPacket[]>(`SHOW COLUMNS FROM ${quoteId(name)}`);
    // Computed (VIRTUAL/STORED GENERATED) columns can't be inserted. Note:
    // "DEFAULT_GENERATED" only means a DEFAULT CURRENT_TIMESTAMP, which is kept.
    const insertable = columns
      .filter((column) => !computed.has(String(column.Field)) && !/(VIRTUAL|STORED) GENERATED/i.test(String(column.Extra ?? "")))
      .map((column) => String(column.Field));
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

// D-246 (audit OPS-09): the same format as scripts/database/backup-file.js
// (which restore and verify read): "ARSBK1", IV, AES-256-GCM ciphertext, tag.
export const BACKUP_NAME = /^ars-db-\d{8}-\d{6}\.sql\.gz(\.enc)?$/;
const BACKUP_MAGIC = Buffer.from("ARSBK1");

export function backupEncryptionKey(value = getEnv().BACKUP_ENCRYPTION_KEY): Buffer | null {
  if (!value) return null;
  const key = Buffer.from(value, "base64");
  if (key.length !== 32) throw new Error("BACKUP_ENCRYPTION_KEY must be 32 bytes, base64-encoded.");
  return key;
}

export function encryptBackup(gzip: Buffer, key: Buffer): Buffer {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
  const body = Buffer.concat([cipher.update(gzip), cipher.final()]);
  return Buffer.concat([BACKUP_MAGIC, iv, body, cipher.getAuthTag()]);
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
  const key = backupEncryptionKey();
  const file = path.join(dir, `ars-db-${stamp}.sql.gz${key ? ".enc" : ""}`);
  const partial = `${file}.part`;
  const stats = { tables: 0, rows: 0 };
  await pipeline(Readable.from(dumpStatements(stats)), zlib.createGzip({ level: 6 }), fs.createWriteStream(partial));
  // D-246 (audit OPS-09): encrypted when a key is set, and always with a
  // .sha256 next to it (restore.js and verify-backup.js check both).
  if (key) fs.writeFileSync(partial, encryptBackup(fs.readFileSync(partial), key));
  fs.writeFileSync(`${file}.sha256`, `${crypto.createHash("sha256").update(fs.readFileSync(partial)).digest("hex")}  ${path.basename(file)}\n`);
  fs.renameSync(partial, file); // a half-written file never looks like a backup

  let deletedOldFiles = 0;
  const cutoff = Date.now() - keepDays * 86_400_000;
  for (const name of fs.readdirSync(dir)) {
    if (!BACKUP_NAME.test(name)) continue;
    const full = path.join(dir, name);
    if (full !== file && fs.statSync(full).mtimeMs < cutoff) {
      fs.rmSync(full);
      fs.rmSync(`${full}.sha256`, { force: true });
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
    .filter((name) => BACKUP_NAME.test(name))
    .map((name) => ({ name, stat: fs.statSync(path.join(dir, name)) }))
    .sort((a, b) => b.stat.mtimeMs - a.stat.mtimeMs);
  const latest = files[0];
  return { latest: latest ? { name: latest.name, bytes: latest.stat.size, at: latest.stat.mtime } : null, count: files.length, dir };
}

// The job runner calls this every 5 minutes; it backs up at most once a day.
export async function runDailyBackup(): Promise<{ backup: "DONE" | "NOT_DUE" | "FAILED"; offsite?: "DONE" | "OFF" | "FAILED"; offsiteError?: string }> {
  const latest = backupStatus().latest;
  if (latest && Date.now() - latest.at.getTime() < 23 * 3_600_000) return { backup: "NOT_DUE" };
  const report = await createBackup({ keepDays: getEnv().BACKUP_KEEP_DAYS ?? 14 });
  // D-246 (audit OPS-08): then the off-site copy. A failure is reported (the
  // run is marked failed, so the Super Admin is told); the local backup stays.
  try {
    const config = await loadOffsiteConfig();
    if (!config) return { backup: "DONE", offsite: "OFF" };
    await uploadOffsite(report.file, config);
    return { backup: "DONE", offsite: "DONE" };
  } catch (error) {
    logError("off-site backup copy failed", error);
    return { backup: "DONE", offsite: "FAILED", offsiteError: error instanceof Error ? error.message.slice(0, 300) : "Failed" };
  }
}
