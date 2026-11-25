import { expect, test } from "@playwright/test";

test.use({ hasTouch: true, viewport: { width: 390, height: 844 } });

for (const [name, path] of [
  ["community report", "/report?c=-77.410,39.414,14"],
  ["letter", "/dear-frederick/submit"],
]) {
  test(`${name} photo can be chosen by touch or keyboard`, async ({ page }) => {
    await page.goto(path);
    const picker = page.locator('input[type="file"]');
    const label = picker.locator("..");
    await expect(picker).toBeVisible();

    const touchChooser = page.waitForEvent("filechooser");
    await picker.tap();
    await (await touchChooser).setFiles([]);

    await picker.focus();
    await page.keyboard.press("Tab");
    await page.keyboard.press("Shift+Tab");
    await expect(picker).toBeFocused();
    await expect(label).toHaveCSS("outline-style", "solid");
    const keyboardChooser = page.waitForEvent("filechooser");
    await page.keyboard.press("Enter");
    await (await keyboardChooser).setFiles([]);
  });
}
