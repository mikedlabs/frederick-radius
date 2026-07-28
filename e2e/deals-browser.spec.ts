import { expect, test, type Page } from "@playwright/test";

function observeClientErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });
  page.on("pageerror", (error) => errors.push(error.message));
  return errors;
}

test.describe("Deals browser journey", () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test("shows only the selected day's offer and timing", async ({ page }) => {
    const clientErrors = observeClientErrors(page);
    const response = await page.goto("/deals", {
      waitUntil: "domcontentloaded",
    });
    expect(response?.status()).toBe(200);

    await page.getByRole("button", { name: /^Tuesday:/ }).click();
    await expect(
      page.getByRole("heading", { name: "Tuesday deals" }),
    ).toBeVisible();

    const monkey = page
      .getByRole("article")
      .filter({ hasText: "Monkey Lala" });
    await expect(monkey).toContainText("$4 craft draft pints");
    await expect(monkey).not.toContainText("Crabby Wednesday");
    await expect(monkey).not.toContainText("$1 oysters");
    await expect(
      monkey.getByRole("link", {
        name: /Check source for .+ at Monkey Lala/,
      }),
    ).toBeVisible();

    const rubesOnTuesday = page
      .getByRole("article")
      .filter({ hasText: "Rube's Crab Shack LLC" });
    const rubeSources = rubesOnTuesday.getByRole("link", {
      name: /Check source for .+ at Rube's Crab Shack LLC/,
    });
    await expect(rubeSources).toHaveCount(2);
    const sourceHrefs = await rubeSources.evaluateAll((links) =>
      links.map((link) => (link as HTMLAnchorElement).href),
    );
    expect(new Set(sourceHrefs).size).toBe(2);

    await page.getByRole("button", { name: /^Wednesday:/ }).click();
    await expect(
      page.getByRole("heading", { name: "Wednesday deals" }),
    ).toBeVisible();
    await expect(monkey).toContainText("Crabby Wednesday");
    await expect(monkey).not.toContainText("$4 craft draft pints");
    await expect(monkey).not.toContainText("$1 oysters");

    await page.getByRole("button", { name: /^Saturday:/ }).click();
    const rubes = page
      .getByRole("article")
      .filter({ hasText: "Rube's Crab Shack LLC" });
    await expect(rubes).toContainText("At open");
    await expect(rubes).not.toContainText("3 PM");
    expect(clientErrors).toEqual([]);
  });

  test("search and town filters produce a clear recoverable state", async ({
    page,
  }) => {
    await page.goto("/deals", { waitUntil: "domcontentloaded" });
    await page.getByRole("button", { name: /^Wednesday:/ }).click();
    await expect(
      page.getByRole("heading", { name: "Wednesday deals" }),
    ).toBeVisible();
    await page.getByRole("button", { name: /^Tuesday:/ }).click();
    await expect(
      page.getByRole("heading", { name: "Tuesday deals" }),
    ).toBeVisible();

    const search = page.getByRole("searchbox", { name: "Search deals" });
    await search.fill("first responders");
    await expect(
      page.getByRole("article").filter({ hasText: "Belles' Sports Bar & Grill" }),
    ).toBeVisible();
    await expect(page.locator("[data-deal-card]")).toHaveCount(1);

    await search.fill("a phrase no deal contains");
    await expect(page.getByText("No matching deals")).toBeVisible();
    await page.getByRole("button", { name: "Clear filters" }).click();
    await expect(page.locator("[data-deal-card]")).toHaveCount(7);
  });
});

test.describe("Deals responsive layout", () => {
  for (const width of [320, 390]) {
    test(`${width}px keeps the page usable without document overflow`, async ({
      page,
    }) => {
      await page.setViewportSize({ width, height: 844 });
      await page.goto("/deals", { waitUntil: "domcontentloaded" });

      expect(
        await page.evaluate(
          () =>
            document.documentElement.scrollWidth -
            document.documentElement.clientWidth,
        ),
      ).toBeLessThanOrEqual(1);

      const dayButtons = page.locator("[data-deal-day-rail] button");
      await expect(dayButtons).toHaveCount(8);
      for (let index = 0; index < 8; index += 1) {
        const box = await dayButtons.nth(index).boundingBox();
        expect(box?.width ?? 0).toBeGreaterThanOrEqual(44);
        expect(box?.height ?? 0).toBeGreaterThanOrEqual(44);
      }

      const saturday = page.getByRole("button", { name: /^Saturday:/ });
      await saturday.click();
      await expect(saturday).toHaveAttribute("aria-pressed", "true");
      const saturdayBox = await saturday.boundingBox();
      expect(saturdayBox?.x ?? -1).toBeGreaterThanOrEqual(0);
      expect((saturdayBox?.x ?? width) + (saturdayBox?.width ?? 0)).toBeLessThanOrEqual(
        width + 1,
      );

      const firstPlaceLink = page
        .locator("[data-deal-card]")
        .first()
        .getByRole("link", { name: /.+/ })
        .first();
      const linkBox = await firstPlaceLink.boundingBox();
      expect(linkBox?.width ?? 0).toBeGreaterThan(0);
      expect(linkBox?.height ?? 0).toBeGreaterThan(0);
    });
  }

  test("desktop uses a real two-column result composition", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.goto("/deals", { waitUntil: "domcontentloaded" });
    await page.getByRole("button", { name: /^Tuesday:/ }).click();

    const cards = page.locator("[data-deal-card]");
    await expect(cards).toHaveCount(7);
    const boxes = await Promise.all(
      Array.from({ length: 5 }, (_, index) => cards.nth(index).boundingBox()),
    );
    const hasSharedRow = boxes.some((left, leftIndex) =>
      boxes.some(
        (right, rightIndex) =>
          leftIndex !== rightIndex &&
          left !== null &&
          right !== null &&
          Math.abs(left.y - right.y) <= 2 &&
          Math.abs(left.x - right.x) > 40,
      ),
    );
    expect(hasSharedRow).toBe(true);
  });
});
