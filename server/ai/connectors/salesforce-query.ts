import "server-only";
import { getSettingValue } from "@/server/settings/values";
import { API_VERSION, salesforceGet, SalesforceUnavailable } from "@/server/ai/connectors/salesforce-auth";
import type { SalesforceScope } from "@/server/ai/chat-access";

// D-172: live, read-only Salesforce questions for Pic bot. The model never
// writes SOQL. It names an allowed object, allowed fields and simple
// filters; this file validates each one and builds the query:
//   - objects and fields: only the Super Admin's allowlist (ai.salesforce.objects),
//     or, when it is "*" (D-175), any object and field the connected
//     Salesforce user can query, with names taken from Salesforce's describe;
//   - filters: allowlisted field, a fixed operator, a typed value (strings
//     escaped; numbers, dates and booleans checked by pattern);
//   - scope: OWN adds OwnerId = the person's Salesforce user (matched by email,
//     exactly one active user); ALL adds nothing; NONE never reaches here;
//   - WITH USER_MODE: Salesforce applies its own sharing and field-level
//     security for the connected user;
//   - at most MAX_ROWS rows, one page; counts use COUNT() (Salesforce counts).
export const MAX_ROWS = 50;
const NAME = /^[A-Za-z][A-Za-z0-9_]{0,79}$/;
const OPERATORS = ["=", "!=", ">", "<", ">=", "<=", "LIKE"] as const;
export type Operator = (typeof OPERATORS)[number];

export type Allowlist = Map<string, Set<string>>; // object -> allowed fields

export function parseAllowlist(value: string | null): Allowlist {
  const out: Allowlist = new Map();
  if (!value) return out;
  for (const part of value.split(";").map((item) => item.trim()).filter(Boolean)) {
    const [object, list = ""] = part.split(":");
    const fields = list.split(",").map((field) => field.trim()).filter(Boolean);
    if (!object || !NAME.test(object) || !fields.every((field) => NAME.test(field))) throw new Error(`Invalid Salesforce allowlist entry "${part.slice(0, 60)}".`);
    out.set(object, new Set(["Id", "OwnerId", "SystemModstamp", ...fields]));
  }
  return out;
}

export async function loadAllowlist(): Promise<Allowlist> {
  const value = await getSettingValue("ai.salesforce.objects");
  return value?.trim() === ALL_OBJECTS ? new Map() : parseAllowlist(value);
}

// D-175: "*" = every object the connected Salesforce user can query.
export const ALL_OBJECTS = "*";
export async function readsAllObjects(): Promise<boolean> {
  return (await getSettingValue("ai.salesforce.objects"))?.trim() === ALL_OBJECTS;
}

export interface FieldInfo {
  name: string;
  label: string;
  type: string;
}

// Describes are cached for 10 minutes per object (they rarely change).
const DESCRIBE_MS = 10 * 60 * 1000;
const describeCache = new Map<string, { at: number; fields: FieldInfo[] }>();

// The queryable fields of one object, from Salesforce's describe. Unknown or
// non-queryable objects are refused.
export async function describeObject(object: string, fetchImpl?: typeof fetch, signal?: AbortSignal): Promise<FieldInfo[]> {
  if (!NAME.test(object)) throw new QueryRefused(`The object ${object.slice(0, 80)} isn't available.`);
  const cached = describeCache.get(object);
  if (cached && Date.now() - cached.at < DESCRIBE_MS) return cached.fields;
  let result: { queryable?: boolean; fields?: { name?: string; label?: string; type?: string }[] };
  try {
    result = (await salesforceGet(`/services/data/${API_VERSION}/sobjects/${object}/describe`, fetchImpl, signal)) as typeof result;
  } catch (error) {
    if (error instanceof SalesforceUnavailable && /NOT_FOUND|HTTP 404/.test(error.message)) throw new QueryRefused(`The object ${object} doesn't exist in Salesforce or isn't visible.`);
    throw error;
  }
  if (!result.queryable) throw new QueryRefused(`The object ${object} can't be read.`);
  const fields = (result.fields ?? []).filter((field) => field.name && NAME.test(field.name)).map((field) => ({ name: field.name!, label: String(field.label ?? field.name), type: String(field.type ?? "") }));
  describeCache.set(object, { at: Date.now(), fields });
  return fields;
}

