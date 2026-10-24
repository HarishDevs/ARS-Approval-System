import "server-only";
import { z } from "zod";
import { approvalsWaitingFor, myInformationSummary, myRequestsSummary, myTasksSummary, sourceDatasetCounts } from "@/lib/db/repositories/ai-data.repository";
import { hasModule } from "@/server/modules/modules";
import { createProposal } from "@/server/ai/proposals";
import { countSalesforce, describeObject, listObjects, loadAllowlist, MAX_ROWS, querySalesforce, QueryRefused, readsAllObjects, SalesforceUnavailable } from "@/server/ai/connectors/salesforce-query";
import type { ToolSpec } from "@/server/ai/providers";
import type { AiEvidence } from "@/lib/db/repositories/ai.repository";
import { salesforceScopeOf, type ChatMode, type SalesforceScope } from "@/server/ai/chat-access";
import type { ModuleCode } from "@/types/auth";

// D-169, D-172: the only things Pic bot can do. Each tool belongs to one chat
// mode, is a fixed read-only function (propose_action only records a
// suggestion for a person to decide), validates its arguments, and re-checks
// the person when it runs: the module for module tools, the Salesforce scope
// for Salesforce tools. No tool runs free-form SQL or SOQL, calls an
// arbitrary URL, or changes business data in ARS or Salesforce.
export interface ToolPerson {
  id: number;
  roles: readonly string[];
  modules: readonly ModuleCode[];
  email?: string;
  salesforceScope?: SalesforceScope;
}

export interface ToolContext {
  person: ToolPerson;
  conversationId: number | null;
  dataModes: readonly ChatMode[]; // what this conversation may draw on
  evidence: AiEvidence[]; // collected so far in this answer (for proposals)
  signal?: AbortSignal;
  fetchImpl?: typeof fetch;
}

interface AiTool {
  spec: ToolSpec;
  label: string;
  mode: ChatMode | null; // null: any data mode (propose_action)
  module?: ModuleCode;
  businessData: boolean;
  args: z.ZodTypeAny;
  run: (context: ToolContext, args: Record<string, unknown>) => Promise<{ result: unknown; source: string; links?: { label: string; href: string }[] }>;
}

const ARS = "ARS Approvals (live)";
const SF = "Salesforce (live, read-only)";
const empty = { type: "object", properties: {}, additionalProperties: false };
const filterSchema = {
  type: "array",
  maxItems: 5,
  items: {
    type: "object",
    properties: {
      field: { type: "string" },
      op: { type: "string", enum: ["=", "!=", ">", "<", ">=", "<=", "LIKE"] },
      value: { type: ["string", "number", "boolean", "null"], description: "Text, number, true/false, a date YYYY-MM-DD, or a Salesforce date literal such as THIS_MONTH or LAST_N_DAYS:30. LIKE uses % as the wildcard." },
    },
    required: ["field", "op", "value"],
    additionalProperties: false,
  },
};
const filterArgs = z.array(z.object({ field: z.string().max(80), op: z.enum(["=", "!=", ">", "<", ">=", "<=", "LIKE"]), value: z.union([z.string().max(200), z.number(), z.boolean(), z.null()]) }).strict()).max(5);

function salesforceContext(context: ToolContext) {
  const scope = salesforceScopeOf(context.person);
  if (scope === "NONE" || !context.person.email) throw new QueryRefused("Salesforce data isn't available to you.");
  return { email: context.person.email, scope, signal: context.signal, fetchImpl: context.fetchImpl };
}

