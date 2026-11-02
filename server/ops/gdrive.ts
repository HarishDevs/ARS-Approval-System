import crypto from "node:crypto";

// DR-08 (owner, 2 Nov 2026): an encrypted copy of each daily backup goes to
// an ARS Google Drive folder, uploaded by a Google service account through
// the Drive v3 REST API. No Google library: the service account's JWT is
// signed here (RS256 with node:crypto) and exchanged for an access token.
// Pure apart from the fetch it is given (tests/ops/gdrive.test.ts).

export const DRIVE_SCOPE = "https://www.googleapis.com/auth/drive";
const DEFAULT_TOKEN_URI = "https://oauth2.googleapis.com/token";
const DRIVE_API = "https://www.googleapis.com/drive/v3";
const DRIVE_UPLOAD = "https://www.googleapis.com/upload/drive/v3";
// Marks the files this job made, so it only ever deletes its own.
export const ARS_BACKUP_PROPERTY = "arsBackup";
const BACKUP_FILE = /^(ars-db-\d{8}-\d{6}\.sql\.gz\.enc)(\.sha256)?$/;

export interface ServiceAccountKey {
  clientEmail: string;
  privateKey: string;
  tokenUri: string;
}

// The JSON key file Google gives for a service account. Only the three
// fields used are kept; the key itself never leaves the server.
export function parseServiceAccountKey(json: string): ServiceAccountKey {
  let value: Record<string, unknown>;
  try {
    value = JSON.parse(json) as Record<string, unknown>;
  } catch {
    throw new Error("The service-account key isn't valid JSON. Paste the whole key file.");
  }
  if (value.type !== "service_account") throw new Error('The key file must be a service-account key ("type": "service_account").');
  const clientEmail = typeof value.client_email === "string" ? value.client_email.trim() : "";
  const privateKey = typeof value.private_key === "string" ? value.private_key.replace(/\\n/g, "\n") : "";
  if (!/^[^@\s]+@[^@\s]+\.iam\.gserviceaccount\.com$/.test(clientEmail)) throw new Error("The key file has no service-account email (client_email).");
  if (!privateKey.includes("PRIVATE KEY")) throw new Error("The key file has no private key (private_key).");
  const tokenUri = typeof value.token_uri === "string" && value.token_uri.startsWith("https://") ? value.token_uri : DEFAULT_TOKEN_URI;
  return { clientEmail, privateKey, tokenUri };
}

const base64url = (input: Buffer | string) => Buffer.from(input).toString("base64").replace(/=+$/, "").replace(/\+/g, "-").replace(/\//g, "_");

// The signed assertion for Google's OAuth 2.0 service-account flow (RFC 7523).
export function buildServiceAccountJwt(key: ServiceAccountKey, now: Date, scope = DRIVE_SCOPE): string {
  const iat = Math.floor(now.getTime() / 1000);
  const header = base64url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const claims = base64url(JSON.stringify({ iss: key.clientEmail, scope, aud: key.tokenUri, iat, exp: iat + 3600 }));
  const signature = crypto.sign("RSA-SHA256", Buffer.from(`${header}.${claims}`), key.privateKey);
  return `${header}.${claims}.${base64url(signature)}`;
}

export interface DriveDeps {
  fetch: typeof fetch;
  now?: () => Date;
}

async function failure(response: Response, what: string): Promise<Error> {
  // Google's error message only (no request body, no token).
  const detail = await response
    .json()
    .then((body: { error?: { message?: string } | string; error_description?: string }) => (typeof body.error === "string" ? body.error_description ?? body.error : body.error?.message) ?? "")
    .catch(() => "");
  return new Error(`${what}: HTTP ${response.status}${detail ? ` (${String(detail).slice(0, 200)})` : ""}`);
}

export async function getAccessToken(key: ServiceAccountKey, deps: DriveDeps): Promise<string> {
  const assertion = buildServiceAccountJwt(key, deps.now?.() ?? new Date());
  const response = await deps.fetch(key.tokenUri, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer", assertion }).toString(),
    signal: AbortSignal.timeout(30_000),
  });
  if (!response.ok) throw await failure(response, "Google refused the service-account key");
  const body = (await response.json()) as { access_token?: string };
  if (!body.access_token) throw new Error("Google sent no access token.");
  return body.access_token;
}

