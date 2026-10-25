import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getCurrentSession } from "@/server/auth/session";
import { AuthLayout } from "@/features/auth/components/AuthLayout";
import { LandingWelcome } from "@/features/public/LandingWelcome";

export const metadata: Metadata = {
  title: { absolute: "ARS Internal Workspace | ARS Steels" },
  description: "ARS Internal Workspace — the internal digital workspace for ARS Steels & Alloy International Pvt. Ltd.",
  robots: { index: true, follow: true },
};

// D-188, D-190 (owner): the public landing page of ARS Internal Workspace, on
// the same split layout as sign-in; "Sign in to continue" turns the welcome
// into the sign-in form (existing /login). Signed-in people go straight to
// their space (v1.12.2, D-161). The Google data-use explanation is in the
// privacy policy, linked below the welcome.
export default async function HomePage() {
  if (await getCurrentSession().catch(() => null)) redirect("/users");
  return (
    <AuthLayout>
      <LandingWelcome />
    </AuthLayout>
  );
}
