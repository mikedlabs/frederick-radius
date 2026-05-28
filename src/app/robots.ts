import type { MetadataRoute } from "next";

const BASE = process.env.NEXT_PUBLIC_BASE_URL ?? "https://frederickradius.app";

// User-agent strings used by major LLM training / dataset crawlers.
// Listed explicitly because they each declare a distinct UA and a
// generic `User-agent: *` Disallow would also block legitimate
// search-engine crawlers we DO want.
//
// Sources for these UAs (May 2026):
//   - OpenAI:    GPTBot, ChatGPT-User, OAI-SearchBot
//   - Google:    Google-Extended (training only; Googlebot stays welcome)
//   - Anthropic: anthropic-ai, ClaudeBot, Claude-Web
//   - Common Crawl: CCBot (training set used by many models)
//   - Meta:      FacebookBot, Meta-ExternalAgent
//   - Bytedance/TikTok: Bytespider
//   - Perplexity: PerplexityBot
//   - Cohere:    cohere-ai
//   - Amazonbot, Applebot-Extended (Apple's training-only signal)
//   - DiffBot, omgili
//
// Maintain this list as new training crawlers declare themselves.
const AI_TRAINING_USER_AGENTS = [
  "GPTBot",
  "ChatGPT-User",
  "OAI-SearchBot",
  "Google-Extended",
  "anthropic-ai",
  "ClaudeBot",
  "Claude-Web",
  "CCBot",
  "FacebookBot",
  "Meta-ExternalAgent",
  "Bytespider",
  "PerplexityBot",
  "cohere-ai",
  "Amazonbot",
  "Applebot-Extended",
  "DiffBot",
  "omgili",
];

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
        //   /my-radius       — user-only state surface (renamed from /saved)
        disallow: [
          "/api/",
          "/admin/",
          "/business/manage/",
          "/settings/",
          "/submit/",
          "/welcome",
          "/my-radius",
        ],
      },
      // AI-training opt-out. Each LLM crawler declares its own UA;
      // a flat Disallow per agent is the only machine-readable way
      // to say "you can't train on this." Honored by good actors;
      // bad actors will scrape anyway, which is what the /terms
      // page + LICENSE address legally.
      ...AI_TRAINING_USER_AGENTS.map((userAgent) => ({
        userAgent,
        disallow: ["/"],
      })),
    ],
    sitemap: `${BASE}/sitemap.xml`,
    host: BASE,
  };
}
