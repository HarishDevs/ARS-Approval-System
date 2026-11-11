"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireApiArea } from "@/server/authorization/guards";
import { getActionContext } from "@/lib/http/request-context";
import { actOnMeeting, closeOpenPointFor, reviewAction, scheduleMeeting, type ActOnMeetingInput, type MeetingActor, type MomInput, type PointInput } from "@/server/meetings/service";
import { logError } from "@/lib/logging/logger";
import type { ActionResult } from "@/lib/http/action-result";

// v1.51.0 (D-300): Meeting actions. Session and page access are checked
// first; the service checks the meeting rules for this person under a lock.
async function actor(): Promise<MeetingActor | null> {
  try {
    const session = await requireApiArea("users");
    const { ipAddress } = await getActionContext();
    return { id: session.user.id, name: session.user.name, roles: session.user.roles, sessionId: session.sessionId, ipAddress, modules: session.user.modules };
  } catch {
    return null;
  }
}

const text = (formData: FormData, name: string) => {
  const value = formData.get(name);
  return typeof value === "string" ? value : "";
};
const idOf = (value: string) => (/^\d{1,10}$/.test(value) ? Number(value) : null);
const ids = (formData: FormData, name: string) =>
  [
    ...new Set(
      formData
        .getAll(name)
        .filter((value): value is string => typeof value === "string" && /^\d{1,10}$/.test(value))
        .map(Number),
    ),
  ].slice(0, 500);
const idOrNull = (value: unknown) => (typeof value === "number" && Number.isInteger(value) && value > 0 ? value : null);
const strOf = (value: unknown, max: number) => (typeof value === "string" ? value.slice(0, max) : "");

