import { expect, test } from "@playwright/test";

test.describe("WLR Road Ready concept", () => {
  test.use({
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true,
  });

  test("turns each car-care need into one useful next move", async ({ page }) => {
    const response = await page.goto("/concept/wlr", {
      waitUntil: "load",
    });

    expect(response?.status()).toBe(200);
    await expect(
      page.getByRole("heading", { name: "Car care, without the hunt." }),
    ).toBeVisible();
    await expect(page.locator('meta[name="robots"]')).toHaveAttribute(
      "content",
      /noindex/,
    );
    await expect(page.getByRole("navigation")).toHaveCount(0);

    await expect(
      page.getByRole("heading", {
        name: "Frederick Auto Spa Express – Route 85",
      }),
    ).toBeVisible();

    await page.getByRole("button", { name: /L Lube/ }).click();
    await expect(
      page.getByRole("heading", { name: "Jefferson Street Lube Center" }),
    ).toBeVisible();

    await page.getByRole("button", { name: /R Repair/ }).click();
    await expect(
      page.getByRole("heading", { name: "Frederick Auto Repair" }),
    ).toBeVisible();
    await expect(
      page.getByRole("link", { name: "Get directions", exact: true }),
    ).toHaveAttribute("href", /google\.com\/maps\/dir/);
    await expect(
      page.getByRole("link", { name: /Call Frederick Auto Repair/ }),
    ).toHaveAttribute("href", /^tel:/);

    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth + 1,
      ),
      "the CEO concept should not introduce horizontal mobile overflow",
    ).toBe(true);
  });
});
