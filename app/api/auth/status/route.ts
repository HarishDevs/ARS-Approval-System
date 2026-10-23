import { peekSession, sessionEndReason } from "@/server/auth/session";
import { buildId } from "@/server/ops/build";

// Is this browser still signed in? (QA session 14, DEF-07.) Forms ask after
// an action fails, to tell "your session ended" apart from a network
// problem. v1.8.0: also how many seconds are left before the inactivity
// sign-out (null = none, e.g. the Super Admin), and asking doesn't count as
// activity. Nothing about who. v1.12.1: when signed out, why (this
// browser's own session only), for the signed-out page. v1.12.5: the
// running build, so an open page knows when ARS was updated (D-164).
export async function GET() {
  const status = await peekSession().catch(() => ({ signedIn: false, idleSecondsLeft: null }));
  const reason = status.signedIn ? null : await sessionEndReason().catch(() => null);
  return Response.json({ ...status, reason, build: buildId() }, { headers: { "Cache-Control": "no-store" } });
}
