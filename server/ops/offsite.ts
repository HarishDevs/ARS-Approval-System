import "server-only";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { getSettingValue } from "@/server/settings/values";

// D-246 (audit OPS-08): after each daily backup, a copy goes off the hosting
// account to S3-compatible storage (AWS S3, Cloudflare R2, Backblaze B2,
// Wasabi…) with a write-only key, configured in Super Admin → Settings →
// Off-site backup. Only encrypted backups leave the server (BACKUP_ENCRYPTION_KEY).

const sha256Hex = (data: string | Buffer) => crypto.createHash("sha256").update(data).digest("hex");
const hmac = (key: Buffer | string, data: string) => crypto.createHmac("sha256", key).update(data).digest();
const encodePath = (pathname: string) => pathname.split("/").map((part) => encodeURIComponent(part).replace(/[!'()*]/g, (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`)).join("/");

// AWS Signature Version 4 (header form). Pure, so it is tested against
// AWS's published example (tests/ops/offsite.test.ts).
export function signV4(input: {
  method: string;
  url: string;
  headers: Record<string, string>;
  payloadHash: string;
  region: string;
  service: string;
  accessKeyId: string;
  secretAccessKey: string;
  now: Date;
}): Record<string, string> {
  const url = new URL(input.url);
  const amzDate = input.now.toISOString().replace(/[:-]|\.\d{3}/g, "");
  const day = amzDate.slice(0, 8);
  const headers: Record<string, string> = { ...Object.fromEntries(Object.entries(input.headers).map(([key, value]) => [key.toLowerCase(), value.trim()])), host: url.host, "x-amz-date": amzDate };
  const names = Object.keys(headers).sort();
  const query = [...url.searchParams.entries()]
    .map(([key, value]) => [encodeURIComponent(key), encodeURIComponent(value)])
    .sort(([a], [b]) => (a! < b! ? -1 : a! > b! ? 1 : 0))
    .map(([key, value]) => `${key}=${value}`)
    .join("&");
  const canonical = [input.method, encodePath(url.pathname) || "/", query, ...names.map((name) => `${name}:${headers[name]}`), "", names.join(";"), input.payloadHash].join("\n");
  const scope = `${day}/${input.region}/${input.service}/aws4_request`;
  const toSign = ["AWS4-HMAC-SHA256", amzDate, scope, sha256Hex(canonical)].join("\n");
  const key = hmac(hmac(hmac(hmac(`AWS4${input.secretAccessKey}`, day), input.region), input.service), "aws4_request");
  const signature = crypto.createHmac("sha256", key).update(toSign).digest("hex");
  return { ...headers, authorization: `AWS4-HMAC-SHA256 Credential=${input.accessKeyId}/${scope}, SignedHeaders=${names.join(";")}, Signature=${signature}` };
}

export interface OffsiteConfig {
  endpoint: string; // e.g. https://<account>.r2.cloudflarestorage.com
  region: string;
  bucket: string;
  accessKeyId: string;
  secretAccessKey: string;
}

export async function loadOffsiteConfig(): Promise<OffsiteConfig | null> {
  if ((await getSettingValue("backup.offsite_enabled")) !== "ON") return null;
  const [endpoint, region, bucket, accessKeyId, secretAccessKey] = await Promise.all([
    getSettingValue("backup.s3_endpoint"),
    getSettingValue("backup.s3_region"),
    getSettingValue("backup.s3_bucket"),
    getSettingValue("backup.s3_access_key_id"),
    getSettingValue("backup.s3_secret_access_key"),
  ]);
  if (!endpoint || !bucket || !accessKeyId || !secretAccessKey) throw new Error("Off-site backup is on but not fully set up (endpoint, bucket, access key ID and secret are all needed).");
  return { endpoint: endpoint.replace(/\/+$/, ""), region: region || "auto", bucket, accessKeyId, secretAccessKey };
}

// PUT the backup and its .sha256 (path-style addressing works with every
// S3-compatible service). Throws with the provider's status on failure.
export async function uploadOffsite(file: string, config: OffsiteConfig, deps: { fetch: typeof fetch; now?: () => Date } = { fetch }): Promise<{ uploaded: string[] }> {
  if (!file.endsWith(".enc")) throw new Error("Only encrypted backups go off-site: set BACKUP_ENCRYPTION_KEY first.");
  const uploaded: string[] = [];
  for (const local of [file, `${file}.sha256`]) {
    if (!fs.existsSync(local)) continue;
    const body = fs.readFileSync(local);
    const name = path.basename(local);
    const url = `${config.endpoint}/${config.bucket}/${name}`;
    const payloadHash = sha256Hex(body);
    const headers = signV4({
      method: "PUT",
      url,
      headers: { "content-type": "application/octet-stream", "x-amz-content-sha256": payloadHash },
      payloadHash,
      region: config.region,
      service: "s3",
      accessKeyId: config.accessKeyId,
      secretAccessKey: config.secretAccessKey,
      now: deps.now?.() ?? new Date(),
    });
    delete headers.host; // fetch sets it
    const response = await deps.fetch(url, { method: "PUT", headers, body, signal: AbortSignal.timeout(120_000) });
    if (!response.ok) throw new Error(`Off-site upload of ${name} refused: HTTP ${response.status}`);
    uploaded.push(name);
  }
  return { uploaded };
}
