import type { WorkTaskItem } from "@/lib/db/repositories/work.repository";
import type { GridTask } from "@/server/work/grid";

// D-220: a task row for the shared table. `canEdit`: the person may change
// its dates and fields from the table (the server checks again).
export function toGridTask(item: WorkTaskItem, meId: number, canEdit: boolean, sectionId: number | null = item.sectionId, position: number = item.position): GridTask {
  const open = ["OPEN", "IN_PROGRESS", "BLOCKED"].includes(item.status);
  return {
    id: item.id,
    taskNo: item.taskNo,
    title: item.title,
    status: item.status,
    priority: item.priority,
    assigneeId: item.assigneeId,
    assigneeName: item.assigneeName,
    createdBy: item.createdBy,
    createdByName: item.createdByName,
    dueAt: item.dueAt?.toISOString() ?? null,
    startsOn: item.startsOn,
    createdAt: item.createdAt.toISOString(),
    completedAt: item.completedAt?.toISOString() ?? null,
    likes: item.likes,
    comments: item.comments,
    subtasks: item.subtasks,
    isPeriodic: item.isPeriodic,
    isMilestone: item.isMilestone,
    projects: item.projects,
    tags: item.tags.map((tag) => ({ id: tag.id, name: tag.name })),
    followers: item.followers,
    sectionId,
    position,
    // D-222: an ad hoc task's details are its creator's; periodic: editors and the assignee too.
    canEdit: item.isPeriodic ? canEdit || item.assigneeId === meId || item.createdBy === meId : item.createdBy === meId,
    canComplete: (canEdit || item.assigneeId === meId) && (open || item.status === "COMPLETED"),
  };
}
