#!/usr/bin/env node
// Runs database/seeds/*.sql in filename order. Every seed must be idempotent
// (INSERT ... ON DUPLICATE KEY UPDATE / INSERT IGNORE) so re-running is safe.
// Usage: npm run db:seed
const fs = require("node:fs");
const path = require("node:path");
const { connect } = require("./env");
const { splitStatements } = require("./migrate");

const SEEDS_DIR = path.join(__dirname, "..", "..", "database", "seeds");

async function main() {
  const connection = await connect();
  try {
    const files = fs.readdirSync(SEEDS_DIR).filter((name) => name.endsWith(".sql")).sort();
    for (const filename of files) {
      console.log(`Seeding ${filename} ...`);
      const sql = fs.readFileSync(path.join(SEEDS_DIR, filename), "utf8");
      for (const statement of splitStatements(sql)) {
        await connection.query(statement);
      }
    }
    console.log(`Done. Ran ${files.length} seed file(s).`);
  } finally {
    await connection.end();
  }
}

main().catch((error) => {
  console.error("Seeding failed:", error.message);
  process.exit(1);
});
