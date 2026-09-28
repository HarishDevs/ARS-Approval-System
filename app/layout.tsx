import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "../styles/globals.css";

const inter = Inter({ subsets: ["latin"], variable: "--font-inter", display: "swap" });

export const metadata: Metadata = {
  title: { default: "ARS Approvals", template: "%s · ARS Approvals" },
  description: "ARS Steels approval platform",
  robots: { index: false, follow: false },
  icons: { icon: "/brand/ars-mark.svg" },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={inter.variable}>
      <body className="bg-page font-sans text-body text-ink antialiased">{children}</body>
    </html>
  );
}
