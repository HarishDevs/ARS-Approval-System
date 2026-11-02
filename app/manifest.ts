import type { MetadataRoute } from "next";
import { APP_BRANDING as B } from "@/lib/branding";

// Installable on phones and desktops (P8-02, D-106): "Add to Home screen"
// opens the app in its own window. No offline mode: approvals need the
// server, and nothing private is cached on the device.
// Nov 2026 branding: name, icons and colours come from lib/branding.ts.
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: B.fullName,
    short_name: B.shortName,
    description: B.description,
    start_url: "/users",
    scope: "/",
    display: "standalone",
    // The splash screen: the logo's own blue behind the app icon.
    background_color: B.backgroundColor,
    theme_color: B.themeColor,
    icons: [
      { src: B.icon64, sizes: "64x64", type: "image/png", purpose: "any" },
      { src: B.icon96, sizes: "96x96", type: "image/png", purpose: "any" },
      { src: B.icon, sizes: "192x192", type: "image/png", purpose: "any" },
      { src: B.icon512, sizes: "512x512", type: "image/png", purpose: "any" },
      { src: B.maskable, sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
    // v1.43.0: long-press the app icon for the four main places.
    shortcuts: [
      { name: "Approvals waiting for me", short_name: "Approvals", url: "/users/approvals", icons: [{ src: B.icon96, sizes: "96x96" }] },
      { name: "My tasks", short_name: "Tasks", url: "/users/work/my-tasks", icons: [{ src: B.icon96, sizes: "96x96" }] },
      { name: "Inbox", short_name: "Inbox", url: "/users/inbox", icons: [{ src: B.icon96, sizes: "96x96" }] },
    ],
  };
}
