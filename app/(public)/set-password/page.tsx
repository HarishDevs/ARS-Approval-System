import { MailLink } from "@/features/ui/MailLink";
import type { Metadata } from "next";
import Link from "next/link";
import { AuthLayout } from "@/features/auth/components/AuthLayout";
import { SetPasswordPanel } from "@/features/auth/components/SetPasswordPanel";
import { inspectSetPasswordLink } from "@/server/auth/set-password";
import { getAuthSecurityConfig } from "@/server/settings/values";

export const metadata: Metadata = { title: "Set your password", referrer: "no-referrer" };
export const dynamic = "force-dynamic";

// F-04. Opening the link only shows the form; nothing is used up until the
// WhatsApp code is confirmed (link previews in chat apps fetch URLs).
export default async function SetPasswordPage({ searchParams }: { searchParams: Promise<{ token?: string | string[] }> }) {
  const raw = (await searchParams).token;
  const token = Array.isArray(raw) ? raw[0] : raw;
  const link = token ? await inspectSetPasswordLink(token) : { valid: false as const };
  const { passwordMinLength } = await getAuthSecurityConfig();

  return (
    <AuthLayout>
      {link.valid && token ? (
        <SetPasswordPanel token={token} name={link.name} loginId={link.loginId} minLength={passwordMinLength} />
      ) : (
        <div className="mt-8">
          <h1 className="text-display font-bold">Link not valid</h1>
          <p className="mt-2 text-[length:calc(15px*var(--text-scale,1))] text-ink-muted">This link has expired or was already used. Ask IT (<MailLink address="itadmin@arssteels.co.in" />) to send a new one.</p>
          <Link href="/login" className="link mt-6 inline-block">
            Go to sign in
          </Link>
        </div>
      )}
    </AuthLayout>
  );
}
