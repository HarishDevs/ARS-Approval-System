import { describe, expect, it } from "vitest";
import { buildPushPayload, describeDevice, pushRetryDelay } from "@/server/push/payload";
import { allowedPushEndpoint, subscribeSchema } from "@/server/push/validate";
import { channelWanted } from "@/server/notifications/preferences";
import { audienceIsEmpty, broadcastSchema } from "@/server/notifications/broadcast";

// D-252: what a push carries, who may receive one, and what a browser may register.
describe("push payload", () => {
  const base = { notificationId: 42, eventType: "APPROVAL_NEEDED", title: "Approval needed: ESM-2026-000012", message: "Laptops for Finance, amount ₹2,40,000. Please decide.", deepLink: "/users/requests/12", entity: { type: "REQUEST", id: 12 } };

  it("by default shows the title and a plain line, never the message with amounts", () => {
    const payload = buildPushPayload(base, "TITLE");
    expect(payload.title).toBe("Approval needed: ESM-2026-000012");
    expect(payload.body).not.toContain("2,40,000");
    expect(payload.body).toContain("Approval");
    expect(payload.url).toBe("/users/requests/12");
    expect(payload.tag).toBe("ars-request-12");
    expect(payload.priority).toBe("HIGH");
  });

  it("FULL shows the message; GENERIC shows nothing about it", () => {
    expect(buildPushPayload(base, "FULL").body).toContain("2,40,000");
    const generic = buildPushPayload(base, "GENERIC");
    expect(generic.title).toBe("ARS CMS");
    expect(generic.body).not.toContain("ESM");
  });

  it("IT's notices show their text (they are written to be read); only app pages are opened", () => {
    const notice = buildPushPayload({ ...base, eventType: "ADMIN_ANNOUNCEMENT", title: "Plant shutdown", message: "The plant is closed on Sunday.", deepLink: "https://evil.example/x", entity: null, priority: "NORMAL" }, "TITLE");
    expect(notice.body).toBe("The plant is closed on Sunday.");
    expect(notice.url).toBe("/users/inbox");
    expect(notice.tag).toBe("ars-n42");
    expect(notice.priority).toBe("NORMAL");
  });
});

describe("devices and retries", () => {
  it("names the device broadly from its browser", () => {
    expect(describeDevice("Mozilla/5.0 (Linux; Android 15; Pixel 9) AppleWebKit/537.36 Chrome/131.0 Mobile Safari/537.36")).toEqual({ deviceType: "PHONE", browser: "Chrome", operatingSystem: "Android" });
    expect(describeDevice("Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Version/18.0 Mobile/15E148 Safari/604.1")).toEqual({ deviceType: "PHONE", browser: "Safari", operatingSystem: "iOS" });
    expect(describeDevice("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 Version/18.0 Safari/605.1.15", { touch: true })).toMatchObject({ deviceType: "TABLET", operatingSystem: "iPadOS" });
    expect(describeDevice("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/131.0 Safari/537.36 Edg/131.0")).toEqual({ deviceType: "DESKTOP", browser: "Edge", operatingSystem: "Windows" });
  });

  it("retries busy or failing push services with growing waits; never a refusal", () => {
    expect(pushRetryDelay(503, 1, null)).toBe(60);
    expect(pushRetryDelay(null, 2, null)).toBe(300);
    expect(pushRetryDelay(429, 1, 600)).toBe(600);
    expect(pushRetryDelay(429, 1, 99_999)).toBe(3600);
    expect(pushRetryDelay(500, 5, null)).toBeNull();
    expect(pushRetryDelay(400, 1, null)).toBeNull();
    expect(pushRetryDelay(403, 1, null)).toBeNull();
  });
});

describe("what a browser may register", () => {
  it("only the browsers' own push services (the server posts to it)", () => {
    expect(allowedPushEndpoint("https://fcm.googleapis.com/fcm/send/abc", "")).toBe(true);
    expect(allowedPushEndpoint("https://updates.push.services.mozilla.com/wpush/v2/abc", "")).toBe(true);
    expect(allowedPushEndpoint("https://wns2-db5p.notify.windows.com/w/?token=abc", "")).toBe(true);
    expect(allowedPushEndpoint("https://web.push.apple.com/QGuQ", "")).toBe(true);
    expect(allowedPushEndpoint("https://evil.example/fcm.googleapis.com", "")).toBe(false);
    expect(allowedPushEndpoint("http://fcm.googleapis.com/x", "")).toBe(false);
    expect(allowedPushEndpoint("https://fcm.googleapis.com:8443/x", "")).toBe(false);
    expect(allowedPushEndpoint("http://127.0.0.1:4555/push", "")).toBe(false);
    expect(allowedPushEndpoint("http://127.0.0.1:4555/push", "http://127.0.0.1:4555")).toBe(true);
  });

  it("checks the keys' shape", () => {
    const keys = { p256dh: "B".repeat(87), auth: "a".repeat(22) };
    expect(subscribeSchema.safeParse({ subscription: { endpoint: "https://fcm.googleapis.com/fcm/send/x", keys } }).success).toBe(true);
    expect(subscribeSchema.safeParse({ subscription: { endpoint: "https://fcm.googleapis.com/fcm/send/x", keys: { ...keys, auth: "short" } } }).success).toBe(false);
  });
});

describe("push follows the preferences", () => {
  it("optional kinds can be switched off for devices; security, work waiting and important alerts can't", () => {
    const off = new Set(["MY_REQUESTS:PUSH", "ANNOUNCEMENTS:PUSH", "IMPORTANT:PUSH", "SECURITY:PUSH"]);
    expect(channelWanted("REQUEST_APPROVED", "PUSH", off)).toBe(false);
    expect(channelWanted("ADMIN_ANNOUNCEMENT", "PUSH", off)).toBe(false);
    expect(channelWanted("ADMIN_IMPORTANT", "PUSH", off)).toBe(true);
    expect(channelWanted("NEW_LOGIN", "PUSH", off)).toBe(true);
    expect(channelWanted("APPROVAL_NEEDED", "PUSH", off)).toBe(true);
    expect(channelWanted("REQUEST_APPROVED", "EMAIL", off)).toBe(true);
  });
});

describe("IT notifications", () => {
  const audience = { everyone: false, userIds: [], departmentIds: [], roleCodes: [], hods: false, managers: false };
  it("needs an audience, a title and a message; links only to app pages", () => {
    expect(audienceIsEmpty(audience)).toBe(true);
    expect(audienceIsEmpty({ ...audience, hods: true })).toBe(false);
    const good = broadcastSchema.safeParse({ title: "Shutdown", message: "Sunday maintenance.", category: "SYSTEM", audience: { ...audience, everyone: true }, link: "/users/calendar" });
    expect(good.success).toBe(true);
    expect(broadcastSchema.safeParse({ title: "Shutdown", message: "Sunday maintenance.", category: "SYSTEM", audience, link: "https://evil.example" }).success).toBe(false);
    expect(broadcastSchema.safeParse({ title: "x", message: "Sunday maintenance.", category: "SYSTEM", audience }).success).toBe(false);
    expect(broadcastSchema.safeParse({ title: "Shutdown", message: "Sunday.", category: "PARTY", audience }).success).toBe(false);
  });
});
