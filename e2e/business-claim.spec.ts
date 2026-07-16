import { test, expect } from "@playwright/test";

/**
 * Business claim — page-level e2e.
 *
 * Covers the surfaces that don't need a writable database:
 *  - /business/claim honestly explains that owner claiming is not open yet
 *  - /business/claim?place=<slug> accepts the deep-link
 *  - /business/manage/<bogus-token> returns 404 (the no-account
 *    capability check refuses unknown tokens, not just expired ones)
 *
 * Token-issuance + admin moderation are exercised by the vitest
 * integration spec at tests/business-claim-flow.spec.ts (opt-in via
 * TEST_DATABASE_URL — does NOT run against prod or dev DBs).
 */

test.describe("/business/claim", () => {
  test("renders the intentional coming-soon state and correction contact", async ({ page }) => {
    await page.goto("/business/claim");
    await expect(
      page.getByRole("heading", { name: /Claim your business/i }),
    ).toBeVisible();

    await expect(page.getByText("Coming soon", { exact: true })).toBeVisible();
    await expect(page.getByRole("link", { name: "hello@frederickradius.app" })).toHaveAttribute(
      "href",
      /^mailto:hello@frederickradius\.app/,
    );
    await expect(page.locator("form")).toHaveCount(0);
  });

  test("accepts a ?place= deep link without crashing", async ({ page }) => {
    const response = await page.goto(
      "/business/claim?place=idiom-brewing-co-frederick",
    );
    expect(response?.status()).toBeLessThan(400);
    await expect(
      page.getByRole("heading", { name: /Claim your business/i }),
    ).toBeVisible();
  });
});

test.describe("/business/manage/[token]", () => {
  test("a bogus token returns 404", async ({ page }) => {
    const response = await page.goto(
      "/business/manage/00000000-0000-0000-0000-000000000000",
    );
    expect(response?.status()).toBe(404);
  });

  test("a non-UUID token returns 404", async ({ page }) => {
    const response = await page.goto("/business/manage/not-a-real-token");
    expect(response?.status()).toBe(404);
  });
});
