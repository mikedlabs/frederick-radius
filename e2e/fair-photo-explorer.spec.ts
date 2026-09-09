import { expect, test, type Locator, type Page } from "@playwright/test";

const FAIR_PATH = "/moments/great-frederick-fair-2026";
const EXPLORER_NAME = "Explore the Fair at night";

test.use({
  viewport: { width: 390, height: 844 },
  locale: "en-US",
  timezoneId: "America/New_York",
  serviceWorkers: "block",
});

async function openFair(page: Page) {
  await page.goto(FAIR_PATH, { waitUntil: "domcontentloaded" });
  await expect(page.locator("[data-fair-app]")).toHaveAttribute(
    "data-fair-interaction-ready", "true", { timeout: 15_000 },
  );
  await page.getByRole("combobox", { name: "Fair day in your plan" })
    .selectOption("2026-09-18");
  return page.getByRole("button", { name: "See the Fair from above", exact: true });
}

async function openExplorer(page: Page) {
  await page.getByRole("button", { name: "See the Fair from above", exact: true }).click();
  const drawer = page.getByRole("dialog", { name: EXPLORER_NAME, exact: true });
  await expect(drawer).toBeVisible();
  await expect(drawer.locator("iframe[data-fair-photo-viewer]")).toHaveAttribute(
    "src", "/fair-photo-viewer",
  );
  return drawer;
}

async function expectControlTextToFit(control: Locator) {
  const geometry = await control.evaluate((element) => ({
    clientHeight: element.clientHeight,
    clientWidth: element.clientWidth,
    scrollHeight: element.scrollHeight,
    scrollWidth: element.scrollWidth,
  }));
  expect(geometry.scrollWidth).toBeLessThanOrEqual(geometry.clientWidth + 1);
  expect(geometry.scrollHeight).toBeLessThanOrEqual(geometry.clientHeight + 1);
}

test("loads the actual Fair photo drawer only on request and restores its trigger on dismissal", async ({ page }) => {
  const viewerRequests: string[] = [];
  page.on("request", (request) => {
    const path = new URL(request.url()).pathname;
    if (path === "/fair-photo-viewer" || path.startsWith("/fair-viewer-assets/")) {
      viewerRequests.push(path);
    }
  });
  const trigger = await openFair(page);
  await expect(page.locator("iframe[data-fair-photo-viewer]")).toHaveCount(0);
  expect(viewerRequests).toEqual([]);

  for (const dismissal of ["Escape", "Close"] as const) {
    const drawer = await openExplorer(page);
    await expect.poll(() => viewerRequests.includes("/fair-photo-viewer")).toBe(true);
    await drawer.getByRole("button", { name: "Show Midway in the photograph", exact: true }).click();
    await expect(drawer.getByRole("heading", { name: "Midway", exact: true })).toBeVisible();
    await expect(drawer).toContainText("Individual ride placement can change");
    await expect(drawer.getByRole("button", { name: "Find rides and midway", exact: true })).toBeVisible();

    if (dismissal === "Escape") await page.keyboard.press("Escape");
    else await drawer.getByRole("button", { name: `Close ${EXPLORER_NAME}`, exact: true }).click();

    await expect(drawer).toHaveCount(0);
    await expect(page.locator("iframe[data-fair-photo-viewer]")).toHaveCount(0);
    await expect(trigger).toBeFocused();
    expect(new URL(page.url()).pathname).toBe(FAIR_PATH);
  }
});

test("hands the Grandstand photograph to its exact map place and Back stays inside the Fair", async ({ page }) => {
  await openFair(page);
  const drawer = await openExplorer(page);
  await drawer.getByRole("button", { name: "Show on Fair map", exact: true }).click();

  await expect(drawer).toHaveCount(0);
  await expect(page.locator("iframe[data-fair-photo-viewer]")).toHaveCount(0);
  await expect(page).toHaveURL(
    /\/moments\/great-frederick-fair-2026\?meet=osm-way-103615596#fair-map$/,
  );
  const selectedPlace = page.getByRole("region", { name: "Selected map place: Grandstand", exact: true });
  await expect(selectedPlace).toBeVisible({ timeout: 15_000 });

  await page.goBack();
  await expect(selectedPlace).toHaveCount(0);
  await expect(page.locator("[data-fair-app]")).toBeVisible();
  await expect(page.locator("iframe[data-fair-photo-viewer]")).toHaveCount(0);
  expect(new URL(page.url()).pathname).toBe(FAIR_PATH);
});

test("hands Grandstand exploration to the selected day's filtered program", async ({ page }) => {
  await openFair(page);
  const drawer = await openExplorer(page);
  await drawer.getByRole("button", { name: "See Grandstand program", exact: true }).click();

  await expect(drawer).toHaveCount(0);
  await expect(page.locator("iframe[data-fair-photo-viewer]")).toHaveCount(0);
  await expect(page).toHaveURL(/#program$/);
  await expect(page.getByRole("combobox", { name: "Fair day to explore" })).toHaveValue("2026-09-18");
  await expect(page.locator('[data-fair-program-filter="motorsport"]')).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByRole("button", { name: "Open details for Daughtry", exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Open details for Kid Zone", exact: true })).toHaveCount(0);
});

test("keeps photo actions readable when text is enlarged on a narrow phone", async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 844 });
  await openFair(page);
  await page.addStyleTag({
    content: `
      [data-fair-photo-explorer] button {
        font-size: 32px !important;
      }
    `,
  });
  const drawer = await openExplorer(page);

  await expectControlTextToFit(
    drawer.getByRole("button", { name: "See Grandstand program", exact: true }),
  );
  await expectControlTextToFit(
    drawer.getByRole("button", { name: "Show on Fair map", exact: true }),
  );

  await drawer
    .getByRole("button", { name: "Show Midway in the photograph", exact: true })
    .click();
  await expectControlTextToFit(
    drawer.getByRole("button", { name: "Find rides and midway", exact: true }),
  );
});
