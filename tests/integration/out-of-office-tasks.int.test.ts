import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { RowDataPacket } from "mysql2/promise";
import { getDbPool } from "@/lib/db/client";
import { createDelegation } from "@/server/approvals/collab";
import * as work from "@/server/work/service";
import { createUser } from "./helpers";

// v1.54.5 (owner): "when out of office dates are set, the tasks already on
// those dates move to the day after the to-date; a new task on those dates
// shows a warning, like the approval".
const person = (id: number) => ({ id, name: `P${id}`, roles: ["USER"], modules: ["APPROVAL", "TASK"] as ("APPROVAL" | "TASK")[] });
const indiaDay = (offset: number) => new Date(Date.now() + 330 * 60_000 + offset * 86_400_000).toISOString().slice(0, 10);
let away: number;
let boss: number;
let cover: number;

beforeAll(async () => {
  boss = await createUser({ name: "OOO boss" });
  away = await createUser({ name: "OOO person", managerId: boss });
  cover = await createUser({ name: "OOO cover" });
});

afterAll(async () => {
  await getDbPool().end();
});

const dueDay = async (id: number) => {
  const [rows] = await getDbPool().query<RowDataPacket[]>("SELECT DATE_FORMAT(DATE_ADD(due_at, INTERVAL 330 MINUTE), '%Y-%m-%d') AS d FROM tasks WHERE id = ?", [id]);
  return String(rows[0]!.d);
};

describe("out of office and tasks", () => {
  it("tasks due within the dates move to the first free day after them; others stay; the giver is told", async () => {
    const [starts, ends] = [indiaDay(20), indiaDay(22)];
    const inside = await work.quickAddTask({ title: "Inside the dates", projectId: null, sectionId: null, parentId: null, assigneeId: away, dueDay: indiaDay(21), mySectionId: null, holidayOk: true }, person(boss));
    const outside = await work.quickAddTask({ title: "After the dates", projectId: null, sectionId: null, parentId: null, assigneeId: away, dueDay: indiaDay(30), mySectionId: null, holidayOk: true }, person(boss));
    if (!inside.ok || !outside.ok) throw new Error("setup");
    const made = await createDelegation({ userId: away, delegateId: cover, startsOn: starts, endsOn: ends }, { id: away, roles: ["USER"] });
    expect(made.ok).toBe(true);
    if (!made.ok) return;
    expect(made.value.movedTasks).toBe(1);
    expect(made.value.movedTo > ends).toBe(true);
    expect(await dueDay(inside.value.id)).toBe(made.value.movedTo);
    expect(await dueDay(outside.value.id)).toBe(indiaDay(30));
    const [told] = await getDbPool().query<RowDataPacket[]>("SELECT COUNT(*) AS n FROM notifications WHERE user_id = ? AND message LIKE '%out of office%'", [boss]);
    expect(Number(told[0]!.n)).toBeGreaterThan(0);

    // A new task due while away asks first (keep or move to the day after).
    const asked = await work.quickAddTask({ title: "New while away", projectId: null, sectionId: null, parentId: null, assigneeId: away, dueDay: indiaDay(21), mySectionId: null }, person(boss));
    expect(asked.ok).toBe(false);
    expect(!asked.ok && asked.holiday).toMatchObject({ away: true, mode: "WARN" });
    const kept = await work.quickAddTask({ title: "Kept while away", projectId: null, sectionId: null, parentId: null, assigneeId: away, dueDay: indiaDay(21), mySectionId: null, holidayOk: true }, person(boss));
    expect(kept.ok).toBe(true);
  });
});
