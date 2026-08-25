import { expect, test } from "@playwright/test";
import { sweepMarkedHorizontalRails } from "../scripts/lib/page-quality-horizontal-rails";

const VALID_LOGO = [
  "data:image/svg+xml,",
  encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="40" height="40"><rect width="40" height="40" fill="#0b6340"/></svg>'),
].join("");

test("the page-quality sweep exercises offscreen logos without hiding a broken image", async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 568 });
  await page.setContent(`
    <style>
      #rail { display: flex; gap: 8px; overflow-x: auto; width: 280px; }
      #rail > div { flex: 0 0 720px; }
      #rail img { display: block; height: 40px; margin-left: 660px; width: 40px; }
    </style>
    <div id="rail" data-page-quality-horizontal-rail>
      ${Array.from({ length: 8 }, (_, index) => (
        `<div><img loading="lazy" data-logo="${index}" alt="Logo ${index}" src="${VALID_LOGO}"></div>`
      )).join("")}
      <div><img loading="lazy" data-broken-logo alt="Broken logo" src="data:image/png;base64,this-is-not-an-image"></div>
    </div>
  `);

  const before = await page.locator("#rail img").evaluateAll((images) => images.map((image) => ({
    complete: (image as HTMLImageElement).complete,
    naturalWidth: (image as HTMLImageElement).naturalWidth,
  })));
  expect(before.slice(2).some((image) => !image.complete)).toBe(true);

  const originalScrollLeft = await page.locator("#rail").evaluate((rail) => {
    rail.scrollLeft = 17;
    return rail.scrollLeft;
  });
  const sweep = await page.evaluate(sweepMarkedHorizontalRails, {
    selector: "[data-page-quality-horizontal-rail]",
    settleMs: 40,
    stepFraction: 0.8,
    maxStepsPerRail: 120,
  });

  await expect.poll(async () => page.locator("#rail img:not([data-broken-logo])").evaluateAll(
    (images) => images.every((image) => (
      (image as HTMLImageElement).complete && (image as HTMLImageElement).naturalWidth > 0
    )),
  )).toBe(true);

  const brokenState = await page.locator("[data-broken-logo]").evaluate((image) => ({
    complete: (image as HTMLImageElement).complete,
    naturalWidth: (image as HTMLImageElement).naturalWidth,
  }));
  const restoredScrollLeft = await page.locator("#rail").evaluate((rail) => rail.scrollLeft);

  expect(sweep.railsFound).toBe(1);
  expect(sweep.railsSwept).toBe(1);
  expect(sweep.positionsVisited).toBeGreaterThan(8);
  expect(restoredScrollLeft).toBe(originalScrollLeft);
  // This is the exact predicate used by collectDomMetrics for broken images.
  expect(brokenState.complete && brokenState.naturalWidth === 0).toBe(true);
});
