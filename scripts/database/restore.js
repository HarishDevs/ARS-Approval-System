#!/usr/bin/env node
// Restores a backup made by the app (server/ops/backup.ts, D-104) into the
// database named by DB_NAME. Every table in the file is dropped and
// re-created, so you must name the database on the command line to confirm.
// Usage:
//   node scripts/database/restore.js <ars-db-YYYYMMDD-HHMMSS.sql.gz> --confirm-database=<DB_NAME>
// Restore into a NEW, empty database first and check it (DEPLOYMENT Part P).
const fs = require("node:fs");
const zlib = require("node:zlib");
const { connect } = require("./env");

// Statements end with ";" at the end of a line; "DELIMITER $$" blocks
// (triggers) end with "$$". Quotes inside values never end a statement
// because values are on one line and escaped.
function splitDump(sql) {
  const statements = [];
  let delimiter = ";";
  let buffer = [];
  for (const line of sql.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (/^DELIMITER\s+/i.test(trimmed)) {
      delimiter = trimmed.split(/\s+/)[1];
      continue;
    }
    if (!buffer.length && (trimmed === "" || trimmed.startsWith("--"))) continue;
    buffer.push(line);
    if (trimmed.endsWith(delimiter)) {
      const statement = buffer.join("\n");
      statements.push(statement.slice(0, statement.lastIndexOf(delimiter)));
      buffer = [];
    }
  }
  if (buffer.join("").trim()) statements.push(buffer.join("\n"));
  return statements;
}

async function main() {
  const file = process.argv[2];
  const confirm = (process.argv.find((arg) => arg.startsWith("--confirm-database=")) || "").split("=")[1];
  if (!file || !fs.existsSync(file)) throw new Error("Give the backup file: node scripts/database/restore.js <file.sql.gz> --confirm-database=<DB_NAME>");
  if (!confirm || confirm !== process.env.DB_NAME) {
    throw new Error(`This replaces every table in "${process.env.DB_NAME}". Run again with --confirm-database=${process.env.DB_NAME} to confirm.`);
  }
  const raw = fs.readFileSync(file);
  const sql = (file.endsWith(".gz") ? zlib.gunzipSync(raw) : raw).toString("utf8");
  const statements = splitDump(sql);
  const connection = await connect();
  try {
    let done = 0;
    for (const statement of statements) {
      await connection.query(statement);
      done += 1;
    }
    console.log(`Restored ${file} into ${process.env.DB_NAME}: ${done} statements.`);
  } finally {
    await connection.end();
  }
}

module.exports = { splitDump };

if (require.main === module) {
  main().catch((error) => {
    console.error("Restore failed:", error.message);
    process.exit(1);
  });
}
