import { keepSessionAlive } from "@/server/auth/session";

// v1.8.0: "Stay signed in" (or activity in the page) counts as activity now.
// Only for a live session; answers yes/no, nothing else.
export async function POST() {
  const ok = await keepSessionAlive().catch(() => false);
  return Response.json({ signedIn: ok }, { status: ok ? 200 : 401, headers: { "Cache-Control": "no-store" } });
}
