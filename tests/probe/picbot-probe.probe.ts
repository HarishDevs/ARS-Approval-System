// Local diagnosis only (not part of any suite): replays questions through the
// real Pico Bot against the local database, its saved provider and Salesforce
// connection, and prints what the model asked for and got. Never prints keys.
import { it } from "vitest";
import { getDbPool } from "@/lib/db/client";
import { findUserById } from "@/lib/db/repositories/users.repository";
import { askAssistant, type AskPerson } from "@/server/ai/assistant";
import { getSettingValue } from "@/server/settings/values";
import { listMessages } from "@/lib/db/repositories/ai.repository";

// A stand-in Salesforce (the local connection needs a new sign-in): the real
// object and field lists of the ARS org, with fixed sample answers.
const F = (spec: string) => spec.split(" ").map((item) => {
  const [name, type, ...label] = item.split(":");
  return { name, type, label: label.join(" ").replace(/_/g, " ") || name };
});
const DESCRIBE: Record<string, ReturnType<typeof F>> = {
  Employee__c: F("Id:id Name:string:Employee_Code CreatedDate:datetime Employee_Name__c:string:Employee_Name Designation__c:picklist:Designation Department__c:picklist:Department Last_Login__c:datetime:Last_Login Region_Master__c:reference:Region Status__c:picklist:Status Sub_Region__c:picklist:Sub_Region Password__c:string:Password Session_ID__c:string:Session_ID Team__c:picklist:Team"),
  Attendance__c: F("Id:id Name:string CreatedDate:datetime Attendance_Date__c:date:Attendance_Date Attendance_Type__c:picklist:Attendance_Type Check_in_Time__c:datetime:Check-in_Time Check_Out_Time__c:datetime:Check-Out_Time Employee__c:reference:Employee Employee_Name__c:string:Employee_Name Region__c:reference:Region Status__c:picklist:Status Present_Type__c:picklist:Present_Type"),
  LoginHistory: F("Id:id LoginTime:datetime:Login_Time UserId:reference:User_ID Status:string Application:string"),
  Account: F("Id:id Name:string:Account_Name Customer_Code__c:string:Customer_Code Customer_category__c:picklist:Customer_category Region__c:reference:Region Status__c:picklist:Status Pending_Order_Amount__c:currency:Pending_Order_Amount Current_Year_Target__c:double:Current_Year_Target Current_Year_Actual__c:double:Current_Year_Actual Ledger_Balance__c:currency:Ledger_Balance Aadhar_Number__c:string:Aadhar_Number PAN_Number__c:string:PAN_Number"),
  Secondary_Order__c: F("Id:id Name:string CreatedDate:datetime Region__c:reference:Region Status__c:picklist:Status Quantity_in_MT__c:double:Quantity_in_MT"),
};
const OBJECTS = [["Employee__c", "Executive"], ["Attendance__c", "Attendance"], ["LoginHistory", "Login History"], ["Secondary_Order__c", "Secondary Order"], ["Account", "Account"], ["Visit__c", "Visit"], ["User", "User"]];
function salesforce(url: string): Response {
  const json = (body: unknown) => new Response(JSON.stringify(body), { status: 200, headers: { "content-type": "application/json" } });
  if (url.includes("/oauth2/token")) return json({ access_token: "probe-token", instance_url: "https://ars.my.salesforce.com" });
  const describe = url.match(/\/sobjects\/(\w+)\/describe/);
  if (describe) return DESCRIBE[describe[1]!] ? json({ queryable: true, fields: DESCRIBE[describe[1]!] }) : new Response(JSON.stringify([{ errorCode: "NOT_FOUND" }]), { status: 404 });
  if (/\/sobjects\/?(\?|$)/.test(url)) return json({ sobjects: OBJECTS.map(([name, label]) => ({ name, label, queryable: true })) });
  const soql = decodeURIComponent(url.split("q=")[1] ?? "");
  if (/SELECT COUNT\(\) /.test(soql)) return json({ totalSize: 7, done: true, records: [] });
  if (/ g0/.test(soql)) return json({ totalSize: 2, done: true, records: [{ g0: "Chennai North", ...(/ g1/.test(soql) ? { g1: "Present" } : {}), v: 4, n: 4 }, { g0: "ROT1", ...(/ g1/.test(soql) ? { g1: "Present" } : {}), v: 3, n: 3 }] });
  return json({ totalSize: 2, done: true, records: [{ Id: "a1", Name: "Sample 1" }, { Id: "a2", Name: "Sample 2" }] });
}

