import type { AckRule, InfoSettings } from "@/server/modules/settings";

// v1.9.0 (D-143, D-145): the information lifecycle. Pure and unit-tested.
//   DRAFT → PUBLISHED → WITHDRAWN / ARCHIVED; a published one past its
//   expiry date shows as Expired (worked out, not stored).
// Reading is not acknowledging; neither approves or completes anything.
export const INFO_STATUSES = ["DRAFT", "PUBLISHED", "WITHDRAWN", "ARCHIVED"] as const;
export type InfoStatus = (typeof INFO_STATUSES)[number];
export type InfoState = InfoStatus | "EXPIRED";
export const INFO_STATE_LABEL: Record<InfoState, string> = { DRAFT: "Draft", PUBLISHED: "Published", WITHDRAWN: "Withdrawn", ARCHIVED: "Archived", EXPIRED: "Expired" };

// Expired = published, and its expiry date (India) is before today (India).
export function infoState(item: { status: InfoStatus; expiresOn: string | null }, indiaToday: string): InfoState {
  if (item.status === "PUBLISHED" && item.expiresOn && item.expiresOn < indiaToday) return "EXPIRED";
  return item.status;
}

export const INFO_ACTIONS = ["EDIT_DRAFT", "PUBLISH", "DELETE_DRAFT", "EDIT_PUBLISHED", "WITHDRAW", "ARCHIVE", "ACKNOWLEDGE"] as const;
export type InfoAction = (typeof INFO_ACTIONS)[number];

export interface InfoViewer {
  id: number;
  isAdmin: boolean;
  recipient: { readAt: Date | null; acknowledgedAt: Date | null } | null;
}

// The sender, IT, and (once published) the people it was sent to may see it.
export function canSeeInfo(item: { status: InfoStatus; createdBy: number }, viewer: InfoViewer): boolean {
  if (viewer.id === item.createdBy || viewer.isAdmin) return true;
  return item.status !== "DRAFT" && viewer.recipient !== null;
}

export function allowedInfoActions(
  item: { status: InfoStatus; createdBy: number; ackRequired: boolean; expiresOn: string | null },
  viewer: InfoViewer,
  settings: Pick<InfoSettings, "editableAfterPublish">,
  indiaToday: string,
): Set<InfoAction> {
  const actions = new Set<InfoAction>();
  if (!canSeeInfo(item, viewer)) return actions;
  const owner = viewer.id === item.createdBy || viewer.isAdmin;
  const state = infoState(item, indiaToday);
  if (item.status === "DRAFT" && viewer.id === item.createdBy) {
    actions.add("EDIT_DRAFT");
    actions.add("PUBLISH");
    actions.add("DELETE_DRAFT");
  }
  if (owner && state === "PUBLISHED" && settings.editableAfterPublish) actions.add("EDIT_PUBLISHED");
  if (owner && (state === "PUBLISHED" || state === "EXPIRED")) actions.add("WITHDRAW");
  if (owner && item.status !== "DRAFT" && item.status !== "ARCHIVED") actions.add("ARCHIVE");
  if (viewer.recipient && item.ackRequired && !viewer.recipient.acknowledgedAt && state === "PUBLISHED") actions.add("ACKNOWLEDGE");
  return actions;
}

// Does this item ask recipients to acknowledge? (the type decides, or the sender)
export function resolveAck(rule: AckRule, senderAsked: boolean): boolean {
  return rule === "ALWAYS" || (rule === "SENDER_CHOOSES" && senderAsked);
}

// The recipients chosen on the form, checked against what the type allows.
export interface TargetChoice {
  people: number[];
  departments: number[];
  groups: number[];
  everyone: boolean;
}
export function targetProblems(choice: TargetChoice, settings: Pick<InfoSettings, "allowPeople" | "allowDepartments" | "allowGroups" | "allowEveryone">): string[] {
  const problems: string[] = [];
  if (choice.people.length && !settings.allowPeople) problems.push("This type can't be sent to chosen people.");
  if (choice.departments.length && !settings.allowDepartments) problems.push("This type can't be sent to departments.");
  if (choice.groups.length && !settings.allowGroups) problems.push("This type can't be sent to groups.");
  if (choice.everyone && !settings.allowEveryone) problems.push("This type can't be sent to everyone.");
  if (!choice.people.length && !choice.departments.length && !choice.groups.length && !choice.everyone) problems.push("Choose who should receive it.");
  return problems;
}

// Recipients worked out from the chosen targets, with where each came from
// (a person chosen directly wins over a department or group). The sender is
// never a recipient of their own information.
export function resolveRecipients(
  choice: TargetChoice,
  directory: { active: ReadonlyMap<number, { departmentId: number | null }>; groupMembers: ReadonlyMap<number, readonly number[]> },
  senderId: number,
): Map<number, "USER" | "DEPARTMENT" | "GROUP" | "EVERYONE"> {
  const out = new Map<number, "USER" | "DEPARTMENT" | "GROUP" | "EVERYONE">();
  const add = (id: number, source: "USER" | "DEPARTMENT" | "GROUP" | "EVERYONE") => {
    if (id === senderId || !directory.active.has(id) || out.has(id)) return;
    out.set(id, source);
  };
  for (const id of choice.people) add(id, "USER");
  for (const [id, person] of directory.active) if (person.departmentId !== null && choice.departments.includes(person.departmentId)) add(id, "DEPARTMENT");
  for (const group of choice.groups) for (const id of directory.groupMembers.get(group) ?? []) add(id, "GROUP");
  if (choice.everyone) for (const id of directory.active.keys()) add(id, "EVERYONE");
  return out;
}

export const MAX_RECIPIENTS = 5000;
