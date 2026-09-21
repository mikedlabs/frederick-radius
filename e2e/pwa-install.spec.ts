import { expect, test } from "@playwright/test";
import type { AxeResults } from "axe-core";
import { readFileSync } from "node:fs";

const IOS_SAFARI =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Version/18.0 Mobile/15E148 Safari/604.1";

async function expectAccessible(page: import("@playwright/test").Page) {
  await page.locator("[data-return-bridge]").evaluateAll(async (panels) => {
    await Promise.all(panels.flatMap((panel) => panel.getAnimations().map((animation) => animation.finished)));
  });
  await page.addScriptTag({ content: readFileSync("node_modules/axe-core/axe.min.js", "utf8") });
  const violations = await page.evaluate(async () => {
    const axe = (window as unknown as {
      axe: { run: (context: Document, options: object) => Promise<AxeResults> };
    }).axe;
    return (await axe.run(document, {
      runOnly: { type: "tag", values: ["wcag2a", "wcag2aa", "wcag21aa"] },
    })).violations;
  });
  expect(violations).toEqual([]);
}

async function openInstallInstructions(page: import("@playwright/test").Page) {
  await page.goto("/today", { waitUntil: "domcontentloaded" });
  await expect(page.locator("main h1")).toBeVisible();
  await expect(page.locator("html")).toHaveAttribute(
    "data-return-bridge-ready",
    "true",
  );
  await page.evaluate(() => window.dispatchEvent(new Event("fr:open-install")));
  return page.locator("[data-return-bridge]");
}