const TOOLS: readonly AiTool[] = [
  {
    label: "Approvals waiting for me",
    mode: "APPROVAL",
    module: "APPROVAL",
    businessData: true,
    spec: { name: "approvals_waiting_for_me", description: "The approvals waiting for the person asking: how many, how many are overdue, and the five oldest (number, title, hours waiting).", parameters: empty },
    args: z.object({}).strict(),
    run: async ({ person }) => {
      const data = await approvalsWaitingFor(person.id);
      return { result: data, source: ARS, links: data.oldest.map((item) => ({ label: item.requestNo, href: item.href })) };
    },
  },
  {
    label: "My requests",
    mode: "APPROVAL",
    module: "APPROVAL",
    businessData: true,
    spec: {
      name: "my_requests_summary",
      description: "The requests the person asking has raised in the last N days: how many, by status, and the average hours to close.",
      parameters: { type: "object", properties: { period_days: { type: "integer", enum: [7, 30, 90, 365] } }, required: ["period_days"], additionalProperties: false },
    },
    args: z.object({ period_days: z.union([z.literal(7), z.literal(30), z.literal(90), z.literal(365)]) }).strict(),
    run: async ({ person }, args) => ({ result: await myRequestsSummary(person.id, Number(args.period_days)), source: ARS, links: [{ label: "My requests", href: "/users/requests" }] }),
  },
  {
    label: "My tasks",
    mode: "TASK",
    module: "TASK",
    businessData: true,
    spec: { name: "my_tasks_summary", description: "The tasks assigned to the person asking: open, in progress, blocked, overdue, due within 7 days, completed in the last 30 days.", parameters: empty },
    args: z.object({}).strict(),
    run: async ({ person }) => ({ result: await myTasksSummary(person.id), source: ARS, links: [{ label: "My tasks", href: "/users/tasks" }] }),
  },
  {
    label: "My information",
    mode: "INFORMATION",
    module: "INFORMATION",
    businessData: true,
    spec: { name: "my_information_summary", description: "Information sent to the person asking: how many are unread, and how many wait for their acknowledgement.", parameters: empty },
    args: z.object({}).strict(),
    run: async ({ person }) => ({ result: await myInformationSummary(person.id), source: ARS, links: [{ label: "Information inbox", href: "/users/information" }] }),
  },
  {
    label: "Salesforce objects available",
    mode: "SALESFORCE",
    businessData: true,
    spec: {
      name: "salesforce_objects",
      description: "The Salesforce objects (and, for a fixed list, fields) Pic bot may read for this person, and whether only their own records are visible. Call it first. If it says all objects are readable, pass search (e.g. 'opportunit') to find an object, then call salesforce_fields.",
      parameters: { type: "object", properties: { search: { type: "string", maxLength: 60 } }, additionalProperties: false },
    },
    args: z.object({ search: z.string().max(60).optional() }).strict(),
    run: async (context, args) => {
      const sf = salesforceContext(context);
      const scope = sf.scope;
      if (await readsAllObjects()) {
        const objects = await listObjects(String(args.search ?? ""), sf.fetchImpl, sf.signal);
        return { result: { scope: scope === "OWN" ? "only records this person owns" : "all records they may see", objects: objects.slice(0, 120).map((item) => item.name), more: objects.length > 120 ? `${objects.length - 120} more; pass search to narrow` : null, fields: "call salesforce_fields with the object name", maxRows: MAX_ROWS }, source: SF };
      }
      const allowlist = await loadAllowlist();
      return { result: { scope: scope === "OWN" ? "only records this person owns" : "all records of these objects they may see", objects: Object.fromEntries([...allowlist].map(([object, fields]) => [object, [...fields]])), maxRows: MAX_ROWS, copies: await sourceDatasetCounts("salesforce") }, source: SF };
    },
  },
  {
    label: "Salesforce fields",
    mode: "SALESFORCE",
    businessData: true,
    spec: { name: "salesforce_fields", description: "The fields (name, label, type) of one Salesforce object, when all objects are readable. Use the names exactly in salesforce_query and salesforce_count.", parameters: { type: "object", properties: { object: { type: "string" } }, required: ["object"], additionalProperties: false } },
    args: z.object({ object: z.string().max(80) }).strict(),
    run: async (context, args) => {
      const sf = salesforceContext(context);
      if (!(await readsAllObjects())) throw new QueryRefused("Use salesforce_objects: only the listed objects and fields are available.");
      const fields = await describeObject(String(args.object), sf.fetchImpl, sf.signal);
      // Compact (name:type) to keep the answer small for providers with low token limits.
      return { result: { object: args.object, fields: fields.slice(0, 200).map((field) => `${field.name}:${field.type}`), more: fields.length > 200 }, source: SF };
    },
  },
  {
    label: "Salesforce records",
    mode: "SALESFORCE",
    businessData: true,
    spec: {
      name: "salesforce_query",
      description: `Read Salesforce records (at most ${MAX_ROWS}) of one allowed object, with allowed fields and simple filters. Salesforce applies its own sharing and field security; only the person's permitted records come back.`,
      parameters: {
        type: "object",
        properties: {
          object: { type: "string" },
          fields: { type: "array", items: { type: "string" }, minItems: 1, maxItems: 12 },
          filters: filterSchema,
          order_by: { type: "object", properties: { field: { type: "string" }, direction: { type: "string", enum: ["ASC", "DESC"] } }, required: ["field", "direction"], additionalProperties: false },
          limit: { type: "integer", minimum: 1, maximum: MAX_ROWS },
        },
        required: ["object", "fields", "limit"],
        additionalProperties: false,
      },
    },
    args: z.object({ object: z.string().max(80), fields: z.array(z.string().max(80)).min(1).max(12), filters: filterArgs.default([]), order_by: z.object({ field: z.string().max(80), direction: z.enum(["ASC", "DESC"]) }).strict().optional(), limit: z.number().int().min(1).max(MAX_ROWS) }).strict(),
    run: async (context, args) => {
      const sf = salesforceContext(context);
      const result = await querySalesforce({ object: String(args.object), fields: args.fields as string[], filters: args.filters as never, orderBy: (args.order_by as never) ?? null, limit: Number(args.limit) }, sf);
      return { result: { query: result.soqlShape, records: result.records, returned: result.records.length, totalMatching: result.totalSize, truncated: result.truncated }, source: SF };
    },
  },
  {
    label: "Salesforce count",
    mode: "SALESFORCE",
    businessData: true,
    spec: {
      name: "salesforce_count",
      description: "Count Salesforce records of one allowed object matching simple filters (Salesforce does the counting).",
      parameters: { type: "object", properties: { object: { type: "string" }, filters: filterSchema }, required: ["object"], additionalProperties: false },
    },
    args: z.object({ object: z.string().max(80), filters: filterArgs.default([]) }).strict(),
    run: async (context, args) => {
      const sf = salesforceContext(context);
      const result = await countSalesforce({ object: String(args.object), filters: args.filters as never }, sf);
      return { result: { object: args.object, filters: args.filters, ...result }, source: SF };
    },
  },
  {
    label: "Proposed action",
    mode: null,
    businessData: false,
    spec: {
      name: "propose_action",
      description: "Record a suggested action for a person to approve or reject (for example: remind an approver, follow up a request, review a task). Nothing is carried out. Use only when the person asks for a suggestion to be recorded, and only with facts from other tools.",
      parameters: {
        type: "object",
        properties: { kind: { type: "string", enum: ["REMINDER", "FOLLOW_UP", "REVIEW", "OTHER"] }, title: { type: "string", maxLength: 200 }, details: { type: "string", maxLength: 2000 } },
        required: ["kind", "title", "details"],
        additionalProperties: false,
      },
    },
    args: z.object({ kind: z.enum(["REMINDER", "FOLLOW_UP", "REVIEW", "OTHER"]), title: z.string().trim().min(3).max(200), details: z.string().trim().min(10).max(2000) }).strict(),
    run: async (context, args) => {
      const proposal = await createProposal(context.person, { conversationId: context.conversationId, kind: args.kind as "REMINDER", title: String(args.title), details: String(args.details), evidence: context.evidence });
      return { result: { proposalId: proposal.id, status: "PENDING", approver: proposal.approverLabel, note: "Recorded for a person to approve or reject. Nothing has been carried out." }, source: "ARS Approvals", links: [{ label: "Insights & Recommendations", href: "/users/ai/insights" }] };
    },
  },
];

