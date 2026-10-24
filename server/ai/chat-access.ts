import type { ModuleCode } from "@/types/auth";
import { hasModule } from "@/server/modules/modules";

// Pic bot - ai (D-172): which chat modes a person may use right now. Pure.
// Precedence (administrator restrictions always win; a person's choice of
// mode only selects among these, it never adds):
//   nothing at all when the emergency stop is on, the AI switch is off for
//   them, or they lack the AI module; then each mode needs
//   GENERAL      global general chat ON  + the person's GENERAL mode
//   APPROVAL/TASK/INFORMATION  the mode enabled globally + the person's mode + that module
//   SALESFORCE   enabled globally + the person's mode + a Salesforce scope (OWN or ALL) + a live connection
//   COMBINED     global combined ON + the person's COMBINED mode + GENERAL + at least one data mode
// Re-evaluated on every request, so a change applies to open chats at once.
export type ChatMode = "GENERAL" | "APPROVAL" | "TASK" | "INFORMATION" | "SALESFORCE" | "COMBINED";
export type SalesforceScope = "NONE" | "OWN" | "ALL";
export const CHAT_MODES: readonly ChatMode[] = ["GENERAL", "APPROVAL", "TASK", "INFORMATION", "SALESFORCE", "COMBINED"];
export const DATA_MODES: readonly ChatMode[] = ["APPROVAL", "TASK", "INFORMATION", "SALESFORCE"];
export const MODE_LABEL: Record<ChatMode, string> = {
  GENERAL: "General chat",
  APPROVAL: "Approvals",
  TASK: "Tasks",
  INFORMATION: "Information",
  SALESFORCE: "Salesforce data",
  COMBINED: "Combined",
};
export const MODE_HELP: Record<ChatMode, string> = {
  GENERAL: "General questions, writing and reasoning. No ARS or Salesforce data.",
  APPROVAL: "Your approvals and requests only.",
  TASK: "Your tasks only.",
  INFORMATION: "Your information inbox only.",
  SALESFORCE: "Salesforce records you're allowed to see, read-only.",
  COMBINED: "Your permitted data together with general answers.",
};
export const DEFAULT_CHAT_MODES: readonly ChatMode[] = ["APPROVAL", "TASK", "INFORMATION"];
const MODE_MODULE: Partial<Record<ChatMode, ModuleCode>> = { APPROVAL: "APPROVAL", TASK: "TASK", INFORMATION: "INFORMATION" };

export interface ChatPolicy {
  emergencyStop: boolean;
  aiFeatureOn: boolean; // features.ai for this person
  generalChat: boolean;
  combinedChat: boolean;
  moduleModes: readonly ChatMode[]; // ai.module_modes
  salesforceConnected: boolean;
}

export interface ChatPerson {
  roles: readonly string[];
  modules: readonly ModuleCode[];
  chatModes: readonly ChatMode[];
  salesforceScope: SalesforceScope;
}

export function effectiveModes(person: ChatPerson, policy: ChatPolicy): ChatMode[] {
  if (policy.emergencyStop || !policy.aiFeatureOn || !hasModule(person, "AI")) return [];
  const wants = (mode: ChatMode) => person.chatModes.includes(mode);
  const out = new Set<ChatMode>();
  if (policy.generalChat && wants("GENERAL")) out.add("GENERAL");
  for (const mode of ["APPROVAL", "TASK", "INFORMATION"] as const) {
    if (policy.moduleModes.includes(mode) && wants(mode) && hasModule(person, MODE_MODULE[mode]!)) out.add(mode);
  }
  if (policy.moduleModes.includes("SALESFORCE") && wants("SALESFORCE") && person.salesforceScope !== "NONE" && policy.salesforceConnected) out.add("SALESFORCE");
  if (policy.combinedChat && wants("COMBINED") && out.has("GENERAL") && DATA_MODES.some((mode) => out.has(mode))) out.add("COMBINED");
  return CHAT_MODES.filter((mode) => out.has(mode));
}

// The data modes a conversation in `mode` may draw on (COMBINED: all the
// person's effective data modes; a single mode: itself).
export function dataModesFor(mode: ChatMode, effective: readonly ChatMode[]): ChatMode[] {
  if (mode === "COMBINED") return DATA_MODES.filter((item) => effective.includes(item));
  return DATA_MODES.includes(mode) && effective.includes(mode) ? [mode] : [];
}

export function parseChatModes(value: string | null | undefined): ChatMode[] {
  const parts = new Set((value ?? "").split(",").map((part) => part.trim()));
  return CHAT_MODES.filter((mode) => parts.has(mode));
}

export function normaliseChatModes(values: readonly string[]): { ok: true; value: ChatMode[] } | { ok: false } {
  if (values.some((value) => !(CHAT_MODES as readonly string[]).includes(value))) return { ok: false };
  const chosen = new Set(values);
  return { ok: true, value: CHAT_MODES.filter((mode) => chosen.has(mode)) };
}

export const isSalesforceScope = (value: unknown): value is SalesforceScope => value === "NONE" || value === "OWN" || value === "ALL";
