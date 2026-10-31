#!/usr/bin/env node
// Applies pending database/migrations/*.sql in filename order, tracked in
// schema_migrations (safe to re-run). Naming: YYYYMMDDHHMM_description.sql.
// Files may use "-- @delimiter $$" blocks for triggers (see splitStatements).
// v1.9.0: a block marked "-- @optional" (just before "-- @begin") is skipped
// with a warning when the database user isn't allowed to run it (hosted
// MySQL with binary logging refuses CREATE TRIGGER without SUPER). The
// warning names the SQL file IT can run once in phpMyAdmin instead.
// Usage: npm run db:migrate
const fs = require("node:fs");
const path = require("node:path");
const { connect } = require("./env");

// MIGRATIONS_DIR: only for the resume test (tests/integration/migrate.int.test.ts).
const MIGRATIONS_DIR = process.env.MIGRATIONS_DIR || path.join(__dirname, "..", "..", "database", "migrations");

// Splits a file into statements. Plain statements end with ";". A trigger
// body contains ";" itself, so it is wrapped between "-- @begin" and
// "-- @end" lines and sent as one statement.
const OPTIONAL = "-- @optional";
// Errors that mean "not allowed here", for which an optional block is skipped.
const PRIVILEGE_ERRORS = new Set(["ER_BINLOG_CREATE_ROUTINE_NEED_SUPER", "ER_SPECIFIC_ACCESS_DENIED_ERROR", "ER_TABLEACCESS_DENIED_ERROR", "ER_DBACCESS_DENIED_ERROR"]);
const isOptional = (statement) => statement.startsWith(OPTIONAL);

function splitStatements(sql) {
  const statements = [];
  const lines = sql.split(/\r?\n/);
  let buffer = [];
  let inBlock = false;
  let optional = false;
  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed === OPTIONAL) {
      optional = true;
      continue;
    }
    if (trimmed === "-- @begin") {
      inBlock = true;
      buffer = [];
      continue;
    }
    if (trimmed === "-- @end") {
      inBlock = false;
      statements.push(`${optional ? `${OPTIONAL}\n` : ""}${buffer.join("\n")}`);
      optional = false;
      buffer = [];
      continue;
    }
    buffer.push(line);
    if (!inBlock && !trimmed.startsWith("--") && trimmed.endsWith(";")) {
      const statement = buffer.join("\n").trim();
      if (statement.replace(/--.*$/gm, "").trim()) statements.push(statement);
      buffer = [];
    }
  }
  const rest = buffer.join("\n").replace(/--.*$/gm, "").trim();
  if (rest) statements.push(buffer.join("\n"));
  return statements;
}

const MIGRATION_LOCK = "ars_migrate";
const MIGRATION_LOCK_WAIT_SECONDS = 120;

async function main() {
  const connection = await connect();
  try {
    await connection.query(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        filename    VARCHAR(255) NOT NULL PRIMARY KEY,
        applied_at  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`);

    // MySQL can't roll back table changes, so a file that fails halfway is
    // partly applied. Progress is saved per statement: after fixing the cause,
    // the next run carries on from the statement that failed (audit R-10).
    await connection.query(`
      CREATE TABLE IF NOT EXISTS schema_migration_progress (
        filename    VARCHAR(255) NOT NULL PRIMARY KEY,
        statements_done INT NOT NULL,
        updated_at  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`);

    // D-246 (audit DB-002): one runner at a time. Two app processes starting
    // together (a redeploy, Passenger workers) wait for each other; the second
    // then reads the ledger after the first has finished and finds nothing to do.
    const [locked] = await connection.query("SELECT GET_LOCK(?, ?) AS got", [MIGRATION_LOCK, MIGRATION_LOCK_WAIT_SECONDS]);
    if (Number(locked[0]?.got) !== 1) throw new Error(`Another process is applying migrations (waited ${MIGRATION_LOCK_WAIT_SECONDS} s for the lock). Start again when it has finished.`);

    const [rows] = await connection.query("SELECT filename FROM schema_migrations");
    const applied = new Set(rows.map((row) => row.filename));
    const pending = fs
      .readdirSync(MIGRATIONS_DIR)
      .filter((name) => name.endsWith(".sql"))
      .sort()
      .filter((name) => !applied.has(name));

    if (pending.length === 0) {
      console.log("No pending migrations.");
      return;
    }

    for (const filename of pending) {
      const sql = fs.readFileSync(path.join(MIGRATIONS_DIR, filename), "utf8");
      const statements = splitStatements(sql);
      const [progress] = await connection.query("SELECT statements_done FROM schema_migration_progress WHERE filename = ?", [filename]);
      const start = progress[0] ? Number(progress[0].statements_done) : 0;
      console.log(start ? `Resuming ${filename} at statement ${start + 1} of ${statements.length} ...` : `Applying ${filename} ...`);
      for (let index = start; index < statements.length; index += 1) {
        try {
          await connection.query(statements[index]);
        } catch (error) {
          if (isOptional(statements[index]) && PRIVILEGE_ERRORS.has(error.code)) {
            const what = statements[index].split("\n").find((line) => line.trim() && !line.trim().startsWith("--")) ?? "";
            console.log(`WARNING: skipped optional statement ${index + 1} of ${statements.length} in ${filename} (${what.trim().slice(0, 80)}): ${error.message}`);
            console.log("  The app works without it. To add it, run database/optional/v190_append_only_triggers.sql once in phpMyAdmin.");
            await connection.query(
              "INSERT INTO schema_migration_progress (filename, statements_done) VALUES (?, ?) ON DUPLICATE KEY UPDATE statements_done = VALUES(statements_done)",
              [filename, index + 1],
            );
            continue;
          }
          const first = statements[index].split("\n").find((line) => line.trim() && !line.trim().startsWith("--")) ?? "";
          error.message =
            `${filename}, statement ${index + 1} of ${statements.length} (${first.trim().slice(0, 80)}): ${error.message}\n` +
            `Statements 1 to ${index} of this file are applied and recorded. Fix the cause, then start again: it carries on from statement ${index + 1}.`;
          throw error;
        }
        await connection.query(
          "INSERT INTO schema_migration_progress (filename, statements_done) VALUES (?, ?) ON DUPLICATE KEY UPDATE statements_done = VALUES(statements_done)",
          [filename, index + 1],
        );
      }
      await connection.query("INSERT INTO schema_migrations (filename) VALUES (?)", [filename]);
      await connection.query("DELETE FROM schema_migration_progress WHERE filename = ?", [filename]);
    }
    console.log(`Done. Applied ${pending.length} migration(s).`);
  } finally {
    await connection.query("SELECT RELEASE_LOCK(?)", [MIGRATION_LOCK]).catch(() => undefined);
    await connection.end();
  }
}

module.exports = { splitStatements };

if (require.main === module) {
  main().catch((error) => {
    console.error("Migration failed:", error.message);
    process.exit(1);
  });
}
