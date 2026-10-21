import { readFile } from "node:fs/promises";
import { expect, test, type Locator, type Page } from "@playwright/test";
import catalog from "../src/data/places-client.json";
import { getLandmarkPhoto, wikimediaUrl } from "../src/lib/integrations/wikimedia";
import { getOwnedPlacePhoto } from "../src/lib/owned-place-photos";

const bakerSlug = "baker-park-frederick";
const creekSlug = "carroll-creek-linear-park-frederick";
const places = [bakerSlug, creekSlug].map((slug) => catalog.find((place) => place.slug === slug)!);
const returnTo = "/search?q=park&in=frederick&kind=place";
const mapUrl = `/map?q=park&in=frederick&returnTo=${encodeURIComponent(returnTo)}`;
const photoName = "places/ChIJlayoutFixture/photos/layout-fixture-baker-park";
const authorUri = "https://www.google.com/maps/contrib/000000000000000000000";
const googleFixture = {
  google_photo_url: `/api/place-photo?${new URLSearchParams({ name: photoName, w: "208" })}`,
  google_photo_attribution: {
    photo_name: photoName,
    google_maps_uri: `${authorUri}/photo/layout-fixture-baker-park`,
    authors: [{ display_name: "LAYOUT FIXTURE author", uri: authorUri }],
  },
};
const signal = Buffer.from("R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7", "base64");
const labelledBytes = '<svg xmlns="http://www.w3.org/2000/svg" width="96" height="96"><rect width="96" height="96" fill="#ddd"/><text x="48" y="40" text-anchor="middle" font-size="12">COMMONS</text><text x="48" y="55" text-anchor="middle" font-size="12">LAYOUT</text><text x="48" y="70" text-anchor="middle" font-size="12">FIXTURE</text></svg>';

/** The full application, selected card, registries, credit owner, CSS and
 * history are real. Only local API/image transport is controlled. Commons
 * fixture bytes do not depict Baker Park or prove external image availability.
 * The owned transport reads the already-reviewed local Creek photograph. */
