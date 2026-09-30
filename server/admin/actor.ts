import "server-only";
import { requireApiArea } from "@/server/authorization/guards";
import { getActionContext } from "@/lib/http/request-context";
import type { AdminActor } from "@/server/admin/users";

// Who is calling an /admin Server Action. null = not allowed; the action
// answers "Not found." so nothing about the area is revealed (D-016).
export async function getAdminActor(): Promise<AdminActor | null> {
  try {
    const session = await requireApiArea("admin");
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
