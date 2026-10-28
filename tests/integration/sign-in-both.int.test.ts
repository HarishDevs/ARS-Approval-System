import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { getDbPool } from "@/lib/db/client";
import { createUser as createUserService, updateUser } from "@/server/admin/users";
import { getUserForAdmin } from "@/lib/db/repositories/admin-users.repository";
import { findUserById } from "@/lib/db/repositories/users.repository";
import { checkSignInAllowed } from "@/server/auth/sign-in-rules";
import type { ParsedUserInput } from "@/server/admin/user-input";
import { createUser } from "./helpers";

// D-208 (owner): "Both" sign-in, against MySQL: saved and read back through
// the admin service, and either method is then allowed; moving a person from
// Both to Google only removes their password, as Google-only people have none.
const tag = Date.now().toString(36).toUpperCase();
const itAdmin = (id: number) => ({ id, roles: ["USER", "IT_ADMIN"] as const, sessionId: "both", ipAddress: null });
let adminId: number;

beforeAll(async () => {
  adminId = await createUser({ name: `Both admin ${tag}`, roles: ["USER", "IT_ADMIN"] });
});

afterAll(async () => {
  await getDbPool().end();
});

describe("sign in with Google or password (D-208)", () => {
  it("a person set to Both may use either method", async () => {
    const created = await createUserService(
      { loginId: `both-${tag}`.toLowerCase(), name: "Both ways", email: `both-${tag}@example.test`.toLowerCase(), whatsappNumber: "919876500001", departmentId: null, designationId: null, reportingManagerId: null, signInMethod: "BOTH", roles: ["USER"] },
      itAdmin(adminId),
    );
    if (!created.ok) throw new Error(created.message);
    const user = (await findUserById(created.value))!;
    expect(user.signInMethod).toBe("BOTH");
    expect(checkSignInAllowed(user, "GOOGLE")).toEqual({ allowed: true });
    expect(checkSignInAllowed(user, "PASSWORD")).toEqual({ allowed: true });
  });

  it("moving from Both to Google only clears the password; Both to Password keeps it", async () => {
    const created = await createUserService(
      { loginId: `both2-${tag}`.toLowerCase(), name: "Both then Google", email: `both2-${tag}@example.test`.toLowerCase(), whatsappNumber: "919876500002", departmentId: null, designationId: null, reportingManagerId: null, signInMethod: "BOTH", roles: ["USER"] },
      itAdmin(adminId),
    );
    if (!created.ok) throw new Error(created.message);
    const id = created.value;
    await getDbPool().query("UPDATE users SET password_hash = 'x' WHERE id = ?", [id]);
    const current = (await getUserForAdmin(id))!;
    const base: ParsedUserInput = { loginId: current.loginId, name: current.name, email: current.email, whatsappNumber: current.whatsappNumber, departmentId: null, designationId: null, reportingManagerId: null, signInMethod: "PASSWORD", roles: current.roles };
    expect((await updateUser(id, base, itAdmin(adminId))).ok).toBe(true);
    expect((await findUserById(id))!.passwordHash).toBe("x");
    expect((await updateUser(id, { ...base, signInMethod: "GOOGLE" }, itAdmin(adminId))).ok).toBe(true);
    const after = (await findUserById(id))!;
    expect(after.signInMethod).toBe("GOOGLE");
    expect(after.passwordHash).toBeNull();
  });
});