function allowedNow(tool: AiTool, context: Pick<ToolContext, "person" | "dataModes">): boolean {
  if (tool.mode === null) return context.dataModes.length > 0; // propose_action: data conversations only
  if (!context.dataModes.includes(tool.mode)) return false;
  if (tool.module && !hasModule(context.person, tool.module)) return false;
  if (tool.mode === "SALESFORCE" && salesforceScopeOf(context.person) === "NONE") return false;
  return true;
}

// The tools this conversation may use: its data modes, the person's modules
// and Salesforce scope, and whether the provider may see business data.
export function toolsFor(context: Pick<ToolContext, "person" | "dataModes">, includeBusinessData: boolean): AiTool[] {
  return TOOLS.filter((tool) => allowedNow(tool, context) && (includeBusinessData || !tool.businessData));
}

export const TOOL_NAMES = TOOLS.map((tool) => tool.spec.name);

// Runs one tool call from the model. Unknown tools, tools not allowed now and
// bad arguments are refused with a message the model can read; refusals and
// source failures never invent data.
export async function runTool(context: ToolContext, allowed: readonly AiTool[], name: string, rawArgs: Record<string, unknown>): Promise<{ content: string; evidence: AiEvidence | null }> {
  const tool = allowed.find((item) => item.spec.name === name);
  if (!tool || !allowedNow(tool, context)) return { content: JSON.stringify({ error: `The tool "${name.slice(0, 60)}" isn't available in this chat. Say the information is outside this chat's access.` }), evidence: null };
  const parsed = tool.args.safeParse(rawArgs);
  if (!parsed.success) return { content: JSON.stringify({ error: "The arguments weren't valid for this tool.", issues: parsed.error.issues.map((issue) => issue.message).slice(0, 3) }), evidence: null };
  const asOf = new Date().toISOString();
  try {
    const output = await tool.run(context, parsed.data as Record<string, unknown>);
    const evidence: AiEvidence = { tool: tool.spec.name, label: tool.label, args: parsed.data as Record<string, unknown>, source: output.source, asOf, result: output.result, links: output.links ?? [] };
    return { content: JSON.stringify({ source: output.source, as_of: asOf, data: output.result }), evidence };
  } catch (error) {
    if (error instanceof QueryRefused || error instanceof SalesforceUnavailable) return { content: JSON.stringify({ error: error.message, note: "Tell the person this plainly; do not guess the data." }), evidence: null };
    throw error;
  }
}
