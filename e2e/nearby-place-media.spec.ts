import { expect, test, type Locator } from "@playwright/test";

const creek = "carroll-creek-linear-park-frederick";

test.use({ serviceWorkers: "block" });
test.beforeEach(async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.addInitScript(() => {
    localStorage.setItem("fr:appearance:v1", "light");
    document.cookie = "fr_scope=town:frederick; path=/";
    document.cookie = "fr_onboarded=1; path=/";
  });
  // This journey verifies the actual owned source. Other rows may hydrate
  // canonical metadata, but no paid image bytes are needed for the check.
  await page.route("**/api/place-photo?**", (route) => route.abort());
});

async function expectReachableTarget(target: Locator) {
  await target.evaluate((node) => node.scrollIntoView({ block: "center" }));
  await expect(target).toBeVisible();
  // The shared icon button has a 36px visual face and a real 44px ::after
  // hit extender. Probe the effective target, rather than its visual box.
  await expect.poll(() => target.evaluate((node) => {
    const box = node.getBoundingClientRect();
    const x = box.left + box.width / 2;
    const y = box.top + box.height / 2;
    const points = [[x, y], [x - 21.5, y], [x + 21.5, y], [x, y - 21.5], [x, y + 21.5]];
    return points.every(([px, py]) => {
      const hit = document.elementFromPoint(px, py);
      return hit === node || Boolean(hit && node.contains(hit));
    });
  })).toBe(true);
}

for (const width of [320, 375, 390, 430]) {
  test(`Nearby uses the actual Creek photo and keeps row actions usable at ${width}px`, async ({ page }, testInfo) => {
    await page.setViewportSize({ width, height: width === 320 ? 568 : 844 });
    const metadataSlugs: string[] = [];
    page.on("request", (request) => {
      const url = new URL(request.url());
      if (url.pathname === "/api/places/by-slugs") metadataSlugs.push(...(url.searchParams.get("slugs") ?? "").split(","));
    });
    const response = await page.goto("/nearby?c=outside&in=frederick", { waitUntil: "domcontentloaded" });
    expect(response?.status()).toBe(200);
    const heading = page.getByRole("heading", { name: "Carroll Creek Linear Park", exact: true });
    const card = page.locator("article").filter({ has: heading });
    await heading.scrollIntoViewIfNeeded();
    const image = card.locator('[data-place-card-photo-source="owned"] img');
    await expect(image).toBeVisible();
    await expect.poll(() => image.evaluate((node) => (node as HTMLImageElement).naturalWidth)).toBeGreaterThan(1);
    const actualSource = await image.evaluate((node) => {
      const url = new URL((node as HTMLImageElement).currentSrc);
      return decodeURIComponent(url.searchParams.get("url") ?? url.pathname);
    });
    expect(actualSource).toBe("/images/seasons/summer/SUMMER CARROL CREEK.jpg");
    await expect(card.locator(".place-card-photo-credit")).toHaveCount(0);
    const browsingMetadataForOwnedPlace = metadataSlugs.includes(creek);
    expect(browsingMetadataForOwnedPlace).toBe(false);
    expect(await card.evaluate((node) => node.scrollWidth <= node.clientWidth)).toBe(true);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    const save = card.locator(`[data-save-ref="place:${creek}"]`);
    await expectReachableTarget(save);
    await save.click();
    await expect(save).toHaveAttribute("aria-pressed", "true");
    const open = card.getByRole("button", { name: /^View Carroll Creek Linear Park .*details$/ });
    await expectReachableTarget(open);
    await page.screenshot({ path: testInfo.outputPath(`nearby-owned-row-${width}.png`) });
    await open.click();
    await expect(page.getByRole("dialog")).toHaveCount(1);
    await expect(page.getByRole("dialog").getByRole("heading", { name: "Carroll Creek Linear Park", exact: true })).toBeVisible();
    await testInfo.attach("owned-row-evidence", { contentType: "application/json", body: JSON.stringify({
      width, actualSource, browsingMetadataForOwnedPlace, sourceCaption: false,
      paidImageTransport: "blocked", saved: true, oneDetailOverlay: true,
    }) });
  });
}
