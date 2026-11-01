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
    // QA-DB-01 (v1.42.1): the size comes from DB_POOL_SIZE (default 10); a
    // connection that can't be made in 10 s fails instead of hanging, and at
    // most 500 queries wait for a free connection (then a clear error, not an
    // ever-growing queue).
    connectionLimit: env.DB_POOL_SIZE,
    connectTimeout: 10_000,
    queueLimit: 500,
    dateStrings: false,
    timezone: "Z",
  });
  return globalForDb.dbPool;
}

export type Queryable = Pick<mysql.Pool, "query"> | Pick<mysql.PoolConnection, "query">;
