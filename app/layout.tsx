import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import { cookies, headers } from "next/headers";
import { Providers } from "@/app/providers";
import { THEME_COOKIE, parseTheme, themeAttribute } from "@/server/ui/theme";
import { REQUEST_ID_HEADER } from "@/lib/logging/request-id";
import { PwaBoot } from "@/features/pwa/PwaBoot";
import { ScrollRegions } from "@/features/ui/ScrollRegions";
import { buildId } from "@/server/ops/build";
import { APP_BRANDING, TITLE_TEMPLATE } from "@/lib/branding";
import "../styles/globals.css";

// Every page is rendered per request so Next.js can stamp this request's
// CSP nonce on its scripts (middleware.ts, P1-34a).
export const dynamic = "force-dynamic";

const inter = Inter({ subsets: ["latin"], variable: "--font-inter", display: "swap" });

export const metadata: Metadata = {
  // D-246 (audit OPS-19): absolute canonical and preview links on the public pages.
  metadataBase: new URL(process.env.APP_BASE_URL ?? "https://approval.arssteels.net"),
  // D-188 (owner): the visible name. Nov 2026 branding: ARS CMS (lib/branding.ts).
  title: { default: APP_BRANDING.appName, template: TITLE_TEMPLATE },
  description: `${APP_BRANDING.appName} — the Central Management System of ARS Steels & Alloy International Pvt. Ltd.`,
  applicationName: APP_BRANDING.appName,
  robots: { index: false, follow: false },
  // WEB-04 (v1.10.0); Nov 2026: the ARS GREEN STEEL CMS app icon, made from the owner's master logo.
  icons: {
    icon: [
      { url: APP_BRANDING.favicon32, type: "image/png", sizes: "32x32" },
      { url: APP_BRANDING.favicon16, type: "image/png", sizes: "16x16" },
      { url: APP_BRANDING.icon, type: "image/png", sizes: "192x192" },
      { url: APP_BRANDING.faviconIco, sizes: "48x48" },
    ],
    shortcut: APP_BRANDING.faviconIco,
    apple: APP_BRANDING.appleTouchIcon,
  },
  appleWebApp: { capable: true, title: APP_BRANDING.shortName, statusBarStyle: "default" },
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: APP_BRANDING.themeColor },
    { media: "(prefers-color-scheme: dark)", color: "#0e131b" },
  ],
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  // #14: the page's reference, for "Copy details for IT" and error pages.
  const requestId = (await headers()).get(REQUEST_ID_HEADER) ?? "";
  // UI-02: the saved theme is painted on the first byte (no flash).
  const theme = parseTheme((await cookies()).get(THEME_COOKIE)?.value);
  return (
    <html lang="en" className={inter.variable} data-theme={themeAttribute(theme)} suppressHydrationWarning>
      <head>
        <meta name="ars-request-id" content={requestId} />
      </head>
      <body className="bg-page font-sans text-body text-ink antialiased">
        <Providers>{children}</Providers>
        {/* D-251: service worker, install invitation, daily-session device hint. */}
        <PwaBoot build={buildId()} />
        <ScrollRegions />
      </body>
    </html>
  );
}