async function installSelectedBoundary(page: Page, baseURL: string | undefined) {
  if (!baseURL || !["localhost", "127.0.0.1"].includes(new URL(baseURL).hostname)) {
    throw new Error("Selected-photo geometry checks require a loopback server.");
  }
  const localWebKit = page.context().browser()?.browserType().name() === "webkit"
    && new URL(baseURL).protocol === "http:";
  const localCspAdjustments: Array<{ before: string; after: string }> = [];
  const curated = getLandmarkPhoto(bakerSlug)!;
  const owned = getOwnedPlacePhoto(creekSlug)!;
  expect(curated).not.toBeNull();
  expect(owned).not.toBeNull();
  const commonsSrc = wikimediaUrl(curated.file, 720);
  const browseCommonsSrc = wikimediaUrl(curated.file, 176);
  const metadataRequests: string[] = [];
  const googleRequests: string[] = [];
  const commonsRequests: string[] = [];
  const browseCommonsRequests: string[] = [];
  const allOwnedRequests: string[] = [];
  let browseOwnedUrl: string | undefined;
  const declareOwnedBrowseRequest = (url: string) => {
    // Identify the actual decoded88px thumbnail from its currentSrc rather
    // than a broad width threshold that could absorb a detail request.
    expect(allOwnedRequests).toContain(url);
    if (browseOwnedUrl) expect(url).toBe(browseOwnedUrl);
    browseOwnedUrl = url;
  };
  let releaseGoogle!: () => void;
  let releaseCommons!: () => void;
  const googleReady = new Promise<void>((resolve) => { releaseGoogle = resolve; });
  const commonsReady = new Promise<void>((resolve) => { releaseCommons = resolve; });

  await page.addInitScript(() => {
    localStorage.setItem("fr_map_location_intro_v1", "dismissed");
    const original = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function (this: HTMLCanvasElement, type: string, ...args: unknown[]) {
      if (/webgl/.test(type)) return null;
      return original.call(this, type as "2d", ...args);
    } as typeof original;
  });
  await page.route("**/*", async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    if (!["localhost", "127.0.0.1"].includes(url.hostname)) {
      return route.abort("blockedbyclient");
    }
    if (localWebKit && url.origin === new URL(baseURL).origin
      && request.method() === "GET" && request.isNavigationRequest() && request.resourceType() === "document") {
      // Local HTTP WebKit upgrades linked assets despite bypassCSP. Preserve
      // actual document bytes and all other headers/policy directives.
      const response = await route.fetch();
      const headers = response.headers();
      if (headers["content-security-policy"]) {
        const before = headers["content-security-policy"];
        headers["content-security-policy"] = before.split(";")
          .filter(part => part.trim().toLowerCase() !== "upgrade-insecure-requests").join(";");
        if (before !== headers["content-security-policy"]) localCspAdjustments.push({ before, after: headers["content-security-policy"] });
      }
      return route.fulfill({ response, headers });
    }
    if (url.pathname === "/api/map/places") {
      return route.fulfill({ json: { generatedAt: new Date().toISOString(), places: places.map((place) => ({
        slug: place.slug, name: place.name, category: place.category,
        geom: place.geom, municipality: place.municipality,
        source: place.source, is_verified: place.is_verified,
        field_notes: place.field_notes, short_blurb: place.short_blurb,
        primary_type: place.primary_type, open_status: { state: "unknown" },
      })) } });
    }
    if (url.pathname === "/api/search") {
      return route.fulfill({ json: { results: places.map((place) => ({
        type: "place", id: `place:${place.slug}`, title: place.name,
        subtitle: place.municipality, href: `/places/${place.slug}`,
        lng: place.geom.lng, lat: place.geom.lat,
      })) } });
    }
    if (url.pathname.startsWith("/api/places/map-card/")) {
      const slug = decodeURIComponent(url.pathname.split("/").at(-1)!);
      metadataRequests.push(slug);
      if (slug === bakerSlug) return route.fulfill({ json: { place: { slug, ...googleFixture } } });
      // Owned source eligibility is independent of unavailable metadata.
      return route.fulfill({ status: 503, json: { error: "Selected metadata unavailable in the local layout fixture" } });
    }
    if (url.pathname === "/api/place-photo") {
      googleRequests.push(url.href);
      expect(url.searchParams.get("name")).toBe(photoName);
      expect(url.searchParams.get("fallback")).toBe("signal");
      expect(url.searchParams.get("w")).toBe("208");
      await googleReady;
      return route.fulfill({ contentType: "image/gif", body: signal });
    }
    if (url.pathname === "/_next/image") {
      const underlying = new URL(url.searchParams.get("url") ?? "", baseURL);
      if (underlying.href === browseCommonsSrc) {
        browseCommonsRequests.push(underlying.href);
        // The active shortlist now legitimately paints the exact free source.
        // Its declared layout bytes are independent of the held selected card.
        return route.fulfill({ contentType: "image/svg+xml", body: labelledBytes });
      }
      if (underlying.href === commonsSrc) {
        commonsRequests.push(underlying.href);
        await commonsReady;
        // Intercept before the local optimizer could fetch an external source.
        return route.fulfill({ contentType: "image/svg+xml", body: labelledBytes });
      }
      if (decodeURIComponent(underlying.pathname) === owned.src) {
        const optimizerWidth = Number(url.searchParams.get("w"));
        expect(Number.isInteger(optimizerWidth) && optimizerWidth > 0).toBe(true);
        allOwnedRequests.push(url.href);
        return route.fulfill({ contentType: "image/jpeg", body: await readFile(`public${owned.src}`) });
      }
      if (!["localhost", "127.0.0.1"].includes(underlying.hostname)) {
        throw new Error(`Unexpected remote optimized photo in bounded local proof: ${underlying.href}`);
      }
    }
    if (url.pathname.startsWith("/api/")) {
      return route.fulfill({ status: 503, json: { error: "Optional source unavailable in the local layout fixture" } });
    }
    if (request.method() === "GET") return route.continue();
    return route.abort("blockedbyclient");
  });
  return { curated, owned, commonsSrc, browseCommonsSrc, metadataRequests, googleRequests,
    commonsRequests, browseCommonsRequests, declareOwnedBrowseRequest, localCspAdjustments,
    get ownedRequests() {
      if (!browseOwnedUrl) throw new Error("The decoded owned browse source must be identified first.");
      return allOwnedRequests.filter(url => url !== browseOwnedUrl);
    },
    get browseOwnedRequests() { return allOwnedRequests.filter(url => url === browseOwnedUrl); },
    releaseGoogle, releaseCommons };
}

async function assert44Reachable(control: Locator) {
  await control.scrollIntoViewIfNeeded();
  await expect(control).toBeVisible();
  await expect.poll(() => control.evaluate((element) => {
    const rect = element.getBoundingClientRect();
    const x = rect.x + rect.width / 2;
    const y = rect.y + rect.height / 2;
    const points = [[x, y], [x - 21.5, y], [x + 21.5, y], [x, y - 21.5], [x, y + 21.5]];
    return {
      large: rect.width >= 44 && rect.height >= 44,
      hit: points.every(([px, py]) => px >= 0 && py >= 0 && px < innerWidth && py < innerHeight && element.contains(document.elementFromPoint(px, py))),
    };
  })).toEqual({ large: true, hit: true });
}

