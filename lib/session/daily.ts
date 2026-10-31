// D-250 (owner: "Persistent Mobile Session & Automatic Midnight Logout"):
// a session on a phone, a tablet or the installed app lasts until the next
// midnight, India time, with no sign-out for inactivity. Pure (no Node or
// server imports), so the middleware and the browser can use it too.

// India has no daylight saving: midnight IST is always 18:30 UTC.
const IST_OFFSET_MS = (5 * 60 + 30) * 60_000;
const DAY_MS = 24 * 60 * 60_000;

// The next 00:00 in India after `now` (the server's clock, never the device's).
export function nextIndiaMidnight(now: Date): Date {
  const local = now.getTime() + IST_OFFSET_MS;
  return new Date(Math.floor(local / DAY_MS) * DAY_MS + DAY_MS - IST_OFFSET_MS);
}

export function secondsUntilIndiaMidnight(now: Date): number {
  return Math.max(1, Math.floor((nextIndiaMidnight(now).getTime() - now.getTime()) / 1000));
}

// Who gets the daily session: the Super Admin chooses (Settings → Sign-in).
export type DailySessionScope = "DEVICES" | "EVERYONE" | "OFF";
export const DAILY_SCOPES: readonly DailySessionScope[] = ["DEVICES", "EVERYONE", "OFF"];

// The browser says what it is (the ars_client cookie, set by the app's own
// script): "app" in the installed app, "handheld" on a touch phone or tablet.
// iPadOS Safari reports itself as a Mac, so the user agent alone can't tell.
export const CLIENT_KIND_COOKIE = "ars_client";
export type ClientKind = "app" | "handheld";
export function parseClientKind(value: string | null | undefined): ClientKind | null {
  return value === "app" || value === "handheld" ? value : null;
}

const HANDHELD_UA = /Android|iPhone|iPad|iPod|Mobile|Tablet|Silk|Kindle|Opera Mini|IEMobile/i;
export function isHandheldUserAgent(userAgent: string | null | undefined): boolean {
  return Boolean(userAgent && HANDHELD_UA.test(userAgent));
}

export function dailySessionApplies(scope: DailySessionScope, userAgent: string | null | undefined, clientKind: ClientKind | null): boolean {
  if (scope === "OFF") return false;
  if (scope === "EVERYONE") return true;
  return clientKind !== null || isHandheldUserAgent(userAgent);
}
