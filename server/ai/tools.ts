import "server-only";
import { z } from "zod";
import { approvalsWaitingFor, myInformationSummary, myRequestsSummary, myTasksSummary, sourceDatasetCounts } from "@/lib/db/repositories/ai-data.repository";
import { hasModule } from "@/server/modules/modules";
import { createProposal } from "@/server/ai/proposals";
import type { ToolSpec } from "@/server/ai/providers";
import type { AiEvidence } from "@/lib/db/repositories/ai.repository";
import type { ModuleCode } from "@/types/auth";

// D-169 (AI module branch): the only things the AI can do. Each tool is a
// fixed, parameterised, read-only function (except propose_action, which
// records a proposal for a person to decide). Each re-checks the person's
// modules when it runs, validates its arguments, and returns its data with
// the source and the time it was read. There is no tool that runs SQL, calls
// a URL or changes business data.
export interface ToolPerson {
  id: number;
  roles: readonly string[];
  modules: readonly ModuleCode[];
}

export interface ToolContext {
  person: ToolPerson;
  conversationId: number | null;
  salesforceVisible: boolean;
  evidence: AiEvidence[]; // collected so far in this answer (for proposals)
}

interface AiTool {
  spec: ToolSpec;
  label: string;
  module: ModuleCode | null; // null: needs only the AI module
  businessData: boolean; // returns business data (needs a provider approved for it)
  args: z.ZodTypeAny;
  allowed?: (context: ToolContext) => boolean;
  run: (context: ToolContext, args: Record<string, unknown>) => Promise<{ result: unknown; source: string; links?: { label: string; href: string }[] }>;
}

const ARS = "ARS Approvals (live)";

const TOOLS: readonly AiTool[] = [
  {
    label: "Approvals waiting for me",
    module: "APPROVAL",
    businessData: true,
    spec: { name: "approvals_waiting_for_me", description: "The approvals waiting for the person asking: how many, how many are overdue, and the five oldest (number, title, hours waiting).", parameters: { type: "object", properties: {}, additionalProperties: false } },
    args: z.object({}).strict(),
    run: async ({ person }) => {
      const data = await approvalsWaitingFor(person.id);
      return { result: data, source: ARS, links: data.oldest.map((item) => ({ label: item.requestNo, href: item.href })) };
    },
  },
  {
    label: "My requests",
    module: "APPROVAL",
    businessData: true,
    spec: {
      name: "my_requests_summary",
      description: "The requests the person asking has raised in the last N days: how many, by status, and the average hours to close.",
      parameters: { type: "object", properties: { period_days: { type: "integer", enum: [7, 30, 90, 365], description: "How many days back." } }, required: ["period_days"], additionalProperties: false },
    },
    args: z.object({ period_days: z.union([z.literal(7), z.literal(30), z.literal(90), z.literal(365)]) }).strict(),
    run: async ({ person }, args) => ({ result: await myRequestsSummary(person.id, Number(args.period_days)), source: ARS, links: [{ label: "My requests", href: "/users/requests" }] }),
  },
  {
    label: "My tasks",
    module: "TASK",
    businessData: true,
    spec: { name: "my_tasks_summary", description: "The tasks assigned to the person asking: open, in progress, blocked, overdue, due within 7 days, completed in the last 30 days.", parameters: { type: "object", properties: {}, additionalProperties: false } },
    args: z.object({}).strict(),
    run: async ({ person }) => ({ result: await myTasksSummary(person.id), source: ARS, links: [{ label: "My tasks", href: "/users/tasks" }] }),
  },
  {
    label: "My information",
    module: "INFORMATION",
    businessData: true,
    spec: { name: "my_information_summary", description: "Information sent to the person asking: how many are unread, and how many wait for their acknowledgement.", parameters: { type: "object", properties: {}, additionalProperties: false } },
    args: z.object({}).strict(),
    run: async ({ person }) => ({ result: await myInformationSummary(person.id), source: ARS, links: [{ label: "Information inbox", href: "/users/information" }] }),
  },
  {
    label: "Salesforce data available",
    module: null,
    businessData: true,
    allowed: (context) => context.salesforceVisible,
    spec: { name: "salesforce_datasets", description: "Which Salesforce objects have been copied into ARS, how many records each has, and when they were last synced. Use it before saying anything about Salesforce data.", parameters: { type: "object", properties: {}, additionalProperties: false } },
    args: z.object({}).strict(),
    run: async () => ({ result: await sourceDatasetCounts("salesforce"), source: "Salesforce (copied by the hourly sync)" }),
  },
  {
    label: "Proposed action",
    module: null,
    businessData: false,
    spec: {
      name: "propose_action",
      description:
        "Record a suggested action for a person to approve or reject (for example: remind an approver, follow up a request, review a task). Nothing is carried out. Use only when the person asks for a suggestion to be recorded, and only with facts from other tools.",
      parameters: {
        type: "object",
        properties: {
          kind: { type: "string", enum: ["REMINDER", "FOLLOW_UP", "REVIEW", "OTHER"] },
          title: { type: "string", maxLength: 200 },
          details: { type: "string", maxLength: 2000, description: "What should be done and why, citing the figures from the tools." },
        },
        required: ["kind", "title", "details"],
        additionalProperties: false,
      },
    },
    args: z.object({ kind: z.enum(["REMINDER", "FOLLOW_UP", "REVIEW", "OTHER"]), title: z.string().trim().min(3).max(200), details: z.string().trim().min(10).max(2000) }).strict(),
    run: async (context, args) => {
      const proposal = await createProposal(context.person, {
        conversationId: context.conversationId,
        kind: args.kind as "REMINDER",
        title: String(args.title),
        details: String(args.details),
        evidence: context.evidence,
      });
      return { result: { proposalId: proposal.id, status: "PENDING", approver: proposal.approverLabel, note: "Recorded for a person to approve or reject. Nothing has been carried out." }, source: "ARS Approvals", links: [{ label: "Insights & Recommendations", href: "/users/ai/insights" }] };
    },
  },
];

