import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { AuthLayout } from "@/features/auth/components/AuthLayout";
import { SignInPanel } from "@/features/auth/components/SignInPanel";
import { getCurrentSession } from "@/server/auth/session";
import { safeNextPath } from "@/lib/http/safe-next";

export const metadata: Metadata = { title: "Sign in" };


export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string | string[] }> }) {
  const next = safeNextPath((await searchParams).next);
  if (await getCurrentSession().catch(() => null)) redirect(next);

  return (
    <AuthLayout>
      <SignInPanel nextPath={next} />
    </AuthLayout>
  );
}
