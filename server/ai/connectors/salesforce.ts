import "server-only";
import { finishSyncRun, lastGoodCheckpoint, startSyncRun, upsertSourceRecords } from "@/lib/db/repositories/ai.repository";
import { getSettingValue } from "@/server/settings/values";
import { redactSecrets } from "@/server/ai/providers";
import { logError } from "@/lib/logging/logger";
import { API_VERSION as SF_API, salesforceGet } from "@/server/ai/connectors/salesforce-auth";
import { getConnection } from "@/lib/db/repositories/salesforce.repository";

// D-169 Phase 6, D-172: the optional hourly COPY of Salesforce objects (for
// the dashboard), READ-ONLY, through the one OAuth connection
// (salesforce-auth.ts). Objects and fields are the Super Admin's allowlist;
// off unless "Also copy those objects hourly" is ON. Live questions don't use
// the copy (salesforce-query.ts queries Salesforce directly).
// Each object is copied page by page (nextRecordsUrl), incrementally from the
// last SUCCESSFUL run's SystemModstamp, and stored by its Salesforce Id, so a
// repeat never duplicates. A failed run keeps the last good copy and checkpoint.
// Not yet tested against a real org: needs the owner's approved sandbox.
export const SALESFORCE_KEY = "salesforce";
const API_VERSION = SF_API;
const MAX_PAGES = 200; // about 400,000 records per object per run
const NAME = /^[A-Za-z][A-Za-z0-9_]{0,79}$/; // object and field API names (custom ones end in __c)

export interface ObjectSpec {
  object: string;
  fields: string[];
}

// "Account:Name,Industry;Opportunity:Name,Amount" → specs. Id and SystemModstamp
// are always added. Names are checked again here, so nothing can reach the query.
export function parseObjects(value: string | null): ObjectSpec[] {
  if (!value) return [];
  return value
    .split(";")
    .map((part) => part.trim())
    .filter(Boolean)
    .map((part) => {
      const [object, fieldList = ""] = part.split(":");
      const fields = fieldList.split(",").map((field) => field.trim()).filter(Boolean);
      if (!NAME.test(object ?? "") || !fields.every((field) => NAME.test(field))) throw new Error(`Invalid Salesforce object or field in "${part.slice(0, 60)}".`);
      return { object: object!, fields: [...new Set(["Id", "SystemModstamp", ...fields])] };
    });
}

// The SOQL for one object: only listed fields, only records changed after the
// checkpoint (an ISO date-time we wrote ourselves, checked by pattern).
export function soqlFor(spec: ObjectSpec, checkpoint: string | null): string {
  const since = checkpoint && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{3})?Z$/.test(checkpoint) ? ` WHERE SystemModstamp > ${checkpoint}` : "";
  return `SELECT ${spec.fields.join(", ")} FROM ${spec.object}${since} ORDER BY SystemModstamp ASC`;
}

export interface SalesforceConfig {
  objects: ObjectSpec[];
}

// Set up = connected, an allowlist, and the hourly copy switched on.
export async function loadSalesforceConfig(): Promise<SalesforceConfig | null> {
  const [copy, objects, connection] = await Promise.all([getSettingValue("ai.salesforce.copy_hourly"), getSettingValue("ai.salesforce.objects"), getConnection()]);
  // "*" (D-175) is for live questions only; the hourly copy needs a fixed list.
  if (copy !== "ON" || !objects || objects.trim() === "*" || connection.status !== "CONNECTED") return null;
  return { objects: parseObjects(objects) };
}

type Fetched = { records: { id: string; modifiedAt: string | null; data: Record<string, unknown> }[]; latest: string | null; pages: number };

// Reads every page of one query. Throws (and saves nothing) if any page fails,
// so a partial result is never mistaken for a complete one.
export async function fetchAll(get: (path: string) => Promise<unknown>, soql: string): Promise<Fetched> {
  const records: Fetched["records"] = [];
  let latest: string | null = null;
  let next: string | null = `/services/data/${API_VERSION}/query?q=${encodeURIComponent(soql)}`;
  let pages = 0;
  while (next) {
    if (++pages > MAX_PAGES) throw new Error(`Stopped after ${MAX_PAGES} pages; narrow the object list or fields.`);
    if (!next.startsWith("/services/data/")) throw new Error("Unexpected next-page address from Salesforce.");
    const page = (await get(next)) as { records?: Record<string, unknown>[]; nextRecordsUrl?: string; done?: boolean };
    for (const record of page.records ?? []) {
      const id = typeof record.Id === "string" ? record.Id : null;
      if (!id) continue;
      const modifiedAt = typeof record.SystemModstamp === "string" ? record.SystemModstamp : null;
      if (modifiedAt && (!latest || modifiedAt > latest)) latest = modifiedAt;
      const data = Object.fromEntries(Object.entries(record).filter(([key]) => key !== "attributes"));
      records.push({ id, modifiedAt, data });
    }
    next = page.done === false && page.nextRecordsUrl ? page.nextRecordsUrl : null;
  }
  return { records, latest, pages };
}

const isoCheckpoint = (value: string | null) => (value ? new Date(value).toISOString() : null);

export interface SyncSummary {
  ok: boolean;
  message: string;
  datasets: { dataset: string; ok: boolean; rows: number; error?: string }[];
}

// One sync of every listed object. Each object is its own run: one failing
// doesn't stop the others, and never moves its checkpoint.
export async function syncSalesforce(startedBy: number | null, fetchImpl: typeof fetch = fetch): Promise<SyncSummary> {
  let config: SalesforceConfig | null;
  try {
    config = await loadSalesforceConfig();
  } catch (error) {
    return { ok: false, message: (error as Error).message, datasets: [] };
  }
  if (!config) return { ok: false, message: "The hourly copy isn't set up: connect Salesforce, list the objects, and switch the copy ON in AI settings.", datasets: [] };
  const get = (path: string) => salesforceGet(path, fetchImpl);
  const datasets: SyncSummary["datasets"] = [];
  for (const spec of config.objects) {
    const checkpoint = await lastGoodCheckpoint(SALESFORCE_KEY, spec.object);
    const runId = await startSyncRun(SALESFORCE_KEY, spec.object, checkpoint, startedBy);
    try {
      const fetched = await fetchAll(get, soqlFor(spec, checkpoint));
      for (let index = 0; index < fetched.records.length; index += 500) await upsertSourceRecords(SALESFORCE_KEY, spec.object, fetched.records.slice(index, index + 500));
      await finishSyncRun(runId, { status: "SUCCEEDED", rowsFetched: fetched.records.length, checkpointOut: isoCheckpoint(fetched.latest) ?? checkpoint, error: null });
      datasets.push({ dataset: spec.object, ok: true, rows: fetched.records.length });
    } catch (error) {
      const message = redactSecrets((error as Error).message ?? "Sync failed.");
      logError("salesforce sync failed", error, { object: spec.object });
      await finishSyncRun(runId, { status: "FAILED", rowsFetched: 0, checkpointOut: null, error: message });
      datasets.push({ dataset: spec.object, ok: false, rows: 0, error: message });
    }
  }
  const failed = datasets.filter((item) => !item.ok).length;
  return { ok: failed === 0, message: failed ? `${failed} of ${datasets.length} objects failed; their last good copy is kept.` : `Synced ${datasets.length} object${datasets.length === 1 ? "" : "s"}.`, datasets };
}
