import "server-only";
import crypto from "node:crypto";
import { NextResponse } from "next/server";

// One response envelope for every API route. Error messages are generic and
// carry a reference code; never stack traces, SQL or provider details (D-016).
function requestId(): string {
  const date = new Date().toISOString().slice(0, 10).replace(/-/g, "");
  return `REQ-${date}-${crypto.randomBytes(3).toString("hex").toUpperCase()}`;
}

export function apiSuccess<T>(data: T, init?: ResponseInit): NextResponse {
  return NextResponse.json({ success: true, data }, init);
}

export function apiError(code: string, message: string, status: number): NextResponse {
  return NextResponse.json({ success: false, error: { code, message, requestId: requestId() } }, { status });
}
