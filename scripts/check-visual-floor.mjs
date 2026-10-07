#!/usr/bin/env node
/**
 * Visual-floor ratchet (docs/VISUAL_FIRST.md, build step 2).
 *
 * Loads each surface at 390 x 844 as a first-time visitor and measures the
 * first viewport between the sticky header and the bottom nav. A surface meets
 * the floor when it shows at least one real picture or map of 96 x 96 px or
 * more there.
 *
 * What counts as a real picture or map:
 *   - an <img> that decoded larger than 1 x 1 (the place-photo proxy's
 *     failure signal is 1 x 1, so a missing photo never counts);
 *   - a <canvas> (the MapLibre and Mapbox maps draw into one);
 *   - a <video>.
 * CSS backgrounds never count: in this product they are paper texture.
 * Pixels under overlaid type DO count as picture. Measuring only the pixels
 * between letters made two earlier probes disagree by up to 8 points on
 * photos with titles, and the floor asks whether a picture is there, not how
 * much of it is unlettered.
 * An element covered by an opaque sheet or dialog does not count.
 *
 * The baseline (scripts/visual-floor-baseline.json) is a ratchet like
 * scripts/style-lint-baseline.json. Every surface listed there as `enforced`
 * must keep meeting the floor; the check fails when one regresses. `--write`
 * records the current measurements and enforces every surface that meets the
 * floor now. It never un-enforces a surface: dropping one is a reviewed edit
 * to the JSON, not a side effect of a bad run.
 *
 * Usage:
 *   node scripts/check-visual-floor.mjs                  # check production
 *   node scripts/check-visual-floor.mjs --base http://localhost:3010
 *   node scripts/check-visual-floor.mjs --only /today --only /map
 *   node scripts/check-visual-floor.mjs --write          # update the ratchet
 *
 * A sandbox with a preinstalled Chromium can set PW_CHROMIUM_PATH, the same
 * variable playwright.config.ts reads.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "@playwright/test";

const HERE = dirname(fileURLToPath(import.meta.url));
const BASELINE_PATH = join(HERE, "visual-floor-baseline.json");
const VIEWPORT = { width: 390, height: 844 };
const MIN_SIDE = 96;

function parseArgs(argv) {
  const out = { base: process.env.VISUAL_FLOOR_BASE_URL || "https://frederickradius.app", only: [], write: false };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--write") out.write = true;
    else if (arg === "--base") out.base = argv[++i];
    else if (arg === "--only") out.only.push(argv[++i]);
    else throw new Error(`Unknown argument: ${arg}`);
  }
  out.base = out.base.replace(/\/$/, "");
  return out;
}

/** Runs in the page. Returns the visual measurements for the first viewport. */
function measureFirstViewport(minSide) {
  const vw = window.innerWidth;
  const vh = window.innerHeight;

  // Chrome: full-width fixed or sticky bars touching the top or the bottom.
  let bandTop = 0;
  let bandBottom = vh;
  for (const el of document.querySelectorAll("body *")) {
    const style = getComputedStyle(el);
    if (style.position !== "fixed" && style.position !== "sticky") continue;
    if (style.visibility !== "visible" || style.display === "none") continue;
    const r = el.getBoundingClientRect();
    if (r.width < vw * 0.8 || r.height <= 0 || r.height > 200) continue;
    if (r.top <= 1 && r.bottom > bandTop && r.bottom < vh / 2) bandTop = r.bottom;
    if (r.bottom >= vh - 1 && r.top < bandBottom && r.top > vh / 2) bandBottom = r.top;
  }

  const opaque = (el) => {
    const style = getComputedStyle(el);
    const match = style.backgroundColor.match(/rgba?\(([^)]+)\)/);
    const alpha = match ? Number(match[1].split(",")[3] ?? 1) : 0;
    return alpha >= 0.5 || style.backdropFilter !== "none";
  };

  /** Visible box of an element after clipping ancestors, the viewport and the chrome. */
  const visibleBox = (el) => {
    const r = el.getBoundingClientRect();
    let left = r.left;
    let top = r.top;
    let right = r.right;
    let bottom = r.bottom;
    for (let p = el.parentElement; p; p = p.parentElement) {
      const style = getComputedStyle(p);
      if (/(hidden|clip|auto|scroll)/.test(style.overflow + style.overflowX + style.overflowY)) {
        const pr = p.getBoundingClientRect();
        left = Math.max(left, pr.left);
        top = Math.max(top, pr.top);
        right = Math.min(right, pr.right);
        bottom = Math.min(bottom, pr.bottom);
      }
    }
    left = Math.max(left, 0);
    right = Math.min(right, vw);
    top = Math.max(top, bandTop);
    bottom = Math.min(bottom, bandBottom);
    return { left, top, width: Math.max(0, right - left), height: Math.max(0, bottom - top) };
  };

  /** True when the element is painted at most of a 3 x 3 grid of its visible box. */
  const unobstructed = (el, box) => {
    let seen = 0;
    for (const fx of [0.2, 0.5, 0.8]) {
      for (const fy of [0.2, 0.5, 0.8]) {
        const stack = document.elementsFromPoint(box.left + box.width * fx, box.top + box.height * fy);
        const at = stack.indexOf(el);
        if (at < 0) continue;
        const above = stack.slice(0, at).filter((a) => !el.contains(a) && !a.contains(el));
        if (above.every((a) => !opaque(a) && !/^(IMG|CANVAS|VIDEO)$/.test(a.tagName))) seen += 1;
      }
    }
    return seen >= 5;
  };

  const visuals = [];
  for (const el of document.querySelectorAll("img, canvas, video")) {
    const style = getComputedStyle(el);
    if (style.visibility !== "visible" || Number(style.opacity) < 0.1) continue;
    if (el.tagName === "IMG" && !(el.complete && el.naturalWidth > 1 && el.naturalHeight > 1)) continue;
    if (el.tagName === "VIDEO" && el.readyState < 2) continue;
    const box = visibleBox(el);
    if (box.width < 1 || box.height < 1) continue;
    if (!unobstructed(el, box)) continue;
    const name = el.tagName === "IMG"
      ? (el.getAttribute("alt") || el.currentSrc.split("?")[0].split("/").pop() || "image")
      : el.closest(".maplibregl-map, .mapboxgl-map") ? "map" : el.tagName.toLowerCase();
    visuals.push({
      kind: el.tagName.toLowerCase(),
      name: name.slice(0, 60),
      width: Math.round(box.width),
      height: Math.round(box.height),
      left: box.left,
      top: box.top,
      qualifies: box.width >= minSide && box.height >= minSide,
    });
  }

  // Union area of the qualifying boxes, sampled on a 4 px grid.
  const qualifying = visuals.filter((v) => v.qualifies);
  let hits = 0;
  let total = 0;
  for (let y = bandTop + 2; y < bandBottom; y += 4) {
    for (let x = 2; x < vw; x += 4) {
      total += 1;
      if (qualifying.some((v) => x >= v.left && x < v.left + v.width && y >= v.top && y < v.top + v.height)) hits += 1;
    }
  }

  return {
    band: [Math.round(bandTop), Math.round(bandBottom)],
    share: total ? Math.round((hits / total) * 1000) / 1000 : 0,
    meetsFloor: qualifying.length > 0,
    visuals: visuals.map((v) => ({ kind: v.kind, name: v.name, width: v.width, height: v.height, qualifies: v.qualifies })),
  };
}

