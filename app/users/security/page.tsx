import { requireArea } from "@/server/authorization/guards";
import { PageHeader } from "@/features/shell/PageHeader";
import { SignOutEverywhereButton } from "@/features/shell/SignOutEverywhereButton";

export default async function SecurityPage() {
  const { user } = await requireArea("users");
  return (
    <>
      <PageHeader title="Sign-in & devices" description="How you sign in, and what to do if you see a sign-in you don't recognise." />
      <div className="max-w-2xl space-y-4">
        <section className="rounded-lg border border-line bg-surface p-5">
          <h2 className="font-semibold">Sign-in method</h2>
          <p className="mt-1 text-ink-muted">
            {user.signInMethod === "GOOGLE"
              ? `Google account (${user.email}). No code is needed.`
              : `User ID and password, then a code on WhatsApp${user.whatsappNumber ? ` (+${user.whatsappNumber.slice(0, 2)}…${user.whatsappNumber.slice(-2)})` : ""}.`}
          </p>
          <p className="mt-2 text-label text-ink-muted">Only IT can change how you sign in.</p>
        </section>
        <section className="rounded-lg border border-line bg-surface p-5">
          <h2 className="font-semibold">Sign out on every device</h2>
          <p className="mt-1 text-ink-muted">
            Ends every open session, including this one. Use it if you signed in on a shared computer or lost your phone.
          </p>
          <div className="mt-4 max-w-xs">
            <SignOutEverywhereButton />
          </div>
        </section>
      </div>
    </>
  );
}
