// Drafts (#3, D-108): pure rules, unit-tested. A draft is what someone typed
// into the raise-a-request form (or the custom approval form) and hasn't
// submitted yet. It never creates a request and never tells anyone.

export const DRAFT_DAYS = 30;
const MAX_FIELDS = 80;
const MAX_VALUE = 5000;
const MAX_SPEC = 64_000;

// WF:<workflowId> for a predefined type, CUSTOM for a custom approval.
export type DraftKey = { kind: "WORKFLOW"; workflowId: number; key: string } | { kind: "CUSTOM"; key: "CUSTOM" };

export function parseDraftKey(key: unknown): DraftKey | null {
  if (key === "CUSTOM") return { kind: "CUSTOM", key: "CUSTOM" };
  if (typeof key === "string" && /^WF:\d{1,10}$/.test(key)) return { kind: "WORKFLOW", workflowId: Number(key.slice(3)), key };
  return null;
}

export interface DraftContent {
  title: string;
  fields: Record<string, string>;
}

// Only plain text values under limits; files, ids and keys used by the form
// machinery are never stored. Returns null when the content isn't acceptable.
const RESERVED = new Set(["workflowId", "requestId", "submissionKey", "attachments", "allowDuplicate", "title"]);

export function cleanDraftContent(input: { title?: unknown; fields?: unknown }): DraftContent | null {
  const title = typeof input.title === "string" ? input.title.slice(0, 200) : "";
  if (!input.fields || typeof input.fields !== "object" || Array.isArray(input.fields)) return null;
  const fields: Record<string, string> = {};
  const entries = Object.entries(input.fields as Record<string, unknown>);
  if (entries.length > MAX_FIELDS) return null;
  for (const [key, value] of entries) {
    if (RESERVED.has(key) || key.startsWith("$") || !/^[A-Za-z][A-Za-z0-9_]{0,59}$/.test(key)) continue;
    if (typeof value !== "string") continue;
    const limit = key === "spec" ? MAX_SPEC : MAX_VALUE;
    if (value.length > limit) return null;
    fields[key] = value;
  }
  return { title, fields };
}

// Something worth keeping: a title or any filled-in value.
export function isEmptyDraft(content: DraftContent): boolean {
  return !content.title.trim() && Object.entries(content.fields).every(([key, value]) => key === "spec" || !value.trim());
}
