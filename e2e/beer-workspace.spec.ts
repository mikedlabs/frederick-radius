import { expect, test } from "@playwright/test";
import { BREWERIES } from "../src/data/beers";

test.describe("beer workspace deep links", () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test("anchors select their panel and browser history restores the prior mode", async ({ page }) => {
    test.setTimeout(180_000);
    const pageErrors: string[] = [];
    const hydrationErrors: string[] = [];
    page.on("pageerror", (error) => pageErrors.push(error.message));
    page.on("console", (message) => {
      const text = message.text();
      if (
        message.type() === "error" &&
        /hydration|did not match|nested <a>|cannot contain a nested/i.test(text)
      ) {
        hydrationErrors.push(text);
      }
    });
    await page.goto("/beer#on-tap-now", {
      waitUntil: "domcontentloaded",
      timeout: 120_000,
    });

    const taprooms = page.getByRole("tab", { name: "Taprooms" });
    const index = page.getByRole("tab", { name: "Beer index" });
    const week = page.getByRole("tab", { name: "This week" });

    await expect(week).toHaveAttribute("aria-selected", "true");
    await expect(page).toHaveURL(/#on-tap-now$/);

    await page.goto("/beer", {
      waitUntil: "domcontentloaded",
      timeout: 120_000,
    });
    await expect(taprooms).toHaveAttribute("aria-selected", "true");

    // A real click proves hydration has attached the URL listeners before we
    // exercise a hash change that would otherwise be easy to race in a test.
    // The server renders Taprooms selected, so a click that lands before
    // React attaches is lost. Repeating it is safe: choosing the mode that is
    // already current pushes no history entry.
    await expect(async () => {
      await index.click();
      await expect(index).toHaveAttribute("aria-selected", "true", { timeout: 1_000 });
    }).toPass({ timeout: 30_000 });
    await page.goBack();
    await expect(taprooms).toHaveAttribute("aria-selected", "true");

    await page.evaluate(() => {
      window.location.hash = "on-tap-now";
    });
    await expect(week).toHaveAttribute("aria-selected", "true");

    await index.click();
    await expect(index).toHaveAttribute("aria-selected", "true");
    await expect(page).toHaveURL(/#beer-index$/);
    await expect(page.locator("#beer-index")).toBeVisible();

    await page.goBack();
    await expect(week).toHaveAttribute("aria-selected", "true");
    await expect(page).toHaveURL(/#on-tap-now$/);

    await page.goBack();
    await expect(taprooms).toHaveAttribute("aria-selected", "true");
    await expect(page).toHaveURL(/\/beer$/);

    await page.evaluate(() => {
      window.location.hash = "beer-week";
    });
    await expect(week).toHaveAttribute("aria-selected", "true");
    await expect(page).toHaveURL(/#beer-week$/);
    expect(pageErrors).toEqual([]);
    expect(hydrationErrors).toEqual([]);
  });

  test("Back closes a beer drawer in place and a brewery link leaves no dead entry", async ({ page }) => {
    test.setTimeout(180_000);
    await page.goto("/today", { waitUntil: "domcontentloaded", timeout: 120_000 });
    await page.goto("/beer#beer-index", { waitUntil: "domcontentloaded", timeout: 120_000 });
    // The hash selects its tab from client code, which proves hydration.
    await expect(page.getByRole("tab", { name: "Beer index" })).toHaveAttribute("aria-selected", "true");

    const filters = page.getByRole("button", { name: "Filter and sort beers" });
    const filterDrawer = page.getByRole("dialog", { name: "Filter and sort beers" });
    await filters.click();
    await expect(filterDrawer).toBeVisible();
    await expect(filterDrawer).toHaveAttribute("data-drawer-surface", "solid");

    await page.goBack();
    await expect(filterDrawer).toHaveCount(0);
    await expect(page).toHaveURL(/\/beer#beer-index$/);
    await expect(filters).toBeFocused();

    // The Close control removes the drawer's own entry, so the next Back
    // leaves the page instead of stopping on an identical URL.
    await filters.click();
    await expect(filterDrawer).toBeVisible();
    await filterDrawer.getByRole("button", { name: "Close Filter and sort beers" }).click();
    await expect(filterDrawer).toHaveCount(0);
    await expect(page).toHaveURL(/\/beer#beer-index$/);

    // So does the drawer's own primary action, which closes it from the page.
    await filters.click();
    await expect(filterDrawer).toBeVisible();
    await filterDrawer.getByRole("button", { name: /^Show \d+ beers?$/ }).click();
    await expect(filterDrawer).toHaveCount(0);
    await expect(page).toHaveURL(/\/beer#beer-index$/);

    await page.locator("#beer-index-results button[aria-label]").first().click();
    const pourDrawer = page.getByRole("dialog");
    await expect(pourDrawer).toBeVisible();
    await pourDrawer.locator('a[href^="/places/"]').last().click();
    await expect(page).toHaveURL(/\/places\/[^/#?]+$/, { timeout: 120_000 });

    await page.goBack({ waitUntil: "domcontentloaded", timeout: 120_000 });
    await expect(page).toHaveURL(/\/beer#beer-index$/);
    await expect(page.getByRole("tab", { name: "Beer index" })).toHaveAttribute("aria-selected", "true");
    await expect(page.getByRole("dialog")).toHaveCount(0);

    await page.goBack({ waitUntil: "domcontentloaded", timeout: 120_000 });
    await expect(page).toHaveURL(/\/today$/);
  });

  for (const viewport of [
    { width: 390, height: 844 },
    { width: 320, height: 568 },
  ]) {
    test(`the taproom front door stays visual and usable at ${viewport.width}px`, async ({ page }) => {
      await page.setViewportSize(viewport);
      await page.goto("/beer", { waitUntil: "domcontentloaded" });

      await expect(
        page.getByRole("heading", { level: 1, name: "Beer in Frederick County" }),
      ).toBeVisible();
      await expect(page.getByText(/source-checked brewery guides/i)).toBeVisible();
      await expect(page.getByRole("heading", { name: "Find the right taproom." })).toBeVisible();

      const firstHeroMedia = page.locator("header [data-brewery-media]").first();
      await expect(firstHeroMedia).toBeVisible();
      await expect.poll(async () => {
        const image = firstHeroMedia.locator("img").first();
        return image.evaluate((node: HTMLImageElement) => node.naturalWidth);
      }).toBeGreaterThan(1);

      const firstTaproomMedia = page
        .locator("#brewery-strip-results [data-brewery-media]")
        .first();
      await expect(firstTaproomMedia).toBeVisible();
      await expect.poll(async () => {
        const image = firstTaproomMedia.locator("img").first();
        return image.evaluate((node: HTMLImageElement) => node.naturalWidth);
      }).toBeGreaterThan(1);

      const tabHeights = await page.getByRole("tab").evaluateAll((tabs) =>
        tabs.map((tab) => tab.getBoundingClientRect().height),
      );
      expect(tabHeights.every((height) => height >= 44)).toBe(true);

      const overflow = await page.evaluate(() =>
        document.documentElement.scrollWidth - window.innerWidth,
      );
      expect(overflow).toBeLessThanOrEqual(1);
    });
  }

  test("the taproom rail is a grid with every brewery in reach on a desktop screen", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto("/beer", { waitUntil: "domcontentloaded" });

    const rail = page.locator("#brewery-strip-results");
    await expect(rail).toBeVisible();
    await expect(rail.locator(":scope > li")).toHaveCount(BREWERIES.length);

    // A hidden-scrollbar rail strands cards from a mouse wheel, so from lg up
    // nothing may scroll sideways and every card sits inside the list's box.
    const layout = await rail.evaluate((node) => {
      const box = node.getBoundingClientRect();
      return {
        display: getComputedStyle(node).display,
        sidewaysScroll: node.scrollWidth - node.clientWidth,
        cardsOutside: Array.from(node.children).filter((item) => {
          const card = item.getBoundingClientRect();
          return (
            card.left < box.left - 1 || card.right > box.right + 1 ||
            card.top < box.top - 1 || card.bottom > box.bottom + 1
          );
        }).length,
      };
    });
    expect(layout.display).toBe("grid");
    expect(layout.sidewaysScroll).toBeLessThanOrEqual(1);
    expect(layout.cardsOutside).toBe(0);
  });

  test("the random picker returns an actionable beer and brewery", async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.goto("/beer#find-your-pour", { waitUntil: "domcontentloaded" });

    const picker = page.locator("#find-your-pour");
    await expect(picker).toBeVisible();

    await picker.getByRole("button", { name: "Spin for a beer" }).click();
    await expect(picker.getByRole("heading", { level: 3 })).toBeVisible();
    await expect(picker.getByRole("link", { name: "Open brewery guide" })).toHaveAttribute(
      "href",
      /^\/places\/.+/,
    );
    await expect(picker.getByText(/catalog pick/i)).toBeVisible();

    await picker.getByRole("button", { name: "A brewery" }).click();
    await picker.getByRole("button", { name: "Spin for a brewery" }).click();
    await expect(picker.getByRole("heading", { level: 3 })).toBeVisible();
    await expect(picker.getByRole("link", { name: "Open brewery guide" })).toHaveAttribute(
      "href",
      /^\/places\/.+/,
    );
  });
});
