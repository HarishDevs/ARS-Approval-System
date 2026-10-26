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

// D-201: secrets are never readable, even with "*" (the Executive object has
// Password__c and Session_ID__c). D-204: nor are identity and bank details
// (Account has Aadhar_Number__c, PAN_Number__c, Party_Bank_Account_Number__c,
// Bank_IFSC_Code__c), which shouldn't reach an outside AI service.
// Matched on the field's name or label.
export const SECRET_FIELD = /pass(?:word|wd|code)|session[\s_]*id|token|secret|(?<![a-z])otp(?![a-z])|api[\s_]*key|private[\s_]*key|aadh?aa?r|(?<![a-z])pan[\s_]*(?:number|no)(?![a-z])|bank[\s_]*(?:account|a\/c)|account[\s_]*number|ifsc|micr|date[\s_]*of[\s_]*birth|(?<![a-z])dob(?![a-z])|(?<![a-z])kyc[\s_]*(?:id|no|number|ref|data|details?)(?![a-z])/i;

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
  const fields = (result.fields ?? []).filter((field) => field.name && NAME.test(field.name) && !SECRET_FIELD.test(field.name) && !SECRET_FIELD.test(String(field.label ?? "")) && field.type !== "encryptedstring").map((field) => ({ name: field.name!, label: String(field.label ?? field.name), type: String(field.type ?? "") }));
  describeCache.set(object, { at: Date.now(), fields });
  return fields;
}

// The objects the connected user can query (no share, history, feed or
// change-event tables), optionally filtered by name or label. Cached for 10 minutes.
let objectCache: { at: number; sobjects: { name?: string; label?: string; queryable?: boolean; deprecatedAndHidden?: boolean; customSetting?: boolean }[] } | null = null;
export async function listObjects(search: string, fetchImpl?: typeof fetch, signal?: AbortSignal): Promise<{ name: string; label: string }[]> {
  if (!objectCache || Date.now() - objectCache.at >= DESCRIBE_MS) {
    const result = (await salesforceGet(`/services/data/${API_VERSION}/sobjects`, fetchImpl, signal)) as { sobjects?: NonNullable<typeof objectCache>["sobjects"] };
    objectCache = { at: Date.now(), sobjects: result.sobjects ?? [] };
  }
  const term = search.trim().toLowerCase();
  return objectCache.sobjects
    .filter((item) => item.queryable && !item.deprecatedAndHidden && !item.customSetting && item.name && NAME.test(item.name) && !/(Share|History|Feed|ChangeEvent|__mdt)$/.test(item.name))
    .map((item) => ({ name: item.name!, label: String(item.label ?? item.name) }))
    .filter((item) => !term || item.name.toLowerCase().includes(term) || item.label.toLowerCase().includes(term));
}

// D-201: field types for one object (name -> Salesforce type), so a plain
// date on a date-time field becomes a day range instead of a Salesforce
// error. Empty when the object can't be described (the allowlist still rules).
export type FieldTypes = Map<string, string>;
async function typesFor(object: string, context: QueryContext): Promise<FieldTypes> {
  try {
    return new Map((await describeObject(object, context.fetchImpl, context.signal)).map((field) => [field.name, field.type.toLowerCase()]));
  } catch (error) {
    if (error instanceof QueryRefused) return new Map();
    throw error;
  }
}

// D-201: a calendar day in India time as a UTC range, for date-time fields
// ("created on 2026-10-26" = from 00:00 to 24:00 IST).
const IST_OFFSET_MS = 330 * 60 * 1000;
export function istDayRange(day: string): { start: string; end: string } {
  const startMs = Date.parse(`${day}T00:00:00Z`) - IST_OFFSET_MS;
  if (!Number.isFinite(startMs)) throw new QueryRefused("Not a valid date.");
  const iso = (ms: number) => new Date(ms).toISOString().replace(/\.\d{3}Z$/, "Z");
  return { start: iso(startMs), end: iso(startMs + 24 * 60 * 60 * 1000) };
}

// D-201: people (and smaller models) use everyday names: "Executive" for
// Employee__c, "Region" for Region_Master__c, "last login" for Last_Login__c.
// A name that isn't an exact API name is matched to an object or field by
// its API name or label, ignoring case, spaces, underscores, "__c" and a
// plural "s". Only names are translated; every allowlist check still runs.
const simple = (value: string) => value.toLowerCase().replace(/__c$/, "").replace(/[^a-z0-9]/g, "").replace(/s$/, "");