test.describe("Home Screen installation", () => {
  test.describe("shareable installation page", () => {
    test("keeps the four-tab app shell and opens the existing desktop QR instructions on request", async ({ page }) => {
      await page.goto("/install", { waitUntil: "domcontentloaded" });
      const content = page.locator("[data-install-page]");
      await expect(content.getByRole("heading", { level: 1 })).toHaveText("Radius on your Home Screen");
      await expect(content).toContainText("not a separate App Store download");
      await expect(content).toContainText("Live data needs an internet connection");
      await expect(content).toContainText("They do not sync through a cloud account");
      await expect(content.getByRole("link", { name: "Open Radius" })).toHaveAttribute("href", "/today");
      const navigation = page.getByRole("navigation", { name: "Primary", exact: true });
      await expect(navigation.getByRole("link")).toHaveText(["Today", "Map", "Events", "Saved"]);
      await expect(page.locator("html")).toHaveAttribute("data-return-bridge-ready", "true");
      const panel = page.locator("[data-return-bridge]");
      await expect(panel).toBeHidden();

      const add = content.getByRole("button", { name: "Add", exact: true });
      await add.click();
      await expect(panel).toHaveAttribute("data-surface", "desktop");
      await expect(panel.getByRole("img", { name: "QR code for Frederick Radius" })).toBeVisible();
      await expect(panel).toContainText("Scan with your phone");
      await expect(panel.getByRole("button", { name: "Copy link" })).toBeVisible();
      await expect(panel).toHaveCount(1);
      await page.keyboard.press("Escape");
      await expect(panel).toBeHidden();
      await expect(add).toBeFocused();
      await expectAccessible(page);
      await page.screenshot({ path: "output/playwright/pwa-install-page-desktop.png", fullPage: true });
    });

    test("shows the installed state without asking an installed visitor to add it again", async ({ page }) => {
      await page.addInitScript(() => {
        Object.defineProperty(navigator, "standalone", { configurable: true, get: () => true });
      });
      await page.goto("/install", { waitUntil: "domcontentloaded" });
      const content = page.locator("[data-install-page]");
      await expect(content.getByText("Radius is on this device", { exact: true })).toBeVisible();
      await expect(content.getByRole("button", { name: "Add", exact: true })).toHaveCount(0);
      await expect(page.locator("[data-return-bridge]")).toBeHidden();
      await expect(content.getByRole("link", { name: "Open Radius" })).toBeVisible();
    });

    test("keeps the Fair's direct setup action and adds a shareable help route inside its disclosure", async ({ page }) => {
      await page.goto("/moments/great-frederick-fair-2026", { waitUntil: "domcontentloaded" });
      const guide = page.locator("[data-fair-keep-guide]");
      const setupLink = guide.getByRole("link", { name: "Home Screen setup and help" });
      await expect(setupLink).toBeHidden();
      await guide.locator("summary").click();
      await expect(guide.getByRole("button", { name: "Add Radius to Home Screen", exact: true })).toBeVisible();
      await expect(setupLink).toHaveAttribute("href", "/install");
      await setupLink.click();
      await expect(page).toHaveURL(/\/install$/);
      await expect(page.locator("[data-install-page]").getByRole("heading", { level: 1 })).toBeVisible();
    });
  });

  test.describe("iPhone Safari", () => {
    test.use({
      userAgent: IOS_SAFARI,
      viewport: { width: 390, height: 844 },
      isMobile: true,
      hasTouch: true,
    });

    test("names Add to Home Screen and gives the exact Safari steps", async ({
      page,
    }) => {
      const panel = await openInstallInstructions(page);

      await expect(panel).toHaveAttribute("data-surface", "ios-safari");
      await expect(
        panel.getByText("Add Radius to your Home Screen", { exact: true }),
      ).toBeVisible();
      await expect(panel).toContainText(
        "In Safari, tap Share, choose Add to Home Screen",
      );
      await expect(
        panel.getByRole("button", { name: "I added Radius" }),
      ).toBeVisible();
      await panel.evaluate(async (element) => {
        await Promise.all(
          element.getAnimations().map((animation) => animation.finished),
        );
      });
      await page.screenshot({
        path: "output/playwright/pwa-add-home-screen-ios-390x844.png",
        fullPage: false,
      });
    });

    test("does not interrupt Today with a timed Home Screen offer", async ({
      page,
    }) => {
      await page.goto("/today", { waitUntil: "domcontentloaded" });
      const panel = page.locator("[data-return-bridge]");

      await expect(panel).toBeHidden();
      await page.waitForTimeout(11_000);
      await expect(panel).toBeHidden();
      await expect(page.locator("main h1")).toBeVisible();
    });

    test("opens Safari steps from the shareable page, returns focus, and fits a 320px phone", async ({ page }) => {
      await page.setViewportSize({ width: 320, height: 740 });
      await page.goto("/install", { waitUntil: "domcontentloaded" });
      await expect(page.locator("html")).toHaveAttribute("data-return-bridge-ready", "true");
      const content = page.locator("[data-install-page]");
      const panel = page.locator("[data-return-bridge]");
      await expect(content.getByRole("heading", { level: 1 })).toBeVisible();
      await expect(panel).toBeHidden();
      // The landing page stays deliberate even after the shared mobile offer timer.
      await page.waitForTimeout(11_000);
      await expect(panel).toBeHidden();
      const add = content.getByRole("button", { name: "Add", exact: true });
      await add.click();
      await expect(panel).toHaveAttribute("data-surface", "ios-safari");
      await expect(panel).toContainText("In Safari, tap Share, choose Add to Home Screen");
      await expect(panel).toContainText("keep Open as Web App on, then tap Add");
      await expect(panel.getByRole("button", { name: "I added Radius" })).toBeVisible();
      await expect(panel.getByRole("button", { name: "Close Keep Radius" })).toBeFocused();
      await expectAccessible(page);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
      expect(await panel.evaluate((element) => element.scrollWidth <= element.clientWidth)).toBe(true);
      await page.screenshot({ path: "output/playwright/pwa-install-page-ios-320x740.png", fullPage: false });
      await panel.getByRole("button", { name: "Close Keep Radius" }).click();
      await expect(panel).toBeHidden();
      await expect(add).toBeFocused();
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
      await page.screenshot({ path: "output/playwright/pwa-install-page-320x740.png", fullPage: true });
      for (const width of [375, 390, 430]) {
        await page.setViewportSize({ width, height: 844 });
        await expect(add).toBeVisible();
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
      }
    });
  });

  test.describe("iPhone social browser", () => {
    test.use({
      userAgent: `${IOS_SAFARI} [FBAN/FBIOS;FBAV/500.0]`,
      viewport: { width: 390, height: 844 },
      isMobile: true,
      hasTouch: true,
    });

    test("explains the required browser handoff instead of pretending it can install", async ({
      page,
    }) => {
      const panel = await openInstallInstructions(page);

      await expect(panel).toHaveAttribute("data-surface", "embedded-ios");
      await expect(panel).toContainText("Facebook cannot add Radius directly");
      await expect(panel).toContainText("Open in browser");
      await expect(panel).toContainText("Add to Home Screen");
    });
  });

  test("uses Chromium's native install prompt when the browser offers it", async ({
    page,
  }) => {
    await page.goto("/today", { waitUntil: "domcontentloaded" });
    await expect(page.locator("main h1")).toBeVisible();
    await expect(page.locator("html")).toHaveAttribute(
      "data-return-bridge-ready",
      "true",
    );

    await page.evaluate(() => {
      const browserWindow = window as Window & { __radiusPromptCalls?: number };
      browserWindow.__radiusPromptCalls = 0;
      const installEvent = new Event("beforeinstallprompt", {
        bubbles: false,
        cancelable: true,
      }) as Event & {
        prompt: () => Promise<void>;
        userChoice: Promise<{ outcome: "accepted"; platform: string }>;
      };
      installEvent.prompt = async () => {
        browserWindow.__radiusPromptCalls =
          (browserWindow.__radiusPromptCalls ?? 0) + 1;
      };
      installEvent.userChoice = Promise.resolve({
        outcome: "accepted",
        platform: "web",
      });
      window.dispatchEvent(installEvent);
      window.dispatchEvent(new Event("fr:open-install"));
    });

    const panel = page.locator("[data-return-bridge]");
    await expect(panel).toHaveAttribute("data-surface", "native");
    await expect(
      panel.getByRole("button", { name: "Add to Home Screen" }),
    ).toBeVisible();
    await panel.getByRole("button", { name: "Add to Home Screen" }).click();
    await expect(panel).toBeHidden();
    await expect
      .poll(() =>
        page.evaluate(
          () =>
            (window as Window & { __radiusPromptCalls?: number })
              .__radiusPromptCalls ?? 0,
        ),
      )
      .toBe(1);
  });
});
