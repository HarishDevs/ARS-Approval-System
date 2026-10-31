import type { MetadataRoute } from "next";

// D-246 (audit OPS-18): the three public pages.
export default function sitemap(): MetadataRoute.Sitemap {
  const base = process.env.APP_BASE_URL ?? "https://approval.arssteels.net";
  return ["/", "/privacy", "/terms"].map((path) => ({ url: `${base}${path === "/" ? "" : path}`, changeFrequency: "monthly", priority: path === "/" ? 1 : 0.5 }));
}
