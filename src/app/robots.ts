import type { MetadataRoute } from "next";

const BASE = process.env.NEXT_PUBLIC_BASE_URL ?? "https://frederickradius.app";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        // Keep crawlers out of:
        //   /api/            — JSON endpoints, not pages
        //   /admin/          — Basic-Auth-gated moderation surfaces
        //   /business/manage/ — token-gated owner surface (no auth wall, so we MUST robots-block)
        //   /settings/       — per-device preferences (no content)
        //   /submit/         — submission forms (no content)
        //   /welcome         — first-run onboarding (no content)
        //   /saved           — user-only state surface
        disallow: [
          "/api/",
          "/admin/",
          "/business/manage/",
          "/settings/",
          "/submit/",
          "/welcome",
          "/saved",
        ],
      },
    ],
    sitemap: `${BASE}/sitemap.xml`,
    host: BASE,
  };
}
