import { expect, test } from "@playwright/test";

test.describe("BottomDrawer keyboard focus", () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test("the Fair program drawer contains focus and returns it to its opener", async ({
    page,
  }) => {
    test.setTimeout(180_000);
    await page.goto("/moments/great-frederick-fair-2026#find", {
      waitUntil: "domcontentloaded",
    });
    await page
      .getByRole("button", { name: "Browse full program", exact: true })
      .click();

    const opener = page
      .getByRole("button", { name: /^Open details for / })
      .first();
    await expect(opener).toBeVisible();
    const itemTitle = (await opener.getAttribute("aria-label"))?.replace(
      "Open details for ",
      "",
    );
    if (!itemTitle) throw new Error("Program detail opener needs an accessible name");
    await opener.focus();
    await opener.press("Enter");

    const drawer = page.getByRole("dialog", { name: itemTitle });
    const closeButton = drawer.getByRole("button", {
      name: `Close ${itemTitle}`,
    });
    await expect(drawer).toBeVisible();
    await expect(drawer).toHaveAttribute("aria-modal", "true");
    await expect(closeButton).toBeFocused();

    const focusable = drawer.locator(
      'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
    );
    const lastFocusable = focusable.last();
    await lastFocusable.focus();
    await page.keyboard.press("Tab");
    await expect(closeButton).toBeFocused();

    await closeButton.focus();
    await page.keyboard.press("Shift+Tab");
    await expect(lastFocusable).toBeFocused();

    await page.keyboard.press("Escape");
    await expect(drawer).toBeHidden();
    await expect(opener).toBeFocused();
  });
});
