import crypto from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import { ARS_BACKUP_PROPERTY, buildServiceAccountJwt, checkFolderAccess, getAccessToken, listBackupFiles, parseServiceAccountKey, selectForDeletion, uploadFile } from "@/server/ops/gdrive";

// DR-08 (owner, 2 Nov 2026): the Google Drive copy of the encrypted daily
// backup: the service-account JWT, the token exchange, the folder test and
// which old copies are deleted. fetch is mocked; nothing reaches Google.
const { privateKey, publicKey } = crypto.generateKeyPairSync("rsa", { modulusLength: 2048 });
const pem = privateKey.export({ type: "pkcs8", format: "pem" }).toString();
const keyFile = JSON.stringify({ type: "service_account", client_email: "ars-backup@ars-project.iam.gserviceaccount.com", private_key: pem, token_uri: "https://oauth2.googleapis.com/token" });
const decode = (part: string) => JSON.parse(Buffer.from(part, "base64url").toString("utf8")) as Record<string, unknown>;

describe("Google Drive backup (DR-08)", () => {
  it("reads a service-account key file and refuses anything else", () => {
    expect(parseServiceAccountKey(keyFile)).toMatchObject({ clientEmail: "ars-backup@ars-project.iam.gserviceaccount.com", tokenUri: "https://oauth2.googleapis.com/token" });
    // A key pasted with its newlines escaped still works.
    expect(parseServiceAccountKey(keyFile.replace(/\\n/g, "\\\\n")).privateKey).toBe(pem);
    expect(() => parseServiceAccountKey("not json")).toThrow(/valid JSON/);
    expect(() => parseServiceAccountKey(JSON.stringify({ type: "authorized_user" }))).toThrow(/service-account/);
    expect(() => parseServiceAccountKey(JSON.stringify({ type: "service_account", client_email: "x@gmail.com", private_key: pem }))).toThrow(/client_email/);
  });

  it("builds an RS256 JWT with the right claims, verifiable with the public key", () => {
    const jwt = buildServiceAccountJwt(parseServiceAccountKey(keyFile), new Date("2026-11-02T00:00:00Z"));
    const [header, claims, signature] = jwt.split(".");
    expect(decode(header!)).toEqual({ alg: "RS256", typ: "JWT" });
    expect(decode(claims!)).toEqual({ iss: "ars-backup@ars-project.iam.gserviceaccount.com", scope: "https://www.googleapis.com/auth/drive", aud: "https://oauth2.googleapis.com/token", iat: 1793577600, exp: 1793581200 });
    expect(jwt).not.toMatch(/[=+/]/);
    expect(crypto.verify("RSA-SHA256", Buffer.from(`${header}.${claims}`), publicKey, Buffer.from(signature!, "base64url"))).toBe(true);
  });

  it("exchanges the JWT for an access token and reports a refusal without the key", async () => {
    const key = parseServiceAccountKey(keyFile);
    const ok = vi.fn<(url: string, init: RequestInit) => Promise<Response>>(async () => Response.json({ access_token: "ya29.token" }));
    expect(await getAccessToken(key, { fetch: ok as unknown as typeof fetch, now: () => new Date("2026-11-02T00:00:00Z") })).toBe("ya29.token");
    const body = new URLSearchParams(String(ok.mock.calls[0]![1].body));
    expect(body.get("grant_type")).toBe("urn:ietf:params:oauth:grant-type:jwt-bearer");
    expect(body.get("assertion")!.split(".")).toHaveLength(3);

    const refused = vi.fn(async () => Response.json({ error: "invalid_grant", error_description: "Invalid JWT Signature." }, { status: 400 }));
    const error = await getAccessToken(key, { fetch: refused as unknown as typeof fetch }).catch((caught: Error) => caught);
    expect(String(error)).toMatch(/HTTP 400 \(Invalid JWT Signature\.\)/);
    expect(String(error)).not.toContain("PRIVATE KEY");
  });

  it("the test only reads the folder (GET) and says when it can't add files", async () => {
    const calls: { url: string; init?: RequestInit }[] = [];
    const fetchFolder = (folder: object, status = 200) =>
      vi.fn(async (url: string, init?: RequestInit) => {
        calls.push({ url, init });
        return Response.json(folder, { status });
      }) as unknown as typeof fetch;
    expect(await checkFolderAccess("t", "folder123456", { fetch: fetchFolder({ name: "ARS backups", mimeType: "application/vnd.google-apps.folder", driveId: "d1", capabilities: { canAddChildren: true } }) })).toEqual({ name: "ARS backups", sharedDrive: true });
    expect(calls[0]!.init?.method ?? "GET").toBe("GET");
    await expect(checkFolderAccess("t", "folder123456", { fetch: fetchFolder({ mimeType: "application/vnd.google-apps.folder", capabilities: { canAddChildren: false } }) })).rejects.toThrow(/can't add files/);
    await expect(checkFolderAccess("t", "folder123456", { fetch: fetchFolder({ name: "x.pdf", mimeType: "application/pdf" }) })).rejects.toThrow(/isn't a folder/);
    await expect(checkFolderAccess("t", "folder123456", { fetch: fetchFolder({}, 404) })).rejects.toThrow(/wasn't found/);
  });

  it("uploads with the job's mark into the folder, and lists only marked files", async () => {
    const calls: { url: string; init: RequestInit }[] = [];
    const mock = vi.fn(async (url: string, init: RequestInit) => {
      calls.push({ url, init });
      if (url.includes("uploadType=resumable")) return new Response(null, { status: 200, headers: { location: "https://upload.example/session-1" } });
      if (url === "https://upload.example/session-1") return Response.json({ id: "file-1" });
      return Response.json({ files: [{ id: "a", name: "ars-db-20261101-020000.sql.gz.enc" }] });
    }) as unknown as typeof fetch;
    expect(await uploadFile("t", "folder123456", "ars-db-20261102-020000.sql.gz.enc", Buffer.from("ARSBK1…"), { fetch: mock })).toBe("file-1");
    const metadata = JSON.parse(String(calls[0]!.init.body)) as { parents: string[]; appProperties: Record<string, string> };
    expect(metadata.parents).toEqual(["folder123456"]);
    expect(metadata.appProperties).toEqual({ [ARS_BACKUP_PROPERTY]: "1" });
    expect(calls[1]!.init.method).toBe("PUT");

    expect(await listBackupFiles("t", "folder123456", { fetch: mock })).toEqual([{ id: "a", name: "ars-db-20261101-020000.sql.gz.enc" }]);
    expect(new URL(calls[2]!.url).searchParams.get("q")).toContain("appProperties has { key='arsBackup' and value='1' }");
  });

  it("keeps the newest N backups (with their .sha256) and never touches other files", () => {
    const files = [
      "ars-db-20261029-020000.sql.gz.enc",
      "ars-db-20261029-020000.sql.gz.enc.sha256",
      "ars-db-20261030-020000.sql.gz.enc",
      "ars-db-20261031-020000.sql.gz.enc.sha256",
      "ars-db-20261031-020000.sql.gz.enc",
      "ars-db-20261101-020000.sql.gz.enc",
      "ars-db-20261101-020000.sql.gz.enc.sha256",
      "notes.txt",
      "ars-db-20261001-020000.sql.gz",
    ].map((name, index) => ({ id: String(index), name }));
    expect(selectForDeletion(files, 2).map((file) => file.name)).toEqual(["ars-db-20261029-020000.sql.gz.enc", "ars-db-20261029-020000.sql.gz.enc.sha256", "ars-db-20261030-020000.sql.gz.enc"]);
    expect(selectForDeletion(files, 14)).toEqual([]);
    // At least one copy is always kept.
    expect(selectForDeletion(files, 0).map((file) => file.name)).not.toContain("ars-db-20261101-020000.sql.gz.enc");
  });
});
