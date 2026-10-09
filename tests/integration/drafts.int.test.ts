import { afterAll, describe, expect, it } from "vitest";
import type { RowDataPacket } from "mysql2/promise";
import { getDbPool } from "@/lib/db/client";
import { deleteDraft, findDraft, listDrafts, pruneExpiredDrafts, saveDraft } from "@/lib/db/repositories/drafts.repository";
import { createUser } from "./helpers";

// #3 drafts: owned by one person, versioned across tabs, expire, and never
// create a request or a notification.
afterAll(async () => {
  await getDbPool().end();
});

const content = (amount: string) => ({ title: "Laptop", fields: { amount } });

describe("request drafts", () => {
  it("save, recover, and only the owner sees them", async () => {
    const owner = await createUser();
    const other = await createUser();
    expect(await saveDraft(owner, "CUSTOM", content("1"), null)).toMatchObject({ ok: true, version: 1 });
    expect(await findDraft(owner, "CUSTOM")).toMatchObject({ title: "Laptop", fields: { amount: "1" }, version: 1 });
    expect(await findDraft(other, "CUSTOM")).toBeNull();
    expect((await listDrafts(other)).length).toBe(0);
    // Another person's delete can't touch it.
    expect(await deleteDraft(other, "CUSTOM")).toBe(false);
    expect(await findDraft(owner, "CUSTOM")).not.toBeNull();
  });

  it("a second tab can't silently overwrite newer content", async () => {
    const owner = await createUser();
    await saveDraft(owner, "CUSTOM", content("1"), null); // tab A creates (v1)
    expect(await saveDraft(owner, "CUSTOM", content("2"), 1)).toMatchObject({ ok: true, version: 2 }); // tab A
    const stale = await saveDraft(owner, "CUSTOM", content("old"), 1); // tab B still at v1
    expect(stale).toMatchObject({ ok: false, conflict: true });
    expect((await findDraft(owner, "CUSTOM"))?.fields.amount).toBe("2");
    expect(await saveDraft(owner, "CUSTOM", content("new"), null)).toMatchObject({ ok: false, conflict: true }); // tab C "new draft"
  });

  it("expired drafts aren't returned, are pruned, and a new one can start", async () => {
    const owner = await createUser();
    await saveDraft(owner, "CUSTOM", content("1"), null);
    await getDbPool().query("UPDATE request_drafts SET expires_at = DATE_SUB(CURRENT_TIMESTAMP, INTERVAL 1 MINUTE) WHERE user_id = ?", [owner]);
    expect(await findDraft(owner, "CUSTOM")).toBeNull();
    expect(await saveDraft(owner, "CUSTOM", content("fresh"), null)).toMatchObject({ ok: true, version: 1 });
    await getDbPool().query("UPDATE request_drafts SET expires_at = DATE_SUB(CURRENT_TIMESTAMP, INTERVAL 1 MINUTE) WHERE user_id = ?", [owner]);
    expect(await pruneExpiredDrafts()).toBeGreaterThanOrEqual(1);
  });

  it("saving a draft creates no request and no notification", async () => {
    const owner = await createUser();
    const count = async () => {
      const [[requests]] = await getDbPool().query<RowDataPacket[]>("SELECT COUNT(*) AS n FROM approval_requests WHERE requester_id = ?", [owner]);
      const [[notes]] = await getDbPool().query<RowDataPacket[]>("SELECT COUNT(*) AS n FROM notification_outbox");
      return [Number(requests!.n), Number(notes!.n)];
    };
    const before = await count();
    await saveDraft(owner, "CUSTOM", content("9"), null);
    await saveDraft(owner, "CUSTOM", content("10"), 1);
    expect(await count()).toEqual(before);
  });
});
