import "server-only";
import { requireApiArea } from "@/server/authorization/guards";
import { getActionContext } from "@/lib/http/request-context";
import type { AdminActor } from "@/server/admin/users";

// Who is calling an /admin Server Action. null = not allowed; the action
// answers "Not found." so nothing about the area is revealed (D-016).
// G-3 (v1.10.0): `page` is the admin page the action belongs to (its key in
// server/authorization/pages.ts), so a Hidden or View-only rule on it holds
// wherever the action is posted from.
export async function getAdminActor(page?: string): Promise<AdminActor | null> {
  try {
    const session = await requireApiArea("admin", { page });
    const { ipAddress } = await getActionContext();
    return { id: session.user.id, roles: session.user.roles, sessionId: session.sessionId, ipAddress };
  } catch {
    return null;
  }
}

export function formFields(formData: FormData, names: readonly string[]): Record<string, string | undefined> {
  const fields: Record<string, string | undefined> = {};
  for (const name of names) {
    const value = formData.get(name);
    fields[name] = typeof value === "string" ? value : undefined;
  }
  return fields;
}

export function parseId(value: FormDataEntryValue | null): number | null {
  return typeof value === "string" && /^\d+$/.test(value) ? Number(value) : null;
}
