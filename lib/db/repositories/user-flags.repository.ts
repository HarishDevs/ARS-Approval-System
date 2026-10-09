import "server-only";
import type { ResultSetHeader, RowDataPacket } from "mysql2/promise";
import { getDbPool, type Queryable } from "@/lib/db/client";

// Small per-person flags (#13), e.g. the first-use checklist dismissed.
const FLAG = /^[A-Z][A-Z0-9_]{1,59}$/;

export async function hasFlag(userId: number, flag: string, db: Queryable = getDbPool()): Promise<boolean> {
  if (!FLAG.test(flag)) return false;
  const [rows] = await db.query<RowDataPacket[]>("SELECT 1 FROM user_flags WHERE user_id = ? AND flag = ? LIMIT 1", [userId, flag]);
  return rows.length > 0;
}

export async function setFlag(userId: number, flag: string, db: Queryable = getDbPool()): Promise<void> {
  if (!FLAG.test(flag)) throw new Error("bad flag");
  await db.query<ResultSetHeader>("INSERT IGNORE INTO user_flags (user_id, flag) VALUES (?, ?)", [userId, flag]);
}