// Test: may this service account add files to the folder? Reads the
// folder's details only; nothing is uploaded.
export async function checkFolderAccess(token: string, folderId: string, deps: DriveDeps): Promise<{ name: string; sharedDrive: boolean }> {
  const url = `${DRIVE_API}/files/${encodeURIComponent(folderId)}?fields=id,name,mimeType,driveId,capabilities(canAddChildren)&supportsAllDrives=true`;
  const response = await deps.fetch(url, { headers: { authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(30_000) });
  if (response.status === 404) throw new Error("The folder wasn't found, or isn't shared with the service account.");
  if (!response.ok) throw await failure(response, "Couldn't read the folder");
  const folder = (await response.json()) as { name?: string; mimeType?: string; driveId?: string; capabilities?: { canAddChildren?: boolean } };
  if (folder.mimeType !== "application/vnd.google-apps.folder") throw new Error("That id isn't a folder.");
  if (!folder.capabilities?.canAddChildren) throw new Error("The service account can't add files to this folder. Give it Content manager (shared drive) or Editor access.");
  return { name: folder.name ?? folderId, sharedDrive: Boolean(folder.driveId) };
}

export interface DriveFile {
  id: string;
  name: string;
}

// The backup files this job made in the folder (marked with appProperties).
export async function listBackupFiles(token: string, folderId: string, deps: DriveDeps): Promise<DriveFile[]> {
  const files: DriveFile[] = [];
  let pageToken: string | undefined;
  do {
    const q = `'${folderId.replace(/['\\]/g, "")}' in parents and appProperties has { key='${ARS_BACKUP_PROPERTY}' and value='1' } and trashed=false`;
    const params = new URLSearchParams({ q, fields: "nextPageToken,files(id,name)", pageSize: "1000", supportsAllDrives: "true", includeItemsFromAllDrives: "true" });
    if (pageToken) params.set("pageToken", pageToken);
    const response = await deps.fetch(`${DRIVE_API}/files?${params.toString()}`, { headers: { authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(30_000) });
    if (!response.ok) throw await failure(response, "Couldn't list the Drive folder");
    const body = (await response.json()) as { files?: DriveFile[]; nextPageToken?: string };
    files.push(...(body.files ?? []));
    pageToken = body.nextPageToken;
  } while (pageToken);
  return files;
}

// Resumable upload in one request (no 5 MB limit like a multipart upload).
export async function uploadFile(token: string, folderId: string, name: string, body: Buffer, deps: DriveDeps): Promise<string> {
  const start = await deps.fetch(`${DRIVE_UPLOAD}/files?uploadType=resumable&supportsAllDrives=true&fields=id`, {
    method: "POST",
    headers: { authorization: `Bearer ${token}`, "content-type": "application/json; charset=UTF-8", "x-upload-content-type": "application/octet-stream", "x-upload-content-length": String(body.length) },
    body: JSON.stringify({ name, parents: [folderId], mimeType: "application/octet-stream", appProperties: { [ARS_BACKUP_PROPERTY]: "1" } }),
    signal: AbortSignal.timeout(30_000),
  });
  if (!start.ok) throw await failure(start, `Drive refused the upload of ${name}`);
  const location = start.headers.get("location");
  if (!location) throw new Error("Drive gave no upload address.");
  const put = await deps.fetch(location, { method: "PUT", headers: { "content-type": "application/octet-stream" }, body, signal: AbortSignal.timeout(600_000) });
  if (!put.ok) throw await failure(put, `Drive refused the upload of ${name}`);
  const created = (await put.json().catch(() => ({}))) as { id?: string };
  return created.id ?? "";
}

// In a shared drive only a Manager may delete for good; a Content manager (the
// role the setup asks for) may move to the drive's trash, which Google empties
// after 30 days. So old copies go to the trash.
export async function deleteFile(token: string, fileId: string, deps: DriveDeps): Promise<void> {
  const response = await deps.fetch(`${DRIVE_API}/files/${encodeURIComponent(fileId)}?supportsAllDrives=true`, {
    method: "PATCH",
    headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
    body: JSON.stringify({ trashed: true }),
    signal: AbortSignal.timeout(30_000),
  });
  if (!response.ok && response.status !== 404) throw await failure(response, "Couldn't delete an old backup from Drive");
}

// Which of this job's files to delete: everything but the newest `keep`
// backups (a backup and its .sha256 count as one). Names carry the time
// (ars-db-YYYYMMDD-HHMMSS), so name order is time order. Files whose name
// isn't a backup's are left alone.
export function selectForDeletion(files: readonly DriveFile[], keep: number): DriveFile[] {
  const backups = [...new Set(files.map((file) => BACKUP_FILE.exec(file.name)?.[1]).filter((name): name is string => Boolean(name)))].sort().reverse();
  const kept = new Set(backups.slice(0, Math.max(1, Math.floor(keep))));
  return files.filter((file) => {
    const backup = BACKUP_FILE.exec(file.name)?.[1];
    return backup !== undefined && !kept.has(backup);
  });
}
