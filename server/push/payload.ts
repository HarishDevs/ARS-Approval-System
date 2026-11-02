// D-252: what a phone or desktop notification carries. Pure and unit-tested.
// The push message is encrypted end to end (RFC 8291), but a notification is
// shown on a lock screen, so by default it carries the title and a plain
// line, never the message body with amounts or field values.
import { categoryOf, CATEGORY_LABEL, appPath } from "@/server/notifications/categories";

export type LockScreenDetail = "TITLE" | "FULL" | "GENERIC";
export type PushPriority = "NORMAL" | "HIGH";

export interface PushPayload {
  title: string;
  body: string;
  url: string; // a path inside the app, never another site
  tag: string; // a newer message about the same record replaces the older one
  category: string;
  priority: PushPriority;
  timestamp: number;
}

const URGENT_EVENTS = new Set(["APPROVAL_NEEDED", "TASK_ASSIGNED", "REQUEST_BLOCKED", "WORK_TASK_ASSIGNED", "RULE_ESCALATION", "ADMIN_IMPORTANT", "NEW_LOGIN", "ACCOUNT_LOCKED", "SECURITY_ALERT"]);

const clip = (text: string, max: number) => {
  const plain = text.replace(/\s+/g, " ").trim();
  return plain.length > max ? `${plain.slice(0, max - 1)}…` : plain;
};

export function buildPushPayload(
  input: { notificationId: number; eventType: string; title: string; message: string; deepLink: string | null; entity?: { type: string; id: number } | null; priority?: PushPriority; createdAt?: Date },
  detail: LockScreenDetail,
): PushPayload {
  const category = categoryOf(input.eventType);
  // IT's own notices are written to be read as they are.
  const broadcast = input.eventType.startsWith("ADMIN_") || input.eventType === "PUSH_TEST";
  const mode: LockScreenDetail = broadcast && detail !== "GENERIC" ? "FULL" : detail;
  const title = mode === "GENERIC" ? "ARS CMS" : clip(input.title, 80);
  const body = mode === "GENERIC" ? "You have a new notification. Open ARS CMS to see it." : mode === "FULL" ? clip(input.message, 180) : `${CATEGORY_LABEL[category]} · open ARS CMS to see it`;
  const url = appPath(input.deepLink) ?? "/users/inbox";
  return {
    title,
    body,
    url: url.startsWith("/") && !url.startsWith("//") ? url : "/users/inbox",
    tag: input.entity ? `ars-${input.entity.type.toLowerCase()}-${input.entity.id}` : `ars-n${input.notificationId}`,
    category,
    priority: input.priority ?? (URGENT_EVENTS.has(input.eventType) ? "HIGH" : "NORMAL"),
    timestamp: (input.createdAt ?? new Date()).getTime(),
  };
}

// Device details from the browser's user agent (shown on App & devices and
// to IT). Only broad names; the full user agent isn't stored.
export function describeDevice(userAgent: string | null | undefined, hint: { touch?: boolean; width?: number } = {}): { deviceType: "PHONE" | "TABLET" | "DESKTOP"; browser: string | null; operatingSystem: string | null } {
  const ua = userAgent ?? "";
  const operatingSystem = /iPhone|iPod/.test(ua)
    ? "iOS"
    : /iPad/.test(ua) || (/Macintosh/.test(ua) && hint.touch)
      ? "iPadOS"
      : /Android/.test(ua)
        ? "Android"
        : /Windows/.test(ua)
          ? "Windows"
          : /Mac OS X|Macintosh/.test(ua)
            ? "macOS"
            : /CrOS/.test(ua)
              ? "ChromeOS"
              : /Linux/.test(ua)
                ? "Linux"
                : null;
  const browser = /Edg\//.test(ua)
    ? "Edge"
    : /SamsungBrowser/.test(ua)
      ? "Samsung Internet"
      : /OPR\//.test(ua)
        ? "Opera"
        : /Firefox|FxiOS/.test(ua)
          ? "Firefox"
          : /Chrome|CriOS/.test(ua)
            ? "Chrome"
            : /Safari/.test(ua)
              ? "Safari"
              : null;
  const tablet = operatingSystem === "iPadOS" || (operatingSystem === "Android" && !/Mobile/.test(ua)) || /Tablet/.test(ua);
  const phone = !tablet && (operatingSystem === "iOS" || (operatingSystem === "Android" && /Mobile/.test(ua)));
  return { deviceType: tablet ? "TABLET" : phone ? "PHONE" : "DESKTOP", browser, operatingSystem };
}

// When a failed push is tried again, in seconds; null = stop. 404/410 mean
// the subscription is gone (handled before this); 429 and 5xx are worth
// retrying; anything else (400, 403 wrong keys, 413 too big) is not.
const BACKOFF_SECONDS = [60, 300, 900, 3600];
export function pushRetryDelay(status: number | null, attempt: number, retryAfterSeconds: number | null): number | null {
  const retryable = status === null || status === 429 || status >= 500;
  if (!retryable || attempt > BACKOFF_SECONDS.length) return null;
  const base = BACKOFF_SECONDS[attempt - 1]!;
  return retryAfterSeconds !== null && retryAfterSeconds > base ? Math.min(retryAfterSeconds, 3600) : base;
}
