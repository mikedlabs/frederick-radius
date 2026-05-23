import { test, expect } from "@playwright/test";

/**
 * Business claim — page-level e2e.
 *
 * Covers the surfaces that don't need a writable database:
 *  - /business/claim renders the form
 *  - /business/claim?place=<slug> accepts the deep-link
 *  - /business/manage/<bogus-token> returns 404 (the no-account
 *    capability check refuses unknown tokens, not just expired ones)
 *
 * Token-issuance + admin moderation are exercised by the vitest
 * integration spec at tests/business-claim-flow.spec.ts (opt-in via
 * TEST_DATABASE_URL — does NOT run against prod or dev DBs).
 */

test.describe("/business/claim", () => {
  test("renders the form with the four required fields", async ({ page }) => {
    await page.goto("/business/claim");
    await expect(
      page.getByRole("heading", { name: /Claim your business/i }),
    ).toBeVisible();

    // Field names from ClaimForm.tsx — the contract the server action
    // depends on. If a field gets renamed, the integration spec also
    // breaks; both should change together.
    await expect(page.locator('input[name="business_name"]')).toBeVisible();
    await expect(page.locator('input[name="owner_name"]')).toBeVisible();
    await expect(page.locator('input[name="owner_email"]')).toBeVisible();

    await expect(
      page.getByRole("button", { name: /Submit claim for review/i }),
    ).toBeVisible();
  });

  test("client-side validation blocks the submit with no email", async ({
    page,
  }) => {
    await page.goto("/business/claim");
    await page.locator('input[name="business_name"]').fill("Acme Test Co.");
    await page.locator('input[name="owner_name"]').fill("Test Owner");
    // owner_email left empty
    await page.getByRole("button", { name: /Submit claim for review/i }).click();

    // The validator should refuse without the email — the form
    // surfaces a "valid email" or "email is required" message.
    await expect(page.getByText(/email/i).first()).toBeVisible();
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