const QUESTIONS = (process.env.PROBE_QUESTIONS ?? "How many executives logged in today? Give a region wise login count").split("||");

it("probe", async () => {
  const [rows] = await getDbPool().query<import("mysql2").RowDataPacket[]>("SELECT u.id FROM users u JOIN user_roles ur ON ur.user_id = u.id JOIN roles r ON r.id = ur.role_id WHERE r.code = 'SUPER_ADMIN' ORDER BY u.id LIMIT 1");
  const user = (await findUserById(rows[0]!.id))!;
  const person: AskPerson = { id: user.id, roles: user.roles, modules: user.modules, chatModes: user.chatModes, salesforceScope: user.salesforceScope, name: user.name, email: user.email };
  console.log("provider", await getSettingValue("ai.active_provider"), "model", process.env.PROBE_MODEL ?? (await getSettingValue("ai.nvidia.model")));
  const realFetch = globalThis.fetch;
  await getDbPool().query("UPDATE ai_salesforce_connection SET status = 'CONNECTED' WHERE id = 1");
  const [fallback] = await getDbPool().query<import("mysql2").RowDataPacket[]>("SELECT value FROM system_settings WHERE setting_key = 'ai.fallback_provider'");
  if (process.env.PROBE_ONLY_ACTIVE) await getDbPool().query("UPDATE system_settings SET value = 'NONE' WHERE setting_key = 'ai.fallback_provider'");
  const fetchImpl = (async (url: string | URL | Request, init?: RequestInit) => {
    const target = String(url);
    const response = target.includes("/services/") ? salesforce(target) : await realFetch(url, init);
    if (!target.includes("/services/")) {
      const clone = response.clone();
      const body = await clone.json().catch(() => null);
      const message = body?.choices?.[0]?.message;
      if (message) console.log("MODEL", body.model, JSON.stringify({ content: String(message.content ?? "").slice(0, 400), tool_calls: (message.tool_calls ?? []).map((call: { function: { name: string; arguments: string } }) => `${call.function.name} ${call.function.arguments}`) }));
      else console.log("PROVIDER", response.status, JSON.stringify(body).slice(0, 300));
      const sent = JSON.parse(String(init?.body ?? "{}"));
      const last = sent.messages?.at(-1);
      if (last?.role === "tool") console.log("  TOOL RESULT:", String(last.content).slice(0, 400));
    } else console.log("  SF", response.status, decodeURIComponent(target.split("q=")[1] ?? target.split("/services/data/")[1] ?? "").slice(0, 300));
    return response;
  }) as typeof fetch;
  let conversationId: number | null = null;
  for (const [index, question] of QUESTIONS.entries()) {
    if (index) await new Promise((resolve) => setTimeout(resolve, Number(process.env.PROBE_PAUSE_MS ?? 0)));
    console.log("\n=== Q:", question);
    const result = await askAssistant(person, { conversationId, mode: conversationId ? null : "SALESFORCE", question, requestKey: crypto.randomUUID(), fetchImpl });
    console.log("RESULT", JSON.stringify(result));
    if (result.conversationId) {
      conversationId = result.conversationId;
      const answer = (await listMessages(person.id, conversationId)).at(-1)!;
      console.log("ANSWER:", answer.content.slice(0, 1200), "\nTOOLS:", answer.evidence.map((item) => item.tool).join(", "), "UNVERIFIED:", answer.unverified.join(","));
    }
  }
  await getDbPool().query("UPDATE ai_salesforce_connection SET status = 'NEEDS_REAUTH' WHERE id = 1");
  await getDbPool().query("UPDATE system_settings SET value = ? WHERE setting_key = 'ai.fallback_provider'", [fallback[0]?.value ?? "NONE"]);
}, 600000);
