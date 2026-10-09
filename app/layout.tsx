import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
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

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={inter.variable}>
      <body className="bg-page font-sans text-body text-ink antialiased">{children}</body>
    </html>
  );
}
