import { expect, test } from "@playwright/test";
import { readFileSync } from "node:fs";

// The route contract independently decodes its actual signal bytes. Here the
// same transport fixture exercises the mounted card in both browser engines,
// without making a Google photo request or depending on an upstream outage.
const TRANSPARENT_PIXEL = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAAC0lEQVR4nGNgAAIAAAUAAXpeqz8AAAAASUVORK5CYII=",
  "base64",
);
type SignalLoad = { naturalWidth: number; naturalHeight: number; paintedWidth: number; paintedHeight: number; placeName: string | null; sourceUrl: string };
const FALLBACK_PLACE_SLUG = "dancing-bear-toys-and-games";
const fallbackPhotoRecord = (JSON.parse(readFileSync("src/data/places-enrichment.json", "utf8")) as Record<string, {
  google_place_id: string; photo_names: string[]; photo_attributions: { photo_name: string }[];
}>)[FALLBACK_PLACE_SLUG];

test.use({ viewport: { width: 390, height: 844 }, serviceWorkers: "block", ignoreHTTPSErrors: false });

test("a failed photo signal collapses its place face and keeps the real listing usable", async ({ page, context, baseURL, bypassCSP, ignoreHTTPSErrors }, testInfo) => {
  expect(ignoreHTTPSErrors).toBe(false);
  const loaded: SignalLoad[] = [];
  await page.exposeFunction("recordPhotoSignalLoad", (value: SignalLoad) => loaded.push(value));
  await page.addInitScript(() => {
    document.addEventListener("load", (event) => {
      const img = event.target;
      if (!(img instanceof HTMLImageElement) || !img.closest('[data-place-card-photo-source="google"]')) return;
      const rect = img.getBoundingClientRect();
      void (window as unknown as { recordPhotoSignalLoad: (value: SignalLoad) => Promise<void> }).recordPhotoSignalLoad({
        naturalWidth: img.naturalWidth, naturalHeight: img.naturalHeight,
        paintedWidth: rect.width, paintedHeight: rect.height,
        placeName: img.closest("article")?.querySelector("h3")?.textContent?.trim() ?? null,
        sourceUrl: img.currentSrc || img.src,
      });
    }, true);
  });
  await context.addCookies([
    { name: "fr_onboarded", value: "1", url: baseURL! },
    { name: "fr_scope", value: "town:frederick", url: baseURL! },
  ]);
  let interceptedPhotos = 0;
  let blockedGoogleRequests = 0;
  let blockedEnrichmentRequests = 0;
  const interceptedPhotoNames = new Set<string>();
  await page.route("**/*", async (route) => {
    const request = route.request();
    if (!["GET", "HEAD"].includes(request.method())) return route.abort("blockedbyclient");
    const url = new URL(request.url());
    const optimizedSource = url.searchParams.get("url") ?? "";
    if (/(^|\.)(googleapis\.com|googleusercontent\.com)$/.test(url.hostname)) {
      blockedGoogleRequests += 1;
      return route.abort("blockedbyclient");
    }
    if (/^\/api\/place\/[^/]+\/enrich$/.test(url.pathname)) {
      blockedEnrichmentRequests += 1;
      return route.abort("blockedbyclient");
    }
    if (/wikimedia\.org$/.test(url.hostname) || optimizedSource.startsWith("https://commons.wikimedia.org/")) {
      return route.abort("blockedbyclient");
    }
    if (url.pathname === "/api/place-photo") {
      interceptedPhotos += 1;
      const photoName = url.searchParams.get("name");
      if (photoName) interceptedPhotoNames.add(photoName);
      return route.fulfill({ status: 200, contentType: "image/png", body: TRANSPARENT_PIXEL,
        headers: { "X-Photo-Fallback": "upstream-400", "Cache-Control": "public, max-age=300, s-maxage=300" } });
    }
    return route.continue();
  });
  // A town's five editorial picks legitimately change as verified hours do.
  // Use the supported full shopping inventory, independent of that top-five rank.
  const response = await page.goto("/category/shopping", { waitUntil: "domcontentloaded" });
  expect(response?.status()).toBe(200);
  expect((await response!.allHeaders())["content-security-policy"]).toBeTruthy();
  const browse = page.getByRole("region", { name: "All shopping", exact: true });
  await browse.getByRole("button", { name: /^All shopping/ }).click();
  await browse.getByRole("button", { name: /^Sort: / }).click();
  await browse.getByRole("group", { name: "Sort", exact: true }).getByRole("button", { name: /^A→Z/ }).click();
  await expect(browse.getByRole("button", { name: "Sort: A→Z", exact: true })).toBeVisible();
  // Wait for the old ranked page's exit animation, then traverse only real
  // bounded pagination controls; no fixture can inject this target into the list.
  await expect(browse.locator("article")).toHaveCount(24);
  // Choose the large photo face before revealing later alphabetical pages.
  await browse.getByRole("radio", { name: "Grid", exact: true }).click();
  await expect(browse.getByRole("radio", { name: "Grid", exact: true })).toHaveAttribute("aria-checked", "true");
  const heading = browse.getByRole("heading", { name: "Dancing Bear Toys and Games", exact: true });
  let browsePages = 1;
  while (await heading.count() === 0 && browsePages < 12) {
    const before = await browse.locator("article").count();
    await browse.getByRole("button", { name: /^Show \d+ more$/ }).click();
    await expect.poll(() => browse.locator("article").count()).toBeGreaterThan(before);
    browsePages++;
  }
  // `has` resolves within each article; keep its heading locator relative
  // rather than requiring another ancestor browse region inside the card.
  const card = browse.locator("article").filter({ has: page.getByRole("heading", { name: "Dancing Bear Toys and Games", exact: true }) });
  const open = card.getByRole("button", { name: /^View Dancing Bear Toys and Games .*details$/ });
  await expect(heading).toBeVisible();
  await open.scrollIntoViewIfNeeded();
  const targetLoads = () => loaded.filter((image) => image.placeName === "Dancing Bear Toys and Games");
  await expect.poll(() => targetLoads().length).toBeGreaterThan(0);
  const expectedPhotoName = fallbackPhotoRecord.photo_names[0];
  expect(expectedPhotoName.startsWith(`places/${fallbackPhotoRecord.google_place_id}/photos/`)).toBe(true);
  expect(fallbackPhotoRecord.photo_attributions.some((credit) => credit.photo_name === expectedPhotoName)).toBe(true);
  for (const image of targetLoads()) {
    const source = new URL(image.sourceUrl);
    expect(source.origin).toBe(new URL(baseURL!).origin);
    expect(source.pathname).toBe("/api/place-photo");
    expect(source.searchParams.get("name")).toBe(expectedPhotoName);
    expect(source.searchParams.get("slug")).toBe(FALLBACK_PLACE_SLUG);
    expect(source.searchParams.get("fallback")).toBe("signal");
    expect(interceptedPhotoNames.has(expectedPhotoName)).toBe(true);
    expect(image.naturalWidth).toBe(1);
    expect(image.naturalHeight).toBe(1);
  }
  expect(targetLoads().some((image) => image.paintedWidth > 150 && image.paintedHeight > 80)).toBe(true);
  await expect(card.locator("[data-place-card-photo]")).toHaveCount(0);
  await expect(card.locator(".place-card-photo-credit")).toHaveCount(0);
  await expect(heading).toBeVisible();
  await expect(open).toBeVisible();
  // The browse grid may show real reason chips instead of a rating. Attribution belongs
  // to displayed Google content, never to an exhausted photograph.
  const displayedRatings = card.getByTitle(/from [\d,]+ Google reviews$/);
  for (const rating of await displayedRatings.all()) {
    await expect(rating).toContainText("Google Maps");
  }
  await open.click();
  const sheet = page.getByRole("dialog");
  await expect(sheet).toHaveCount(1);
  await expect(sheet.getByRole("heading", { name: "Dancing Bear Toys and Games", exact: true })).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(sheet).toHaveCount(0);
  await expect(open).toBeFocused();
  expect(interceptedPhotos).toBeGreaterThan(0);
  await testInfo.attach("photo-signal-decoding-and-fallback", {
    contentType: "application/json",
    body: JSON.stringify({ loaded, targetLoads: targetLoads(), expectedPhotoName, interceptedPhotos, blockedGoogleRequests, blockedEnrichmentRequests, forwardedGoogleRequests: 0, cspBypassed: bypassCSP,
      securityProof: "Local HTTP transport regression; public HTTPS acceptance separately keeps CSP enforcement enabled.",
      preservedListing: "Dancing Bear Toys and Games", listingSurface: "/category/shopping", browsePath: "All shopping → A→Z → Grid → real pagination", browsePages, removedBlankPhotoFace: true }),
  });
  await page.screenshot({ path: testInfo.outputPath("place-photo-factual-fallback.png") });
});

