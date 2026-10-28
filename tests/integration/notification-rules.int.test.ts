import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { RowDataPacket } from "mysql2/promise";
import { getDbPool } from "@/lib/db/client";
import { createWorkflow, publishVersion, submitRequest, type Actor } from "@/server/approvals/service";
import { insertRule } from "@/lib/db/repositories/notification-rules.repository";
import { runNotificationRules, previewRule } from "@/server/notifications/rule-runner";
import { ruleSchema } from "@/server/notifications/rule-model";
import { createUser } from "./helpers";

// D-209: reminder and escalation rules against MySQL: conditions on a form
// field, escalation levels to the right people, repeats, never twice, and
// open tasks.
const admin = (id: number): Actor => ({ id, roles: ["USER", "IT_ADMIN"] });
const tag = Date.now().toString(36).toUpperCase();
let adminId: number;
let managerId: number;
let approverId: number;
let requesterId: number;
let typeName: string;
let bigRequest: number;
let smallRequest: number;
const rules: number[] = [];

async function notices(userId: number, eventType: string): Promise<{ title: string; deep_link: string }[]> {
  const [rows] = await getDbPool().query<RowDataPacket[]>("SELECT title, deep_link FROM notifications WHERE user_id = ? AND event_type = ? ORDER BY id", [userId, eventType]);
  return rows as { title: string; deep_link: string }[];
}

beforeAll(async () => {
  // Earlier rules from other runs on this database are switched off.
  await getDbPool().query("UPDATE notification_rules SET active = FALSE");
  adminId = await createUser({ name: `Rules IT ${tag}`, roles: ["USER", "IT_ADMIN"] });
  managerId = await createUser({ name: `Rules manager ${tag}` });
  approverId = await createUser({ name: `Rules approver ${tag}`, managerId });
  requesterId = await createUser({ name: `Rules requester ${tag}` });
  typeName = `Rules purchase ${tag}`;
  const created = await createWorkflow(
    {
      code: `RULES_${tag}`,
      name: typeName,
      kind: "PREDEFINED",
      requestPrefix: "RUL",
      builder: { stages: [{ kind: "STEP", step: { id: "a", label: "Finance check", approvers: { kind: "PEOPLE", userIds: [approverId] }, rule: "ALL" } }] },
      form: [{ key: "amount", label: "Amount", type: "NUMBER", required: false }],
    },
    admin(adminId),
  );
  if (!created.ok) throw new Error(created.message);
  const published = await publishVersion(created.value.versionId, admin(adminId));
  if (!published.ok) throw new Error(published.message);
  const raise = async (amount: string) => {
    const result = await submitRequest({ workflowId: created.value.workflowId, title: `Rules ${amount}`, fields: { amount }, allowDuplicate: true }, { id: requesterId, roles: ["USER"] });
    if (!result.ok) throw new Error(result.message);
    return result.value.requestId;
  };
  bigRequest = await raise("6,50,000");
  smallRequest = await raise("1000");
  // The steps reached the approver 30 hours ago.
  await getDbPool().query("UPDATE approval_tasks SET created_at = UTC_TIMESTAMP() - INTERVAL 30 HOUR WHERE request_id IN (?, ?)", [bigRequest, smallRequest]);
});

afterAll(async () => {
  if (rules.length) await getDbPool().query("DELETE FROM notification_rules WHERE id IN (?)", [rules]);
  await getDbPool().end();
});

