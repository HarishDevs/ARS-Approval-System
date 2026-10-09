import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import { headers } from "next/headers";
import { REQUEST_ID_HEADER } from "@/lib/logging/request-id";
import "../styles/globals.css";

// Every page is rendered per request so Next.js can stamp this request's
// CSP nonce on its scripts (middleware.ts, P1-34a).
export const dynamic = "force-dynamic";

const inter = Inter({ subsets: ["latin"], variable: "--font-inter", display: "swap" });

export const metadata: Metadata = {
  title: { default: "ARS Approvals", template: "%s · ARS Approvals" },
  description: "ARS Steels approval platform",
  robots: { index: false, follow: false },
  icons: { icon: "/brand/ars-mark.svg", apple: "/icons/apple-touch-icon.png" },
  appleWebApp: { capable: true, title: "Approvals", statusBarStyle: "default" },
};

export const viewport: Viewport = { themeColor: "#003B6E" };

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  // #14: the page's reference, for "Copy details for IT" and error pages.
  const requestId = (await headers()).get(REQUEST_ID_HEADER) ?? "";
  return (
    <html lang="en" className={inter.variable}>
      <head>
        <meta name="ars-request-id" content={requestId} />
      </head>
      <body className="bg-page font-sans text-body text-ink antialiased">{children}</body>
    </html>
  );
}
