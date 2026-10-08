import type { TemplateEntry, TemplateVariable } from "@/server/notifications/templates";

// WhatsApp template creator rules (S7, D-076). Pure and unit-tested.
// The Super Admin writes with named placeholders ({{request_no}}); Meta needs
// numbered ones ({{1}}, {{2}}) in order of first use, each with a sample.
export const MAX_BODY = 1024;
export const MAX_FOOTER = 60;

export interface CompiledBody {
  body: string; // with {{1}}, {{2}} …
  variables: TemplateVariable[]; // position = index + 1
  examples: string[];
}

export type CompileResult = { ok: true; value: CompiledBody } | { ok: false; errors: string[] };

const PLACEHOLDER = /\{\{\s*([^{}]*?)\s*\}\}/g;

export function compileNamedBody(text: string, allowed: readonly TemplateVariable[]): CompileResult {
  const errors: string[] = [];
  const body = text.replace(/\r\n/g, "\n").trim();
  if (!body) return { ok: false, errors: ["Write the message first."] };
  const byKey = new Map(allowed.map((variable) => [variable.key, variable]));
  const order: TemplateVariable[] = [];
  const numbered = body.replace(PLACEHOLDER, (match, raw: string) => {
    const key = raw.trim();
    const variable = byKey.get(key);
    if (!variable) {
      errors.push(/^\d+$/.test(key) ? `Use the named placeholders, e.g. {{${allowed[0]?.key ?? "name"}}}, not {{${key}}}.` : `{{${key}}} isn't available for this message.`);
      return match;
    }
    let position = order.indexOf(variable);
    if (position === -1) {
      order.push(variable);
      position = order.length - 1;
    }
    return `{{${position + 1}}}`;
  });
  if (/\{\{|\}\}/.test(numbered.replace(/\{\{\d+\}\}/g, ""))) errors.push("A placeholder isn't closed properly: use {{name}}.");
  if (/^\{\{\d+\}\}/.test(numbered)) errors.push("Meta doesn't allow a message to start with a placeholder; add a word before it.");
  if (/\{\{\d+\}\}$/.test(numbered)) errors.push("Meta doesn't allow a message to end with a placeholder; add a word or a full stop after it.");
  if (/\{\{\d+\}\}\s*\{\{\d+\}\}/.test(numbered)) errors.push("Put some words between two placeholders; Meta refuses them side by side.");
  if (/\n{3,}/.test(numbered)) errors.push("Use at most one empty line in a row.");
  if (numbered.length > MAX_BODY) errors.push(`Keep the message under ${MAX_BODY.toLocaleString("en-IN")} characters (now ${numbered.length.toLocaleString("en-IN")}).`);
  // Meta rejects templates that are mostly placeholders.
  const words = numbered.replace(/\{\{\d+\}\}/g, " ").split(/\s+/).filter(Boolean).length;
  if (order.length > 0 && words < order.length * 2) errors.push("Add more words around the placeholders; Meta rejects messages that are mostly placeholders.");
  if (errors.length) return { ok: false, errors: [...new Set(errors)] };
  return { ok: true, value: { body: numbered, variables: order, examples: order.map((variable) => variable.sample) } };
}

// The catalogue's {{1}} wording turned back into named placeholders, to
// start the editor from.
export function toNamedBody(body: string, variables: readonly TemplateVariable[]): string {
  return body.replace(/\{\{(\d+)\}\}/g, (match, n: string) => {
    const variable = variables[Number(n) - 1];
    return variable ? `{{${variable.key}}}` : match;
  });
}

export function previewNamed(text: string, allowed: readonly TemplateVariable[]): string {
  const byKey = new Map(allowed.map((variable) => [variable.key, variable.sample]));
  return text.replace(PLACEHOLDER, (match, raw: string) => byKey.get(raw.trim()) ?? match);
}

export function checkTemplateName(name: string): string | null {
  if (!/^[a-z0-9_]{1,512}$/.test(name)) return "Use lowercase letters, numbers and _ only (no spaces), e.g. ars_approval_needed_v1.";
  return null;
}

export function checkFooter(footer: string): string | null {
  if (footer.length > MAX_FOOTER) return `Keep the footer under ${MAX_FOOTER} characters.`;
  if (/\{\{/.test(footer)) return "The footer can't have placeholders.";
  return null;
}

// Meta won't take a new definition under an approved or pending name, so
// every new version gets its own: base, base_v2, base_v3 …
export function versionedName(base: string, version: number): string {
  if (version <= 1) return base;
  return `${base.replace(/_v\d+$/, "")}_v${version}`;
}

// Meta's status → what the registry does with it.
export type RegistryOutcome = "APPROVED" | "PENDING" | "REJECTED" | "PAUSED";
export function outcomeOf(metaStatus: string): RegistryOutcome {
  const status = metaStatus.toUpperCase();
  if (status === "APPROVED" || status === "ACTIVE") return "APPROVED";
  if (status === "REJECTED") return "REJECTED";
  if (status === "PAUSED" || status === "DISABLED" || status === "DELETED" || status === "PENDING_DELETION") return "PAUSED";
  return "PENDING";
}

export function defaultDraft(entry: TemplateEntry) {
  return { name: entry.name, category: "UTILITY" as const, body: toNamedBody(entry.body, entry.variables), footer: "" };
}
