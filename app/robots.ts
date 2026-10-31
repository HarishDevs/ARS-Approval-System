import type { MetadataRoute } from "next";

// D-246 (audit OPS-18): crawlers may read the public pages only; everything
// signed-in (and every API) is off limits. The pages say "noindex" too.
export default function robots(): MetadataRoute.Robots {
  const base = process.env.APP_BASE_URL ?? "https://approval.arssteels.net";
  return {
    rules: [{ userAgent: "*", allow: ["/$", "/privacy", "/terms"], disallow: ["/users", "/admin", "/superadmin", "/api", "/login", "/signed-out", "/set-password", "/forgot-password", "/security", "/try"] }],
    sitemap: `${base}/sitemap.xml`,
  };
}
