import { expect, test } from "@playwright/test";

test.describe("BottomDrawer keyboard focus", () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test("the Fair program drawer contains focus and returns it to its opener", async ({
    page,
  }) => {
    test.setTimeout(180_000);
    await page.goto("/moments/great-frederick-fair-2026#program", {
      waitUntil: "domcontentloaded",
    });
    // The program list renders its detail openers directly; the Fair
    // workspace no longer puts a "Browse full program" step in front of them.
    const opener = page
      .getByRole("button", { name: /^Open details for / })
      .first();
    await expect(opener).toBeVisible();
    const openerLabel = (await opener.getAttribute("aria-label"))?.replace(
      "Open details for ",
      "",
    );
    if (!openerLabel) throw new Error("Program detail opener needs an accessible name");
    await opener.focus();
    await opener.press("Enter");

    const drawer = page.getByRole("dialog");
    await expect(drawer).toBeVisible();
    // The drawer is named for the item alone. An opener may add the time and
    // place after that title (the Grandstand spotlight does).
    const itemTitle = await drawer.evaluate(
      (node) => document.getElementById(node.getAttribute("aria-labelledby") ?? "")?.textContent ?? "",
    );
    expect(itemTitle).not.toBe("");
    expect(openerLabel.startsWith(itemTitle)).toBe(true);
    const closeButton = drawer.getByRole("button", {
      name: `Close ${itemTitle}`,
    });
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
