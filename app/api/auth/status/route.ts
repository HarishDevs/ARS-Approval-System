import { getCurrentSession } from "@/server/auth/session";

// Is this browser still signed in? (QA session 14, DEF-07.) Forms ask after
// an action fails, to tell "your session ended" apart from a network
// problem. Answers only yes/no: nothing about who, or why.
export async function GET() {
  const session = await getCurrentSession().catch(() => null);
  return Response.json({ signedIn: Boolean(session && session.user.active) }, { headers: { "Cache-Control": "no-store" } });
}
