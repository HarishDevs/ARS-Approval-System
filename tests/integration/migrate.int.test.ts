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
