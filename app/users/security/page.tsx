import type { Metadata } from "next";
import { requireArea } from "@/server/authorization/guards";
import { ProfileTabs } from "@/features/shell/ProfileTabs";
import { PageHeader } from "@/features/shell/PageHeader";
import { SignOutEverywhereButton } from "@/features/shell/SignOutEverywhereButton";
import { SafeText } from "@/features/ui/SafeText";
import { Hint } from "@/features/ui/Hint";
import { listLoginHistory } from "@/lib/db/repositories/audit.repository";
import { formatIndiaTime } from "@/server/notifications/security-messages";
import { maskWhatsApp } from "@/features/ui/labels";

// WEB-05 (v1.10.0): a plain, non-confidential browser title.
export const metadata: Metadata = { title: "Sign-in & devices" };

export default async function SecurityPage() {
  const { user } = await requireArea("users");
  const recent = await listLoginHistory({ userId: user.id }, 10);
  return (
    <>
      <PageHeader title="Sign-in & devices" description="How you sign in, and what to do if you see a sign-in you don't recognise." />
      <ProfileTabs />
      <div className="max-w-2xl space-y-4">
        <section className="rounded-lg border border-line bg-surface p-5">
          <h2 className="flex items-center gap-1.5 font-semibold">
            Sign-in method
            <Hint text="Only IT can change how you sign in." align="start" />
          </h2>
          <p className="mt-1 text-ink-muted">
            {user.signInMethod === "GOOGLE"
              ? <SafeText text={`Google account (${user.email}). No code is needed.`} />
              : `User ID and password, then a code on WhatsApp${user.whatsappNumber ? ` (${maskWhatsApp(user.whatsappNumber)})` : ""}.`}
          </p>
        </section>
        <section className="rounded-lg border border-line bg-surface p-5">
          <h2 className="flex items-center gap-1.5 font-semibold">
            Your recent sign-ins
            <Hint text="Something you don't recognise? Sign out on every device below, and tell IT." align="start" />
          </h2>
          {recent.length === 0 ? (
            <p className="mt-1 text-ink-muted">None recorded yet.</p>
          ) : (
            <ul className="mt-2 divide-y divide-line">
              {recent.map((item) => (
                <li key={item.id} className="flex flex-wrap items-baseline justify-between gap-2 py-2 text-label">
                  <span>
                    {formatIndiaTime(item.occurredAt)} · {item.method === "GOOGLE" ? "Google" : "Password + code"}
                    {item.newDevice && <span className="text-warning-600"> · new device</span>}
                  </span>
                  <span className={item.success ? "text-success-600" : "text-danger-600"}>{item.success ? "Signed in" : "Failed"}</span>
                </li>
              ))}
            </ul>
          )}
        </section>
        <section className="rounded-lg border border-line bg-surface p-5">
          <h2 className="flex items-center gap-1.5 font-semibold">
            Sign out on every device
            <Hint text="Use it if you signed in on a shared computer or lost your phone." align="start" />
          </h2>
          <p className="mt-1 text-ink-muted">Ends every open session, including this one.</p>
          <div className="mt-4 max-w-xs">
            <SignOutEverywhereButton />
          </div>
        </section>
      </div>
    </>
  );
}
