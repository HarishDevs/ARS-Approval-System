import "server-only";
import { createHash, randomUUID } from "node:crypto";
import { createPurposeToken, createSessionToken, verifyPurposeToken } from "@/lib/session/token";
import { claimSecurityLink, createSession } from "@/lib/db/repositories/sessions.repository";
import { findUserById } from "@/lib/db/repositories/users.repository";
import { recordAudit } from "@/lib/db/repositories/audit.repository";
import type { RoleCode } from "@/types/auth";

// D-185 (owner): "Try as" any person, from their user page, for the IT team.
//   - The IT Admin or Super Admin gets a one-time link (5 minutes) to open in
//     a private window; their own session is never touched.
//   - Opening the link where someone is already signed in is refused, so it
//     can never replace a session (browsers can't be made to open a private
//     window, so this is the guarantee).
//   - The Try as session is view-only (server/auth/session.ts refuses every
//     change centrally), lasts at most an hour, and records who opened it.
//   - An IT Admin may try staff only; another IT Admin or a Super Admin is
//     for the Super Admin. Nobody tries themselves, the break-glass account,
//     or an inactive person. Every link and every use is audited.
export const TRY_AS_PURPOSE = "try-as";
const LINK_SECONDS = 5 * 60;
const SESSION_SECONDS = 60 * 60;

type Person = { id: number; roles: readonly RoleCode[] | readonly string[] };
type Target = Person & { active: boolean; isBreakGlass: boolean };

export function canTryAs(actor: Person, target: Target): { ok: true } | { ok: false; message: string } {
  const isSuper = actor.roles.includes("SUPER_ADMIN");
  if (!isSuper && !actor.roles.includes("IT_ADMIN")) return { ok: false, message: "Not found." };
  if (actor.id === target.id) return { ok: false, message: "You can't try the app as yourself." };
  if (!target.active) return { ok: false, message: "This person is inactive." };
  if (target.isBreakGlass) return { ok: false, message: "The break-glass account can't be tried." };
  if (!isSuper && (target.roles.includes("SUPER_ADMIN") || target.roles.includes("IT_ADMIN"))) return { ok: false, message: "Only the Super Admin can try the app as an IT Admin." };
  return { ok: true };
}

export async function createTryAsLink(actor: Person & { sessionId: string; ipAddress: string | null }, targetId: number, baseUrl: string): Promise<{ ok: true; url: string; name: string } | { ok: false; message: string }> {
  const target = await findUserById(targetId);
  if (!target) return { ok: false, message: "Not found." };
  const allowed = canTryAs(actor, target);
  if (!allowed.ok) return allowed;
  // The actor rides in the token's session field; it is re-checked on use.
  const token = createPurposeToken(TRY_AS_PURPOSE, target.id, String(actor.id), LINK_SECONDS);
  await recordAudit({ actorUserId: actor.id, action: "TRY_AS_LINK_CREATED", entityType: "USER", entityId: target.id, sessionId: actor.sessionId, ipAddress: actor.ipAddress });
  return { ok: true, url: new URL(`/api/auth/try/${token}`, baseUrl).toString(), name: target.name };
}

export type RedeemResult = { ok: true; token: string } | { ok: false; reason: "SIGNED_IN" | "EXPIRED" | "USED" | "REFUSED" };

export async function redeemTryAsLink(token: string, request: { signedIn: boolean; ipAddress: string | null; userAgent: string | null }): Promise<RedeemResult> {
  if (request.signedIn) return { ok: false, reason: "SIGNED_IN" }; // never replace a session (checked before the link is used up)
  const payload = verifyPurposeToken(token, TRY_AS_PURPOSE);
  const actorId = payload && /^\d+$/.test(payload.sid ?? "") ? Number(payload.sid) : null;
  if (!payload || actorId === null) return { ok: false, reason: "EXPIRED" };
  if (!(await claimSecurityLink(createHash("sha256").update(token).digest("hex")))) return { ok: false, reason: "USED" };
  const [actor, target] = await Promise.all([findUserById(actorId), findUserById(payload.uid)]);
  if (!actor || !actor.active || !target || !canTryAs(actor, target).ok) return { ok: false, reason: "REFUSED" };
  const sessionId = randomUUID();
  await createSession({ id: sessionId, userId: target.id, deviceId: null, authMethod: "TRY_AS", ipAddress: request.ipAddress, userAgent: request.userAgent, ttlSeconds: SESSION_SECONDS, triedBy: actor.id });
  await recordAudit({ actorUserId: actor.id, action: "TRY_AS_STARTED", entityType: "USER", entityId: target.id, sessionId, ipAddress: request.ipAddress, metadata: { viewOnly: true } });
  return { ok: true, token: createSessionToken(sessionId, target.id) };
}

export const TRY_AS_SESSION_SECONDS = SESSION_SECONDS;
