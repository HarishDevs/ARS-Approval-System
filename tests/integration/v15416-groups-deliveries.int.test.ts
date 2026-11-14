import { beforeAll, describe, expect, it } from "vitest";
import { getDbPool } from "@/lib/db/client";
import { createWorkflow, publishVersion, submitRequest, type Actor } from "@/server/approvals/service";
import { listGroupData } from "@/server/requests/list-groups";
import { createDelivery, createNotification, deliverySummary, listRecentDeliveries, parseDeliveryFilter } from "@/lib/db/repositories/notifications.repository";
import { createDepartment, createUser, pendingTaskKey } from "./helpers";

// v1.54.16 (owner): Group by the requester's department and any form field
// (confidential values hidden from people who may not see them), and the
// Message deliveries dashboard's counts.
let requester: number;
let approver: number;
let stranger: number;
let requestId: number;
let deptName: string;
const person = (id: number): Actor => ({ id, roles: ["USER"] });

beforeAll(async () => {
  approver = await createUser({ name: "G Approver" });
  const dept = await createDepartment(null);
  const [[row]] = (await getDbPool().query("SELECT name FROM departments WHERE id = ?", [dept])) as unknown as [{ name: string }[]];
  deptName = row!.name;
  requester = await createUser({ name: "G Requester", departmentId: dept });
  stranger = await createUser({ name: "G Stranger" });
  const adminId = await createUser({ roles: ["USER", "IT_ADMIN"] });
  const admin: Actor = { id: adminId, roles: ["USER", "IT_ADMIN"] };
  const created = await createWorkflow(
    {
      code: `GRP_${Date.now()}`,
      name: "Group type",
      kind: "PREDEFINED",
      requestPrefix: "GR",
      form: [
        { key: "vendor", label: "Vendor name", type: "TEXT", required: true },
        { key: "budget", label: "Budget code", type: "TEXT", required: true, confidential: true },
        { key: "notes", label: "Notes", type: "LONG_TEXT", required: false },
      ],
      definition: {
        nodes: [
          { id: "start", kind: "START", label: "Start" },
          { id: "a", kind: "APPROVAL", label: "G check", approvers: [{ type: "USER", userId: approver }], completion: { type: "ALL" } },
          { id: "end", kind: "END", label: "End" },
        ],
        edges: [
          { id: "e1", from: "start", to: "a" },
          { id: "e2", from: "a", to: "end" },
        ],
      },
    },
    admin,
  );
  if (!created.ok) throw new Error(created.message);
  await publishVersion(created.value.versionId, admin);
  const raised = await submitRequest({ workflowId: created.value.workflowId, title: "G steel order", fields: { vendor: "Tata Steel", budget: "CAPEX-9", notes: "long" } }, person(requester));
  if (!raised.ok) throw new Error(raised.message);
  requestId = raised.value.requestId;
  await pendingTaskKey(requestId, approver);
});

describe("Group by department and form fields", () => {
  it("offers each groupable field by its label (not long text) and the requester's department", async () => {
    const data = await listGroupData([requestId], { id: requester, roles: ["USER"] });
    expect(data.fields.map((field) => field.label)).toEqual(["Budget code", "Vendor name"]);
    expect(data.department[requestId]).toBe(deptName);
    expect(data.values[requestId]).toMatchObject({ "f:vendor_name": "Tata Steel", "f:budget_code": "CAPEX-9" });
  });
  it("a confidential value is Hidden for someone not on the request, shown to the approver", async () => {
    expect((await listGroupData([requestId], { id: stranger, roles: ["USER"] })).values[requestId]?.["f:budget_code"]).toBe("Hidden");
    expect((await listGroupData([requestId], { id: approver, roles: ["USER"] })).values[requestId]?.["f:budget_code"]).toBe("CAPEX-9");
  });
});

describe("Message deliveries dashboard", () => {
  it("counts by channel, provider and status; filters apply to the list too", async () => {
    const notificationId = await createNotification({ eventType: "G_DASH_TEST", userId: requester, title: "t", message: "m", deepLink: null });
    // Rows of its own provider, so other suites (the retry runner) can't change them meanwhile.
    const provider = "GDASHTEST" as "SMTP";
    await createDelivery({ notificationId, channel: "EMAIL", provider, status: "SENT", providerReference: "queue X | <m>" });
    await createDelivery({ notificationId, channel: "EMAIL", provider, status: "FAILED", failureCode: "EMAIL_REJECTED" });
    await createDelivery({ notificationId, channel: "WHATSAPP", provider, status: "SKIPPED", failureCode: "NO_WHATSAPP_NUMBER" });
    const all = await deliverySummary(parseDeliveryFilter({ days: "1", provider: "GDASHTEST" }));
    expect(all.providers).toContain("GDASHTEST");
    const count = (channel: string, status: string) => all.byChannelStatus.filter((row) => row.channel === channel && row.status === status).reduce((sum, row) => sum + row.n, 0);
    expect(count("EMAIL", "SENT")).toBe(1);
    expect(count("EMAIL", "FAILED")).toBe(1);
    expect(count("WHATSAPP", "SKIPPED")).toBe(1);
    expect(all.failures.some((row) => row.code === "EMAIL_REJECTED")).toBe(true);
    expect(all.events.some((row) => row.eventType === "G_DASH_TEST")).toBe(true);
    const failedOnly = await listRecentDeliveries(200, parseDeliveryFilter({ days: "1", status: "FAILED", channel: "EMAIL", provider: "GDASHTEST" }));
    expect(failedOnly.length).toBeGreaterThan(0);
    expect(failedOnly.every((row) => row.status === "FAILED" && row.channel === "EMAIL")).toBe(true);
  });
  it("only known values are accepted from the address bar", () => {
    expect(parseDeliveryFilter({ days: "999", channel: "SMS", status: "x'; DROP", provider: "smtp; --" })).toEqual({ days: 7, channel: null, status: null, provider: null });
  });
});
