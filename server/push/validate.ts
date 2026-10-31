import { z } from "zod";

// D-252: what a browser may register. The server later POSTs to the
// endpoint, so only the browsers' own push services are accepted (anything
// else could make the server call an address of the caller's choosing).
// PUSH_EXTRA_ENDPOINT_ORIGINS adds origins for tests only; never set it in
// production.
const PUSH_HOSTS = [/^fcm\.googleapis\.com$/, /^android\.googleapis\.com$/, /(^|\.)push\.services\.mozilla\.com$/, /(^|\.)notify\.windows\.com$/, /^web\.push\.apple\.com$/, /(^|\.)push\.apple\.com$/];

export function allowedPushEndpoint(endpoint: string, extraOrigins = process.env.PUSH_EXTRA_ENDPOINT_ORIGINS ?? ""): boolean {
  let url: URL;
  try {
    url = new URL(endpoint);
  } catch {
    return false;
  }
  const extras = extraOrigins
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean);
  if (extras.includes(url.origin)) return true;
  return url.protocol === "https:" && url.port === "" && !url.username && !url.password && PUSH_HOSTS.some((host) => host.test(url.hostname));
}

const base64url = (min: number, max: number) => z.string().regex(/^[A-Za-z0-9_-]+=*$/).min(min).max(max);

export const subscriptionSchema = z.object({
  endpoint: z.string().max(1000).refine((value) => allowedPushEndpoint(value), "Not a browser push service."),
  keys: z.object({ p256dh: base64url(80, 100), auth: base64url(16, 30) }),
});

export const subscribeSchema = z.object({
  subscription: subscriptionSchema,
  installed: z.boolean().default(false),
  permission: z.enum(["granted", "denied", "default"]).default("granted"),
  touch: z.boolean().default(false),
});

export const resubscribeSchema = z.object({
  oldEndpoint: z.string().max(1000),
  subscription: subscriptionSchema,
});
