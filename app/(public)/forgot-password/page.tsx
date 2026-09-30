import type { Metadata } from "next";
import { AuthLayout } from "@/features/auth/components/AuthLayout";
import { ForgotPasswordPanel } from "@/features/auth/components/ForgotPasswordPanel";
import { getAuthSecurityConfig } from "@/server/settings/values";

export const metadata: Metadata = { title: "Forgot password" };
export const dynamic = "force-dynamic";

export default async function ForgotPasswordPage() {
  const { passwordMinLength } = await getAuthSecurityConfig();
  return (
    <AuthLayout>
      <ForgotPasswordPanel minLength={passwordMinLength} />
    </AuthLayout>
  );
}
