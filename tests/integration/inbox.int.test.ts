import { beforeAll, describe, expect, it } from "vitest";
import type { ResultSetHeader } from "mysql2/promise";
import { getDbPool } from "@/lib/db/client";
import { countUnread, countUnreadByCategory, listInbox } from "@/lib/db/repositories/collab.repository";
import { setInbox } from "@/lib/db/repositories/work.repository";
import { createUser } from "./helpers";

// D-237 (owner): one Inbox. Every notice (not only task ones) can be
// bookmarked and archived; Activity hides what is archived.
let me: number;
let other: number;
const ids: Record<string, number> = {};

async function notice(userId: number, eventType: string, category: string | null, title: string): Promise<number> {
  const [result] = await getDbPool().query<ResultSetHeader>("INSERT INTO notifications (event_type, category, user_id, title, message) VALUES (?, ?, ?, ?, 'm')", [eventType, category, userId, title]);
  return result.insertId;
}

beforeAll(async () => {
  me = await createUser({ name: "Inbox Owner" });
  other = await createUser({ name: "Inbox Stranger" });
  ids.approval = await notice(me, "APPROVAL_NEEDED", "APPROVAL", "Approve PO");
  ids.task = await notice(me, "TASK_ASSIGNED", "TASK", "Survey");
  ids.info = await notice(me, "INFO_PUBLISHED", "INFORMATION", "Circular");
});

describe("the one Inbox (D-237)", () => {
  it("bookmarks and archives any of one's own notices, never someone else's", async () => {
    expect(await setInbox(other, [ids.approval!], "ARCHIVE", undefined, true)).toBe(0);
    expect(await setInbox(me, [ids.approval!], "BOOKMARK", undefined, true)).toBe(1);
    expect(await setInbox(me, [ids.info!], "ARCHIVE", undefined, true)).toBe(1);
    // The task inbox's own scope still covers only task notices.
    expect(await setInbox(me, [ids.approval!], "ARCHIVE")).toBe(0);
  });

  it("Activity hides archived notices; Bookmarks and Archive list them, with their flags", async () => {
    const activity = await listInbox(me, 50);
    expect(activity.map((item) => item.id)).toEqual(expect.arrayContaining([ids.approval, ids.task]));
    expect(activity.some((item) => item.id === ids.info)).toBe(false);
    expect(activity.find((item) => item.id === ids.approval)?.bookmarked).toBe(true);
    expect((await listInbox(me, 50, undefined, undefined, null, "bookmarks")).map((item) => item.id)).toEqual([ids.approval]);
    const archive = await listInbox(me, 50, undefined, undefined, null, "archive");
    expect(archive.map((item) => item.id)).toEqual([ids.info]);
    expect(archive[0]?.archived).toBe(true);
    expect((await listInbox(me, 50, undefined, undefined, "TASK")).map((item) => item.id)).toEqual([ids.task]);
  });

  it("unread counts leave archived notices out; Only unread filters", async () => {
    await setInbox(me, [ids.info!], "UNREAD", undefined, true);
    expect(await countUnread(me)).toBe(2);
    expect((await countUnreadByCategory(me)).INFORMATION).toBe(0);
    await setInbox(me, [ids.task!], "READ", undefined, true);
    expect((await listInbox(me, 50, undefined, undefined, null, "activity", true)).map((item) => item.id)).toEqual([ids.approval]);
  });
});
