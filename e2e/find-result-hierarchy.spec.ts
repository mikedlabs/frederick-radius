import { expect, test, type Page } from "@playwright/test";
import { registerWebkitLoopbackDocumentSeam } from "./webkit-loopback-document";

const name = "National Museum of Civil War Medicine";
const slug = "national-museum-civil-war-medicine-frederick";
const photo = "/place-photos/civil-war-medicine-frontage.jpg";

test.use({ serviceWorkers: "block" });
test.beforeEach(async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.addInitScript(() => {
    localStorage.setItem("fr:scope:v1", "county");
    localStorage.setItem("fr:appearance:v1", "light");
    localStorage.setItem("fr_analytics_optout", "1");
    document.cookie = "fr_analytics_optout=1; path=/";
    document.cookie = "fr_scope=county; path=/";
    document.cookie = "fr_onboarded=1; path=/";
  });
  // This flow never purchases media or submits an AI request. Bundled image
  // transport and the real search endpoint remain untouched.
  await page.route("**/api/place-photo?**", route => route.abort());
});
registerWebkitLoopbackDocumentSeam();

async function openFind(page: Page) {
  const launcher = page.locator("header").getByRole("button", { name: "Ask or find across Frederick County", exact: true }).filter({ visible: true });
  await expect(launcher).toHaveAttribute("data-find-interaction-ready", "true");
  await launcher.click();
  const dialog = page.getByRole("dialog", { name: "What do you need?", exact: true });
  await expect(dialog).toBeVisible();
  return { dialog, launcher };
}

for (const width of [320, 375, 390, 430]) {
  test(`a named place leads with its real photo and Enter keeps the same destination at ${width}px`, async ({ page }, info) => {
    test.setTimeout(90_000);
    await page.setViewportSize({ width, height: 844 });
    await page.goto("/contacts", { waitUntil: "domcontentloaded" });
    let { dialog } = await openFind(page);
    const input = dialog.getByRole("searchbox");
    const responsePending = page.waitForResponse(response => {
      const url = new URL(response.url());
      return url.pathname === "/api/search" && url.searchParams.get("q") === name;
    });
    await input.fill(name);
    const response = await responsePending;
    expect(response.status()).toBe(200);
    const answer = await response.json();
    expect(answer.results[0]).toMatchObject({ type: "place", id: `place:${slug}`, title: name });
    expect(answer.meta.qualifiers.categoryKey).toBeNull();
    const first = dialog.locator("#search-opt-0");
    const heading = first.getByRole("heading", { name, exact: true });
    await expect(heading).toBeVisible();
    await expect(dialog.getByText("Direct answer", { exact: true })).toHaveCount(0);
    await expect(dialog.getByText("Art", { exact: true })).toHaveCount(0);
    const image = first.locator('[data-search-place-photo-frame="lead"] img');
    await expect.poll(() => image.evaluate(async node => {
      const image = node as HTMLImageElement;
      try { await image.decode(); } catch { return false; }
      const url = new URL(image.currentSrc);
      return image.complete && image.naturalWidth > 1 && image.naturalHeight > 1 &&
        url.origin === location.origin && url.pathname === "/_next/image" && url.searchParams.get("url") === "/place-photos/civil-war-medicine-frontage.jpg";
    })).toBe(true);
    await expect(image).toHaveCSS("object-position", "50% 100%");
    expect(new URL(await image.getAttribute("src") ?? "", page.url()).searchParams.get("url")).toBe(photo);
    const firstBox = (await first.boundingBox())!;
    const inputBox = (await input.boundingBox())!;
    expect(firstBox.y - (inputBox.y + inputBox.height)).toBeLessThanOrEqual(20);
    const view = first.getByRole("link", { name: "View place", exact: true });
    await expect(view).toHaveAttribute("href", `/places/${slug}`);
    for (const control of [view, first.getByRole("link", { name: "Map", exact: true })]) {
      const bounds = (await control.boundingBox())!;
      expect(bounds.width).toBeGreaterThanOrEqual(44);
      expect(bounds.height).toBeGreaterThanOrEqual(44);
    }
    await expect(first.getByRole("link", { name: /Wikimedia Commons/ })).toBeVisible();
    await expect(first.getByRole("link", { name: "CC BY-SA 4.0", exact: true })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(1);
    await page.screenshot({ path: info.outputPath(`find-place-first-${width}.png`) });
    await input.press("Enter");
    await expect(page).toHaveURL(new RegExp(`/places/${slug}$`));
    await expect(page.getByRole("heading", { level: 1, name, exact: true })).toBeVisible();
    await page.goBack();
    await expect(page).toHaveURL(/\/contacts$/);
    const reopened = await openFind(page);
    dialog = reopened.dialog;
    await expect(dialog.getByRole("searchbox")).toHaveValue(name);
    await dialog.getByRole("button", { name: "Close Find", exact: true }).click();
    await expect(dialog).toHaveCount(0);
    await expect(reopened.launcher).toBeFocused();
  });
}
