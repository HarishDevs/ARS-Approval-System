import "server-only";
import { cache } from "react";
import { cookies, headers } from "next/headers";
import { LAYOUT_COOKIE, PHONE_UA, type LayoutMode } from "@/lib/ui/layout";

// v1.43.0 (owner's mobile brief; docs/mobile/MOBILE_REDESIGN_ARCHITECTURE.md):
// one layout per request. The browser says which (a cookie set from its window
// width: below 768 px = mobile); before it has, a phone's user agent means
// mobile. Anything else gets the desktop layout, exactly as before.
export const layoutMode = cache(async (): Promise<LayoutMode> => {
  const chosen = (await cookies()).get(LAYOUT_COOKIE)?.value;
  if (chosen === "mobile" || chosen === "desktop") return chosen;
  return PHONE_UA.test((await headers()).get("user-agent") ?? "") ? "mobile" : "desktop";
});

export const isMobileLayout = async () => (await layoutMode()) === "mobile";
