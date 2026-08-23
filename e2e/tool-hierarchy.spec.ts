import { expect, test } from "@playwright/test";

test.use({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });

const COMPASS_PINS_KEY = "fr.compass.pins.v1";
const DEFAULT_PINNED_TOOLS = [
  "Ask Radius",
  "Near me",
  "Live conditions",
  "Nearby essentials",
] as const;

test("Compass keeps core tools visible and opens URL-backed intent chapters", async ({
  page,
}) => {
  await page.addInitScript((key) => window.localStorage.removeItem(key), COMPASS_PINS_KEY);
  await page.goto("/compass", { waitUntil: "domcontentloaded" });

  const compass = page.locator("[data-compass-ready]");
  await expect(compass).toHaveAttribute("data-compass-ready", "true");
  await expect(
    page.getByRole("heading", { level: 1, name: "What do you need?" }),
  ).toBeVisible();

  const pinned = page.locator(
    'section[aria-labelledby="compass-pinned-heading"]',
  );
  await expect(pinned.locator("li")).toHaveCount(4);
  for (const label of DEFAULT_PINNED_TOOLS) {
    await expect(
      pinned.getByRole("link", { name: new RegExp(`^${label}\\b`) }),
    ).toBeVisible();
  }

  const browse = page.locator(
    'section[aria-labelledby="compass-browse-heading"]',
  );
  const intentLabels = [
    "Eat, drink & go out",
    "Get around",
    "Essentials & local help",
    "Explore & save",
  ] as const;
  for (const label of intentLabels) {
    const chapter = browse.getByRole("button", { name: new RegExp(`^${label}\\b`) });
    await expect(chapter).toBeVisible();
  }
  await expect(browse.locator("section")).toHaveCount(4);
  await expect(
    browse.getByRole("button", { name: /^All (?:64|65) tools\b/ }),
  ).toBeVisible();
  await expect(browse.getByRole("link")).toHaveCount(0);
  const visibleHrefs = await compass.locator("a:visible").evaluateAll((links) =>
    links.map((link) => link.getAttribute("href")),
  );
  expect(new Set(visibleHrefs).size).toBe(visibleHrefs.length);

  await browse
    .getByRole("button", { name: /^Eat, drink & go out\b/ })
    .click();
  await expect(
    browse.getByRole("link", { name: "Book a table" }),
  ).toBeVisible();
  await browse
    .getByRole("button", { name: "More food, drinks & events" })
    .click();
  await expect(page).toHaveURL(/[?&]deck=go-out(?:&|$)/);
  let dialog = page.getByRole("dialog", { name: "Eat, drink & go out" });
  await expect(dialog).toBeVisible();
  const dialogBox = await dialog.boundingBox();
  expect(dialogBox).not.toBeNull();
  expect(Math.abs((dialogBox?.y ?? 0) + (dialogBox?.height ?? 0) - 844))
    .toBeLessThanOrEqual(2);
  expect(dialogBox?.width ?? 0).toBeGreaterThanOrEqual(388);
  await expect(dialog.getByRole("button", { name: "All tools" })).toBeVisible();
  await expect(dialog.getByRole("link", { name: /^Brunch guide\b/ })).toBeVisible();
  await expect(dialog.getByRole("searchbox")).toHaveCount(1);
  await expect(dialog.getByRole("button", { name: /^Pin / })).toHaveCount(0);

  await dialog.getByRole("button", { name: "All tools" }).click();
  await expect(page).toHaveURL(/[?&]deck=all(?:&|$)/);
  dialog = page.getByRole("dialog", { name: "All tools" });
  await expect(dialog).toBeVisible();
  await expect(dialog).toContainText(/6[45] tools, organized by category/);
  await expect(dialog.getByRole("button")).toHaveCount(10);
  await expect(dialog.getByRole("searchbox")).toHaveCount(1);
  await expect(
    dialog.getByRole("heading", { name: "Find something" }),
  ).toBeVisible();
  await expect(
    dialog.getByRole("heading", { name: "Conditions & help" }),
  ).toBeVisible();
  await expect(dialog.getByRole("link", { name: /^County scanner\b/ })).toBeVisible();

  await dialog
    .getByRole("button", { name: /^Conditions & help\b/ })
    .click();
  await expect(page).toHaveURL(/[?&]deck=all(?:&|$)/);
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
    page.getByRole("dialog", { name: "All tools" }),
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

  await page.getByRole("button", { name: "Edit" }).click();
  const dialog = page.getByRole("dialog", { name: "Edit shortcuts" });
  await expect(dialog).toBeVisible();
  const toolFilter = dialog.getByRole("searchbox", { name: "Search tools in this section" });
  await expect(toolFilter).toBeVisible();
  await toolFilter.fill("brunch");
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

  await dialog.getByRole("button", { name: "Close Edit shortcuts" }).click();
  await expect(dialog).toBeHidden();
  await page.reload({ waitUntil: "domcontentloaded" });
  await expect(page.locator("[data-compass-ready]")).toHaveAttribute(
    "data-compass-ready",
    "true",
  );

  const pinned = page.locator(
    'section[aria-labelledby="compass-pinned-heading"]',
  );
  await expect(pinned.locator("li")).toHaveCount(5);
  await expect(
    pinned.getByRole("link", { name: /^Brunch guide\b/ }),
  ).toBeVisible();
});

test("Compass routes everyday language and exposes pinning in results", async ({
  page,
}) => {
  await page.addInitScript((key) => window.localStorage.removeItem(key), COMPASS_PINS_KEY);
  await page.goto("/compass", { waitUntil: "domcontentloaded" });
  await expect(page.locator("[data-compass-ready]")).toHaveAttribute(
    "data-compass-ready",
    "true",
  );

  const search = page.getByRole("searchbox", { name: /Search Radius tools/ });
  await search.fill("closest trash can");
  await expect(page.getByRole("link", { name: /^Trash cans\b/ })).toBeVisible();
  const pinTrash = page.getByRole("button", { name: "Pin Trash cans" });
  await expect(pinTrash).toBeVisible();
  await pinTrash.click();
  await expect(page.getByRole("button", { name: "Unpin Trash cans" })).toBeVisible();

  await search.fill("anything fun tonight");
  await expect(
    page
      .locator('section[aria-labelledby="compass-search-heading"]')
      .getByRole("link", { name: /^Events\b/ }),
  ).toBeVisible();
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
