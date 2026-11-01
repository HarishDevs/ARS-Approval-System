// D-259 (owner's Kanban reference): each board column gets a coloured top
// accent, in a fixed order, so neighbouring columns are told apart at a glance
// (the column's name says what it is; colour never carries meaning alone).
const ACCENTS = ["border-t-primary-600", "border-t-warning-600", "border-t-success-600", "border-t-info-600", "border-t-danger-600"];
export const columnAccent = (index: number) => ACCENTS[index % ACCENTS.length]!;

export const initialsOf = (name: string) =>
  name
    .replace(/\(.*?\)/g, "")
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]!.toUpperCase())
    .join("");
