"use server";

import { revalidatePath } from "next/cache";
import { requireApiArea } from "@/server/authorization/guards";
import { setUserSetting } from "@/lib/db/repositories/user-settings.repository";
import { LIST_COLUMN_KEYS, LIST_KEYS } from "@/server/requests/list-columns";

// D-256: the columns a person shows on a request list, kept on the account
// (every device). Unknown lists or columns are ignored.
export async function saveListColumnsAction(list: string, columns: string[]): Promise<{ ok: boolean }> {
  const session = await requireApiArea("users", { change: false }).catch(() => null);
  if (!session || !(LIST_KEYS as readonly string[]).includes(list)) return { ok: false };
  const clean = [...new Set(columns.filter((column) => (LIST_COLUMN_KEYS as readonly string[]).includes(column)))];
  await setUserSetting(session.user.id, `list.columns.${list}`, JSON.stringify(clean));
  revalidatePath("/users", "layout");
  return { ok: true };
}
