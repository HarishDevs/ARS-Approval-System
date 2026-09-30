import "server-only";
import type { NextRequest } from "next/server";
import { DEVICE_COOKIE_NAME } from "@/lib/session/constants";
import { readDeviceKey } from "@/lib/session/token";
import type { RequestContext } from "@/types/auth";

// IP comes from x-forwarded-for, which GoDaddy's proxy sets. It is null when
// running `next dev` directly, which is expected.
export function getRequestContext(request: NextRequest): RequestContext {
  const forwarded = request.headers.get("x-forwarded-for");
  const ipAddress = forwarded?.split(",")[0]?.trim() || request.headers.get("x-real-ip") || null;
  const userAgent = request.headers.get("user-agent")?.slice(0, 500) ?? null;
  const deviceKey = readDeviceKey(request.cookies.get(DEVICE_COOKIE_NAME)?.value);
  return { ipAddress, userAgent, deviceKey };
}

// Same context for Server Actions, which have no NextRequest.
export async function getActionContext(): Promise<RequestContext> {
  const { headers, cookies } = await import("next/headers");
  const headerList = await headers();
  const forwarded = headerList.get("x-forwarded-for");
  const ipAddress = forwarded?.split(",")[0]?.trim() || headerList.get("x-real-ip") || null;
  const userAgent = headerList.get("user-agent")?.slice(0, 500) ?? null;
  const deviceKey = readDeviceKey((await cookies()).get(DEVICE_COOKIE_NAME)?.value);
  return { ipAddress, userAgent, deviceKey };
}
