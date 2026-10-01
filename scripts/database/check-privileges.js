// Go-live check (F-90, S4-07): can this MySQL account do what the migrations
// need? Run it against the production database BEFORE migrating:
//
//   DB_HOST=… DB_PORT=… DB_NAME=… DB_USER=… DB_PASSWORD=… node scripts/database/check-privileges.js
//
// It creates and drops a scratch table and trigger only; it never touches
// real data. The append-only guarantees (audit log, timeline, comments)
// rely on triggers: if CREATE TRIGGER is refused, ask GoDaddy support to
// allow it (or enable log_bin_trust_function_creators) before go-live.
const { connect } = require("./env");

async function main() {
  const db = await connect();
  const results = [];
  const check = async (name, sql) => {
    try {
      await db.query(sql);
      results.push([name, "OK"]);
      return true;
    } catch (error) {
      results.push([name, `FAILED: ${error.code ?? ""} ${error.message}`]);
      return false;
    }
  };
  try {
    const [[version]] = await db.query("SELECT VERSION() AS version");
    results.push(["MySQL version", version.version]);
    await check("CREATE TABLE", "CREATE TABLE zz_privilege_check (id INT PRIMARY KEY, note VARCHAR(20)) ENGINE=InnoDB");
    await check("ALTER TABLE", "ALTER TABLE zz_privilege_check ADD COLUMN extra INT NULL");
    await check("INSERT / UPDATE", "INSERT INTO zz_privilege_check (id, note) VALUES (1, 'x')");
    const trigger = await check(
      "CREATE TRIGGER (append-only tables)",
      "CREATE TRIGGER zz_privilege_check_no_update BEFORE UPDATE ON zz_privilege_check FOR EACH ROW BEGIN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'blocked'; END",
    );
    if (trigger) {
      const blocked = await check("Trigger blocks an UPDATE (expected to FAIL)", "UPDATE zz_privilege_check SET note = 'y'");
      results[results.length - 1][1] = blocked ? "PROBLEM: the update went through" : "OK (blocked as intended)";
      await check("DROP TRIGGER", "DROP TRIGGER zz_privilege_check_no_update");
    }
    await check("FOR UPDATE SKIP LOCKED (job runner)", "SELECT id FROM zz_privilege_check FOR UPDATE SKIP LOCKED");
    await check("JSON columns", "SELECT JSON_EXTRACT('{\"a\":1}', '$.a')");
  } finally {
    await db.query("DROP TABLE IF EXISTS zz_privilege_check").catch(() => undefined);
    await db.end();
  }
  const width = Math.max(...results.map(([name]) => name.length));
  for (const [name, outcome] of results) console.log(`${name.padEnd(width)}  ${outcome}`);
  const failed = results.filter(([name, outcome]) => /FAILED|PROBLEM/.test(outcome) && !name.includes("expected to FAIL"));
  if (failed.length) {
    console.log("\nNot ready: fix the lines above before running migrate.js.");
    process.exit(1);
  }
  console.log("\nReady: this account can run the migrations.");
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