async function measure(browser, base, path) {
  const context = await browser.newContext({
    viewport: VIEWPORT,
    deviceScaleFactor: 1,
    timezoneId: "America/New_York",
    locale: "en-US",
  });
  const page = await context.newPage();
  try {
    await page.goto(`${base}${path}`, { waitUntil: "load", timeout: 60_000 });
    await page.waitForLoadState("networkidle", { timeout: 15_000 }).catch(() => {});
    // Maps paint after their tiles land, and lazy images decode after idle.
    await page.waitForTimeout(2_500);
    return await page.evaluate(measureFirstViewport, MIN_SIDE);
  } finally {
    await context.close();
  }
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const baseline = JSON.parse(readFileSync(BASELINE_PATH, "utf8"));
  const paths = args.only.length ? args.only : Object.keys(baseline.surfaces);
  const browser = await chromium.launch({
    ...(process.env.PW_CHROMIUM_PATH
      ? { executablePath: process.env.PW_CHROMIUM_PATH, args: ["--no-sandbox"] }
      : {}),
  });

  const failures = [];
  const results = {};
  try {
    for (const path of paths) {
      let result;
      try {
        result = await measure(browser, args.base, path);
      } catch (error) {
        // One retry: a cold serverless render can outlast the first load.
        result = await measure(browser, args.base, path).catch((retryError) => ({ error: String(retryError.message || retryError) }));
        if (!result.error) console.log(`  retried ${path} after: ${String(error.message || error).slice(0, 80)}`);
      }
      results[path] = result;
      const entry = baseline.surfaces[path] ?? { enforced: false };
      if (result.error) {
        console.log(`✗ ${path}: could not load (${result.error.slice(0, 120)})`);
        if (entry.enforced) failures.push(path);
        continue;
      }
      const largest = result.visuals.filter((v) => v.qualifies).map((v) => `${v.name} ${v.width}x${v.height}`)[0] ?? "none";
      const mark = result.meetsFloor ? "✓" : entry.enforced ? "✗" : "·";
      console.log(`${mark} ${path}: ${(result.share * 100).toFixed(1)}% picture or map, largest ${largest}${entry.enforced ? " (enforced)" : ""}`);
      if (entry.enforced && !result.meetsFloor) failures.push(path);
    }
  } finally {
    await browser.close();
  }

  if (args.write) {
    for (const [path, result] of Object.entries(results)) {
      if (result.error) continue;
      const previous = baseline.surfaces[path] ?? { enforced: false };
      baseline.surfaces[path] = {
        enforced: previous.enforced || result.meetsFloor,
        share: result.share,
      };
    }
    baseline.measured = new Date().toISOString().slice(0, 10);
    baseline.base = args.base;
    writeFileSync(BASELINE_PATH, `${JSON.stringify(baseline, null, 2)}\n`);
    console.log(`Wrote ${BASELINE_PATH}.`);
  }

  if (failures.length && !args.write) {
    console.error(`\nVisual floor regressed on ${failures.join(", ")}. Each enforced surface must show a real picture or map of at least ${MIN_SIDE} px in its first viewport (docs/VISUAL_FIRST.md).`);
    process.exit(1);
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
