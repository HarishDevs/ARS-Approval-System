import "server-only";
import type { TaskRecord } from "@/lib/db/repositories/tasks.repository";
import { listPeopleFacts } from "@/lib/db/repositories/tasks.repository";
import { personLabel } from "@/lib/people/label";
import { assignGroup, ancestors, fieldValues, likesOf, listComments, listDependencies, listFollowers, listProjectFields, listSections, listSubtasks, listTaskItems, listTaskProjects, listVisibleProjects } from "@/lib/db/repositories/work.repository";
import { OPEN_STATUSES } from "@/server/modules/task-rules";
import { indiaDateTimeText } from "@/server/modules/settings";
import { loadSetting } from "@/server/work/holiday-store";
import { parseRecurrenceSettings, RECURRENCE_SETTINGS_KEY } from "@/server/work/more-rules";
import { recurrenceOf } from "@/server/work/service-more";
import { rightsOn, workViewer } from "@/server/work/task-access";
import type { PanelData } from "@/features/work/TaskWorkPanel";
import type { CommentView } from "@/features/work/CommentThread";

// D-215 / D-219: everything the task page and the task panel show beside the
// task's own details (projects, subtasks, waiting for, tags, followers,
// likes, repeat, fields, comments), with what the person may do.
export async function taskWorkView(task: TaskRecord, user: { id: number; roles: readonly string[] }) {
  const viewer = await workViewer(user);
  const [rights, chain, links, subtasks, deps, followers, likes, comments, choices, workItem, people, recurrence, recurrenceSettings, ownValues] = await Promise.all([
    rightsOn(task, viewer),
    ancestors(task.id),
    listTaskProjects(task.id),
    listSubtasks(task.id),
    listDependencies(task.id),
    listFollowers(task.id),
    likesOf("TASK", task.id),
    listComments(task.id, user.id),
    listVisibleProjects(viewer),
    listTaskItems(["t.id = ?"], [task.id], "t.id", 1),
    listPeopleFacts(),
    recurrenceOf(task.id),
    loadSetting(RECURRENCE_SETTINGS_KEY).then(parseRecurrenceSettings),
    fieldValues([task.id]),
  ]);
  const [linkSections, linkFields] = await Promise.all([Promise.all(links.map((link) => listSections(link.projectId))), Promise.all(links.map((link) => listProjectFields(link.projectId)))]);
  const panel: PanelData = {
    taskId: task.id,
    taskNo: task.taskNo,
    title: task.title,
    open: OPEN_STATUSES.includes(task.status),
    isMilestone: task.isMilestone,
    startsOn: task.startsOn ?? "",
    meId: user.id,
    canEdit: rights.edit,
    // D-222: planning (dates, tags, waiting for, fields, repeat) and details (milestone…) per the ad hoc rule.
    canProgress: rights.planning,
    canDetails: rights.details,
    adhoc: rights.adhoc,
    canComment: rights.comment,
    deleted: Boolean(task.deletedAt),
    parent: chain.at(-1) ?? null,
    links: links.map((link, index) => ({ projectId: link.projectId, projectName: link.projectName, color: link.color, sectionId: link.sectionId, sections: linkSections[index]!.map((section) => ({ id: section.id, name: section.name })) })),
    projectChoices: choices.map((project) => ({ id: project.id, name: project.name })),
    subtasks: subtasks.map((item) => ({ id: item.id, title: item.title, status: item.status, assigneeName: item.assigneeName, dueAt: item.dueAt?.toISOString() ?? null, subtasks: item.subtasks })),
    blockedBy: deps.blockedBy,
    blocking: deps.blocking,
    tags: workItem.items[0]?.tags.map((tag) => ({ id: tag.id, name: tag.name })) ?? [],
    followers,
    // v1.52.1: pickers show "Name - code" with the department; mentions keep the name.
    people: people.map((person) => ({ id: person.id, label: personLabel(person), detail: person.departmentName ?? undefined, name: person.name })),
    likes,
    nowIso: new Date().toISOString(),
    recurrence,
    recurrenceOn: recurrenceSettings.enabled,
    fields: links.map((link, index) => ({ projectId: link.projectId, fields: linkFields[index]!.map((field) => ({ id: field.id, name: field.name, kind: field.kind, options: field.options })), values: ownValues.get(task.id) ?? {} })),
  };
  const commentViews: CommentView[] = comments.map((comment) => ({
    id: comment.id,
    parentCommentId: comment.parentCommentId,
    authorId: comment.authorId,
    authorName: comment.authorName,
    body: comment.body,
    isPinned: comment.isPinned,
    edited: comment.editedAt !== null,
    deleted: comment.deletedAt !== null,
    when: indiaDateTimeText(comment.createdAt),
    likes: comment.likes,
    likedByMe: comment.likedByMe,
  }));
  // D-222: the other people an ad hoc task was given to (their own copies).
  const group = await assignGroup(task.id);
  return { panel, comments: commentViews, rights, chain, links, viewer, people, group };
}