async function assertFullCard(card: Locator, name: string, creditLinks: Locator[] = []) {
  await expect(card.locator("button a, button button, a button")).toHaveCount(0);
  for (const control of [
    card.getByRole("button", { name: `Close ${name}`, exact: true }),
    card.getByRole("button", { name: `Open details for ${name}`, exact: true }),
    card.locator(".map-peek-title-button"),
    card.getByRole("button", { name: "Details", exact: true }),
    card.getByRole("link", { name: "Directions", exact: true }),
    card.getByRole("button", { name: "Save", exact: true }),
    card.getByRole("button", { name: `Share ${name}`, exact: true }),
    ...creditLinks,
  ]) await assert44Reachable(control);
  const geometry = await card.evaluate((element) => {
    const box = element.getBoundingClientRect();
    return { left: box.left, right: box.right, bottom: box.bottom,
      width: innerWidth, height: innerHeight,
      horizontalOverflow: element.scrollWidth > element.clientWidth || document.documentElement.scrollWidth > innerWidth,
      scrollHeight: element.scrollHeight, clientHeight: element.clientHeight, scrollTop: element.scrollTop };
  });
  expect(geometry.left).toBeGreaterThanOrEqual(0);
  expect(geometry.right).toBeLessThanOrEqual(geometry.width);
  expect(geometry.bottom).toBeLessThanOrEqual(geometry.height);
  expect(geometry.horizontalOverflow).toBe(false);
  return geometry;
}

async function assertRealImage(image: Locator, source: "curated" | "owned") {
  await expect(image).toHaveAttribute("data-map-peek-photo-state", "ready");
  await expect(image).toHaveAttribute("data-map-peek-photo-source", source);
  await expect.poll(() => image.evaluate((element) => {
    const image = element as HTMLImageElement;
    return image.complete && image.naturalWidth > 1 && image.naturalHeight > 1;
  })).toBe(true);
}

async function renderedImageSource(image: Locator, origin: string) {
  const src = await image.evaluate((element) => {
    const image = element as HTMLImageElement;
    return image.currentSrc || image.src;
  });
  const wrapped = new URL(src, origin);
  return new URL(wrapped.searchParams.get("url") ?? wrapped.href, origin);
}