function parseJson(raw: string): unknown {
  if (!raw || raw.length > 500_000) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function parsePoints(raw: string): PointInput[] | null {
  const value = parseJson(raw);
  if (!Array.isArray(value)) return null;
  return (value as Record<string, unknown>[]).slice(0, 100).map((row) => ({ id: idOrNull(row?.id), title: strOf(row?.title, 300), presenterId: idOrNull(row?.presenterId) }));
}

function parseMom(raw: string): MomInput | null {
  const value = parseJson(raw) as Record<string, unknown> | null;
  if (!value || typeof value !== "object") return null;
  const list = (key: string) => (Array.isArray(value[key]) ? (value[key] as Record<string, unknown>[]).slice(0, 500) : []);
  return {
    discussions: list("discussions").flatMap((row) => (idOrNull(row?.pointId) ? [{ pointId: idOrNull(row.pointId)!, text: strOf(row.text, 8000) }] : [])),
    decisions: (Array.isArray(value.decisions) ? (value.decisions as unknown[]) : []).slice(0, 200).map((row) => strOf(row, 1000)),
    actions: list("actions").map((row) => ({
      title: strOf(row?.title, 200),
      description: strOf(row?.description, 2000),
      ownerId: idOrNull(row?.ownerId),
      priority: strOf(row?.priority, 20),
      dueOn: strOf(row?.dueOn, 10),
    })),
    openPoints: list("openPoints").map((row) => ({ text: strOf(row?.text, 1000), ownerId: idOrNull(row?.ownerId), reviewOn: strOf(row?.reviewOn, 10) })),
    timing:
      value.timing && typeof value.timing === "object"
        ? (() => {
            const t = value.timing as Record<string, unknown>;
            return { startedOnTime: t.startedOnTime === true, startTime: strOf(t.startTime, 5), extended: t.extended === true, endTime: strOf(t.endTime, 5), pointsOnTime: t.pointsOnTime === true, momOnTime: t.momOnTime === true };
          })()
        : null,
    attendance: list("attendance").flatMap((row) => (idOrNull(row?.userId) ? [{ userId: idOrNull(row.userId)!, attendance: strOf(row.attendance, 12) }] : [])),
  };
}

export async function scheduleMeetingAction(_previous: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const me = await actor();
  if (!me) return { ok: false, message: "Not found." };
  let saved: { id: number; meetingNo: string };
  const meetingId = idOf(text(formData, "meetingId"));
  try {
    const result = await scheduleMeeting(
      {
        meetingId,
        rowVersion: idOf(text(formData, "rowVersion")),
        parentMeetingId: idOf(text(formData, "parentMeetingId")),
        title: text(formData, "title"),
        description: text(formData, "description"),
        typeId: idOf(text(formData, "typeId")),
        departmentId: ids(formData, "department")[0] ?? null,
        departmentIds: ids(formData, "departments"),
        ownerId: ids(formData, "owner")[0] ?? null,
        coordinatorId: ids(formData, "coordinator")[0] ?? null,
        participantIds: ids(formData, "participants"),
        mode: text(formData, "mode"),
        venue: text(formData, "venue"),
        link: text(formData, "link"),
        priority: text(formData, "priority"),
        confidentiality: text(formData, "confidentiality"),
        guests: text(formData, "guests"),
        start: `${text(formData, "date")}T${text(formData, "startTime")}`,
        end: `${text(formData, "date")}T${text(formData, "endTime")}`,
        agendaDue: text(formData, "agendaDue"),
        momDue: text(formData, "momDue"),
        pointsPolicy: text(formData, "pointsPolicy"),
        points: text(formData, "points").split(/\r?\n/).slice(0, 100),
      },
      me,
    );
    if (!result.ok) return { ok: false, message: result.message, fieldErrors: result.fieldErrors };
    saved = result.value;
  } catch (error) {
    logError("scheduleMeetingAction failed", error);
    return { ok: false, message: "Couldn't save the meeting. Please try again." };
  }
  revalidatePath("/users/meetings");
  redirect(`/users/meetings/${saved.id}?${meetingId ? "updated=1" : "scheduled=1"}`);
}

const ACTIONS: readonly ActOnMeetingInput["action"][] = [
  "RESPOND",
  "CANCEL",
  "ENTER_MOM",
  "SAVE_POINTS",
  "SUBMIT_POINTS",
  "APPROVE_POINTS",
  "RETURN_POINTS",
  "START",
  "END",
  "SAVE_MOM",
  "SUBMIT_MOM",
  "APPROVE_MOM",
  "RETURN_MOM",
  "CLOSE",
];

export async function meetingAction(_previous: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const me = await actor();
  if (!me) return { ok: false, message: "Not found." };
  const meetingId = idOf(text(formData, "meetingId"));
  const action = text(formData, "action") as ActOnMeetingInput["action"];
  if (!meetingId || !ACTIONS.includes(action)) return { ok: false, message: "Not found." };
  try {
    const result = await actOnMeeting(
      {
        meetingId,
        action,
        rowVersion: idOf(text(formData, "rowVersion")),
        remarks: text(formData, "remarks"),
        response: text(formData, "response"),
        points: formData.has("points") ? parsePoints(text(formData, "points")) : null,
        mom: formData.has("mom") ? parseMom(text(formData, "mom")) : null,
        actualStart: text(formData, "actualStart"),
        actualEnd: text(formData, "actualEnd"),
      },
      me,
    );
    if (!result.ok) return { ok: false, message: result.message, fieldErrors: result.fieldErrors };
    revalidatePath(`/users/meetings/${meetingId}`);
    revalidatePath("/users/meetings");
    return { ok: true, message: result.value.message };
  } catch (error) {
    logError("meetingAction failed", error, { action });
    return { ok: false, message: "Couldn't do that. Please try again." };
  }
}

export async function reviewMeetingAction(_previous: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const me = await actor();
  if (!me) return { ok: false, message: "Not found." };
  const actionId = idOf(text(formData, "actionId"));
  const decision = text(formData, "decision");
  if (!actionId || !["CONFIRM", "SEND_BACK", "NOTE"].includes(decision)) return { ok: false, message: "Not found." };
  try {
    const result = await reviewAction({ actionId, decision: decision as "CONFIRM" | "SEND_BACK" | "NOTE", note: text(formData, "note") }, me);
    if (!result.ok) return { ok: false, message: result.message };
    revalidatePath(`/users/meetings/${result.value.meetingId}`);
    revalidatePath("/users/meetings/follow-ups");
    return { ok: true, message: result.value.message };
  } catch (error) {
    logError("reviewMeetingAction failed", error);
    return { ok: false, message: "Couldn't do that. Please try again." };
  }
}

export async function closeOpenPointAction(_previous: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const me = await actor();
  if (!me) return { ok: false, message: "Not found." };
  const pointId = idOf(text(formData, "pointId"));
  if (!pointId) return { ok: false, message: "Not found." };
  try {
    const result = await closeOpenPointFor({ pointId, note: text(formData, "note") }, me);
    if (!result.ok) return { ok: false, message: result.message };
    revalidatePath(`/users/meetings/${result.value.meetingId}`);
    revalidatePath("/users/meetings/follow-ups");
    return { ok: true, message: "Open point closed." };
  } catch (error) {
    logError("closeOpenPointAction failed", error);
    return { ok: false, message: "Couldn't do that. Please try again." };
  }
}