// The objects the connected user can query (no share, history, feed or
// change-event tables), optionally filtered by name or label.
export async function listObjects(search: string, fetchImpl?: typeof fetch, signal?: AbortSignal): Promise<{ name: string; label: string }[]> {
  const result = (await salesforceGet(`/services/data/${API_VERSION}/sobjects`, fetchImpl, signal)) as { sobjects?: { name?: string; label?: string; queryable?: boolean; deprecatedAndHidden?: boolean; customSetting?: boolean }[] };
  const term = search.trim().toLowerCase();
  return (result.sobjects ?? [])
    .filter((item) => item.queryable && !item.deprecatedAndHidden && !item.customSetting && item.name && NAME.test(item.name) && !/(Share|History|Feed|ChangeEvent|__mdt)$/.test(item.name))
    .map((item) => ({ name: item.name!, label: String(item.label ?? item.name) }))
    .filter((item) => !term || item.name.toLowerCase().includes(term) || item.label.toLowerCase().includes(term));
}

// The allowlist for one query: the configured list, or (with "*") the object's described fields.
async function allowlistFor(object: string, context: QueryContext): Promise<Allowlist> {
  if (!(await readsAllObjects())) return loadAllowlist();
  const fields = await describeObject(object, context.fetchImpl, context.signal);
  return new Map([[object, new Set(fields.map((field) => field.name))]]);
}

export interface Filter {
  field: string;
  op: Operator;
  value: string | number | boolean | null;
}

export interface QuerySpec {
  object: string;
  fields: string[];
  filters: Filter[];
  orderBy?: { field: string; direction: "ASC" | "DESC" } | null;
  limit: number;
}

export class QueryRefused extends Error {
  constructor(message: string) {
    super(message);
    this.name = "QueryRefused";
  }
}

// A SOQL literal from a typed value. Strings are quoted with \ and ' escaped.
export function literal(value: Filter["value"]): string {
  if (value === null) return "null";
  if (typeof value === "boolean") return value ? "true" : "false";
  if (typeof value === "number") {
    if (!Number.isFinite(value)) throw new QueryRefused("Not a valid number.");
    return String(value);
  }
  // Dates and date-times go unquoted in SOQL; anything else is a quoted string.
  if (/^\d{4}-\d{2}-\d{2}$/.test(value) || /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{3})?Z$/.test(value)) return value;
  if (/^(TODAY|YESTERDAY|THIS_WEEK|LAST_WEEK|THIS_MONTH|LAST_MONTH|THIS_QUARTER|LAST_QUARTER|THIS_YEAR|LAST_YEAR|LAST_N_DAYS:\d{1,3})$/.test(value)) return value;
  if (value.length > 200) throw new QueryRefused("A filter value is too long.");
  return `'${value.replace(/\\/g, "\\\\").replace(/'/g, "\\'")}'`;
}

function where(spec: Pick<QuerySpec, "object" | "filters">, allowed: Set<string>, ownerId: string | null): string {
  const parts: string[] = [];
  if (ownerId !== null) {
    if (!/^005[A-Za-z0-9]{12}([A-Za-z0-9]{3})?$/.test(ownerId)) throw new QueryRefused("Unexpected Salesforce user id.");
    parts.push(`OwnerId = '${ownerId}'`);
  }
  for (const filter of spec.filters.slice(0, 5)) {
    if (!allowed.has(filter.field)) throw new QueryRefused(`The field ${filter.field} isn't available.`);
    if (!(OPERATORS as readonly string[]).includes(filter.op)) throw new QueryRefused("Unsupported filter operator.");
    if (filter.op === "LIKE" && typeof filter.value !== "string") throw new QueryRefused("LIKE needs text.");
    parts.push(`${filter.field} ${filter.op} ${literal(filter.value)}`);
  }
  return parts.length ? ` WHERE ${parts.join(" AND ")}` : "";
}

