import { expect, test } from "@playwright/test";

// The route contract independently decodes its actual signal bytes. Here the
// same transport fixture exercises the mounted card in both browser engines,
// without making a Google photo request or depending on an upstream outage.
const TRANSPARENT_PIXEL = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAAC0lEQVR4nGNgAAIAAAUAAXpeqz8AAAAASUVORK5CYII=",
  "base64",
);
type SignalLoad = { naturalWidth: number; naturalHeight: number; paintedWidth: number; paintedHeight: number };

test.use({ viewport: { width: 390, height: 844 }, serviceWorkers: "block", ignoreHTTPSErrors: false });

test("a failed photo signal collapses its place face and keeps the real listing usable", async ({ page, context, baseURL, bypassCSP, ignoreHTTPSErrors }, testInfo) => {
  expect(ignoreHTTPSErrors).toBe(false);
  const loaded: SignalLoad[] = [];
  await page.exposeFunction("recordPhotoSignalLoad", (value: SignalLoad) => loaded.push(value));
  await page.addInitScript(() => {
    document.addEventListener("load", (event) => {
      const img = event.target;
      if (!(img instanceof HTMLImageElement) || !img.closest("[data-place-card-photo]")) return;
      const rect = img.getBoundingClientRect();
      void (window as unknown as { recordPhotoSignalLoad: (value: SignalLoad) => Promise<void> }).recordPhotoSignalLoad({
        naturalWidth: img.naturalWidth, naturalHeight: img.naturalHeight,
        paintedWidth: rect.width, paintedHeight: rect.height,
      });
    }, true);
  });
  await context.addCookies([{ name: "fr_onboarded", value: "1", url: baseURL! }]);
  let interceptedPhotos = 0;
  await page.route("**/*", async (route) => {
    const request = route.request();
    if (!["GET", "HEAD"].includes(request.method())) return route.abort("blockedbyclient");
    if (new URL(request.url()).pathname === "/api/place-photo") {
      interceptedPhotos += 1;
      return route.fulfill({ status: 200, contentType: "image/png", body: TRANSPARENT_PIXEL,
        headers: { "X-Photo-Fallback": "upstream-400", "Cache-Control": "public, max-age=300, s-maxage=300" } });
    }
    return route.continue();
  });
  const response = await page.goto("/m/frederick", { waitUntil: "domcontentloaded" });
  expect(response?.status()).toBe(200);
  expect((await response!.allHeaders())["content-security-policy"]).toBeTruthy();
  const heading = page.getByRole("heading", { name: "Dancing Bear Toys and Games", exact: true });
  const card = page.locator("article").filter({ has: heading });
  const open = card.getByRole("button", { name: /^View Dancing Bear Toys and Games .*details$/ });
  await expect(heading).toBeVisible();
  await open.scrollIntoViewIfNeeded();
  await expect.poll(() => loaded.length).toBeGreaterThan(0);
  expect(loaded.every((image) => image.naturalWidth === 1 && image.naturalHeight === 1)).toBe(true);
  expect(loaded.some((image) => image.paintedWidth > 150 && image.paintedHeight > 80)).toBe(true);
  await expect(card.locator("[data-place-card-photo]")).toHaveCount(0);
  await expect(card.locator(".place-card-photo-credit")).toBeHidden();
  await expect(heading).toBeVisible();
  await expect(open).toBeVisible();
  await expect(card).toContainText("Google Maps");
  expect(interceptedPhotos).toBeGreaterThan(0);
  await testInfo.attach("photo-signal-decoding-and-fallback", {
    contentType: "application/json",
    body: JSON.stringify({ loaded, interceptedPhotos, providerRequests: 0, cspBypassed: bypassCSP,
      securityProof: "Local HTTP transport regression; public HTTPS acceptance separately keeps CSP enforcement enabled.",
      preservedListing: "Dancing Bear Toys and Games", removedBlankPhotoFace: true }),
  });
  await page.screenshot({ path: testInfo.outputPath("place-photo-factual-fallback.png") });
});
