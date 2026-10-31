import { beforeAll, describe, expect, it } from "vitest";
import type { ResultSetHeader, RowDataPacket } from "mysql2/promise";
import { getDbPool } from "@/lib/db/client";
import * as work from "@/server/work/service";
import { runAiStep } from "@/server/ai/jobs";
import { runHodWeekly } from "@/server/reports/hod-weekly";
import { upsertSetting, clearSetting } from "@/lib/db/repositories/settings.repository";
import { createDepartment, createUser, setDepartment } from "./helpers";

// D-245/D-246/D-247: the audit fixes that need the database.
const who = (id: number, roles: string[] = ["USER"]) => ({ id, name: `P${id}`, roles });
const tag = Date.now().toString(36);
let owner: number;
let colleague: number;

beforeAll(async () => {
  owner = await createUser({ name: "Fix owner" });
  colleague = await createUser({ name: "Fix colleague" });
});

describe("project details refuse a stale save (DB-001)", () => {
  it("a save from the version the form opened at works; a second one from that old version is refused", async () => {
    const made = await work.createProject({ name: `Close ${tag}`, description: "", color: "teal", privacy: "PRIVATE", departmentId: null, defaultAccessRole: "COMMENTER", defaultView: "LIST", startOn: "", dueOn: "" }, who(owner));
    if (!made.ok) throw new Error(made.message);
    const [[row]] = await getDbPool().query<RowDataPacket[]>("SELECT row_version FROM projects WHERE id = ?", [made.value.id]);
    const opened = Number(row!.row_version);
    const input = { name: `Close ${tag} v2`, description: "", color: "teal", privacy: "PRIVATE", departmentId: null, defaultAccessRole: "COMMENTER", defaultView: "LIST", startOn: "", dueOn: "", rowVersion: opened };
    expect(await work.updateProjectDetails(made.value.id, input, who(owner))).toMatchObject({ ok: true });
    expect(await work.updateProjectDetails(made.value.id, { ...input, name: `Close ${tag} stale` }, who(owner))).toMatchObject({ ok: false, message: expect.stringMatching(/changed this project/) });
    const [[after]] = await getDbPool().query<RowDataPacket[]>("SELECT name FROM projects WHERE id = ?", [made.value.id]);
    expect(after!.name).toBe(`Close ${tag} v2`);
  });
});

describe("a task for several people names who was missed (DB-007)", () => {
  it("one inactive person doesn't stop the others; the answer says who and counts it", async () => {
    const gone = await createUser({ name: `Gone ${tag}`, active: false });
    const made = await work.quickAddForMany({ title: `Audit ${tag}`, projectId: null, sectionId: null, parentId: null, assigneeId: null, dueDay: "", mySectionId: null }, [colleague, gone], who(owner));
    expect(made).toMatchObject({ ok: true, value: { failed: 1 } });
    if (!made.ok) return;
    expect(made.value.ids).toHaveLength(1);
    expect(made.message).toMatch(new RegExp(`Not for Gone ${tag}`));
  });
});

describe("AI chat retention keeps chats of people on hold (DB-003)", () => {
  it("old chats go, except a held person's", async () => {
    const admin = await createUser({ name: "Hold admin", roles: ["USER", "IT_ADMIN", "SUPER_ADMIN"] });
    const held = await createUser({ name: "Held person" });
    const db = getDbPool();
    const old = async (userId: number) => {
      const [result] = await db.query<ResultSetHeader>("INSERT INTO ai_conversations (owner_user_id, title, mode, created_at, updated_at) VALUES (?, 'old chat', 'GENERAL', NOW() - INTERVAL 400 DAY, NOW() - INTERVAL 400 DAY)", [userId]);
      return result.insertId;
    };
    const kept = await old(held);
    const gone = await old(colleague);
    await db.query("INSERT INTO legal_holds (reference, reason, scope_type, scope_id, owner_user_id, created_by) VALUES (?, 'audit test', 'REQUESTER', ?, ?, ?)", [`HOLD-${tag}`, held, admin, admin]);
    await upsertSetting({ key: "ai.conversation_keep_days", group: "AI", valueType: "NUMBER", encrypted: false, storedValue: "30", updatedBy: admin });
    try {
      await runAiStep();
    } finally {
      await clearSetting("ai.conversation_keep_days", admin);
    }
    const [rows] = await db.query<RowDataPacket[]>("SELECT id FROM ai_conversations WHERE id IN (?)", [[kept, gone]]);
    expect(rows.map((row) => Number(row.id))).toEqual([kept]);
  });
});

describe("weekly HOD report (FI-D01)", () => {
  it("off by default; when on, each department is claimed once per week", async () => {
    const admin = await createUser({ name: "Report admin", roles: ["USER", "IT_ADMIN", "SUPER_ADMIN"] });
    const hod = await createUser({ name: `HOD ${tag}` });
    const department = await createDepartment(hod);
    await setDepartment(colleague, department);
    const monday = new Date("2026-11-02T04:00:00Z"); // Monday 09:30 India time
    expect(await runHodWeekly(monday)).toEqual({ hodWeekly: "off" });
    await upsertSetting({ key: "general.hod_weekly_report", group: "GENERAL", valueType: "STRING", encrypted: false, storedValue: "ON", updatedBy: admin });
    try {
      expect(await runHodWeekly(new Date("2026-11-02T03:00:00Z"))).toEqual({ hodWeekly: "not due" }); // 08:30
      const first = await runHodWeekly(monday);
      expect(first.hodWeekly).toBe("2026-11-02");
      // Email isn't set up in tests, so the send fails and is recorded; it is never tried twice in the week.
      const [[run]] = await getDbPool().query<RowDataPacket[]>("SELECT status FROM hod_report_runs WHERE week_start = '2026-11-02' AND department_id = ?", [department]);
      expect(["SENT", "FAILED"]).toContain(run!.status);
      const second = await runHodWeekly(monday);
      expect(Number(second.sent) + Number(second.failed)).toBe(0);
    } finally {
      await clearSetting("general.hod_weekly_report", admin);
    }
  });
});
