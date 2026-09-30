import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { AuthLayout } from "@/features/auth/components/AuthLayout";
import { SignInPanel } from "@/features/auth/components/SignInPanel";
import { getCurrentSession } from "@/server/auth/session";

export const metadata: Metadata = { title: "Sign in" };

function safeNext(next: string | string[] | undefined): string {
  const value = Array.isArray(next) ? next[0] : next;
  // Only internal paths, never another site.
  return value && value.startsWith("/") && !value.startsWith("//") ? value : "/users";
}

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string | string[] }> }) {
  const next = safeNext((await searchParams).next);
  if (await getCurrentSession().catch(() => null)) redirect(next);

  return (
    <AuthLayout>
      <SignInPanel nextPath={next} />
    </AuthLayout>
  );
}
