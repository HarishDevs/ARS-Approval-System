import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { ResultSetHeader } from "mysql2/promise";
import { getDbPool } from "@/lib/db/client";
import { findUserForSignIn, recordFailedPassword, signInPhoneDigits } from "@/lib/db/repositories/users.repository";

// v1.49.5 (owner): the sign-in name may be the User ID, the email or the
// mobile (WhatsApp) number; the password and the WhatsApp code still follow.
const tag = Date.now().toString(36).toUpperCase();
const phone = `91${String(Date.now()).slice(-10)}`;
let id: number;
let otherId: number;

beforeAll(async () => {
  const [created] = await getDbPool().query<ResultSetHeader>(
    "INSERT INTO users (login_id, name, email, whatsapp_number, sign_in_method, active) VALUES (?, 'Identifier Test', ?, ?, 'PASSWORD', TRUE)",
    [`IDF_${tag}`, `idf.${tag.toLowerCase()}@example.test`, phone],
  );
  id = created.insertId;
  // Someone whose User ID looks like the first person's number: the User ID wins.
  const [other] = await getDbPool().query<ResultSetHeader>(
    "INSERT INTO users (login_id, name, email, sign_in_method, active) VALUES (?, 'Digits Login', ?, 'PASSWORD', TRUE)",
    [`${phone.slice(2)}x`, `idf2.${tag.toLowerCase()}@example.test`],
  );
  otherId = other.insertId;
});

afterAll(async () => {
  await getDbPool().query("DELETE FROM users WHERE id IN (?, ?)", [id, otherId]);
  await getDbPool().end();
});

describe("sign-in name: User ID, email or mobile number", () => {
  it("finds the person by each of the three", async () => {
    expect((await findUserForSignIn(`idf_${tag}`))?.id).toBe(id);
    expect((await findUserForSignIn(`  IDF.${tag}@EXAMPLE.TEST `))?.id).toBe(id);
    expect((await findUserForSignIn(phone))?.id).toBe(id);
    expect((await findUserForSignIn(`+${phone}`))?.id).toBe(id);
    const local = phone.slice(2);
    expect((await findUserForSignIn(`${local.slice(0, 5)} ${local.slice(5)}`))?.id).toBe(id);
    expect((await findUserForSignIn(`${local.slice(0, 5)}-${local.slice(5)}`))?.id).toBe(id);
  });

  it("finds nobody for something that is none of them", async () => {
    expect(await findUserForSignIn("")).toBeNull();
    expect(await findUserForSignIn(`nobody-${tag}@example.test`)).toBeNull();
    expect(await findUserForSignIn("12345")).toBeNull();
    expect((await findUserForSignIn(`${phone.slice(2)}x`))?.id).toBe(otherId);
  });

  it("reads a typed number as digits with the country code", () => {
    expect(signInPhoneDigits("98765 43210")).toEqual(["919876543210", "9876543210"]);
    expect(signInPhoneDigits("+91 98765-43210")).toEqual(["919876543210"]);
    expect(signInPhoneDigits("RAVI01")).toEqual([]);
    expect(signInPhoneDigits("12345")).toEqual([]);
  });
});

// v1.50.0 (security review): after a lock runs out, the count starts again,
// so one wrong password doesn't lock the account straight away.
describe("wrong-password lock", () => {
  it("starts counting again once an earlier lock has expired", async () => {
    await getDbPool().query("UPDATE users SET failed_login_count = 5, locked_until = DATE_SUB(CURRENT_TIMESTAMP, INTERVAL 1 MINUTE) WHERE id = ?", [id]);
    expect(await recordFailedPassword(id, 5, 15)).toEqual({ failedCount: 1, locked: false });
    for (let attempt = 2; attempt <= 4; attempt += 1) await recordFailedPassword(id, 5, 15);
    expect(await recordFailedPassword(id, 5, 15)).toEqual({ failedCount: 5, locked: true });
  });
});
