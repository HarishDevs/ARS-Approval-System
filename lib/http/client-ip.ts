import { isIP } from "node:net";

// Who is calling, for rate limits, sign-in logs and the audit trail (Q-018,
// D-092). All traffic to approval.arssteels.net comes through Cloudflare,
// which sets CF-Connecting-IP to the real visitor and overwrites any value
// the visitor sent. X-Forwarded-For is never trusted from the left: anyone
// can put any address there, which let one machine dodge the per-IP sign-in
// limit (QA-SEC-06). Without Cloudflare (local runs) the right-most entry is
// the one added by the nearest proxy, so that is the fallback.
export function clientIpFrom(get: (name: string) => string | null): string | null {
  const cloudflare = get("cf-connecting-ip")?.trim();
  if (cloudflare && isIP(cloudflare)) return cloudflare;
  const forwarded = get("x-forwarded-for")
    ?.split(",")
    .map((part) => part.trim())
    .filter(Boolean);
  const nearest = forwarded?.at(-1);
  if (nearest && isIP(nearest)) return nearest;
  const real = get("x-real-ip")?.trim();
  return real && isIP(real) ? real : null;
}
