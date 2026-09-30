import { execFileSync } from "node:child_process";
import path from "node:path";
import mysql from "mysql2/promise";

// Recreates ars_approvals_test with the real migrations and seeds, so the
// integration tests see exactly the schema production gets. Uses the MySQL
// root account only to (re)create the database and grant the app user.
export default async function setup(): Promise<void> {
  const host = process.env.TEST_DB_HOST ?? "127.0.0.1";
  const port = Number(process.env.TEST_DB_PORT ?? 3307);
  const appUser = process.env.TEST_DB_USER ?? "ars_dev";
  const appPassword = process.env.TEST_DB_PASSWORD ?? "ars_dev_password";
  const rootPassword = process.env.TEST_DB_ROOT_PASSWORD ?? "ars_root_password";
  const database = "ars_approvals_test";

  const root = await mysql.createConnection({ host, port, user: "root", password: rootPassword });
  try {
    await root.query(`DROP DATABASE IF EXISTS \`${database}\``);
    await root.query(`CREATE DATABASE \`${database}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`);
    await root.query(`GRANT ALL PRIVILEGES ON \`${database}\`.* TO ?@'%'`, [appUser]);
  } finally {
    await root.end();
  }

  const env = { ...process.env, DB_HOST: host, DB_PORT: String(port), DB_NAME: database, DB_USER: appUser, DB_PASSWORD: appPassword };
  const scripts = path.resolve(__dirname, "../../scripts/database");
  for (const script of ["migrate.js", "seed.js"]) {
    try {
      execFileSync(process.execPath, [path.join(scripts, script)], { env, stdio: "pipe" });
    } catch (error) {
      const stderr = (error as { stderr?: Buffer }).stderr?.toString() ?? String(error);
      throw new Error(`${script} failed: ${stderr}`);
    }
  }
}
