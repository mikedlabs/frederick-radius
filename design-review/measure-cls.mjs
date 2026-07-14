import { chromium } from "@playwright/test";
import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

const BASE = process.env.BASE_URL || "http://127.0.0.1:3107";
const browser = await chromium.launch({ headless: true, channel: "chrome" });
const runs = [];

for (let run = 1; run <= 3; run += 1) {
  const context = await browser.newContext({
    viewport: { width: 768, height: 1024 },
    deviceScaleFactor: 1,
    hasTouch: true,
    colorScheme: "light",
    locale: "en-US",
    timezoneId: "America/New_York",
    serviceWorkers: "block",
  });
  await context.addInitScript(() => {
    localStorage.setItem("fr:beta-intro-dismissed:v10", "true");
    localStorage.setItem("fr:onboarded", "1");
    window.__reviewShifts = [];
    const selector = (node) => {
      if (!(node instanceof Element)) return null;
      if (node.id) return `#${CSS.escape(node.id)}`;
      const label = node.getAttribute("aria-label");
      if (label) return `${node.tagName.toLowerCase()}[aria-label="${label.slice(0, 80)}"]`;
      return `${node.tagName.toLowerCase()}.${[...node.classList].slice(0, 4).map((c) => CSS.escape(c)).join(".")}`;
    };
    new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) {
        if (entry.hadRecentInput) continue;
        window.__reviewShifts.push({
          value: entry.value,
          startTime: entry.startTime,
          sources: (entry.sources || []).map((source) => ({
            selector: selector(source.node),
            previousRect: source.previousRect ? {
              x: source.previousRect.x, y: source.previousRect.y,
              width: source.previousRect.width, height: source.previousRect.height,
            } : null,
            currentRect: source.currentRect ? {
              x: source.currentRect.x, y: source.currentRect.y,
              width: source.currentRect.width, height: source.currentRect.height,
            } : null,
          })),
        });
      }
    }).observe({ type: "layout-shift", buffered: true });
  });
  const page = await context.newPage();
  const response = await page.goto(`${BASE}/places/brewers-alley-frederick`, { waitUntil: "domcontentloaded", timeout: 60_000 });
  await page.waitForLoadState("networkidle", { timeout: 12_000 }).catch(() => {});
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(5_000);
  const data = await page.evaluate(() => ({
    shifts: window.__reviewShifts,
    total: window.__reviewShifts.reduce((sum, entry) => sum + entry.value, 0),
    fonts: document.fonts.status,
    images: [...document.images].map((img) => ({
      alt: img.alt,
      complete: img.complete,
      naturalWidth: img.naturalWidth,
      naturalHeight: img.naturalHeight,
      width: img.getBoundingClientRect().width,
      height: img.getBoundingClientRect().height,
      loading: img.loading,
    })),
  }));
  runs.push({ run, status: response?.status() ?? null, ...data });
  await context.close();
}

await browser.close();
await mkdir(resolve("design-review/probes"), { recursive: true });
await writeFile(resolve("design-review/probes/cls-place-tablet.json"), `${JSON.stringify({ route: "/places/brewers-alley-frederick", viewport: "768x1024", runs }, null, 2)}\n`);
console.log(JSON.stringify(runs.map(({ run, total, shifts }) => ({ run, total, shifts: shifts.length })), null, 2));
