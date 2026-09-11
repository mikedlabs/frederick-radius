// Visual-verification harness — boots nothing itself; assumes a server
// is already running at BASE_URL (default http://localhost:3000). Boot
// it (next dev / next start), then: `node scripts/screenshots.mjs`.
//
// Captures the key surfaces at a phone viewport so changes can be eyed
// (and diffed) before they ship to the live site — the antidote to
// shipping visual changes blind. Output: ./screenshots/*.png
//
// Add routes here as we work a surface.
import { chromium, devices } from "@playwright/test";
import { mkdir } from "node:fs/promises";

const BASE = process.env.BASE_URL || "http://localhost:3000";
const OUT = "screenshots";

const ROUTES = [
  { name: "today", path: "/today" },
  { name: "map", path: "/map" },
  { name: "events", path: "/events" },
  { name: "my-radius", path: "/my-radius" },
  { name: "category-coffee", path: "/category/coffee" },
];

const run = async () => {
  await mkdir(OUT, { recursive: true });
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ ...devices["iPhone 13"] });
  // Dismiss the first-visit beta intro so captures show the real
  // layouts, not the welcome overlay.
  await ctx.addInitScript(() => {
    try { localStorage.setItem("fr:beta-intro-dismissed:v8", "true"); } catch {}
  });
  await ctx.addCookies([
    { name: "fr:beta-intro-dismissed:v8", value: "true", url: BASE },
  ]);
  const page = await ctx.newPage();
  for (const r of ROUTES) {
    try {
      await page.goto(`${BASE}${r.path}`, { waitUntil: "networkidle", timeout: 45000 });
      // settle animations / lazy content
      await page.waitForTimeout(1200);
      await page.screenshot({ path: `${OUT}/${r.name}.png`, fullPage: true });
      console.log(`captured ${r.name} (${r.path})`);
    } catch (err) {
      console.log(`FAILED ${r.name} (${r.path}): ${err.message}`);
    }
  }
  await browser.close();
};

run().catch((e) => {
  console.error(e);
  process.exit(1);
});
