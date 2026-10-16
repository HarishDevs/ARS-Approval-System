import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import mysql from "mysql2/promise";
import { afterAll, describe, expect, it } from "vitest";

// Audit R-10: a migration that fails halfway carries on from the failed
// statement next time, instead of re-running the ones already applied.
const host = process.env.TEST_DB_HOST ?? "127.0.0.1";
const port = Number(process.env.TEST_DB_PORT ?? 3307);
const appUser = process.env.TEST_DB_USER ?? "ars_dev";
const appPassword = process.env.TEST_DB_PASSWORD ?? "ars_dev_password";
const rootPassword = process.env.TEST_DB_ROOT_PASSWORD ?? "ars_root_password";
const database = "ars_migrate_resume_test";
const dir = fs.mkdtempSync(path.join(os.tmpdir(), "ars-migrate-"));

async function root() {
  return mysql.createConnection({ host, port, user: "root", password: rootPassword });
}

function migrate(): { ok: boolean; output: string } {
  try {
    const output = execFileSync(process.execPath, [path.resolve(__dirname, "../../scripts/database/migrate.js")], {
      env: { ...process.env, DB_HOST: host, DB_PORT: String(port), DB_NAME: database, DB_USER: appUser, DB_PASSWORD: appPassword, MIGRATIONS_DIR: dir },
      stdio: "pipe",
    });
    return { ok: true, output: output.toString() };
  } catch (error) {
    return { ok: false, output: `${(error as { stdout?: Buffer }).stdout ?? ""}${(error as { stderr?: Buffer }).stderr ?? ""}` };
  }
}

afterAll(async () => {
  const connection = await root();
  await connection.query(`DROP DATABASE IF EXISTS \`${database}\``);
  await connection.end();
  fs.rmSync(dir, { recursive: true, force: true });
});

describe("migrations resume after a failure (R-10)", () => {
  it("stops at the failing statement, then carries on from it", async () => {
    const connection = await root();
    await connection.query(`DROP DATABASE IF EXISTS \`${database}\``);
    await connection.query(`CREATE DATABASE \`${database}\``);
    await connection.query(`GRANT ALL PRIVILEGES ON \`${database}\`.* TO ?@'%'`, [appUser]);
    fs.writeFileSync(
      path.join(dir, "202601010000_three_steps.sql"),
      ["CREATE TABLE one (id INT PRIMARY KEY);", "ALTER TABLE needs_fix ADD COLUMN extra INT;", "CREATE TABLE three (id INT PRIMARY KEY);"].join("\n"),
    );

    const first = migrate();
    expect(first.ok).toBe(false);
    expect(first.output).toContain("statement 2 of 3");
    expect(first.output).toContain("carries on from statement 2");

    // Someone fixes the cause; re-running must not try CREATE TABLE one again.
    await connection.query(`CREATE TABLE \`${database}\`.needs_fix (id INT PRIMARY KEY)`);
    const second = migrate();
    expect(second.output).toContain("Resuming 202601010000_three_steps.sql at statement 2 of 3");
    expect(second.ok).toBe(true);

    const [tables] = await connection.query<mysql.RowDataPacket[]>(`SELECT table_name AS name FROM information_schema.tables WHERE table_schema = ? ORDER BY table_name`, [database]);
    expect(tables.map((row) => String(row.name ?? row.NAME))).toEqual(["needs_fix", "one", "schema_migration_progress", "schema_migrations", "three"]);
    const [progress] = await connection.query<mysql.RowDataPacket[]>(`SELECT COUNT(*) AS total FROM \`${database}\`.schema_migration_progress`);
    expect(Number(progress[0]!.total)).toBe(0);
    await connection.end();
  });
});

// v1.9.0: GoDaddy's MySQL has binary logging on and refuses CREATE TRIGGER
// to a user without SUPER. A block marked "-- @optional" is then skipped
// with a warning, and the rest of the file still applies.
describe("optional statements skipped when the user isn't allowed (v1.9.0)", () => {
  it("skips the optional trigger, applies the rest; a required trigger still fails", async () => {
    const connection = await root();
    const [before] = await connection.query<mysql.RowDataPacket[]>("SELECT @@GLOBAL.log_bin_trust_function_creators AS trusted");
    await connection.query(`DROP DATABASE IF EXISTS \`${database}\``);
    await connection.query(`CREATE DATABASE \`${database}\``);
    await connection.query(`GRANT ALL PRIVILEGES ON \`${database}\`.* TO ?@'%'`, [appUser]);
    for (const name of fs.readdirSync(dir)) fs.rmSync(path.join(dir, name));
    try {
      // Like the host: binary logging on, creators not trusted.
      await connection.query("SET GLOBAL log_bin_trust_function_creators = 0");
      const trigger = (name: string) => ["-- @begin", `CREATE TRIGGER ${name} BEFORE UPDATE ON log_t`, "FOR EACH ROW", "BEGIN", "  SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'append-only';", "END;", "-- @end"];
      fs.writeFileSync(path.join(dir, "202601020000_optional.sql"), ["CREATE TABLE log_t (id INT PRIMARY KEY);", "-- @optional", ...trigger("trg_optional"), "CREATE TABLE after_t (id INT PRIMARY KEY);"].join("\n"));
      // Does this server refuse triggers to the app's user (like GoDaddy)?
      // Some test servers (e.g. CI) run without binary logging, so they don't.
      const app = await mysql.createConnection({ host, port, user: appUser, password: appPassword, database });
      let refused = false;
      try {
        await app.query("CREATE TABLE probe_t (id INT PRIMARY KEY)");
        await app.query("CREATE TRIGGER trg_probe BEFORE UPDATE ON probe_t FOR EACH ROW SET NEW.id = OLD.id");
        await app.query("DROP TRIGGER trg_probe");
      } catch (error) {
        refused = (error as { code?: string }).code === "ER_BINLOG_CREATE_ROUTINE_NEED_SUPER";
      } finally {
        await app.query("DROP TABLE IF EXISTS probe_t").catch(() => undefined);
        await app.end();
      }
      const run = migrate();
      expect(run.ok).toBe(true);
      const [tables] = await connection.query<mysql.RowDataPacket[]>("SELECT table_name AS name FROM information_schema.tables WHERE table_schema = ? AND table_name IN ('log_t', 'after_t')", [database]);
      expect(tables).toHaveLength(2);
      const [triggers] = await connection.query<mysql.RowDataPacket[]>("SELECT trigger_name AS name FROM information_schema.triggers WHERE trigger_schema = ?", [database]);
      fs.writeFileSync(path.join(dir, "202601030000_required.sql"), trigger("trg_required").join("\n"));
      const required = migrate();
      if (refused) {
        expect(run.output).toContain("WARNING: skipped optional statement 2 of 3");
        expect(triggers).toHaveLength(0);
        // Without the marker the same refusal still stops the migration.
        expect(required.ok).toBe(false);
        expect(required.output).toContain("SUPER");
      } else {
        // Allowed here: the optional trigger is simply created; nothing skipped.
        expect(run.output).not.toContain("WARNING");
        expect(triggers.map((row) => String(row.name ?? row.NAME))).toEqual(["trg_optional"]);
        expect(required.ok).toBe(true);
      }
    } finally {
      await connection.query(`SET GLOBAL log_bin_trust_function_creators = ${Number(before[0]!.trusted) ? 1 : 0}`);
      await connection.end();
    }
  });
});
