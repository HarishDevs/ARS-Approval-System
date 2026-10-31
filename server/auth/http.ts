import "server-only";
import type { NextResponse } from "next/server";
import { apiError } from "@/lib/http/api-response";
import { logError } from "@/lib/logging/logger";
import { DEVICE_COOKIE_NAME, DEVICE_COOKIE_TTL_SECONDS, SESSION_COOKIE_NAME, SESSION_TTL_SECONDS } from "@/lib/session/constants";
import { AUTH_ERROR_STATUS, AuthError } from "@/server/auth/errors";
import type { CompleteSignInResult } from "@/server/auth/complete-sign-in";

const secure = process.env.NODE_ENV === "production";

export function setSignInCookies(response: NextResponse, result: CompleteSignInResult): NextResponse {
  response.cookies.set(SESSION_COOKIE_NAME, result.sessionToken, {
    httpOnly: true,
    secure,
    sameSite: "lax",
    path: "/",
    maxAge: result.cookieMaxAge ?? SESSION_TTL_SECONDS,
  });
  if (result.newDeviceCookie) {
    response.cookies.set(DEVICE_COOKIE_NAME, result.newDeviceCookie, {
      httpOnly: true,
      secure,
      sameSite: "lax",
      path: "/",
      maxAge: DEVICE_COOKIE_TTL_SECONDS,
    });
  }
  return response;
}

export function clearSessionCookie(response: NextResponse): NextResponse {
  response.cookies.set(SESSION_COOKIE_NAME, "", { httpOnly: true, secure, sameSite: "lax", path: "/", maxAge: 0 });
  return response;
}

export function authErrorResponse(error: unknown, where: string): NextResponse {
  if (error instanceof AuthError) {
    const response = apiError(error.code, error.message, AUTH_ERROR_STATUS[error.code]);
    if (error.retryAfterSeconds) response.headers.set("Retry-After", String(error.retryAfterSeconds));
    return response;
  }
  logError(`${where} failed`, error);
  return apiError("SYSTEM_ERROR", "Something went wrong. Please try again.", 500);
}