export function matchField(field: string, fields: readonly FieldInfo[]): string {
  if (fields.some((item) => item.name === field)) return field;
  const wanted = simple(field);
  return fields.find((item) => simple(item.name) === wanted)?.name ?? fields.find((item) => simple(item.label) === wanted)?.name ?? field;
}

export async function matchObject(object: string, context: QueryContext): Promise<string> {
  if (NAME.test(object)) {
    try {
      await describeObject(object, context.fetchImpl, context.signal);
      return object;
    } catch (error) {
      if (!(error instanceof QueryRefused)) throw error;
    }
  }
  const wanted = simple(object);
  const objects = await listObjects("", context.fetchImpl, context.signal);
  return objects.find((item) => simple(item.name) === wanted)?.name ?? objects.find((item) => simple(item.label) === wanted)?.name ?? object;
}

async function fieldsOf(object: string, context: QueryContext): Promise<FieldInfo[]> {
  try {
    return await describeObject(object, context.fetchImpl, context.signal);
  } catch (error) {
    if (error instanceof QueryRefused) return [];
    throw error;
  }
}

// The spec with everyday names translated to API names.
async function resolveNames<T extends { object: string; filters: Filter[] }>(spec: T, context: QueryContext, fieldKeys: readonly (keyof T)[]): Promise<T> {
  const object = await matchObject(spec.object, context);
  const fields = await fieldsOf(object, context);
  if (!fields.length) return { ...spec, object };
  const out = { ...spec, object, filters: spec.filters.map((filter) => ({ ...filter, field: matchField(filter.field, fields) })) } as T;
  for (const key of fieldKeys) {
    const value = out[key] as unknown;
    if (typeof value === "string") (out as Record<string, unknown>)[key as string] = matchField(value, fields);
    else if (Array.isArray(value)) (out as Record<string, unknown>)[key as string] = value.map((item) => (typeof item === "string" ? matchField(item, fields) : item));
  }
  return out;
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

// D-201: a lookup field (Region__c, AccountId) holds a record id. Its
// relationship (Region__r, Account) gives the linked record's Name, so
// breakdowns, lists and filters work with names people know, not ids.
const SF_ID = /^[A-Za-z0-9]{15}(?:[A-Za-z0-9]{3})?$/;
export function relationshipOf(field: string, types: FieldTypes): string | null {
  if (types.get(field) !== "reference") return null;
  if (field.endsWith("__c")) return `${field.slice(0, -3)}__r`;
  if (field.endsWith("Id") && field.length > 2) return field.slice(0, -2);
  return null;
}
const nameOf = (field: string, types: FieldTypes) => {
  const relationship = relationshipOf(field, types);
  return relationship ? `${relationship}.Name` : field;
};

function condition(filter: Filter, types: FieldTypes): string {
  const relationship = relationshipOf(filter.field, types);
  if (relationship && typeof filter.value === "string" && !SF_ID.test(filter.value)) return `${relationship}.Name ${filter.op} ${literal(filter.value)}`;
  if (types.get(filter.field) === "datetime" && typeof filter.value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(filter.value)) {
    const { start, end } = istDayRange(filter.value);
    const f = filter.field;
    switch (filter.op) {
      case "=":
        return `(${f} >= ${start} AND ${f} < ${end})`;
      case "!=":
        return `(${f} < ${start} OR ${f} >= ${end})`;
      case ">":
        return `${f} >= ${end}`;
      case ">=":
        return `${f} >= ${start}`;
      case "<":
        return `${f} < ${start}`;
      case "<=":
        return `${f} < ${end}`;
      default:
        throw new QueryRefused("LIKE can't be used with a date.");
    }
  }
  return `${filter.field} ${filter.op} ${literal(filter.value)}`;
}

function where(spec: Pick<QuerySpec, "object" | "filters">, allowed: Set<string>, ownerId: string | null, types: FieldTypes = new Map()): string {
  const parts: string[] = [];
  if (ownerId !== null) {
    if (!/^005[A-Za-z0-9]{12}([A-Za-z0-9]{3})?$/.test(ownerId)) throw new QueryRefused("Unexpected Salesforce user id.");
    parts.push(`OwnerId = '${ownerId}'`);
  }
  for (const filter of spec.filters.slice(0, 5)) {
    if (!allowed.has(filter.field)) throw new QueryRefused(`The field ${filter.field} isn't available.`);
    if (!(OPERATORS as readonly string[]).includes(filter.op)) throw new QueryRefused("Unsupported filter operator.");
    if (filter.op === "LIKE" && typeof filter.value !== "string") throw new QueryRefused("LIKE needs text.");
    parts.push(condition(filter, types));
  }
  return parts.length ? ` WHERE ${parts.join(" AND ")}` : "";
}

// Pure: the SOQL for a validated spec (throws QueryRefused otherwise).
export function buildSelect(spec: QuerySpec, allowlist: Allowlist, ownerId: string | null, types: FieldTypes = new Map()): string {
  const allowed = allowlist.get(spec.object);
  if (!allowed) throw new QueryRefused(`The object ${spec.object} isn't available to Pico Bot.`);
  const fields = [...new Set(["Id", ...spec.fields])];
  for (const field of fields) if (!allowed.has(field)) throw new QueryRefused(`The field ${field} isn't available.`);
  const names = fields.map((field) => nameOf(field, types)).filter((name) => name.includes("."));
  let soql = `SELECT ${[...fields, ...names].join(", ")} FROM ${spec.object}${where(spec, allowed, ownerId, types)} WITH USER_MODE`;
  if (spec.orderBy) {
    if (!allowed.has(spec.orderBy.field)) throw new QueryRefused(`The field ${spec.orderBy.field} isn't available.`);
    soql += ` ORDER BY ${spec.orderBy.field} ${spec.orderBy.direction === "ASC" ? "ASC" : "DESC"}`;
  }
  return `${soql} LIMIT ${Math.max(1, Math.min(MAX_ROWS, Math.floor(spec.limit)))}`;
}

export function buildCount(spec: Pick<QuerySpec, "object" | "filters">, allowlist: Allowlist, ownerId: string | null, types: FieldTypes = new Map()): string {
  const allowed = allowlist.get(spec.object);
  if (!allowed) throw new QueryRefused(`The object ${spec.object} isn't available to Pico Bot.`);
  return `SELECT COUNT() FROM ${spec.object}${where(spec, allowed, ownerId, types)} WITH USER_MODE`;
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

export async function querySalesforce(input: QuerySpec, context: QueryContext): Promise<{ soqlShape: string; records: Record<string, unknown>[]; totalSize: number; truncated: boolean }> {
  const resolved = await resolveNames(input, context, ["fields"]);
  const orderField = input.orderBy ? (await resolveNames({ object: resolved.object, filters: [{ field: input.orderBy.field, op: "=", value: null }] }, context, [])).filters[0]!.field : null;
  const spec: QuerySpec = { ...resolved, orderBy: input.orderBy && orderField ? { ...input.orderBy, field: orderField } : null };
  const allowlist = await allowlistFor(spec.object, context);
  const soql = buildSelect(spec, allowlist, await ownerFor(context), await typesFor(spec.object, context));
  const result = (await salesforceGet(queryPath(soql), context.fetchImpl, context.signal)) as { totalSize?: number; done?: boolean; records?: Record<string, unknown>[] };
  // A linked record comes back nested ({ Region__r: { Name } }); flatten it to "Region__r.Name".
  const records = (result.records ?? []).slice(0, MAX_ROWS).map((record) =>
    Object.fromEntries(
      Object.entries(record)
        .filter(([key]) => key !== "attributes")
        .map(([key, value]) => (value && typeof value === "object" && !Array.isArray(value) ? [`${key}.Name`, (value as { Name?: unknown }).Name ?? null] : [key, value])),
    ),
  );
  // The query shape (no values) for the evidence panel.
  return { soqlShape: `${spec.object}: ${spec.fields.join(", ")}${spec.filters.length ? ` where ${spec.filters.map((filter) => `${filter.field} ${filter.op} …`).join(" and ")}` : ""}${context.scope === "OWN" ? " (your records)" : ""}`, records, totalSize: Number(result.totalSize ?? records.length), truncated: result.done === false || records.length >= Math.min(MAX_ROWS, Math.floor(spec.limit)) };
}

export async function countSalesforce(input: Pick<QuerySpec, "object" | "filters">, context: QueryContext): Promise<{ count: number; scope: string }> {
  const spec = await resolveNames(input, context, []);
  const allowlist = await allowlistFor(spec.object, context);
  const soql = buildCount(spec, allowlist, await ownerFor(context), await typesFor(spec.object, context));
  const result = (await salesforceGet(queryPath(soql), context.fetchImpl, context.signal)) as { totalSize?: number };
  return { count: Number(result.totalSize ?? 0), scope: context.scope === "OWN" ? "records you own" : "all records you may see" };
}

// D-178: breakdowns for dashboards. Salesforce groups and aggregates; the
// model only names the group field, an optional date bucket, the aggregate
// and its field, all checked against the allowlist like any other query.
export const AGGREGATES = ["COUNT", "SUM", "AVG", "MIN", "MAX"] as const;
export type Aggregate = (typeof AGGREGATES)[number];
export interface GroupSpec {
  object: string;
  groupBy: string;
  thenBy?: string | null; // D-201: a second grouping (e.g. region, then status)
  bucket: "MONTH" | "YEAR" | null;
  aggregate: Aggregate;
  field: string | null;
  filters: Filter[];
}

export function buildGroup(spec: GroupSpec, allowlist: Allowlist, ownerId: string | null, types: FieldTypes = new Map()): string {
  const allowed = allowlist.get(spec.object);
  if (!allowed) throw new QueryRefused(`The object ${spec.object} isn't available to Pico Bot.`);
  if (!allowed.has(spec.groupBy)) throw new QueryRefused(`The field ${spec.groupBy} isn't available.`);
  if (!(AGGREGATES as readonly string[]).includes(spec.aggregate)) throw new QueryRefused("Unsupported aggregate.");
  let measure = "COUNT(Id)";
  if (spec.aggregate !== "COUNT") {
    if (!spec.field || !allowed.has(spec.field)) throw new QueryRefused(`The field ${spec.field ?? "(none)"} isn't available.`);
    measure = `${spec.aggregate}(${spec.field})`;
  }
  if (spec.thenBy && (!allowed.has(spec.thenBy) || spec.thenBy === spec.groupBy)) throw new QueryRefused(`The field ${spec.thenBy} isn't available.`);
  // Date buckets are k0/k1; the group and the second group are g0/g1 (a lookup groups by the linked record's Name).
  const keys = spec.bucket === "MONTH" ? [`CALENDAR_YEAR(${spec.groupBy})`, `CALENDAR_MONTH(${spec.groupBy})`] : spec.bucket === "YEAR" ? [`CALENDAR_YEAR(${spec.groupBy})`] : [nameOf(spec.groupBy, types)];
  const then = spec.thenBy ? nameOf(spec.thenBy, types) : null;
  const groupKeys = [...keys, ...(then ? [then] : [])];
  const select = [...keys.map((key, index) => (spec.bucket ? `${key} k${index}` : `${key} g0`)), ...(then ? [`${then} g1`] : [])].join(", ");
  const order = spec.bucket ? groupKeys.join(", ") : `${measure} DESC`;
  // D-201: a sum or average also carries the record count per group.
  const count = spec.aggregate === "COUNT" ? "" : ", COUNT(Id) n";
  return `SELECT ${select}, ${measure} v${count} FROM ${spec.object}${where(spec, allowed, ownerId, types)} WITH USER_MODE GROUP BY ${groupKeys.join(", ")} ORDER BY ${order} LIMIT ${MAX_ROWS}`;
}

export async function groupSalesforce(input: GroupSpec, context: QueryContext): Promise<{ groups: { group: string; then?: string; value: number; count?: number }[]; total: number; scope: string }> {
  const spec = await resolveNames(input, context, ["groupBy", "thenBy", "field"]);
  const allowlist = await allowlistFor(spec.object, context);
  const soql = buildGroup(spec, allowlist, await ownerFor(context), await typesFor(spec.object, context));
  const result = (await salesforceGet(queryPath(soql), context.fetchImpl, context.signal)) as { records?: Record<string, unknown>[] };
  const text = (value: unknown) => (value === null || value === undefined || value === "" ? "(blank)" : String(value));
  const label = (record: Record<string, unknown>) => {
    if (spec.bucket === "MONTH") return `${String(record.k0)}-${String(record.k1).padStart(2, "0")}`;
    if (spec.bucket === "YEAR") return String(record.k0);
    return text(record.g0);
  };
  const groups = (result.records ?? []).slice(0, MAX_ROWS).map((record) => ({
    group: label(record),
    ...(spec.thenBy ? { then: text(record.g1) } : {}),
    value: Number(record.v ?? 0),
    ...(spec.aggregate === "COUNT" ? {} : { count: Number(record.n ?? 0) }),
  }));
  // The overall total, so the model doesn't have to add the groups up itself.
  const total = Math.round(groups.reduce((sum, item) => sum + item.value, 0) * 1000) / 1000;
  return { groups, total, scope: context.scope === "OWN" ? "records you own" : "all records you may see" };
}

export { SalesforceUnavailable };
