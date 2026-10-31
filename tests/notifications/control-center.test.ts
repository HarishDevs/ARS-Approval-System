import { describe, expect, it, vi } from "vitest";
import { notifyWithDeps, type NotifyDeps, type NotifyInput } from "@/server/notifications/notify";
import { channelWanted, dndApplies, dndHolds, NO_DND, optionalKeys, parseDnd } from "@/server/notifications/preferences";
import { checkPhoto, photoUrl } from "@/server/profile/photo";

// D-231: the notification control centre; D-230: profile photos.
function makeDeps(overrides: Partial<NotifyDeps> = {}) {
  const deliveries: Parameters<NotifyDeps["createDelivery"]>[0][] = [];
  const deps: NotifyDeps = {
    findRecipient: async () => ({ id: 5, name: "Staff", email: "staff@example.com", whatsappNumber: "919876543210", active: true }),
    createNotification: vi.fn(async () => 77),
    createDelivery: vi.fn(async (input) => {
      deliveries.push(input);
      return deliveries.length;
    }) as unknown as NotifyDeps["createDelivery"],
    findActiveTemplate: async () => ({ id: 3, providerName: "wa_v1", language: "en", variableKeys: ["name"] }),
    sendWhatsApp: vi.fn(async () => ({ waMessageId: "wamid.1" })),
    sendEmail: vi.fn(async () => ({ id: "re_1" })),
    markRead: vi.fn(async () => undefined),
    ...overrides,
  };
  return { deps, deliveries };
}
const approved: NotifyInput = { eventType: "REQUEST_APPROVED", userId: 5, title: "Approved", message: "Approved.", email: { subject: "Approved", text: "Hi" }, whatsappVariables: { name: "Staff" } };

describe("choices per kind of message", () => {
  it("one kind can be off while the rest of its group stays on", () => {
    const off = new Set(["E:REQUEST_APPROVED:EMAIL"]);
    expect(channelWanted("REQUEST_APPROVED", "EMAIL", off)).toBe(false);
    expect(channelWanted("REQUEST_REJECTED", "EMAIL", off)).toBe(true);
    expect(channelWanted("REQUEST_APPROVED", "WHATSAPP", off)).toBe(true);
    expect(channelWanted("APPROVAL_NEEDED", "INAPP", new Set(["E:APPROVAL_NEEDED:INAPP", "ACTION_NEEDED:INAPP"]))).toBe(true); // must reach
  });
  it("only optional groups and kinds can be stored", () => {
    const keys = optionalKeys();
    expect(keys.has("MY_REQUESTS:INAPP")).toBe(true);
    expect(keys.has("E:WORK_TASK_COMMENT:WHATSAPP")).toBe(true);
    expect(keys.has("SECURITY:EMAIL")).toBe(false);
    expect(keys.has("E:NEW_LOGIN:EMAIL")).toBe(false);
  });
  it("the app alert switched off keeps the message, already read", async () => {
    const { deps } = makeDeps({ loadOptOuts: async () => new Set(["E:REQUEST_APPROVED:INAPP"]) });
    await notifyWithDeps(approved, deps);
    expect(deps.createNotification).toHaveBeenCalledOnce();
    expect(deps.markRead).toHaveBeenCalledWith(77);
    expect(deps.sendEmail).toHaveBeenCalledOnce();
  });
});

describe("Do not disturb", () => {
  // 31 Oct 2026 is a Saturday. 16:30 UTC = 22:00 India.
  const night = new Date("2026-10-31T16:30:00Z");
  const noon = new Date("2026-10-30T06:30:00Z"); // Friday 12:00 India
  it("quiet hours may cross midnight; days off; a pause", () => {
    expect(dndHolds({ ...NO_DND, quiet: { from: "19:00", to: "09:00" } }, night)).toBe(true);
    expect(dndHolds({ ...NO_DND, quiet: { from: "19:00", to: "09:00" } }, noon)).toBe(false);
    expect(dndHolds({ ...NO_DND, quiet: { from: "13:00", to: "14:00" } }, noon)).toBe(false);
    expect(dndHolds({ ...NO_DND, daysOff: [6] }, night)).toBe(true);
    expect(dndHolds({ ...NO_DND, daysOff: [6] }, noon)).toBe(false);
    expect(dndHolds({ ...NO_DND, pausedUntil: "2026-10-30T07:00:00.000Z" }, noon)).toBe(true);
    expect(dndHolds({ ...NO_DND, pausedUntil: "2026-10-30T06:00:00.000Z" }, noon)).toBe(false);
  });
  it("is read safely", () => {
    expect(parseDnd("not json")).toEqual(NO_DND);
    expect(parseDnd({ quiet: { from: "25:00", to: "09:00" }, daysOff: [1, 1, 9, 0], pausedUntil: "x" })).toEqual({ pausedUntil: null, quiet: null, daysOff: [0, 1] });
  });
  it("holds email and WhatsApp, not the app, and never security messages", async () => {
    const quiet = { ...NO_DND, daysOff: [6] };
    const { deps, deliveries } = makeDeps({ loadDnd: async () => quiet, now: () => night });
    const summary = await notifyWithDeps(approved, deps);
    expect(deps.createNotification).toHaveBeenCalledOnce();
    expect(deps.sendEmail).not.toHaveBeenCalled();
    expect(deps.sendWhatsApp).not.toHaveBeenCalled();
    expect(summary.email).toEqual({ status: "SKIPPED", code: "DO_NOT_DISTURB" });
    expect(deliveries.every((delivery) => delivery.failureCode === "DO_NOT_DISTURB")).toBe(true);
    expect(dndApplies("NEW_LOGIN")).toBe(false);
    const security = makeDeps({ loadDnd: async () => quiet, now: () => night });
    await notifyWithDeps({ ...approved, eventType: "NEW_LOGIN" }, security.deps);
    expect(security.deps.sendEmail).toHaveBeenCalledOnce();
  });
});

describe("profile photos", () => {
  const bytes = (...values: number[]) => new Uint8Array(values);
  it("JPEG, PNG and WebP by their first bytes, at most 3 MB", () => {
    expect(checkPhoto(1000, bytes(0xff, 0xd8, 0xff, 0xe0))).toMatchObject({ ok: true, contentType: "image/jpeg" });
    expect(checkPhoto(1000, bytes(0x89, 0x50, 0x4e, 0x47, 0x0d))).toMatchObject({ ok: true, extension: "png" });
    expect(checkPhoto(1000, new TextEncoder().encode("RIFF\0\0\0\0WEBPVP8 "))).toMatchObject({ ok: true, contentType: "image/webp" });
    expect(checkPhoto(1000, new TextEncoder().encode("<svg onload=alert(1)>"))).toMatchObject({ ok: false });
    expect(checkPhoto(4 * 1024 * 1024, bytes(0xff, 0xd8, 0xff))).toMatchObject({ ok: false });
    expect(checkPhoto(0, bytes())).toMatchObject({ ok: false });
  });
  it("the address changes with the photo", () => {
    expect(photoUrl(7, null)).toBeNull();
    expect(photoUrl(7, new Date("2026-10-31T00:00:00Z"))).toMatch(/^\/api\/users\/7\/photo\?v=/);
  });
});
