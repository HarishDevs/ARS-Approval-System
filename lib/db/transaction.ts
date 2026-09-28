import "server-only";
import type { PoolConnection } from "mysql2/promise";
import { getDbPool } from "@/lib/db/client";

// Runs work in one transaction: commit on success, roll back on any error.
// Notifications must be sent AFTER the commit, never inside it — a failed
// WhatsApp/email send must never undo a business action (G-06 / D-029).
export async function withTransaction<T>(work: (connection: PoolConnection) => Promise<T>): Promise<T> {
  const connection = await getDbPool().getConnection();
  try {
    await connection.beginTransaction();
    const result = await work(connection);
    await connection.commit();
    return result;
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}
