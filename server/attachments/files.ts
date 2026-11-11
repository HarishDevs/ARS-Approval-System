// Attachment rules (S6-05, D-072, F-18). Pure and unit-tested: which files
// are allowed, how big, and whether the bytes really are what the name says.
export const MAX_FILE_BYTES = 10 * 1024 * 1024;
export const MAX_FILES_PER_UPLOAD = 5;
export const MAX_FILES_PER_REQUEST = 20;
export const SNIFF_BYTES = 4096;

type Sniff = (head: Uint8Array) => boolean;

const startsWith =
  (...bytes: number[]): Sniff =>
  (head) =>
    bytes.every((byte, index) => head[index] === byte);
const PDF = startsWith(0x25, 0x50, 0x44, 0x46, 0x2d); // %PDF-
const PNG = startsWith(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a);
const JPEG = startsWith(0xff, 0xd8, 0xff);
const WEBP: Sniff = (head) => startsWith(0x52, 0x49, 0x46, 0x46)(head) && String.fromCharCode(...head.slice(8, 12)) === "WEBP";
const ZIP = startsWith(0x50, 0x4b, 0x03, 0x04); // docx / xlsx / pptx
const OLE = startsWith(0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1); // doc / xls / ppt
// Plain text: no NUL bytes and valid UTF-8 in the first few KB.
const TEXT: Sniff = (head) => {
  if (head.includes(0)) return false;
  try {
    new TextDecoder("utf-8", { fatal: true }).decode(trimPartialUtf8(head));
    return true;
  } catch {
    return false;
  }
};

// A UTF-8 character may be cut at the end of the sniffed bytes.
function trimPartialUtf8(bytes: Uint8Array): Uint8Array {
  let end = bytes.length;
  for (let back = 1; back <= 3 && end - back >= 0; back += 1) {
    const byte = bytes[end - back]!;
    if ((byte & 0xc0) === 0x80) continue; // continuation byte
    if (byte >= 0xc0) {
      const needed = byte >= 0xf0 ? 4 : byte >= 0xe0 ? 3 : 2;
      if (back < needed) end -= back;
    }
    break;
  }
  return bytes.slice(0, end);
}

