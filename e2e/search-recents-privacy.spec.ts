import { expect, test, type Page } from "@playwright/test";

test.use({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });

const KEY = "fr:recent-search:v2";
const LEGACY_KEY = "fr:recent-search:v1";

async function openFind(page: Page) {
  await page.locator("header").first().getByRole("button", {
    name: "Ask or find across Frederick County", exact: true,
  }).click();
  const dialog = page.getByRole("dialog", { name: "What do you need?", exact: true });
  await expect(dialog).toBeVisible();
  return dialog;
}

test.beforeEach(async ({ page }) => {
  // Controlled responses verify browser provenance rather than provider
  // availability. They never supply recent history to the application.
  await page.route("**/api/search?**", async (route) => {
    const query = new URL(route.request().url()).searchParams.get("q");
    await route.fulfill({ json: { results: query === "Beans in the Belfry" ? [{
      type: "place",
      id: "place:beans-in-the-belfry-brunswick",
      title: "Beans in the Belfry",
      subtitle: "Controlled search response for the privacy regression.",
      href: "/places/beans-in-the-belfry-brunswick",
    }] : [] } });
  });
  // A submitted miss keeps the established Ask handoff. No provider request
  // is needed to prove that those words became this device's own history.
  await page.route("**/api/ask", async (route) => {
    await route.fulfill({ status: 503, json: { error: "Controlled privacy regression response" } });
  });
});

test("a fresh first visit has an explicit empty state and typing does not create recents", async ({ page }) => {
  await page.goto("/events", { waitUntil: "domcontentloaded" });
  const dialog = await openFind(page);
  const recents = dialog.getByRole("region", { name: "Recent searches on this device" });
  await expect(recents.getByText("No recent searches on this device.", { exact: true })).toBeVisible();
  await expect(recents.getByRole("button")).toHaveCount(0);
  expect(await page.evaluate((key) => localStorage.getItem(key), KEY)).toBeNull();
  await dialog.getByRole("searchbox").fill("xqzvwmblorp");
  await expect(dialog.getByText("Nothing matches", { exact: false })).toBeVisible();
  await dialog.getByRole("button", { name: "Clear search", exact: true }).click();
  await expect(recents.getByRole("button")).toHaveCount(0);
  expect(await page.evaluate((key) => localStorage.getItem(key), KEY)).toBeNull();
});

test("a real search persists through reload only in its own browser profile", async ({ page, browser }) => {
  await page.goto("/events", { waitUntil: "domcontentloaded" });
  let dialog = await openFind(page);
  const field = dialog.getByRole("searchbox");
  await field.fill("Beans in the Belfry");
  await expect(dialog.getByText("Controlled search response for the privacy regression.")).toBeVisible();
  await field.press("Enter");
  await expect(page).toHaveURL(/\/places\/beans-in-the-belfry-brunswick$/);
  expect(await page.evaluate((key) => JSON.parse(localStorage.getItem(key) ?? "null"), KEY)).toEqual({
    source: "submitted-on-device", queries: ["Beans in the Belfry"],
  });

  await page.goto("/events", { waitUntil: "domcontentloaded" });
  dialog = await openFind(page);
  await dialog.getByRole("button", { name: "Clear search", exact: true }).click();
  await expect(dialog.getByRole("region", { name: "Recent searches on this device" })
    .getByRole("button", { name: "Beans in the Belfry", exact: true })).toBeVisible();
  await page.reload({ waitUntil: "domcontentloaded" });
  dialog = await openFind(page);
  await expect(dialog.getByRole("region", { name: "Recent searches on this device" })
    .getByRole("button", { name: "Beans in the Belfry", exact: true })).toBeVisible();

  const otherProfile = await browser.newContext({
    viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, bypassCSP: true,
  });
  try {
    const otherPage = await otherProfile.newPage();
    await otherPage.goto(new URL("/events", page.url()).href, { waitUntil: "domcontentloaded" });
    const otherDialog = await openFind(otherPage);
    const otherRecents = otherDialog.getByRole("region", { name: "Recent searches on this device" });
    await expect(otherRecents.getByText("No recent searches on this device.", { exact: true })).toBeVisible();
    await expect(otherRecents.getByRole("button")).toHaveCount(0);
    expect(await otherPage.evaluate((key) => localStorage.getItem(key), KEY)).toBeNull();
  } finally {
    await otherProfile.close();
  }

  await dialog.getByRole("button", { name: "Clear recent searches", exact: true }).click();
  await page.reload({ waitUntil: "domcontentloaded" });
  dialog = await openFind(page);
  await expect(dialog.getByText("No recent searches on this device.", { exact: true })).toBeVisible();
});

test("legacy injected recents stay hidden until the person actually submits those words", async ({ page }) => {
  const legacy = JSON.stringify(["xqzvwmblorp", "Another person's query"]);
  await page.addInitScript(({ key, raw }) => localStorage.setItem(key, raw), { key: LEGACY_KEY, raw: legacy });
  await page.goto("/events", { waitUntil: "domcontentloaded" });
  let dialog = await openFind(page);
  let recents = dialog.getByRole("region", { name: "Recent searches on this device" });
  await expect(recents.getByText("No recent searches on this device.", { exact: true })).toBeVisible();
  await expect(recents.getByRole("button")).toHaveCount(0);
  expect(await page.evaluate((key) => localStorage.getItem(key), LEGACY_KEY)).toBe(legacy);
  await dialog.getByRole("searchbox").fill("xqzvwmblorp");
  await expect(dialog.getByText("Nothing matches", { exact: false })).toBeVisible();
  await dialog.getByRole("searchbox").press("Enter");
  await expect(page).toHaveURL(/\/ask\?q=xqzvwmblorp$/);
  await page.goto("/events", { waitUntil: "domcontentloaded" });
  dialog = await openFind(page);
  await dialog.getByRole("button", { name: "Clear search", exact: true }).click();
  recents = dialog.getByRole("region", { name: "Recent searches on this device" });
  await expect(recents.getByRole("button", { name: "xqzvwmblorp", exact: true })).toBeVisible();
  await expect(recents.getByRole("button", { name: "Another person's query", exact: true })).toHaveCount(0);
  expect(await page.evaluate((key) => localStorage.getItem(key), LEGACY_KEY)).toBe(legacy);
});
