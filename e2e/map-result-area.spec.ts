import { expect, test } from "@playwright/test";

test.describe("deliberate map result areas", () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true });

  test("keeps results anchored while panning, then commits the new area once", async ({
    page,
  }) => {
    const committedCamera = "-77.4100,39.4200,13.00";
    await page.goto(`/map?c=${committedCamera}`, {
      waitUntil: "domcontentloaded",
    });

    const canvas = page.locator("canvas.mapboxgl-canvas");
    await expect(canvas).toBeVisible({ timeout: 20_000 });
    await expect(page.locator(".dock-host")).toHaveAttribute(
      "data-map-loaded",
      "true",
      { timeout: 20_000 },
    );
    await expect(
      page.getByRole("button", { name: "Show results here" }),
    ).toHaveCount(0);

    const box = await canvas.boundingBox();
    expect(box).not.toBeNull();
    if (!box) return;

    const y = box.y + box.height * 0.48;
    await page.mouse.move(box.x + box.width * 0.68, y);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width * 0.28, y, { steps: 8 });
    await page.mouse.up();

    const commit = page.getByRole("button", { name: "Show results here" });
    await expect(commit).toBeVisible({ timeout: 10_000 });
    expect(new URL(page.url()).searchParams.get("c")).toBe(committedCamera);

    const commitBox = await commit.boundingBox();
    // Chromium can report a nominal 44px CSS target as 43.99999 physical
    // pixels after device-scale conversion. Round only for this tap-size
    // contract; the layout assertion remains a real 44px minimum.
    expect(Math.round(commitBox?.height ?? 0)).toBeGreaterThanOrEqual(44);

    await commit.click();
    await expect(commit).toHaveCount(0);
    await expect
      .poll(() => new URL(page.url()).searchParams.get("c"))
      .not.toBe(committedCamera);
    await expect(page.locator("[data-map-result-announcement]")).toContainText(
      /(?:Showing [\d,]+ places?|No matching places) in this area\./,
    );

    const wholeCounty = page.getByRole("button", {
      name: "Show the whole county",
    });
    await expect(wholeCounty).toBeVisible();
    await wholeCounty.click();
    await expect(commit).toHaveCount(0);
  });

  test("does not animate the contextual control when reduced motion is requested", async ({
    page,
  }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.goto("/map?c=-77.4100,39.4200,13.00", {
      waitUntil: "domcontentloaded",
    });

    const canvas = page.locator("canvas.mapboxgl-canvas");
    await expect(canvas).toBeVisible({ timeout: 20_000 });
    await expect(page.locator(".dock-host")).toHaveAttribute(
      "data-map-loaded",
      "true",
      { timeout: 20_000 },
    );
    const box = await canvas.boundingBox();
    expect(box).not.toBeNull();
    if (!box) return;

    const y = box.y + box.height * 0.48;
    await page.mouse.move(box.x + box.width * 0.66, y);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width * 0.3, y, { steps: 6 });
    await page.mouse.up();

    const commit = page.getByRole("button", { name: "Show results here" });
    await expect(commit).toBeVisible({ timeout: 10_000 });
    await expect(commit).toHaveCSS("animation-name", "none");
  });
});
