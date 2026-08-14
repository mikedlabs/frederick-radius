import { expect, test } from "@playwright/test";

const IOS_SAFARI =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Version/18.0 Mobile/15E148 Safari/604.1";

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

    test("waits for demonstrated value before making one compact Home Screen offer", async ({
      page,
    }) => {
      await page.goto("/today", { waitUntil: "domcontentloaded" });
      const panel = page.locator("[data-return-bridge]");

      await expect(panel).toBeHidden();
      await page.waitForTimeout(10_500);
      await expect(panel).toBeHidden();
      await page.evaluate(() => {
        window.dispatchEvent(
          new CustomEvent("fr:return-bridge:value", { detail: "place" }),
        );
      });
      await expect(panel).toBeVisible({ timeout: 8_000 });
      await expect(panel).toHaveAttribute("data-offer-mode", "compact");
      await expect(panel).toContainText("Keep Radius close");
      await expect(panel.getByRole("button", { name: "Not now" })).toHaveCount(1);
      await expect(panel.getByRole("button", { name: "Copy link" })).toHaveCount(0);

      await panel.getByRole("button", { name: "Not now" }).click();
      await expect(panel).toBeHidden();
      await page.reload({ waitUntil: "domcontentloaded" });
      await page.waitForTimeout(1_000);
      await expect(panel).toBeHidden();
      await expect
        .poll(() =>
          page.evaluate(() => {
            const raw = window.localStorage.getItem("fr:return-bridge:v1");
            return raw ? JSON.parse(raw).autoDisabled : false;
          }),
        )
        .toBe(true);
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
