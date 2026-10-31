import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";
import { signV4, uploadOffsite } from "@/server/ops/offsite";

// D-246 (audit OPS-08): the off-site copy's request signing (AWS SigV4,
// checked against AWS's published "get-vanilla" example) and upload.
describe("off-site backup", () => {
  it("signs exactly like AWS's published example", () => {
    const headers = signV4({
      method: "GET",
      url: "https://example.amazonaws.com/",
      headers: {},
      payloadHash: "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
      region: "us-east-1",
      service: "service",
      accessKeyId: "AKIDEXAMPLE",
      secretAccessKey: "wJalrXUtnFEMI/K7MDENG+bPxRfiCYEXAMPLEKEY",
      now: new Date("2015-08-30T12:36:00Z"),
    });
    expect(headers.authorization).toBe("AWS4-HMAC-SHA256 Credential=AKIDEXAMPLE/20150830/us-east-1/service/aws4_request, SignedHeaders=host;x-amz-date, Signature=5fa00fa31553b73ebf1942676e86291e8372ff2a2260956d9b8aae1d763fbf31");
  });

  it("uploads the encrypted backup and its hash; refuses an unencrypted one; reports a refusal", async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "ars-offsite-"));
    const file = path.join(dir, "ars-db-20261101-020000.sql.gz.enc");
    fs.writeFileSync(file, Buffer.from("ARSBK1 encrypted"));
    fs.writeFileSync(`${file}.sha256`, "abc  ars-db-20261101-020000.sql.gz.enc\n");
    const config = { endpoint: "https://acct.r2.cloudflarestorage.com", region: "auto", bucket: "ars-backups", accessKeyId: "AKID", secretAccessKey: "secret" };
    const calls: { url: string; init: RequestInit }[] = [];
    const ok = vi.fn(async (url: string, init: RequestInit) => {
      calls.push({ url, init });
      return new Response(null, { status: 200 });
    });
    expect(await uploadOffsite(file, config, { fetch: ok as unknown as typeof fetch })).toEqual({ uploaded: ["ars-db-20261101-020000.sql.gz.enc", "ars-db-20261101-020000.sql.gz.enc.sha256"] });
    expect(calls[0]!.url).toBe("https://acct.r2.cloudflarestorage.com/ars-backups/ars-db-20261101-020000.sql.gz.enc");
    expect((calls[0]!.init.headers as Record<string, string>).authorization).toMatch(/^AWS4-HMAC-SHA256 Credential=AKID\/\d{8}\/auto\/s3\/aws4_request, SignedHeaders=content-type;host;x-amz-content-sha256;x-amz-date, Signature=[0-9a-f]{64}$/);

    await expect(uploadOffsite(file.replace(/\.enc$/, ""), config, { fetch: ok as unknown as typeof fetch })).rejects.toThrow(/Only encrypted backups/);
    const refused = vi.fn(async () => new Response("denied", { status: 403 }));
    await expect(uploadOffsite(file, config, { fetch: refused as unknown as typeof fetch })).rejects.toThrow(/HTTP 403/);
  });
});
