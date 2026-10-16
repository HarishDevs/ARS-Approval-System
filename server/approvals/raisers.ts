import "server-only";
import type { RowDataPacket } from "mysql2/promise";
import { getDbPool } from "@/lib/db/client";
import { mayCreate } from "@/server/modules/settings";
import type { TypeSettings } from "@/server/workflows/type-settings";

// v1.9.0 (owner brief §5.3, D-147): who may raise an approval type. IT
// (IT Admin, Super Admin) always may; others per the type's setting. Checked
// on the server when raising, and used to hide types people can't raise.
export async function departmentOfUser(userId: number): Promise<number | null> {
  const [rows] = await getDbPool().query<(RowDataPacket & { department_id: number | null })[]>("SELECT department_id FROM users WHERE id = ?", [userId]);
  return rows[0]?.department_id ?? null;
}

export function mayRaise(settings: TypeSettings | null | undefined, person: { id: number; roles: readonly string[]; departmentId: number | null }): boolean {
  if (person.roles.includes("IT_ADMIN") || person.roles.includes("SUPER_ADMIN")) return true;
  return mayCreate(settings?.raisers ?? { mode: "EVERYONE", departmentIds: [], userIds: [] }, person);
}