for (const viewport of [{ width: 320, height: 568 }, { width: 375, height: 667 }]) {
  test.describe(`Full selected map photo card at ${viewport.width}px`, () => {
    test.use({ viewport });
    test("Google failure uses exact Commons, credits scroll safely, and owned imagery preserves selection history", async ({ page, baseURL }, testInfo) => {
      test.setTimeout(60_000);
      await page.emulateMedia({ reducedMotion: "reduce" });
      const boundary = await installSelectedBoundary(page, baseURL);
      await page.goto(mapUrl, { waitUntil: "domcontentloaded" });
      await expect(page.locator(".dock-host")).toHaveAttribute("data-map-error", "true", { timeout: 30_000 });
      const list = page.getByRole("region", { name: "Available results without the map" });
      await expect(list.locator("[data-map-list-place]")).toHaveCount(2);
      await expect(list.locator("img")).toHaveCount(2);
      const bakerBrowseRow = list.locator(`[data-map-list-place-row="${bakerSlug}"]`);
      const creekBrowseRow = list.locator(`[data-map-list-place-row="${creekSlug}"]`);
      for (const [row, kind] of [[bakerBrowseRow, "curated"], [creekBrowseRow, "owned"]] as const) {
        const frame = row.locator("[data-map-list-photo]");
        await expect(frame).toHaveAttribute("data-photo-state", "ready");
        await expect(frame).toHaveAttribute("data-photo-source", kind);
        const frameBox = await frame.boundingBox();
        expect(frameBox?.width).toBe(88);
        expect(frameBox?.height).toBe(88);
        await expect.poll(() => frame.locator("img").evaluate((node) => {
          const image = node as HTMLImageElement;
          return image.complete && image.naturalWidth > 1 && image.naturalHeight > 1;
        })).toBe(true);
        await expect(row.locator("button a, a button")).toHaveCount(0);
      }
      expect((await renderedImageSource(bakerBrowseRow.locator("img"), page.url())).href).toBe(boundary.browseCommonsSrc);
      expect(decodeURIComponent((await renderedImageSource(creekBrowseRow.locator("img"), page.url())).pathname)).toBe(boundary.owned.src);
      const ownedBrowseSrc = await creekBrowseRow.locator("img").evaluate(node => (node as HTMLImageElement).currentSrc);
      boundary.declareOwnedBrowseRequest(ownedBrowseSrc);
      const browseCredit = bakerBrowseRow.locator(".place-card-photo-credit");
      await expect(browseCredit).toContainText(`Photo by ${boundary.curated.author}.`);
      const browseSource = browseCredit.getByRole("link", { name: "Wikimedia Commons", exact: true });
      const browseLicense = browseCredit.getByRole("link", { name: boundary.curated.license, exact: true });
      await expect(browseSource).toHaveAttribute("href", boundary.curated.source_url);
      await expect(browseLicense).toHaveAttribute("href", "https://creativecommons.org/licenses/by-sa/4.0");
      for (const control of [browseSource, browseLicense]) await assert44Reachable(control);
      await expect(creekBrowseRow.locator(".place-card-photo-credit")).toHaveCount(0);
      expect(boundary.browseCommonsRequests).toEqual([boundary.browseCommonsSrc]);
      expect(boundary.browseOwnedRequests).toHaveLength(1);
      expect(boundary.metadataRequests).toEqual([]);
      expect(boundary.googleRequests).toEqual([]);
      expect(boundary.commonsRequests).toEqual([]);
      expect(boundary.ownedRequests).toEqual([]);
      const origin = page.url();
      const baker = places[0];
      const bakerRow = list.locator(`[data-map-list-place="${bakerSlug}"]`);
      await bakerRow.click();
      const card = page.locator(".map-peek[data-map-result-surface]");
      await expect(card).toHaveCount(1);
      await expect(card.locator(".map-peek-body")).toHaveAttribute("data-map-place-slug", bakerSlug);
      await expect.poll(() => boundary.googleRequests.length).toBe(1);
      const googleImage = card.locator('img[data-map-peek-photo-source="google"]');
      await expect(googleImage).toHaveAttribute("data-map-peek-photo-state", "loading");
      await expect(googleImage).toHaveAttribute("aria-hidden", "true");
      const actualGoogleSrc = new URL(await googleImage.getAttribute("src") ?? "", page.url());
      expect(actualGoogleSrc.searchParams.get("name")).toBe(googleFixture.google_photo_attribution.photo_name);
      await expect(card.locator(".map-peek-source-credit")).toHaveCount(0);
      const details = card.getByRole("button", { name: "Details", exact: true });
      await details.focus();
      boundary.releaseGoogle();
      await expect.poll(() => boundary.commonsRequests).toEqual([boundary.commonsSrc]);
      await expect(details).toBeFocused();
      await expect(card.locator(".map-peek-source-credit")).toHaveCount(0);
      boundary.releaseCommons();
      const commonsImage = card.getByRole("img", { name: boundary.curated.alt, exact: true });
      await assertRealImage(commonsImage, "curated");
      expect((await renderedImageSource(commonsImage, page.url())).href).toBe(boundary.commonsSrc);
      await expect(details).toBeFocused();
      await expect(card.locator("img")).toHaveCount(1);
      const credits = card.locator(".map-peek-source-credit");
      await expect(credits).toContainText(`The photo is by ${boundary.curated.author} on Wikimedia Commons.`);
      await expect(credits).toContainText("The image is resized for display; previews may be cropped.");
      await expect(credits).not.toContainText("LAYOUT FIXTURE author");
      const sourceLink = credits.getByRole("link", { name: `Photo by ${boundary.curated.author}. Wikimedia Commons`, exact: true });
      const licenseLink = credits.getByRole("link", { name: boundary.curated.license, exact: true });
      await expect(sourceLink).toHaveAttribute("href", boundary.curated.source_url);
      await expect(sourceLink).toHaveText(boundary.curated.author);
      await expect(licenseLink).toHaveAttribute("href", "https://creativecommons.org/licenses/by-sa/4.0");
      const edits = credits.locator("details");
      const editSummary = edits.locator("summary");
      const fullEdits = edits.getByText("The image is resized for display; previews may be cropped.", { exact: true });
      await expect(edits).toHaveJSProperty("open", false);
      await expect(editSummary).toHaveText("Edited photo");
      await expect(fullEdits).not.toBeVisible();
      const initialGeometry = await assertFullCard(card, baker.name, [sourceLink, licenseLink, editSummary]);
      await testInfo.attach("full-selected-card-geometry", { body: JSON.stringify(initialGeometry), contentType: "application/json" });
      await editSummary.focus();
      await page.keyboard.press("Enter");
      await expect(edits).toHaveJSProperty("open", true);
      await expect(fullEdits).toBeVisible();
      await expect(editSummary).toBeFocused();
      await expect(edits).toContainText(`The photo is by ${boundary.curated.author} on Wikimedia Commons.`);
      const expandedGeometry = await assertFullCard(card, baker.name, [sourceLink, licenseLink, editSummary]);
      await testInfo.attach("expanded-photo-credit-geometry", { body: JSON.stringify(expandedGeometry), contentType: "application/json" });
      await editSummary.focus();
      await page.keyboard.press("Enter");
      await expect(edits).toHaveJSProperty("open", false);
      await expect(fullEdits).not.toBeVisible();

      // A short mobile viewport forces the actual card to scroll, including
      // its real Close/Share/header topology and loaded source-credit block.
      await page.setViewportSize({ width: viewport.width, height: 480 });
      await expect.poll(() => page.evaluate(() => innerHeight)).toBe(480);
      await expect.poll(() => card.evaluate((element) => element.scrollHeight > element.clientHeight)).toBe(true);
      const compactGeometry = await assertFullCard(card, baker.name, [sourceLink, licenseLink, editSummary]);
      expect(compactGeometry.scrollTop).toBeGreaterThan(0);
      await testInfo.attach("compact-selected-card-geometry", { body: JSON.stringify(compactGeometry), contentType: "application/json" });
      await testInfo.attach("controlled-commons-layout-bytes", { body: await page.screenshot(), contentType: "image/png" });
      expect(boundary.metadataRequests).toEqual([bakerSlug]);
      expect(boundary.googleRequests).toHaveLength(1);
      expect(boundary.commonsRequests).toEqual([boundary.commonsSrc]);
      expect(boundary.ownedRequests).toEqual([]);
      await page.goBack();
      await expect(page).toHaveURL(origin);
      await expect(card).toHaveCount(0);
      await expect(bakerRow).toBeFocused();
      await expect(list.locator("[data-map-list-place]")).toHaveCount(2);

      const creek = places[1];
      const creekRow = list.locator(`[data-map-list-place="${creekSlug}"]`);
      await creekRow.click();
      await expect(card.locator(".map-peek-body")).toHaveAttribute("data-map-place-slug", creekSlug);
      const ownedImage = card.getByRole("img", { name: boundary.owned.alt, exact: true });
      await assertRealImage(ownedImage, "owned");
      expect(decodeURIComponent((await renderedImageSource(ownedImage, page.url())).pathname)).toBe(boundary.owned.src);
      await expect(card.locator("img")).toHaveCount(1);
      await expect(card.locator(".map-peek-source-credit")).toHaveCount(0);
      const ownedGeometry = await assertFullCard(card, creek.name);
      await testInfo.attach("owned-selected-card-geometry", { body: JSON.stringify(ownedGeometry), contentType: "application/json" });
      expect(boundary.metadataRequests).toEqual([bakerSlug, creekSlug]);
      expect(boundary.googleRequests).toHaveLength(1);
      expect(boundary.commonsRequests).toEqual([boundary.commonsSrc]);
      expect(boundary.ownedRequests).toHaveLength(1);
      const selectedOwnedSrc = await ownedImage.evaluate((node) => (node as HTMLImageElement).currentSrc);
      expect(selectedOwnedSrc).not.toBe(ownedBrowseSrc);
      expect(boundary.ownedRequests).toEqual([selectedOwnedSrc]);
      expect(boundary.browseOwnedRequests).not.toContain(selectedOwnedSrc);
      await card.getByRole("button", { name: `Close ${creek.name}`, exact: true }).click();
      await expect(page).toHaveURL(origin);
      await expect(card).toHaveCount(0);
      await expect(creekRow).toBeFocused();
      await expect(page.getByRole("combobox", { name: "Search Frederick Radius", exact: true })).toHaveValue("park");
      await expect(page.getByRole("link", { name: "Back to search results", exact: true })).toHaveAttribute("href", returnTo);
      expect(new URL(page.url()).searchParams.get("in")).toBe("frederick");
      expect(boundary.metadataRequests).toEqual([bakerSlug, creekSlug]);
      await testInfo.attach("browse-and-selected-photo-requests", { body: JSON.stringify({
        browseCommons: boundary.browseCommonsRequests, selectedCommons: boundary.commonsRequests,
        browseOwned: boundary.browseOwnedRequests, selectedOwned: boundary.ownedRequests,
        google: boundary.googleRequests, selectedMetadata: boundary.metadataRequests,
        localHttpWebKitCspOnly: boundary.localCspAdjustments,
        scope: "Exact controlled free browse thumbnails are distinct from selected-card bytes. Commons layout SVG does not prove external availability or depict the place.",
      }), contentType: "application/json" });
    });
  });
}
