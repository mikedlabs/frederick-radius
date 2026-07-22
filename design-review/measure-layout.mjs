import { chromium } from "@playwright/test";
import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

const BASE = process.env.BASE_URL || "http://127.0.0.1:3107";
const out = {};
const browser = await chromium.launch({ headless: true, channel: "chrome" });

async function pageFor(width, height, path, delay = 1800) {
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
    localStorage.setItem("fr:beta-intro-dismissed:v10", "true");
    localStorage.setItem("fr:onboarded", "1");
  });
  const page = await context.newPage();
  await page.goto(`${BASE}${path}`, { waitUntil: "domcontentloaded", timeout: 60_000 });
  await page.waitForLoadState("networkidle", { timeout: 12_000 }).catch(() => {});
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(delay);
  await page.addStyleTag({ content: "nextjs-portal { display: none !important; }" });
  return { page, context };
}

for (const [view, width, height] of [["mobile-375x812", 375, 812], ["tablet-768x1024", 768, 1024]]) {
  out[view] = {};
  for (const [name, path] of [
    ["place", "/places/brewers-alley-frederick"],
    ["event", "/events/alive-at-five-2026-07-16"],
  ]) {
    const { page, context } = await pageFor(width, height, path);
    out[view][name] = await page.evaluate(({ height }) => {
      const toolbar = document.querySelector('[role="toolbar"]');
      const primaryNav = document.querySelector('nav[aria-label="Primary"]');
      const tr = toolbar?.getBoundingClientRect();
      const nr = primaryNav?.getBoundingClientRect();
      const allFixed = [...document.querySelectorAll("body *")]
        .filter((el) => getComputedStyle(el).position === "fixed" && getComputedStyle(el).display !== "none")
        .map((el) => {
          const r = el.getBoundingClientRect();
          return {
            tag: el.tagName.toLowerCase(),
            role: el.getAttribute("role"),
            label: el.getAttribute("aria-label") || null,
            className: String(el.className || "").slice(0, 160),
            y: Number(r.y.toFixed(1)),
            height: Number(r.height.toFixed(1)),
            bottom: Number(r.bottom.toFixed(1)),
          };
        });
      return {
        viewportHeight: height,
        toolbar: tr ? { y: tr.y, height: tr.height, bottom: tr.bottom } : null,
        primaryNav: nr ? { y: nr.y, height: nr.height, bottom: nr.bottom } : null,
        combinedBottomChromeFromToolbarTopPx: tr ? Number((height - tr.y).toFixed(1)) : null,
        combinedBottomChromeViewportPercent: tr ? Number((((height - tr.y) / height) * 100).toFixed(1)) : null,
        gapBetweenToolbarAndNavPx: tr && nr ? Number((nr.y - tr.bottom).toFixed(1)) : null,
        overlapPx: tr && nr ? Number(Math.max(0, tr.bottom - nr.y).toFixed(1)) : null,
        allFixed,
      };
    }, { height });
    await context.close();
  }
}

{
  const { page, context } = await pageFor(1440, 900, "/map", 4500);
  out.desktopMap = await page.evaluate(() => {
    const map = document.querySelector(".mapboxgl-map");
    const canvas = document.querySelector(".mapboxgl-canvas");
    const main = document.querySelector("main");
    const nav = document.querySelector('nav[aria-label="Primary"]');
    const topbar = document.querySelector("header");
    const r = (el) => {
      if (!el) return null;
      const box = el.getBoundingClientRect();
      return { y: box.y, height: box.height, bottom: box.bottom, width: box.width, display: getComputedStyle(el).display };
    };
    const mapRect = map?.getBoundingClientRect();
    return {
      viewport: { width: innerWidth, height: innerHeight },
      rootBottomNavReserve: getComputedStyle(document.documentElement).getPropertyValue("--app-bottomnav-reserve").trim(),
      rootBrowseMapHeight: getComputedStyle(document.documentElement).getPropertyValue("--app-browse-map-height").trim(),
      computedBrowseMapHeight: getComputedStyle(document.documentElement).getPropertyValue("--app-browse-map-height").trim(),
      topbar: r(topbar),
      map: r(map),
      canvas: r(canvas),
      main: r(main),
      primaryNav: r(nav),
      blankViewportBelowMapPx: mapRect ? Number((innerHeight - mapRect.bottom).toFixed(1)) : null,
    };
  });
  await context.close();
}

{
  const { page, context } = await pageFor(375, 812, "/events");
  out.mobileEvents = await page.evaluate(() => {
    const quickChip = [...document.querySelectorAll("button")].find((el) => el.textContent?.trim() === "This weekend");
    const scroller = quickChip?.parentElement;
    const viewGroup = document.querySelector('[aria-label*="view" i]') || [...document.querySelectorAll("div")].find((el) => el.querySelectorAll('button[aria-label$="view"]').length === 4);
    return {
      quickChipScroller: scroller ? {
        clientWidth: scroller.clientWidth,
        scrollWidth: scroller.scrollWidth,
        clippedPx: scroller.scrollWidth - scroller.clientWidth,
        overflowX: getComputedStyle(scroller).overflowX,
      } : null,
      viewButtons: [...document.querySelectorAll('button[aria-label$="view"]')].map((el) => {
        const r = el.getBoundingClientRect();
        const before = getComputedStyle(el, "::before");
        return {
          label: el.getAttribute("aria-label"),
          width: r.width,
          height: r.height,
          pseudoWidth: Number.parseFloat(before.width) || 0,
          pseudoHeight: Number.parseFloat(before.height) || 0,
        };
      }),
      viewGroupText: viewGroup?.textContent?.replace(/\s+/g, " ").trim().slice(0, 160) || null,
    };
  });
  await context.close();
}

{
  const { page, context } = await pageFor(375, 812, "/search?q=coffee");
  out.mobileSearch = await page.evaluate(() => {
    const section = document.querySelector('section[aria-label*="results for"]');
    const rows = section ? [...section.querySelectorAll("li > a")] : [];
    return {
      resultCountLabel: section?.getAttribute("aria-label") || null,
      renderedRows: rows.length,
      firstFive: rows.slice(0, 5).map((el) => {
        const r = el.getBoundingClientRect();
        return { text: el.textContent?.replace(/\s+/g, " ").trim(), height: r.height };
      }),
      rowsMentionOpen: rows.filter((el) => /open|closed/i.test(el.textContent || "")).length,
      rowsMentionDistance: rows.filter((el) => /\b\d+(?:\.\d+)?\s*(?:mi|ft|min walk)\b/i.test(el.textContent || "")).length,
    };
  });
  await context.close();
}

await browser.close();
await mkdir(resolve("design-review/probes"), { recursive: true });
await writeFile(resolve("design-review/probes/layout-measurements.json"), `${JSON.stringify(out, null, 2)}\n`);
console.log(JSON.stringify(out, null, 2));
