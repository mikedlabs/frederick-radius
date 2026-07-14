import { chromium } from "@playwright/test";
import { mkdir } from "node:fs/promises";
import { resolve } from "node:path";

const BASE = process.env.BASE_URL || "http://127.0.0.1:3107";
const OUT = resolve("design-review/screenshots");

const routes = [
  ["beta", "/beta"],
  ["today", "/today"],
  ["map", "/map"],
  ["events", "/events"],
  ["saved", "/my-radius"],
  ["search-coffee", "/search?q=coffee"],
  ["place-brewers-alley", "/places/brewers-alley-frederick"],
  ["event-alive-at-five", "/events/alive-at-five-2026-07-16"],
  ["town-frederick", "/m/frederick"],
];

const viewports = [
  ["mobile-375x812", 375, 812],
  ["tablet-768x1024", 768, 1024],
  ["desktop-1440x900", 1440, 900],
];

await mkdir(OUT, { recursive: true });
const browser = await chromium.launch({ headless: true, channel: "chrome" });

for (const [viewportName, width, height] of viewports) {
  for (const [routeName, path] of routes) {
    const context = await browser.newContext({
      viewport: { width, height },
      deviceScaleFactor: 1,
      isMobile: width === 375,
      hasTouch: width < 1024,
      colorScheme: "light",
      locale: "en-US",
      timezoneId: "America/New_York",
      geolocation: { latitude: 39.4143, longitude: -77.4105 },
      permissions: ["geolocation"],
      serviceWorkers: "block",
    });
    await context.addInitScript(() => {
      try {
        localStorage.setItem("fr:beta-intro-dismissed:v10", "true");
      } catch {}
    });
    const page = await context.newPage();
    await page.goto(`${BASE}${path}`, { waitUntil: "domcontentloaded", timeout: 60_000 });
    await page.evaluate(() => document.fonts.ready);
    await page.waitForTimeout(routeName === "map" ? 4_000 : 1_500);
    await page.addStyleTag({ content: "nextjs-portal { display: none !important; }" });
    await page.screenshot({
      path: resolve(OUT, `${routeName}--${viewportName}--viewport.png`),
      fullPage: false,
      animations: "disabled",
    });
    console.log(`captured viewport ${routeName} ${viewportName}`);
    await context.close();
  }
}

await browser.close();
