import "server-only";
import fs from "node:fs";
import path from "node:path";
import type { RowDataPacket } from "mysql2/promise";
import { getDbPool } from "@/lib/db/client";
import { recordAudit } from "@/lib/db/repositories/audit.repository";
import { logError } from "@/lib/logging/logger";
import { getSettingValue } from "@/server/settings/values";
import { backupDir, backupStatus } from "@/server/ops/backup";
import { checkFolderAccess, deleteFile, getAccessToken, listBackupFiles, parseServiceAccountKey, selectForDeletion, uploadFile, type DriveDeps, type ServiceAccountKey } from "@/server/ops/gdrive";

// DR-08 (owner, 2 Nov 2026): the daily backup is made by the app itself
// (server/ops/backup.ts, the "backup" job step), encrypted with
// BACKUP_ENCRYPTION_KEY, whose copy the owner holds. This step, run right
// after it, copies the newest encrypted file and its .sha256 to the ARS
// Google Drive folder and keeps the newest N there. An unencrypted backup is
// never uploaded. Set up in Super Admin → Settings → Google Drive backup.

export interface DriveBackupConfig {
  key: ServiceAccountKey;
  folderId: string;
  keep: number;
}

// null = switched off. Throws when on but not fully set up.
export async function loadDriveBackupConfig(): Promise<DriveBackupConfig | null> {
  if ((await getSettingValue("backup.gdrive_enabled")) !== "ON") return null;
  return loadDriveSettings();
}

async function loadDriveSettings(): Promise<DriveBackupConfig> {
  const [json, folderId, keep] = await Promise.all([getSettingValue("backup.gdrive_service_account_json"), getSettingValue("backup.gdrive_folder_id"), getSettingValue("backup.gdrive_keep")]);
  if (!json || !folderId) throw new Error("Google Drive backup isn't fully set up (the service-account key and the folder id are both needed).");
  return { key: parseServiceAccountKey(json), folderId, keep: Math.min(Math.max(Number(keep) || 14, 1), 90) };
}

// The daily gate: this file was already copied by an earlier run.
async function alreadyCopied(file: string): Promise<boolean> {
  const [rows] = await getDbPool().query<RowDataPacket[]>(
    `SELECT 1 FROM job_runs WHERE job_key = 'driveBackup' AND status = 'OK'
       AND JSON_UNQUOTE(JSON_EXTRACT(counts_json, '$.file')) = ? LIMIT 1`,
    [file],
  );
  return rows.length > 0;
}

export type DriveBackupResult = { driveBackup: "OFF" | "NO_BACKUP" | "NOT_DUE" | "DONE" | "FAILED"; file?: string; uploaded?: number; deleted?: number; driveBackupError?: string };

export async function copyBackupToDrive(file: string, config: DriveBackupConfig, deps: DriveDeps = { fetch }): Promise<{ uploaded: number; deleted: number }> {
  // Never upload unencrypted data.
  if (!file.endsWith(".enc")) throw new Error("Only encrypted backups go to Google Drive: set BACKUP_ENCRYPTION_KEY first.");
  const token = await getAccessToken(config.key, deps);
  const existing = await listBackupFiles(token, config.folderId, deps);
  const names = new Set(existing.map((item) => item.name));
  let uploaded = 0;
  const made = [...existing];
  for (const local of [file, `${file}.sha256`]) {
    const name = path.basename(local);
    if (!fs.existsSync(local) || names.has(name)) continue;
    const id = await uploadFile(token, config.folderId, name, fs.readFileSync(local), deps);
    made.push({ id, name });
    uploaded += 1;
  }
  let deleted = 0;
  for (const old of selectForDeletion(made, config.keep)) {
    if (!old.id) continue;
    await deleteFile(token, old.id, deps);
    deleted += 1;
  }
  return { uploaded, deleted };
}

export async function runDriveBackupStep(): Promise<DriveBackupResult> {
  let config: DriveBackupConfig | null;
  try {
    config = await loadDriveBackupConfig();
  } catch (error) {
    return { driveBackup: "FAILED", driveBackupError: error instanceof Error ? error.message.slice(0, 300) : "Failed" };
  }
  if (!config) return { driveBackup: "OFF" };
  const latest = backupStatus().latest;
  if (!latest) return { driveBackup: "NO_BACKUP" };
  if (await alreadyCopied(latest.name)) return { driveBackup: "NOT_DUE", file: latest.name };
  try {
    const result = await copyBackupToDrive(path.join(backupDir(), latest.name), config);
    await recordAudit({ actorUserId: null, action: "BACKUP_COPIED_TO_DRIVE", entityType: "BACKUP", entityId: latest.name.slice(0, 64), metadata: result });
    return { driveBackup: "DONE", file: latest.name, ...result };
  } catch (error) {
    logError("Google Drive backup copy failed", error);
    return { driveBackup: "FAILED", file: latest.name, driveBackupError: error instanceof Error ? error.message.slice(0, 300) : "Failed" };
  }
}

// Super Admin → Settings → Test: signs in as the service account and reads
// the folder's details. Uses the saved settings; uploads nothing.
export async function testDriveAccess(deps: DriveDeps = { fetch }): Promise<{ ok: boolean; message: string }> {
  try {
    const config = await loadDriveSettings();
    const token = await getAccessToken(config.key, deps);
    const folder = await checkFolderAccess(token, config.folderId, deps);
    const note = folder.sharedDrive ? "" : " It isn't in a shared drive: a service account has no storage of its own, so uploads to a folder in someone's My Drive may be refused. Use a folder in a shared drive.";
    return { ok: true, message: `Connected as ${config.key.clientEmail}. It can add files to "${folder.name}".${note}` };
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message.slice(0, 300) : "The test failed." };
  }
}
