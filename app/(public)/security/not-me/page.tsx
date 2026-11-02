import type { Metadata } from "next";
import { NotMeConfirm } from "@/features/auth/components/NotMeConfirm";
import { APP_BRANDING } from "@/lib/branding";

export const metadata: Metadata = { title: "Secure your account" };

// Opened from the new-login alert (F-03/F-05). Nothing happens until the
// user presses the button; link previews in WhatsApp can't trigger it.
export default async function NotMePage({ searchParams }: { searchParams: Promise<{ token?: string }> }) {
  const { token } = await searchParams;
  return (
    <main className="flex min-h-full items-center justify-center px-4 py-12">
      <div className="w-full max-w-[440px] rounded-xl border border-line bg-surface p-8 shadow-card">
        {/* eslint-disable-next-line @next/next/no-img-element -- static brand logo */}
        <img src={APP_BRANDING.logo} alt={APP_BRANDING.logoAlt} width={72} height={48} className="h-12 w-auto rounded-md" />
        <NotMeConfirm token={token ?? ""} />
      </div>
    </main>
  );
}
