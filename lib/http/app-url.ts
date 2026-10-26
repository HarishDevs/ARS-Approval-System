import { getEnv } from "@/config/environment";

// D-196 (owner): the app's public address. APP_BASE_URL (GoDaddy environment)
// is the source of truth; this default is only for a missing setting. D-199:
// the move to arssteels.net was rolled back; the app lives at
// approval.arssteels.net.
export const DEFAULT_APP_BASE_URL = "https://approval.arssteels.net";

export function appBaseUrl(): string {
  return getEnv().APP_BASE_URL ?? DEFAULT_APP_BASE_URL;
}
