import type { Metadata } from "next";
import { APP_BRANDING } from "@/lib/branding";
import { redirect } from "next/navigation";
import { getCurrentSession } from "@/server/auth/session";
import { AuthLayout } from "@/features/auth/components/AuthLayout";
import { LandingWelcome } from "@/features/public/LandingWelcome";

export const metadata: Metadata = {
  title: { absolute: "ARS CMS | ARS Steels" },
  description: "ARS CMS is the Central Management System of ARS Steels & Alloy International Pvt. Ltd.: multi-level approvals, information notices, tasks and an optional Google Calendar link.",
  applicationName: "ARS CMS",
  robots: { index: true, follow: true },
  // D-246 (audit OPS-19): canonical address and link previews.
  alternates: { canonical: "/" },
  openGraph: { type: "website", siteName: "ARS CMS", url: "/", title: "ARS CMS | ARS Steels", description: "The Central Management System of ARS Steels & Alloy International Pvt. Ltd.", images: [{ url: APP_BRANDING.ogImage, width: 1200, height: 630, alt: APP_BRANDING.logoAlt }] },
};

// D-188, D-190 (owner): the public landing page on the same split layout as
// sign-in; "Sign in" turns the welcome into the sign-in form (existing
// /login). D-200 (supersedes the D-198 page): the owner chose the split
// screen back, made Google-safe (see LandingWelcome). Signed-in people go
// straight to their space (v1.12.2, D-161).
export default async function HomePage() {
  if (await getCurrentSession().catch(() => null)) redirect("/users");
  return (
    <AuthLayout landing>
      <LandingWelcome />
    </AuthLayout>
  );
}
