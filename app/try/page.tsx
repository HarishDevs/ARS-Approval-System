import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = { title: "Try as" };

// D-185: why a Try as link didn't open.
const TEXT: Record<string, { title: string; body: string }> = {
  SIGNED_IN: { title: "Open this link in a private window", body: "You're already signed in here, and Try as never replaces your own session. Copy the link and open it in a private (incognito) window: Ctrl + Shift + N in Chrome or Edge, Ctrl + Shift + P in Firefox." },
  EXPIRED: { title: "This link has expired", body: "Try as links work for 5 minutes. Go back to the person's page and press Try as again." },
  USED: { title: "This link was already used", body: "Each Try as link works once. Go back to the person's page and press Try as again." },
  REFUSED: { title: "This link can't be used", body: "The person or your access has changed. Go back to the person's page and try again." },
};

export default async function TryAsPage({ searchParams }: { searchParams: Promise<{ reason?: string }> }) {
  const text = TEXT[(await searchParams).reason ?? ""] ?? TEXT.REFUSED!;
  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col justify-center gap-4 px-6">
      <h1 className="text-title font-semibold">{text.title}</h1>
      <p className="text-ink-muted">{text.body}</p>
      <Link href="/" className="link">
        ARS CMS
      </Link>
    </main>
  );
}
