import "server-only";
import type { NextRequest } from "next/server";
import { clientIpFrom } from "@/lib/http/client-ip";
import { DEVICE_COOKIE_NAME } from "@/lib/session/constants";
import { readDeviceKey } from "@/lib/session/token";
import type { RequestContext } from "@/types/auth";

// The IP comes from Cloudflare's CF-Connecting-IP (see client-ip.ts). It is
// null when running `next dev` directly, which is expected.
export function getRequestContext(request: NextRequest): RequestContext {
  const ipAddress = clientIpFrom((name) => request.headers.get(name));
  const userAgent = request.headers.get("user-agent")?.slice(0, 500) ?? null;
  const deviceKey = readDeviceKey(request.cookies.get(DEVICE_COOKIE_NAME)?.value);
  return { ipAddress, userAgent, deviceKey };
}

// Same context for Server Actions, which have no NextRequest.
export async function getActionContext(): Promise<RequestContext> {
  const { headers, cookies } = await import("next/headers");
  const headerList = await headers();
  const ipAddress = clientIpFrom((name) => headerList.get(name));
  const userAgent = headerList.get("user-agent")?.slice(0, 500) ?? null;
  const deviceKey = readDeviceKey((await cookies()).get(DEVICE_COOKIE_NAME)?.value);
  return { ipAddress, userAgent, deviceKey };
}
