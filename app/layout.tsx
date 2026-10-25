import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import { cookies, headers } from "next/headers";
import { Providers } from "@/app/providers";
import { THEME_COOKIE, parseTheme, themeAttribute } from "@/server/ui/theme";
import { REQUEST_ID_HEADER } from "@/lib/logging/request-id";
import "../styles/globals.css";

// Every page is rendered per request so Next.js can stamp this request's
// CSP nonce on its scripts (middleware.ts, P1-34a).
export const dynamic = "force-dynamic";

const inter = Inter({ subsets: ["latin"], variable: "--font-inter", display: "swap" });

export const metadata: Metadata = {
  // D-188 (owner): the visible name is ARS Internal Workspace.
  title: { default: "ARS Internal Workspace", template: "%s · ARS Internal Workspace" },
  description: "ARS Internal Workspace — the internal digital workspace for ARS Steels & Alloy International Pvt. Ltd.",
  robots: { index: false, follow: false },
  // WEB-04 (v1.10.0): the ARS mark as SVG, with PNG and ICO fallbacks made
  // from the same brand icon for browsers that don't take SVG.
  icons: {
    icon: [
      { url: "/brand/ars-mark.svg", type: "image/svg+xml" },
      { url: "/icons/icon-192.png", type: "image/png", sizes: "192x192" },
      { url: "/favicon.ico", sizes: "48x48" },
    ],
    shortcut: "/favicon.ico",
    apple: "/icons/apple-touch-icon.png",
  },
  appleWebApp: { capable: true, title: "ARS Workspace", statusBarStyle: "default" },
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#003B6E" },
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
      </body>
    </html>
  );
}