// Opaque 128x128 PNG stays above the failure signal after responsive density correction.
// This is a decoded transport fixture, not a claim about venue imagery.
// The six actual Commons files are verified separately in the source receipt.
const DECODED_IMAGE = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAIAAAACACAIAAABMXPacAAAA+klEQVR4nO3RQQ0AIAzAwFlCAy7wLwQZe/SSCmhyc97VYrN+EA8AgHYAALQDAKAdAADtAABoBwBAOwAA2gEA0A4AgHYAALQDAKAdAADtAABoBwBAOwAA2gEA0A4AgHYAALQDAKAdAADtAABoBwBAOwAA2gEA0A4AgHYAALQDAKAdAADtAABoBwBAOwAA2gEA0A4AgHYAALQDAKAdAADtAABoBwBAOwAA2gEA0A4AgHYAALQDAKAdAADtAABoBwBAOwAA2gEA0A4AgHYAALQDAKAdAADtAABoBwBAOwAA2gEA0A4AgHYAALQDAKAdAADtAABoBwBAOwAA2n3CYoL+9wOv8gAAAABJRU5ErkJggg==", "base64");

test("a known landmark tries its exact curated file once and credits only the loaded image", async ({ page, context, baseURL }, testInfo) => {
  await context.addCookies([
    { name: "fr_onboarded", value: "1", url: baseURL! },
    { name: "fr_scope", value: "town:frederick", url: baseURL! },
  ]);
  const exactFile = "Francis Scott Key Monument (March 2024).jpg";
  const exactSource = "https://commons.wikimedia.org/wiki/File:Francis_Scott_Key_Monument_(March_2024).jpg";
  let curatedRequests = 0;
  const curatedRequestsBySource = new Map<string, number>();
  let providerRequests = 0;
  let releaseCurated: () => void = () => {};
  const ready = new Promise<void>((resolve) => { releaseCurated = resolve; });
  await page.route("**/*", async (route) => {
    const request = route.request();
    if (!["GET", "HEAD"].includes(request.method())) return route.abort("blockedbyclient");
    const url = new URL(request.url());
    if (/(^|\.)(places\.googleapis\.com|googleusercontent\.com)$/.test(url.hostname)) {
      providerRequests += 1;
      return route.abort("blockedbyclient");
    }
    if (url.pathname === "/api/place-photo") {
      return route.fulfill({ status: 200, contentType: "image/png", body: TRANSPARENT_PIXEL,
        headers: { "X-Photo-Fallback": "upstream-400", "Cache-Control": "no-store" } });
    }
    const imageSource = url.pathname === "/_next/image" ? url.searchParams.get("url") ?? "" : request.url();
    if (decodeURIComponent(imageSource).includes(`Special:FilePath/${exactFile}`)) {
      curatedRequests += 1;
      const source = new URL(imageSource).href;
      curatedRequestsBySource.set(source, (curatedRequestsBySource.get(source) ?? 0) + 1);
      await ready;
      return route.fulfill({ status: 200, contentType: "image/png", body: DECODED_IMAGE });
    }
    if (/wikimedia\.org$/.test(url.hostname) || imageSource.startsWith("https://commons.wikimedia.org/")) {
      return route.abort("blockedbyclient");
    }
    return route.continue();
  });
  const response = await page.goto("/category/outdoors", { waitUntil: "domcontentloaded" });
  expect(response?.status()).toBe(200);
  await page.getByRole("button", { name: /^All parks & trails/i }).click();
  await page.getByRole("radio", { name: "Grid", exact: true }).click();
  const heading = page.getByRole("heading", { name: "Francis Scott Key Grave and Monument", exact: true });
  const card = page.locator("article").filter({ has: heading });
  const open = card.getByRole("button", { name: /^View Francis Scott Key Grave and Monument .*details$/ });
  await open.scrollIntoViewIfNeeded();
  const image = card.locator('[data-place-card-photo-source="curated"] img');
  await expect(image).toHaveCount(1);
  const mountedSource = await image.evaluate((node) => {
    const imageUrl = new URL((node as HTMLImageElement).currentSrc || (node as HTMLImageElement).src);
    return new URL(imageUrl.pathname === "/_next/image" ? imageUrl.searchParams.get("url")! : imageUrl.href).href;
  });
  // Opening All parks can mount rows before Grid mounts a differently
  // sized source. Each exact responsive source may load once, never retry.
  await expect.poll(() => curatedRequestsBySource.get(mountedSource)).toBe(1);
  await expect(card.locator(".place-card-photo-credit")).toBeHidden();
  await expect(card.locator(".place-card-photo-credit")).toHaveAttribute("aria-hidden", "true");
  const captionBefore = await card.locator(".place-card-photo-credit").evaluate((node) => {
    const rect = node.getBoundingClientRect();
    return { width: rect.width, height: rect.height };
  });
  expect(captionBefore.height).toBeGreaterThan(0);
  expect(await card.locator(".place-card-photo-credit a").first().evaluate((node) => {
    (node as HTMLAnchorElement).focus();
    return document.activeElement === node;
  })).toBe(false);
  releaseCurated();
  await expect(image).toBeVisible();
  await expect.poll(() => image.evaluate((node) => (node as HTMLImageElement).complete)).toBe(true);
  await expect.poll(() => image.evaluate((node) => Math.min(
    (node as HTMLImageElement).naturalWidth,
    (node as HTMLImageElement).naturalHeight,
  ))).toBeGreaterThan(1);
  const decodedImage = await image.evaluate((node) => ({
    complete: (node as HTMLImageElement).complete,
    width: (node as HTMLImageElement).naturalWidth,
    height: (node as HTMLImageElement).naturalHeight,
    currentSrc: (node as HTMLImageElement).currentSrc,
  }));
  const credit = card.locator(".place-card-photo-credit");
  await expect(credit).toContainText("Engineerchange");
  await expect(credit).toContainText("CC BY-SA 4.0");
  const captionAfter = await credit.evaluate((node) => {
    const rect = node.getBoundingClientRect();
    return { width: rect.width, height: rect.height };
  });
  expect(captionAfter).toEqual(captionBefore);
  await expect(credit.getByRole("link", { name: "Wikimedia Commons" })).toHaveAttribute("href", exactSource);
  expect(await credit.evaluate((node) => node.closest("button"))).toBeNull();
  for (const link of await credit.getByRole("link").all()) {
    const bounds = await link.boundingBox();
    expect(bounds?.width).toBeGreaterThanOrEqual(44);
    expect(bounds?.height).toBeGreaterThanOrEqual(44);
  }
  await image.evaluate((node) => node.dispatchEvent(new Event("error")));
  await expect(card.locator("[data-place-card-photo]")).toHaveCount(0);
  await expect(card.locator(".place-card-photo-credit")).toHaveCount(0);
  await expect(heading).toBeVisible();
  await expect(open).toBeVisible();
  expect(curatedRequestsBySource.get(mountedSource)).toBe(1);
  for (const [source, count] of curatedRequestsBySource) {
    expect(count, `Exact curated source retried: ${source}`).toBe(1);
  }
  expect(providerRequests).toBe(0);
  await testInfo.attach("curated-photo-source-and-credit", { contentType: "application/json",
    body: JSON.stringify({ exactFile, exactSource, curatedRequests, curatedRequestsBySource: Object.fromEntries(curatedRequestsBySource), mountedSource, providerRequests, captionBefore, captionAfter, decodedImage,
      transportFixture: "Opaque decoded 128x128 PNG; actual source identity/license verified separately.",
      preservedListing: "Francis Scott Key Grave and Monument", exhaustedCreditRemoved: true }) });
});
