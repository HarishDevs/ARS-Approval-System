import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { getDbPool } from "@/lib/db/client";
import { createModuleType, publishTypeDraft, saveTypeDraft } from "@/server/modules/config";
import { DEFAULT_TASK_SETTINGS } from "@/server/modules/settings";
import { createTask, loadTaskFor } from "@/server/modules/tasks";
import { createDepartment, createUser, setDepartment } from "./helpers";

// v1.50.1 (owner: the task email's link opened "This page isn't available"):
// a person without the Task module still opens a task assigned to them, but
// no other task.
let typeId = 0;
let creator = 0;
let assignee = 0;
let other = 0;
let mine = 0;
let notMine = 0;

beforeAll(async () => {
  const superId = await createUser({ name: "V1501 Super", roles: ["USER", "SUPER_ADMIN"] });
  const superAdmin = { id: superId, roles: ["USER", "SUPER_ADMIN"] };
  creator = await createUser({ name: "V1501 Creator" });
  assignee = await createUser({ name: "V1501 Approval-only" });
  other = await createUser({ name: "V1501 Other" });
  const department = await createDepartment(null);
  for (const id of [creator, assignee, other]) await setDepartment(id, department);
  const type = await createModuleType("TASK", { code: `V1501_${Date.now() % 100000}`, name: "V1501 Task" }, superAdmin as never);
  typeId = type.ok ? type.value.id : 0;
  await saveTypeDraft("TASK", typeId, { name: "V1501 Task", form: [], settings: { ...DEFAULT_TASK_SETTINGS, assignScope: "SAME_DEPARTMENT", completion: "NOTE" } }, superAdmin as never);
  await publishTypeDraft("TASK", typeId, superAdmin as never);
  const make = async (assigneeId: number, title: string) => {
    const created = await createTask(
      { typeId, title, description: "", priority: "NORMAL", assigneeId, due: "2031-01-15T23:59", startsOn: "", related: "", fields: {}, submissionKey: crypto.randomUUID(), files: [], holidayOk: true },
      { id: creator, name: "V1501 Creator", roles: ["USER"], modules: ["APPROVAL", "TASK"] } as never,
    );
    if (!created.ok) throw new Error(created.message);
    return created.value.id;
  };
  mine = await make(assignee, "Add new product in Salesforce");
  notMine = await make(other, "Someone else's task");
});

afterAll(async () => {
  await getDbPool().end();
});

describe("a task for someone without the Task module", () => {
  const approvalOnly = () => ({ id: assignee, roles: ["USER"], modules: ["APPROVAL"] as const });

  it("opens for the person it is assigned to", async () => {
    expect((await loadTaskFor(mine, { ...approvalOnly(), modules: ["APPROVAL"] }))?.task.id).toBe(mine);
  });

  it("doesn't open someone else's task for them", async () => {
    expect(await loadTaskFor(notMine, { ...approvalOnly(), modules: ["APPROVAL"] })).toBeNull();
  });

  it("with the Task module, the usual rules apply", async () => {
    expect((await loadTaskFor(mine, { id: assignee, roles: ["USER"], modules: ["APPROVAL", "TASK"] }))?.task.id).toBe(mine);
  });
});
