import { describe, expect, it } from "vitest";
import { explainBackupError } from "@/server/ops/backup";

// v1.6.2: a failed backup says why, in plain words (found on live: the
// container can't create /home/... folders; Private Storage is /private).
describe("explainBackupError", () => {
  it("points at Private Storage for permission and missing-path problems", () => {
    expect(explainBackupError({ code: "EACCES" }, "/app/storage/backups")).toMatch(/isn't allowed to write to the backup folder \/app\/storage\/backups.*\/private\/backups/);
    expect(explainBackupError({ code: "ENOENT" }, "/home/user/ars-approvals-backups")).toMatch(/can't be created.*\/private\/backups/);
    expect(explainBackupError({ code: "ENOSPC" }, "/private/backups")).toMatch(/no space left/);
  });

  it("names a database refusal, and anything else with its code", () => {
    expect(explainBackupError({ code: "ER_SPECIFIC_ACCESS_DENIED_ERROR", sqlMessage: "Access denied; you need the TRIGGER privilege" }, "/d")).toMatch(/database refused.*TRIGGER/);
    expect(explainBackupError(new Error("boom"), "/d")).toMatch(/boom.*Backup folder: \/d/);
  });
});