describe("reminder and escalation rules (D-209)", () => {
  it("an escalation on a form field reaches the approver's manager and IT for the matching request only, once", async () => {
    const rule = ruleSchema.parse({
      name: `Big purchases ${tag}`,
      kind: "ESCALATION",
      module: "APPROVAL",
      conditions: [
        { field: "type", op: "EQ", value: typeName },
        { field: "form.amount", op: "GT", value: "500000" },
      ],
      stages: [
        { anchor: "STARTED", offsetHours: 24, recipients: ["ASSIGNEE_MANAGER", "IT_ADMINS"] },
        { anchor: "STARTED", offsetHours: 72, recipients: ["REQUESTER"] },
      ],
      subject: "Level {{level}}: {{ref}} waiting at {{step}}",
    });
    rules.push(await insertRule(rule, adminId));
    expect((await previewRule(rule)).matching).toBe(1);

    const first = await runNotificationRules();
    expect(first.sent).toBe(1);
    const toManager = await notices(managerId, "RULE_ESCALATION");
    expect(toManager).toHaveLength(1);
    expect(toManager[0]!.title).toMatch(/^Level 1: RUL-\d{4}-\d{6} waiting at Finance check$/);
    expect(toManager[0]!.deep_link).toBe(`/users/requests/${bigRequest}`);
    expect(await notices(adminId, "RULE_ESCALATION")).toHaveLength(1);
    expect(await notices(requesterId, "RULE_ESCALATION")).toHaveLength(0); // level 2 is at 72 hours

    expect((await runNotificationRules()).sent).toBe(0);
    expect(await notices(managerId, "RULE_ESCALATION")).toHaveLength(1);
  });

  it("a repeating reminder sends the latest due repeat once, to the approver", async () => {
    const rule = ruleSchema.parse({
      name: `Nudge ${tag}`,
      kind: "REMINDER",
      module: "APPROVAL",
      conditions: [{ field: "type", op: "EQ", value: typeName }],
      stages: [{ anchor: "STARTED", offsetHours: 1, repeatHours: 12, maxTimes: 5, recipients: ["ASSIGNEE"] }],
      email: false,
    });
    rules.push(await insertRule(rule, adminId));
    await runNotificationRules();
    // Two requests, each at repeat 3 (1 h, then 13 h and 25 h after the step reached the approver).
    expect(await notices(approverId, "RULE_REMINDER")).toHaveLength(2);
    const [sends] = await getDbPool().query<RowDataPacket[]>("SELECT send_no FROM notification_rule_sends WHERE rule_id = ?", [rules.at(-1)]);
    expect(sends.map((row) => Number(row.send_no))).toEqual([3, 3]);
    await runNotificationRules();
    expect(await notices(approverId, "RULE_REMINDER")).toHaveLength(2);
  });

  it("open tasks: an urgent overdue task escalates to the assignee's manager", async () => {
    const [type] = await getDbPool().query<import("mysql2").ResultSetHeader>("INSERT INTO module_types (module, code, name, active, created_by) VALUES ('TASK', ?, 'Rules task type', TRUE, ?)", [`RT_${tag}`, adminId]);
    const [version] = await getDbPool().query<import("mysql2").ResultSetHeader>("INSERT INTO module_type_versions (type_id, version_no, status, form_json, settings_json, created_by) VALUES (?, 1, 'PUBLISHED', JSON_ARRAY(), JSON_OBJECT(), ?)", [type.insertId, adminId]);
    const types = [{ id: version.insertId }];
    const [result] = await getDbPool().query<import("mysql2").ResultSetHeader>(
      "INSERT INTO tasks (task_no, type_version_id, title, priority, status, created_by, assignee_id, assigned_by, due_at, form_data_json, created_at) VALUES (?, ?, 'Rules task', 'URGENT', 'OPEN', ?, ?, ?, UTC_TIMESTAMP() - INTERVAL 5 HOUR, JSON_OBJECT(), UTC_TIMESTAMP() - INTERVAL 2 DAY)",
      [`TSK-RULES-${tag}`.slice(0, 30), types[0]!.id, requesterId, approverId, requesterId],
    );
    const rule = ruleSchema.parse({
      name: `Urgent tasks ${tag}`,
      kind: "ESCALATION",
      module: "TASK",
      conditions: [
        { field: "priority", op: "IN", value: "high, urgent" },
        { field: "hours_overdue", op: "GE", value: "1" },
        { field: "task_no", op: "EQ", value: `TSK-RULES-${tag}`.slice(0, 30) },
      ],
      stages: [{ anchor: "DUE", offsetHours: 2, recipients: ["ASSIGNEE_MANAGER"] }],
    });
    rules.push(await insertRule(rule, adminId));
    await runNotificationRules();
    const toManager = await notices(managerId, "RULE_ESCALATION");
    expect(toManager.some((item) => item.deep_link === `/users/tasks/${result.insertId}`)).toBe(true);
    await getDbPool().query("DELETE FROM tasks WHERE id = ?", [result.insertId]);
  });
});
