import type { MetadataRoute } from "next";

// Installable on phones and desktops (P8-02, D-106): "Add to Home screen"
// opens the app in its own window. No offline mode: approvals need the
// server, and nothing private is cached on the device.
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "ARS-CMS · Central Management System",
    short_name: "ARS-CMS",
    description: "ARS-CMS, the Central Management System of ARS Steels & Alloy International Pvt. Ltd.",
    start_url: "/users",
    scope: "/",
    display: "standalone",
    background_color: "#ffffff",
    theme_color: "#003B6E",
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icons/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