// The tools this person may use right now (their modules, and the Salesforce visibility setting).
export function toolsFor(context: Pick<ToolContext, "person" | "salesforceVisible">, includeBusinessData: boolean): AiTool[] {
  return TOOLS.filter((tool) => (tool.module === null || hasModule(context.person, tool.module)) && (!tool.allowed || tool.allowed(context as ToolContext)) && (includeBusinessData || !tool.businessData));
}

export const TOOL_NAMES = TOOLS.map((tool) => tool.spec.name);

// Runs one tool call from the model. Unknown tools, tools this person may not
// use and bad arguments are refused with a message the model can read.
export async function runTool(context: ToolContext, allowed: readonly AiTool[], name: string, rawArgs: Record<string, unknown>): Promise<{ content: string; evidence: AiEvidence | null }> {
  const tool = allowed.find((item) => item.spec.name === name);
  if (!tool) return { content: JSON.stringify({ error: `The tool "${name.slice(0, 60)}" isn't available to this person.` }), evidence: null };
  if (tool.module && !hasModule(context.person, tool.module)) return { content: JSON.stringify({ error: "Not allowed for this person." }), evidence: null };
  const parsed = tool.args.safeParse(rawArgs);
  if (!parsed.success) return { content: JSON.stringify({ error: "The arguments weren't valid for this tool.", issues: parsed.error.issues.map((issue) => issue.message).slice(0, 3) }), evidence: null };
  const asOf = new Date().toISOString();
  const output = await tool.run(context, parsed.data as Record<string, unknown>);
  const evidence: AiEvidence = { tool: tool.spec.name, label: tool.label, args: parsed.data as Record<string, unknown>, source: output.source, asOf, result: output.result, links: output.links ?? [] };
  return { content: JSON.stringify({ source: output.source, as_of: asOf, data: output.result }), evidence };
}
