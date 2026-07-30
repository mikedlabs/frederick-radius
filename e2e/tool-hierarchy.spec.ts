import { expect, test } from "@playwright/test";

test.use({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });

const COMPASS_PINS_KEY = "fr.compass.pins.v1";
const DEFAULT_PINNED_TOOLS = [
  "Ask Radius",
  "Near me",
  "Live conditions",
  "Nearby essentials",
] as const;

test("Compass opens its mobile Tool Deck with URL-backed group navigation", async ({
  page,
}) => {
  await page.addInitScript((key) => window.localStorage.removeItem(key), COMPASS_PINS_KEY);
  await page.goto("/compass", { waitUntil: "domcontentloaded" });

  const compass = page.locator("[data-compass-ready]");
  await expect(compass).toHaveAttribute("data-compass-ready", "true");
  await expect(
    page.getByRole("heading", { level: 1, name: "Compass" }),
  ).toBeVisible();

  const pinned = page.locator(
    'section[aria-labelledby="compass-pinned-heading"]',
  );
  await expect(pinned.locator("article")).toHaveCount(4);
  for (const label of DEFAULT_PINNED_TOOLS) {
    await expect(
      pinned.getByRole("link", { name: new RegExp(`^${label}\\b`) }),
    ).toBeVisible();
  }

  const browse = page.locator(
    'section[aria-labelledby="compass-browse-heading"]',
  );
  const groupLabels = [
    "Decide & discover",
    "Food & drink",
    "Events & recreation",
    "Getting around",
    "Public amenities",
    "Live conditions & safety",
    "Community & services",
    "Frederick stories & data",
    "Yours & contribute",
  ] as const;
  for (const label of groupLabels) {
    await expect(
      browse.getByRole("button", { name: new RegExp(`${label}\\b`) }),
    ).toBeVisible();
  }
  await expect(
    browse.getByRole("button", { name: /^All tools\b/ }),
  ).toBeVisible();
  await expect(browse.getByRole("button")).toHaveCount(10);

  await browse.getByRole("button", { name: /Food & drink\b/ }).click();
  await expect(page).toHaveURL(/[?&]deck=food(?:&|$)/);
  let dialog = page.getByRole("dialog", { name: "Food & drink" });
  await expect(dialog).toBeVisible();
  const dialogBox = await dialog.boundingBox();
  expect(dialogBox).not.toBeNull();
  expect(Math.abs((dialogBox?.y ?? 0) + (dialogBox?.height ?? 0) - 844))
    .toBeLessThanOrEqual(2);
  expect(dialogBox?.width ?? 0).toBeGreaterThanOrEqual(388);
  await expect(dialog.getByRole("button", { name: "All groups" })).toBeVisible();
  await expect(dialog.getByRole("link", { name: /^Brunch guide\b/ })).toBeVisible();

  await dialog.getByRole("button", { name: "All groups" }).click();
  await expect(page).toHaveURL(/[?&]deck=all(?:&|$)/);
  dialog = page.getByRole("dialog", { name: "Tool Deck" });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole("button")).toHaveCount(10);

  await dialog
    .getByRole("button", { name: /Live conditions & safety\b/ })
    .click();
  await expect(page).toHaveURL(/[?&]deck=live(?:&|$)/);
  dialog = page.getByRole("dialog", { name: "Live conditions & safety" });
  await expect(dialog.getByRole("button", { name: "All groups" })).toBeVisible();
  await expect(dialog.getByRole("link", { name: /^County scanner\b/ })).toBeVisible();

  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    ),
  ).toBeLessThanOrEqual(1);
  expect(
    await dialog.evaluate((element) => element.scrollWidth - element.clientWidth),
  ).toBeLessThanOrEqual(1);

  await page.goBack();
  await expect(page).toHaveURL(/\/compass$/);
  await expect(
    page.getByRole("dialog", { name: "Live conditions & safety" }),
  ).toBeHidden();
});

test("Compass persists pinned tools on this device", async ({ page }) => {
  await page.goto("/compass", { waitUntil: "domcontentloaded" });
  await page.evaluate((key) => window.localStorage.removeItem(key), COMPASS_PINS_KEY);
  await page.reload({ waitUntil: "domcontentloaded" });
  await expect(page.locator("[data-compass-ready]")).toHaveAttribute(
    "data-compass-ready",
    "true",
  );

  await page
    .locator('section[aria-labelledby="compass-browse-heading"]')
    .getByRole("button", { name: /^All tools\b/ })
    .click();
  const dialog = page.getByRole("dialog", { name: "Tool Deck" });
  await expect(dialog).toBeVisible();
  const deckSearch = dialog.getByRole("searchbox", {
    name: "Search the Tool Deck",
  });
  await deckSearch.fill("brunch");
  const pinBrunch = dialog.getByRole("button", { name: "Pin Brunch guide" });
  await expect(pinBrunch).toHaveAttribute("aria-pressed", "false");
  await pinBrunch.click();
  await expect(
    dialog.getByRole("button", { name: "Unpin Brunch guide" }),
  ).toHaveAttribute("aria-pressed", "true");
  await expect
    .poll(() =>
      page.evaluate((key) => window.localStorage.getItem(key), COMPASS_PINS_KEY),
    )
    .toBe(
      JSON.stringify([
        "ask-radius",
        "nearby",
        "county-pulse",
        "public-essentials",
        "brunch",
      ]),
    );

  await dialog.getByRole("button", { name: "Close Tool Deck" }).click();
  await expect(dialog).toBeHidden();
  await page.reload({ waitUntil: "domcontentloaded" });
  await expect(page.locator("[data-compass-ready]")).toHaveAttribute(
    "data-compass-ready",
    "true",
  );

  const pinned = page.locator(
    'section[aria-labelledby="compass-pinned-heading"]',
  );
  await expect(pinned.locator("article")).toHaveCount(5);
  await expect(
    pinned.getByRole("link", { name: /^Brunch guide\b/ }),
  ).toBeVisible();
  await expect(
    pinned.getByRole("button", { name: "Unpin Brunch guide" }),
  ).toHaveAttribute("aria-pressed", "true");
});

test("the global command sends an urgent need straight to its resolver", async ({
  page,
}) => {
  await page.goto("/today", { waitUntil: "domcontentloaded" });

  await page
    .getByRole("button", { name: "Ask or find across Frederick County" })
    .click();
  const command = page.getByRole("searchbox", {
    name: "Ask or find across Frederick County",
  });
  await command.fill("trash can");
  await command.press("Enter");

  await expect(page).toHaveURL(/\/amenities\?need=trash$/);
  await expect(
    page.getByRole("heading", { level: 1, name: "What do you need?" }),
  ).toBeVisible();
  await expect(page.getByRole("button", { name: "Trash", exact: true })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
});
