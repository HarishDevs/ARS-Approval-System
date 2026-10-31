#!/usr/bin/env node
// Backup check (v1.7.0, C03). Restores a backup made by the app into a
// separate, EMPTY database and proves it came back whole:
//   - every table in the file exists, with exactly the rows the file holds;
//   - every trigger came back, and the append-only triggers still refuse
//     changes (audit log, timeline);
//   - the list of applied migrations matches the file.
// It never touches the live database: it refuses when the target is the
// app's DB_NAME, or when the target already has tables. It prints counts
// only, never data, passwords or settings.
//
// Usage (create an empty database first, e.g. in cPanel → MySQL Databases):
//   node scripts/database/verify-backup.js <ars-db-YYYYMMDD-HHMMSS.sql.gz> --into=<empty_database> [--report=<file.json>]
// Exit code 0 when everything matches, 1 otherwise.
const fs = require("node:fs");
const mysql = require("mysql2/promise");
const { splitDump } = require("./restore");
const { readBackup } = require("./backup-file");
require("./env"); // loads .env.local for the connection settings

const APPEND_ONLY = ["audit_logs", "approval_events"];

// Rows per table as written in the file: each INSERT puts one row per line.
function expectedFromDump(statements) {
  const tables = new Map();
  let triggers = 0;
  for (const statement of statements) {
    const trimmed = statement.trimStart();
    const create = /^CREATE TABLE `([^`]+)`/i.exec(trimmed);
    if (create) tables.set(create[1], tables.get(create[1]) ?? 0);
    const insert = /^INSERT INTO `([^`]+)`/i.exec(trimmed);
    if (insert) tables.set(insert[1], (tables.get(insert[1]) ?? 0) + (trimmed.split("\n").length - 1));
    if (/^CREATE TRIGGER/i.test(trimmed)) triggers += 1;
  }
  return { tables, triggers };
}

function arg(name) {
  const found = process.argv.find((value) => value.startsWith(`--${name}=`));
  return found ? found.slice(name.length + 3) : null;
}

async function main() {
  const file = process.argv[2];
  const into = arg("into");
  const reportFile = arg("report");
  if (!file || !fs.existsSync(file)) throw new Error("Give the backup file: node scripts/database/verify-backup.js <file.sql.gz> --into=<empty_database>");
  if (!into || !/^[A-Za-z0-9_]{1,64}$/.test(into)) throw new Error("Name an empty database to restore into: --into=<name> (letters, numbers and _).");
  if (into === process.env.DB_NAME) throw new Error(`"${into}" is the app's own database. Use a separate, empty database for the check.`);

  const connection = await mysql.createConnection({
    host: process.env.DB_HOST,
    port: Number(process.env.DB_PORT ?? 3306),
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: into,
    multipleStatements: true,
    timezone: "Z",
  });
  const started = Date.now();
  const problems = [];
  try {
    const [existing] = await connection.query("SHOW TABLES");
    if (existing.length > 0) throw new Error(`"${into}" already has ${existing.length} table(s). The check only restores into an empty database.`);

    // D-246 (audit OPS-09): the .sha256 is checked, and an encrypted (.enc) file decrypted.
    const sql = readBackup(file);
    const statements = splitDump(sql);
    const expected = expectedFromDump(statements);
    for (const statement of statements) await connection.query(statement);

    const rows = [];
    for (const [table, want] of [...expected.tables.entries()].sort()) {
      const [[count]] = await connection.query(`SELECT COUNT(*) AS n FROM \`${table}\``);
      const got = Number(count.n);
      rows.push({ table, expected: want, restored: got, ok: got === want });
      if (got !== want) problems.push(`${table}: ${got} rows restored, ${want} in the file`);
    }
    const [[triggerCount]] = await connection.query("SELECT COUNT(*) AS n FROM information_schema.triggers WHERE trigger_schema = DATABASE()");
    if (Number(triggerCount.n) !== expected.triggers) problems.push(`triggers: ${triggerCount.n} restored, ${expected.triggers} in the file`);
    for (const table of APPEND_ONLY.filter((name) => expected.tables.has(name))) {
      try {
        await connection.query(`UPDATE \`${table}\` SET id = id LIMIT 1`);
        const [[one]] = await connection.query(`SELECT COUNT(*) AS n FROM \`${table}\``);
        if (Number(one.n) > 0) problems.push(`${table}: changes were allowed (the append-only trigger is missing)`);
      } catch {
        // Refused: the trigger works.
      }
    }
    const migrations = expected.tables.has("schema_migrations") ? rows.find((row) => row.table === "schema_migrations") : null;
    const report = {
      file: require("node:path").basename(file),
      into,
      checkedAt: new Date().toISOString(),
      seconds: Math.round((Date.now() - started) / 100) / 10,
      tables: rows.length,
      rows: rows.reduce((sum, row) => sum + row.restored, 0),
      triggers: Number(triggerCount.n),
      migrations: migrations ? migrations.restored : null,
      ok: problems.length === 0,
      problems,
      detail: rows,
    };
    if (reportFile) fs.writeFileSync(reportFile, JSON.stringify(report, null, 2));
    console.log(`Backup check of ${report.file} into ${into}: ${report.tables} tables, ${report.rows} rows, ${report.triggers} triggers, ${report.seconds}s.`);
    if (problems.length) {
      console.log("PROBLEMS:");
      for (const problem of problems) console.log(`  - ${problem}`);
      process.exitCode = 1;
    } else {
      console.log("OK: every table, row count and trigger matches the file.");
    }
  } finally {
    await connection.end();
  }
}

module.exports = { expectedFromDump };

if (require.main === module) {
  main().catch((error) => {
    console.error("Backup check failed:", error.message);
    process.exit(1);
  });
}
