import { expect, test, type Page } from "@playwright/test";
import { registerWebkitLoopbackDocumentSeam } from "./webkit-loopback-document";

test.use({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });

type LocalAssetFailure = { protocol: string; path: string; resourceType: string; error: string | null };
const localAssetFailures = new WeakMap<Page, LocalAssetFailure[]>();

test.beforeEach(({ page, browserName, baseURL }) => {
  if (browserName !== "webkit" || !baseURL) return;
  const origin = new URL(baseURL);
  if (origin.protocol !== "http:" || !["localhost", "127.0.0.1"].includes(origin.hostname)) return;
  const failures: LocalAssetFailure[] = [];
  localAssetFailures.set(page, failures);
  page.on("requestfailed", request => {
    const url = new URL(request.url());
    if (url.hostname !== origin.hostname || url.port !== origin.port
      || !["script", "stylesheet"].includes(request.resourceType()) || failures.length >= 40) return;
    failures.push({ protocol: url.protocol, path: url.pathname, resourceType: request.resourceType(),
      error: request.failure()?.errorText ?? null });
  });
});

test.afterEach(async ({ page }, info) => {
  const failures = localAssetFailures.get(page);
  if (failures) await info.attach("search-loopback-script-transport", {
    contentType: "application/json", body: JSON.stringify({ failures }),
  });
});

test("changing the search area refreshes matches and Back restores the previous county search", async ({ page }) => {
  await page.goto("/search?q=coffee&in=county&kind=place", { waitUntil: "domcontentloaded" });
  const area = page.getByRole("combobox", { name: "Search area", exact: true });
  await expect(area).toHaveValue("county");
  await expect(area).toBeEnabled();
  await area.selectOption("brunswick");
  await expect(area).toHaveValue("brunswick", { timeout: 20_000 });
  await expect(page.locator('a[href^="/places/beans-in-the-belfry-brunswick"]')).toBeVisible();
  await expect(page.getByRole("link", { name: "View on map", exact: true })).toHaveAttribute("href", /in=brunswick/);
  expect(new URL(page.url()).searchParams.get("kind")).toBe("place");
  await page.goBack();
  await expect(area).toHaveValue("county", { timeout: 20_000 });
  await expect(page.getByRole("searchbox", { name: "Search Frederick County" })).toHaveValue("coffee");
  expect(new URL(page.url()).searchParams.get("in")).toBe("county");
  expect(new URL(page.url()).searchParams.get("kind")).toBe("place");
});

test("a new area replaces the town embedded in the request without losing the place filter", async ({ page }) => {
  await page.goto("/search?q=coffee%20in%20Thurmont&in=thurmont&kind=place", { waitUntil: "domcontentloaded" });
  const area = page.getByRole("combobox", { name: "Search area", exact: true });
  await expect(area).toBeEnabled();
  await area.selectOption("brunswick");
  await expect(area).toHaveValue("brunswick", { timeout: 20_000 });
  await expect(page.getByRole("searchbox", { name: "Search Frederick County" })).toHaveValue("coffee");
  await expect(page.locator('a[href^="/places/beans-in-the-belfry-brunswick"]')).toBeVisible();
  expect(new URL(page.url()).searchParams.get("in")).toBe("brunswick");
  expect(new URL(page.url()).searchParams.get("kind")).toBe("place");
  await area.selectOption("county");
  await expect(area).toHaveValue("county");
  expect(new URL(page.url()).searchParams.get("in")).toBe("county");
});


for (const width of [320, 390]) {
  test(`native search area and photographic lead reflow at ${width}px with enlarged text`, async ({ page }, info) => {
    await page.setViewportSize({ width, height: 844 });
    await page.route("**/api/place-photo?**", (route) => route.abort());
    await page.goto("/search?q=Schifferstadt&in=county&kind=place", { waitUntil: "domcontentloaded" });
    await page.evaluate(() => { document.documentElement.style.fontSize = "200%"; });
    const area = page.getByRole("combobox", { name: "Search area", exact: true });
    await expect(area).toBeEnabled();
    await expect(area).toHaveValue("county");
    const bounds = (await area.boundingBox())!;
    const sizing = await area.evaluate(element => {
      const style = getComputedStyle(element);
      const links = Array.from(document.querySelectorAll<HTMLLinkElement>('link[rel="stylesheet"]')).map(link => ({
        path: new URL(link.href).pathname, sheetPresent: link.sheet !== null, disabled: link.disabled, media: link.media,
      }));
      return { className: element.className, computed: {
        height: style.height, minHeight: style.minHeight, fontSize: style.fontSize,
        fontFamily: style.fontFamily, lineHeight: style.lineHeight, boxSizing: style.boxSizing,
        paddingTop: style.paddingTop, paddingBottom: style.paddingBottom,
        paddingLeft: style.paddingLeft, paddingRight: style.paddingRight,
        appearance: style.appearance, webkitAppearance: style.getPropertyValue("-webkit-appearance"),
      }, rootFontSize: getComputedStyle(document.documentElement).fontSize,
      documentReadyState: document.readyState, fontStatus: document.fonts.status,
      styleSheetCount: document.styleSheets.length, stylesheetLinkCount: links.length,
      stylesheetLinksWithSheet: links.filter(link => link.sheetPresent).length, links };
    });
    await info.attach("native-search-area-sizing", { contentType: "application/json",
      body: JSON.stringify({ width, bounds, ...sizing }) });
    expect(bounds.height).toBeGreaterThanOrEqual(44);
    expect(bounds.width).toBeGreaterThanOrEqual(width - 64);
    expect(bounds.x).toBeGreaterThanOrEqual(0);
    expect(bounds.x + bounds.width).toBeLessThanOrEqual(width);
    const lead = page.locator("[data-search-place-lead]").first();
    await expect(lead.getByRole("heading", { name: "Schifferstadt Architectural Museum", exact: true })).toBeVisible();
    for (const action of [lead.getByRole("link", { name: "View place: Schifferstadt Architectural Museum", exact: true }), lead.getByRole("link", { name: "Map: Schifferstadt Architectural Museum", exact: true })]) {
      await action.scrollIntoViewIfNeeded();
      const box = (await action.boundingBox())!;
      expect(box.width).toBeGreaterThanOrEqual(44);
      expect(box.height).toBeGreaterThanOrEqual(44);
    }
    expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(1);
  });
}

// Production HTTPS remains untouched. Only local HTTP WebKit documents lose
// their upgrade directive; the shared fixture proves identical response bytes
// and all other headers, and attaches the original/delivered CSP values.
registerWebkitLoopbackDocumentSeam();