// Pure: the SOQL for a validated spec (throws QueryRefused otherwise).
export function buildSelect(spec: QuerySpec, allowlist: Allowlist, ownerId: string | null): string {
  const allowed = allowlist.get(spec.object);
  if (!allowed) throw new QueryRefused(`The object ${spec.object} isn't available to Pic bot.`);
  const fields = [...new Set(["Id", ...spec.fields])];
  for (const field of fields) if (!allowed.has(field)) throw new QueryRefused(`The field ${field} isn't available.`);
  let soql = `SELECT ${fields.join(", ")} FROM ${spec.object}${where(spec, allowed, ownerId)} WITH USER_MODE`;
  if (spec.orderBy) {
    if (!allowed.has(spec.orderBy.field)) throw new QueryRefused(`The field ${spec.orderBy.field} isn't available.`);
    soql += ` ORDER BY ${spec.orderBy.field} ${spec.orderBy.direction === "ASC" ? "ASC" : "DESC"}`;
  }
  return `${soql} LIMIT ${Math.max(1, Math.min(MAX_ROWS, Math.floor(spec.limit)))}`;
}

export function buildCount(spec: Pick<QuerySpec, "object" | "filters">, allowlist: Allowlist, ownerId: string | null): string {
  const allowed = allowlist.get(spec.object);
  if (!allowed) throw new QueryRefused(`The object ${spec.object} isn't available to Pic bot.`);
  return `SELECT COUNT() FROM ${spec.object}${where(spec, allowed, ownerId)} WITH USER_MODE`;
}

const queryPath = (soql: string) => `/services/data/${API_VERSION}/query?q=${encodeURIComponent(soql)}`;

// The person's Salesforce user id for OWN scope: exactly one active user with their email.
export async function salesforceUserIdFor(email: string, fetchImpl: typeof fetch = fetch, signal?: AbortSignal): Promise<string> {
  const soql = `SELECT Id FROM User WHERE Email = ${literal(email)} AND IsActive = true LIMIT 2`;
  const result = (await salesforceGet(queryPath(soql), fetchImpl, signal)) as { records?: { Id?: string }[] };
  const records = result.records ?? [];
  if (records.length !== 1 || !records[0]?.Id) throw new QueryRefused("Your Salesforce user couldn't be matched by email, so Salesforce records can't be read for you. Ask IT to check your email in Salesforce.");
  return records[0].Id;
}

export interface QueryContext {
  email: string;
  scope: SalesforceScope;
  fetchImpl?: typeof fetch;
  signal?: AbortSignal;
}

async function ownerFor(context: QueryContext): Promise<string | null> {
  if (context.scope === "NONE") throw new QueryRefused("Salesforce data isn't available to you.");
  return context.scope === "OWN" ? salesforceUserIdFor(context.email, context.fetchImpl, context.signal) : null;
}

export async function querySalesforce(spec: QuerySpec, context: QueryContext): Promise<{ soqlShape: string; records: Record<string, unknown>[]; totalSize: number; truncated: boolean }> {
  const allowlist = await allowlistFor(spec.object, context);
  const soql = buildSelect(spec, allowlist, await ownerFor(context));
  const result = (await salesforceGet(queryPath(soql), context.fetchImpl, context.signal)) as { totalSize?: number; done?: boolean; records?: Record<string, unknown>[] };
  const records = (result.records ?? []).slice(0, MAX_ROWS).map((record) => Object.fromEntries(Object.entries(record).filter(([key]) => key !== "attributes")));
  // The query shape (no values) for the evidence panel.
  return { soqlShape: `${spec.object}: ${spec.fields.join(", ")}${spec.filters.length ? ` where ${spec.filters.map((filter) => `${filter.field} ${filter.op} …`).join(" and ")}` : ""}${context.scope === "OWN" ? " (your records)" : ""}`, records, totalSize: Number(result.totalSize ?? records.length), truncated: result.done === false };
}

export async function countSalesforce(spec: Pick<QuerySpec, "object" | "filters">, context: QueryContext): Promise<{ count: number; scope: string }> {
  const allowlist = await allowlistFor(spec.object, context);
  const soql = buildCount(spec, allowlist, await ownerFor(context));
  const result = (await salesforceGet(queryPath(soql), context.fetchImpl, context.signal)) as { totalSize?: number };
  return { count: Number(result.totalSize ?? 0), scope: context.scope === "OWN" ? "records you own" : "all records you may see" };
}

export { SalesforceUnavailable };
