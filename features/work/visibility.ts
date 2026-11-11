// Who can see a task, in words (catalog S-17 banner). Shared by the task page and its popup.
export function visibilityText(links: readonly { projectName: string }[]): string {
  return links.length
    ? `This task is visible to members of ${links.map((link) => link.projectName).join(", ")}, its people and followers.`
    : "This task is visible to its assignee, its creator, its followers and the managers above the assignee.";
}
