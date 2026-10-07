import { describe, expect, it } from "vitest";
import { checkCount, checkFile, downloadHeaders, formatSize, MAX_FILE_BYTES, safeFileName } from "@/server/attachments/files";

// S6-05 / D-072: what may be attached, and how it is sent back.
const bytes = (...values: number[]) => new Uint8Array(values);
const text = (value: string) => new TextEncoder().encode(value);
const PDF = text("%PDF-1.7\n...");
const PNG = bytes(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0);
const ZIP = bytes(0x50, 0x4b, 0x03, 0x04, 0x14, 0);

describe("checkFile", () => {
  it("accepts real PDFs, images, Office files and text", () => {
    expect(checkFile({ name: "quote.pdf", size: 1200, head: PDF })).toEqual({ ok: true, name: "quote.pdf", contentType: "application/pdf" });
    expect(checkFile({ name: "photo.PNG", size: 900, head: PNG }).ok).toBe(true);
    expect(checkFile({ name: "costing.xlsx", size: 900, head: ZIP }).ok).toBe(true);
    expect(checkFile({ name: "notes.csv", size: 20, head: text("item,amount\nmotor,45000\n") }).ok).toBe(true);
    expect(checkFile({ name: "नोट.txt", size: 20, head: text("सूचना") }).ok).toBe(true);
  });

  it("refuses types that aren't allowed, empty and oversized files", () => {
    expect(checkFile({ name: "run.exe", size: 10, head: bytes(0x4d, 0x5a) }).ok).toBe(false);
    expect(checkFile({ name: "page.html", size: 10, head: text("<html>") }).ok).toBe(false);
    expect(checkFile({ name: "quote.pdf", size: 0, head: PDF }).ok).toBe(false);
    expect(checkFile({ name: "quote.pdf", size: MAX_FILE_BYTES + 1, head: PDF }).ok).toBe(false);
  });

  it("refuses a file whose bytes don't match its name", () => {
    const disguised = checkFile({ name: "invoice.pdf", size: 10, head: bytes(0x4d, 0x5a, 0x90, 0) });
    expect(disguised).toEqual({ ok: false, message: "invoice.pdf doesn't look like a real PDF file." });
    expect(checkFile({ name: "data.txt", size: 10, head: bytes(0x41, 0, 0x42) }).ok).toBe(false);
  });
});

describe("names, counts and downloads", () => {
  it("strips folders and odd characters, and keeps the extension when shortening", () => {
    expect(safeFileName("C:\\Users\\ravi\\quote<1>.pdf")).toBe("quote1.pdf");
    expect(safeFileName("../../etc/passwd")).toBe("passwd");
    expect(safeFileName("...")).toBe("file");
    const long = safeFileName(`${"a".repeat(200)}.pdf`);
    expect(long).toHaveLength(150);
    expect(long.endsWith(".pdf")).toBe(true);
  });

  it("limits files per upload and per request", () => {
    expect(checkCount(0, 5)).toBeNull();
    expect(checkCount(0, 6)).toMatch(/at most 5/);
    expect(checkCount(18, 3)).toMatch(/at most 20/);
  });

  it("always downloads, never runs in the browser", () => {
    const headers = downloadHeaders("कोटेशन \"final\".pdf", "application/pdf", 10);
    expect(headers["Content-Disposition"]).toMatch(/^attachment; filename="[^"]*"; filename\*=UTF-8''/);
    expect(headers["X-Content-Type-Options"]).toBe("nosniff");
    expect(headers["Content-Security-Policy"]).toContain("sandbox");
  });

  it("formats sizes", () => {
    expect(formatSize(512)).toBe("512 B");
    expect(formatSize(2048)).toBe("2 KB");
    expect(formatSize(3 * 1024 * 1024)).toBe("3.0 MB");
  });
});

describe("filesFrom", () => {
  it("ignores an empty file box but keeps real files", async () => {
    const { filesFrom } = await import("@/server/attachments/service");
    const form = new FormData();
    form.append("attachments", new File([], "blob"));
    form.append("attachments", new File([], ""));
    form.append("attachments", new File(["%PDF-1.4"], "quote.pdf"));
    expect(filesFrom(form).map((file) => file.name)).toEqual(["quote.pdf"]);
  });
});
