#!/usr/bin/env node
// Applies pending database/migrations/*.sql in filename order, tracked in
// schema_migrations (safe to re-run). Naming: YYYYMMDDHHMM_description.sql.
// Files may use "-- @delimiter $$" blocks for triggers (see splitStatements).
// Usage: npm run db:migrate
const fs = require("node:fs");
const path = require("node:path");
const { connect } = require("./env");

const MIGRATIONS_DIR = path.join(__dirname, "..", "..", "database", "migrations");

// Splits a file into statements. Plain statements end with ";". A trigger
// body contains ";" itself, so it is wrapped between "-- @begin" and
// "-- @end" lines and sent as one statement.
function splitStatements(sql) {
  const statements = [];
  const lines = sql.split(/\r?\n/);
  let buffer = [];
  let inBlock = false;
  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed === "-- @begin") {
      inBlock = true;
      buffer = [];
      continue;
    }
    if (trimmed === "-- @end") {
      inBlock = false;
      statements.push(buffer.join("\n"));
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

async function main() {
  const connection = await connect();
  try {
    await connection.query(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        filename    VARCHAR(255) NOT NULL PRIMARY KEY,
        applied_at  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`);

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
      console.log(`Applying ${filename} ...`);
      const sql = fs.readFileSync(path.join(MIGRATIONS_DIR, filename), "utf8");
      for (const statement of splitStatements(sql)) {
        await connection.query(statement);
      }
      await connection.query("INSERT INTO schema_migrations (filename) VALUES (?)", [filename]);
    }
    console.log(`Done. Applied ${pending.length} migration(s).`);
  } finally {
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
