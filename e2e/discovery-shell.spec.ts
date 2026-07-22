import { expect, test } from "@playwright/test";

/**
 * Protect the small-screen discovery shell. These checks cover the handoff
 * between the global Find action and the map's own search, plus the disclosure
 * hierarchy used by Pulse and Compass.
 */
test.describe("mobile discovery shell", () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test("Find opens as a focused full-screen task surface", async ({ page }) => {
    await page.goto("/today", { waitUntil: "domcontentloaded" });

    const openFind = page.getByRole("link", { name: "Find across Frederick County" });
    await expect(openFind).toBeVisible();
    await expect(openFind).toHaveAttribute("href", "/search");
    await expect(openFind).toHaveAttribute("data-find-ready", "true");
    await openFind.click();

    const dialog = page.getByRole("dialog", { name: "Frederick County" });
    await expect(dialog).toBeVisible();
    await expect(page.getByRole("searchbox", { name: "Find across Frederick County" })).toBeFocused();
    await expect(page.getByRole("button", { name: "Close Find" })).toBeVisible();

    await page.keyboard.press("Escape");
    await expect(dialog).toBeHidden();
    await expect(openFind).toBeFocused();
  });

  test("the map keeps search, decisions, and live layers immediately available", async ({ page }) => {
    await page.goto("/map", { waitUntil: "domcontentloaded" });

    const mapFind = page.getByRole("link", { name: "Find on this map" });
    await expect(mapFind).toHaveAttribute("href", "/map#map-search-input");
    await expect(mapFind).toHaveAttribute("data-find-ready", "true");
    await mapFind.click();
    await expect(page.getByRole("searchbox", { name: "Search this map" })).toBeFocused();

    const controls = page.getByRole("group", { name: "Map controls" });
    await expect(controls.getByRole("button", { name: "Places" })).toBeVisible();
    await expect(controls.getByRole("button", { name: "Time" })).toBeVisible();
    await expect(controls.getByRole("button", { name: "Area" })).toBeVisible();

    const layers = page.getByRole("group", { name: "Map layer controls" });
    await expect(layers.getByRole("button", { name: /Read this area/ })).toBeVisible();
    await expect(layers.getByRole("button", { name: /Layers/ })).toBeVisible();
    await expect(layers.getByRole("button", { name: "Transit" })).toBeVisible();
    await expect(layers.getByRole("button", { name: "Radar" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Show list view" })).toHaveCount(0);

    await layers.getByRole("button", { name: /Read this area/ }).click();
    const discoveryPane = page.getByRole("region", { name: "Read this area" });
    await expect(discoveryPane).toBeVisible();
    await discoveryPane.locator(".dock-discovery-card").first().click();
    const finding = page.locator(".map-finding-peek");
    await expect(finding).toBeVisible();
    await expect(finding.getByText("Why this appeared")).toBeVisible();
    await expect(finding.getByRole("button", { name: "Next finding" })).toBeVisible();
    await finding.getByRole("button", { name: "Close finding" }).click();
    await expect(finding).toBeHidden();

    await layers.getByRole("button", { name: /Layers/ }).click();
    await expect(page.getByRole("region", { name: "Layers" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Done" })).toBeVisible();
  });

  test("Compass starts compact and reveals one section at a time", async ({ page }) => {
    await page.goto("/compass", { waitUntil: "domcontentloaded" });

    await expect(page.getByRole("searchbox", { name: "Filter all tools" })).toBeVisible();
    await expect(page.getByRole("navigation", { name: "Common tasks" })).toBeVisible();

    const food = page.locator("#cat-eat-drink details");
    const outdoors = page.locator("#cat-outdoors details");
    await expect(food).not.toHaveAttribute("open", "");
    await food.locator("summary").click();
    await expect(food).toHaveAttribute("open", "");
    await outdoors.locator("summary").click();
    await expect(food).not.toHaveAttribute("open", "");
    await expect(outdoors).toHaveAttribute("open", "");
  });

  test("Pulse leads with the conditions needed before leaving", async ({ page }) => {
    await page.goto("/pulse", { waitUntil: "domcontentloaded" });
    await expect(page.getByRole("heading", { name: "Before you go" })).toBeVisible();
    await expect(page.getByText("Weather, air, roads and transit")).toBeVisible();
  });
});
