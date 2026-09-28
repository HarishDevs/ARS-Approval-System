import "server-only";
import mysql from "mysql2/promise";
import { getEnv } from "@/config/environment";

// One pool per server process, cached on globalThis so Next.js dev-mode Fast
// Refresh doesn't leak a new pool on every edit (Power BI site lesson,
// 2026-09-08). Never import from client code.
const globalForDb = globalThis as unknown as { dbPool?: mysql.Pool };

export function getDbPool(): mysql.Pool {
  if (globalForDb.dbPool) return globalForDb.dbPool;
  const env = getEnv();
  globalForDb.dbPool = mysql.createPool({
    host: env.DB_HOST,
    port: env.DB_PORT,
    user: env.DB_USER,
    password: env.DB_PASSWORD,
    database: env.DB_NAME,
    waitForConnections: true,
    connectionLimit: 10,
    dateStrings: false,
    timezone: "Z",
  });
  return globalForDb.dbPool;
}

export type Queryable = Pick<mysql.Pool, "query"> | Pick<mysql.PoolConnection, "query">;