export const ALLOWED_TYPES: Record<string, { contentType: string; sniff: Sniff; label: string }> = {
  pdf: { contentType: "application/pdf", sniff: PDF, label: "PDF" },
  png: { contentType: "image/png", sniff: PNG, label: "PNG" },
  jpg: { contentType: "image/jpeg", sniff: JPEG, label: "JPG" },
  jpeg: { contentType: "image/jpeg", sniff: JPEG, label: "JPG" },
  webp: { contentType: "image/webp", sniff: WEBP, label: "WEBP" },
  docx: { contentType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document", sniff: ZIP, label: "Word" },
  xlsx: { contentType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", sniff: ZIP, label: "Excel" },
  pptx: { contentType: "application/vnd.openxmlformats-officedocument.presentationml.presentation", sniff: ZIP, label: "PowerPoint" },
  doc: { contentType: "application/msword", sniff: OLE, label: "Word" },
  xls: { contentType: "application/vnd.ms-excel", sniff: OLE, label: "Excel" },
  ppt: { contentType: "application/vnd.ms-powerpoint", sniff: OLE, label: "PowerPoint" },
  csv: { contentType: "text/csv", sniff: TEXT, label: "CSV" },
  txt: { contentType: "text/plain", sniff: TEXT, label: "text" },
};

export const ACCEPT_ATTRIBUTE = Object.keys(ALLOWED_TYPES)
  .map((ext) => `.${ext}`)
  .join(",");

// The name as shown and downloaded: no folders, no control characters,
// at most 150 characters with the extension kept.
export function safeFileName(raw: string): string {
  const base = raw.split(/[\\/]/).pop() ?? "";
  const cleaned = base
    .replace(/[\u0000-\u001f\u007f<>:"|?*]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/^\.+/, "");
  if (!cleaned) return "file";
  if (cleaned.length <= 150) return cleaned;
  const dot = cleaned.lastIndexOf(".");
  const ext = dot > 0 && cleaned.length - dot <= 6 ? cleaned.slice(dot) : "";
  return cleaned.slice(0, 150 - ext.length) + ext;
}

export function extensionOf(name: string): string {
  const dot = name.lastIndexOf(".");
  return dot > 0 ? name.slice(dot + 1).toLowerCase() : "";
}

export type FileCheck = { ok: true; name: string; contentType: string } | { ok: false; message: string };

export function checkFile(file: { name: string; size: number; head: Uint8Array }): FileCheck {
  const name = safeFileName(file.name);
  const type = ALLOWED_TYPES[extensionOf(name)];
  if (!type) return { ok: false, message: `${name}: this type of file isn't allowed. Use PDF, images, Word, Excel, PowerPoint, CSV or text.` };
  if (file.size === 0) return { ok: false, message: `${name} is empty.` };
  if (file.size > MAX_FILE_BYTES) return { ok: false, message: `${name} is larger than 10 MB.` };
  if (!type.sniff(file.head)) return { ok: false, message: `${name} doesn't look like a real ${type.label} file.` };
  return { ok: true, name, contentType: type.contentType };
}

// How many more files a request can take, and whether this upload fits.
export function checkCount(existing: number, adding: number): string | null {
  if (adding > MAX_FILES_PER_UPLOAD) return `Add at most ${MAX_FILES_PER_UPLOAD} files at a time.`;
  if (existing + adding > MAX_FILES_PER_REQUEST) return `A request can hold at most ${MAX_FILES_PER_REQUEST} files (${existing} already attached).`;
  return null;
}

// RD-02: only these may be shown in the browser. Never SVG or HTML (they can
// carry script); every other type is always a download.
export function previewKind(contentType: string): "image" | "pdf" | null {
  if (contentType === "image/png" || contentType === "image/jpeg" || contentType === "image/webp") return "image";
  if (contentType === "application/pdf") return "pdf";
  return null;
}

export function inlineHeaders(name: string, contentType: string, size: number): Record<string, string> {
  const ascii = name.replace(/[^\x20-\x7e]/g, "_").replace(/["\\]/g, "_");
  return {
    "Content-Type": contentType,
    "Content-Length": String(size),
    "Content-Disposition": `inline; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(name)}`,
    "X-Content-Type-Options": "nosniff",
    "Cache-Control": "private, no-store",
    "Cross-Origin-Resource-Policy": "same-origin",
    // Images: nothing at all may run. PDFs: the browser's own viewer only.
    "Content-Security-Policy": contentType === "application/pdf" ? "default-src 'none'; object-src 'none'; frame-ancestors 'self'" : "default-src 'none'; sandbox; frame-ancestors 'self'",
  };
}

// Always a download, never shown inline, with a safe ASCII fallback name.
export function downloadHeaders(name: string, contentType: string, size: number): Record<string, string> {
  const ascii = name.replace(/[^\x20-\x7e]/g, "_").replace(/["\\]/g, "_");
  return {
    "Content-Type": contentType,
    "Content-Length": String(size),
    "Content-Disposition": `attachment; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(name)}`,
    "X-Content-Type-Options": "nosniff",
    "Cache-Control": "private, no-store",
    "Content-Security-Policy": "default-src 'none'; sandbox",
  };
}

export function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

// v1.52.3 (owner): "attachments can be deleted until the first approval;
// after the first approval not, unless an approver asks for changes".
// The person who added the file or the requester may delete it while the
// request is open and either no approver has approved any level yet, or the
// request is back with the requester for changes.
export type AttachmentDeleteFacts = { requestStatus: string; anyApproval: boolean; actorId: number; uploadedBy: number; requesterId: number };
export function attachmentDeleteBlock(facts: AttachmentDeleteFacts): string | null {
  if (facts.actorId !== facts.uploadedBy && facts.actorId !== facts.requesterId) return "Only the requester or the person who added the file can delete it.";
  if (facts.requestStatus === "CHANGES_REQUIRED") return null;
  if (facts.requestStatus !== "IN_PROGRESS" && facts.requestStatus !== "ON_HOLD") return "Files of a closed request can't be deleted.";
  return facts.anyApproval ? "An approver has already approved this request, so its files can't be deleted (unless changes are asked for)." : null;
}
