import type { Metadata } from "next";
import { AuthLayout } from "@/features/auth/components/AuthLayout";
import { safeNextPath } from "@/lib/http/safe-next";
import { idleLimitMinutes } from "@/server/auth/session";

export const metadata: Metadata = { title: "Signed out", robots: { index: false, follow: false } };

// v1.12.1 (owner, D-158): where a person lands when their session ends, so
// they know why and can sign in again (back to the page they were on).
const REASONS: Record<string, { title: string; body: (minutes: number) => string }> = {
  idle: { title: "Signed out after inactivity", body: (minutes) => `For security you were signed out because there was no activity for ${minutes} minutes. Anything you hadn't saved wasn't sent.` },
  expired: { title: "Your sign-in expired", body: () => "For security a sign-in lasts at most 12 hours. Please sign in again." },
  signed_out: { title: "You signed out", body: () => "You signed out of ARS-CMS on this device." },
  revoked: { title: "Signed out from another device", body: () => "Your sign-in was ended, for example by \"Sign out everywhere\" or by IT. If that wasn't you, tell IT." },
  deactivated: { title: "Your account isn't active", body: () => "Your account has been switched off. Ask IT if you need access." },
  locked: { title: "Your account is locked for now", body: () => "Too many attempts, or a security lock. Try again later or ask IT." },
};
const FALLBACK = { title: "You're signed out", body: () => "Your session has ended. Please sign in again." };

export default async function SignedOutPage({ searchParams }: { searchParams: Promise<{ reason?: string; next?: string }> }) {
  const params = await searchParams;
  const reason = REASONS[params.reason ?? ""] ?? FALLBACK;
  const next = safeNextPath(params.next);
  const minutes = await idleLimitMinutes().catch(() => 30);
  const canSignIn = params.reason !== "deactivated";
  return (
    <AuthLayout>
      <div className="w-full max-w-md" data-testid="signed-out">
        <h1 className="text-title font-semibold">{reason.title}</h1>
        <p className="mt-3 text-[length:calc(15px*var(--text-scale,1))] text-ink-muted">{reason.body(minutes)}</p>
        {canSignIn && (
          <a href={`/login?next=${encodeURIComponent(next)}`} className="btn-primary mt-6 inline-flex">
            Sign in again
          </a>
        )}
      </div>
    </AuthLayout>
  );
}
