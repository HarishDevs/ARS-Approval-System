import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { getDbPool } from "@/lib/db/client";
import { deleteApprovalTemplate, findApprovalTemplate, listApprovalTemplates, renameApprovalTemplate, saveApprovalTemplate } from "@/lib/db/repositories/approval-templates.repository";
import { loadDirectorySnapshot, toDirectory } from "@/lib/db/repositories/directory.repository";
import { previewRoute } from "@/server/approvals/route-preview";
import type { BuilderStage } from "@/server/workflows/builder";
import { createUser } from "./helpers";

// v1.54.0 (owner, D-309): a person's own approval templates (levels only),
// and the review's "who approves each level".
let owner: number;
let other: number;
let manager: number;
let named: number;
const stages = (people: number[]): BuilderStage[] =>
  [
    { kind: "STEP", step: { id: "mgr", label: "Manager", approvers: { kind: "REQUESTER_MANAGER" }, rule: "ALL" } },
    { kind: "STEP", step: { id: "fin", label: "Finance", approvers: { kind: "PEOPLE", userIds: people }, rule: "ALL" } },
  ] as BuilderStage[];

beforeAll(async () => {
  manager = await createUser({ name: "Template manager" });
  named = await createUser({ name: "Finance head" });
  owner = await createUser({ name: "Template owner", managerId: manager });
  other = await createUser({ name: "Someone else" });
});

afterAll(async () => {
  await getDbPool().end();
});

describe("approval templates (D-309)", () => {
  it("are the person's own: saved, listed, renamed, replaced by name and deleted, never seen by others", async () => {
    const saved = await saveApprovalTemplate(owner, "Purchase", stages([named]));
    if (saved === "TOO_MANY") throw new Error("limit");
    expect((await listApprovalTemplates(owner)).map((item) => item.name)).toEqual(["Purchase"]);
    expect(await listApprovalTemplates(other)).toEqual([]);
    expect(await findApprovalTemplate(other, saved.id)).toBeNull();
    expect(await deleteApprovalTemplate(other, saved.id)).toBe(false);
    expect(await renameApprovalTemplate(other, saved.id, "Mine now")).toBe("NOT_FOUND");
    // Saving the same name again replaces its levels.
    const again = await saveApprovalTemplate(owner, "Purchase", stages([named, manager]));
    expect(again).toMatchObject({ id: saved.id, replaced: true });
    const found = await findApprovalTemplate(owner, saved.id);
    expect(JSON.stringify(found?.stages)).toContain(String(manager));
    await saveApprovalTemplate(owner, "Travel", stages([named]));
    expect(await renameApprovalTemplate(owner, saved.id, "Travel")).toBe("DUPLICATE");
    expect(await renameApprovalTemplate(owner, saved.id, "Purchase above 1 lakh")).toBe("OK");
    expect(await deleteApprovalTemplate(owner, saved.id)).toBe(true);
    expect((await listApprovalTemplates(owner)).map((item) => item.name)).toEqual(["Travel"]);
  });

  it("the review names who each level goes to: the reporting manager by rule, chosen people by name", async () => {
    const directory = toDirectory(await loadDirectorySnapshot());
    const preview = previewRoute(stages([named]), owner, directory, (id) => `#${id}`);
    expect(preview.mgr).toEqual({ names: [`#${manager}`], note: "Your reporting manager" });
    expect(preview.fin).toEqual({ names: [`#${named}`] });
    // Nobody to resolve: said plainly.
    expect(previewRoute(stages([]), other, directory, String).mgr).toEqual({ names: [], note: "Nobody found for your reporting manager yet" });
  });
});
