import { expect, test, type Page } from "@playwright/test";

const pixel = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAAC0lEQVR4nGNgAAIAAAUAAXpeqz8AAAAASUVORK5CYII=",
  "base64",
);

test.use({ serviceWorkers: "block" });

async function stubFallbackPhotos(page: Page) {
  await page.route("**/api/want?**", async (route) => {
    await new Promise((resolve) => setTimeout(resolve, 1200));
    return route.fulfill({
      json: {
        hero: {
          slug: "replacement-cafe-frederick",
          name: "Replacement Cafe",
          photo: "/api/place-photo?name=places%2Freplacement%2Fphotos%2Ffront&w=800",
          where: "Frederick",
          fact: "Hours not confirmed",
          confidence: "unconfirmed",
        },
        also: [],
        soon: null,
        later: [],
        notable: [],
        contextSource: "county",
        contextLabel: "Frederick County",
        browseHref: "/places?in=county",
      },
    });
  });
  await page.route("**/api/place-photo?**", async (route) => {
    await new Promise((resolve) => setTimeout(resolve, 800));
    return route.fulfill({
      status: 200,
      contentType: "image/png",
      headers: { "x-photo-fallback": "daily-cap" },
      body: pixel,
    });
  });
}

test("Today preview height and lead stay put when photos fall back", async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await stubFallbackPhotos(page);

  await page.goto("/today?in=county", { waitUntil: "domcontentloaded" });
  const lead = page.locator("[data-today-place-preview], [data-today-opening-soon]").first();
  await expect(lead).toBeVisible();
  const firstName = (await lead.locator("[data-today-pick-name]").innerText()).trim();
  expect(firstName.length).toBeGreaterThan(0);
  const firstHeight = (await lead.boundingBox())!.height;
  const preview = page.locator("article[data-today-place-preview]").first();
  if (await preview.count()) {
    await expect(preview).toHaveAttribute("data-preview-layout", /compact|exact/);
    await preview.screenshot({ path: testInfo.outputPath("today-preview-390-first-paint-card.png") });
  }
  await page.screenshot({ path: testInfo.outputPath("today-preview-390-first-paint.png") });

  await page.waitForTimeout(2_000);
  await page.waitForLoadState("networkidle");

  await expect(lead.locator("[data-today-pick-name]")).toHaveText(firstName);
  await expect(page.locator("[data-today-pick-name]").first()).toHaveText(firstName);
  await expect(page.getByText("Replacement Cafe")).toHaveCount(0);
  await expect(page.getByRole("heading", { name: /Places likely open/i })).toHaveCount(0);
  const laterHeight = (await lead.boundingBox())!.height;
  expect(laterHeight).toBe(firstHeight);
  if (await preview.count()) {
    await expect(preview).toHaveAttribute("data-has-photo", "false");
    await preview.screenshot({ path: testInfo.outputPath("today-preview-390-after-photo-card.png") });
  }
  await page.screenshot({ path: testInfo.outputPath("today-preview-390-after-photo.png") });

  await page.setViewportSize({ width: 320, height: 844 });
  await page.addStyleTag({ content: "html { font-size: 200% !important; }" });
  await expect(lead.locator("[data-today-pick-name]")).toHaveText(firstName);
  await page.screenshot({ path: testInfo.outputPath("today-preview-320-200pct-after-photo.png") });
  await lead.screenshot({ path: testInfo.outputPath("today-preview-320-200pct-after-photo-card.png") });

  await testInfo.attach("today-preview-stability", {
    contentType: "application/json",
    body: JSON.stringify({
      firstName,
      firstHeight,
      laterHeight,
      previewAtFirstPaint: Boolean(await preview.count()),
    }),
  });
});

test("Today large-text first paint matches the settled lead", async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 320, height: 844 });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await stubFallbackPhotos(page);
  await page.addInitScript(() => {
    const style = document.createElement("style");
    style.textContent = "html { font-size: 200% !important; }";
    document.documentElement.append(style);
  });

  await page.goto("/today?in=county", { waitUntil: "domcontentloaded" });
  const lead = page.locator("[data-today-place-preview], [data-today-opening-soon]").first();
  await expect(lead).toBeVisible();
  const firstName = (await lead.locator("[data-today-pick-name]").innerText()).trim();
  const firstHeight = (await lead.boundingBox())!.height;
  await page.screenshot({ path: testInfo.outputPath("today-preview-320-200pct-first-paint.png") });
  await lead.screenshot({ path: testInfo.outputPath("today-preview-320-200pct-first-paint-card.png") });

  await page.waitForTimeout(2_000);
  await page.waitForLoadState("networkidle");
  await expect(lead.locator("[data-today-pick-name]")).toHaveText(firstName);
  expect((await lead.boundingBox())!.height).toBe(firstHeight);
  await expect(page.getByText("Replacement Cafe")).toHaveCount(0);
});
