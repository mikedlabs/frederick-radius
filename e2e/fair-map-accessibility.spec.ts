import { expect, test, type Page } from "@playwright/test";
import { readFileSync } from "node:fs";
import path from "node:path";

const FAIR_PATH = "/moments/great-frederick-fair-2026#fair-map";
const AXE_PATH = path.join(process.cwd(), "node_modules/axe-core/axe.min.js");

type AxeViolation = {
  id: string;
  impact: string | null;
  help: string;
  nodes: Array<{ target: string[] }>;
};

async function openFairMap(page: Page) {
  await page.goto(FAIR_PATH, { waitUntil: "domcontentloaded" });
  const map = page.locator("[data-fair-grounds-map]");
  await expect(map).toBeVisible({ timeout: 15_000 });
  await expect(map.locator("canvas")).toBeVisible({ timeout: 15_000 });
  return map;
}

async function expectNoAxeViolations(page: Page) {
  await page.addScriptTag({ content: readFileSync(AXE_PATH, "utf8") });
  const violations = await page.evaluate(async () => {
    const axe = (
      window as unknown as {
        axe: {
          run: (
            context: Element,
            options: object,
          ) => Promise<{ violations: AxeViolation[] }>;
        };
      }
    ).axe;
    return (
      await axe.run(
        document.querySelector("[data-fair-grounds-map]") as Element,
        {
          runOnly: {
            type: "tag",
            values: ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"],
          },
          resultTypes: ["violations"],
        },
      )
    ).violations;
  });
  const summary = violations
    .map(
      (violation) =>
        `[${violation.impact}] ${violation.id} (${violation.help}) — ${violation.nodes[0]?.target.join(" ")}`,
    )
    .join("\n");
  expect(violations, summary).toEqual([]);
}

test.describe("Fairgrounds map accessibility", () => {
  test.use({
    viewport: { width: 390, height: 844 },
    locale: "en-US",
    timezoneId: "America/New_York",
    serviceWorkers: "block",
  });

  test("supports keyboard search, selected-place focus, Escape, and focus return", async ({
    page,
  }) => {
    const map = await openFairMap(page);
    const mapHeading = page.getByRole("heading", {
      level: 2,
      name: "Fairgrounds map",
    });
    await expect(mapHeading).toBeFocused();

    const search = page.getByRole("searchbox", {
      name: "Find a place or program event on the Fair grounds map",
    });
    await search.fill("Homegrown Wineries");
    await expect(page.locator("#fair-map-search-status")).toContainText(
      "1 map result available",
    );
    const results = page.locator("#fair-map-search-results");
    await expect(results.getByRole("option")).toHaveCount(0);
    const result = results.getByRole("button", {
      name: /Commercial Building/,
    });
    await result.focus();
    await result.press("Enter");

    const selectionHeading = page.getByRole("heading", {
      level: 3,
      name: "Selected map place: Commercial Building",
    });
    await expect(selectionHeading).toBeFocused();
    const commercialMarker = map.getByRole("button", {
      name: /^Commercial Building\./,
    });
    await expect(commercialMarker).toHaveAttribute("aria-expanded", "true");

    await selectionHeading.press("Escape");
    await expect(
      page.getByRole("region", {
        name: "Selected map place: Commercial Building",
      }),
    ).toHaveCount(0);
    await expect(search).toBeFocused();

    await commercialMarker.focus();
    await commercialMarker.press("Enter");
    const markerHeading = page.getByRole("heading", {
      level: 3,
      name: "Selected map place: Commercial Building",
    });
    await expect(markerHeading).toBeFocused();
    await markerHeading.press("Escape");
    await expect(commercialMarker).toBeFocused();
  });

  test("provides a keyboard list equivalent and cooperative map gestures", async ({
    page,
  }) => {
    const map = await openFairMap(page);
    const canvas = map.locator("canvas");
    await expect(canvas).toHaveAttribute("role", "region");
    await expect(canvas).toHaveAttribute(
      "aria-label",
      "Interactive Fairgrounds map",
    );
    await expect(canvas).toHaveAttribute(
      "aria-describedby",
      "fair-map-instructions",
    );
    await expect(map.locator(".maplibregl-canvas-container")).toHaveClass(
      /maplibregl-cooperative-gestures/,
    );

    const listDisclosure = page
      .locator("summary")
      .filter({ hasText: "Browse mapped places as a list" });
    await listDisclosure.focus();
    await listDisclosure.press("Enter");
    const places = page.getByRole("list", { name: "Mapped places shown" });
    const gate = places.getByRole("button", { name: /^Gate 1 Gate$/ });
    await expect(gate).toBeVisible();
    await gate.focus();
    await gate.press("Enter");
    await expect(gate).toHaveAttribute("aria-pressed", "true");
    const heading = page.getByRole("heading", {
      level: 3,
      name: "Selected map place: Gate 1",
    });
    await expect(heading).toBeFocused();
    await heading.press("Escape");
    await expect(gate).toBeFocused();
  });

  test("keeps the selected sheet usable at a 320px reflow width", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 320, height: 568 });
    await openFairMap(page);
    const search = page.getByRole("searchbox", {
      name: "Find a place or program event on the Fair grounds map",
    });
    await search.fill("Homegrown Wineries");
    await page
      .locator("#fair-map-search-results")
      .getByRole("button", { name: /Commercial Building/ })
      .press("Enter");

    const sheet = page.getByRole("region", {
      name: "Selected map place: Commercial Building",
    });
    await expect(sheet).toHaveCSS("overflow-y", "auto");
    const source = sheet.getByRole("link", { name: "Mapped source" });
    await source.focus();
    await expect(source).toBeInViewport();

    const geometry = await page.evaluate(() => {
      const selection = document.querySelector<HTMLElement>(
        "#fair-map-selection-mobile",
      );
      const actionBar = document.querySelector<HTMLElement>(
        "[data-mobile-action-bar]",
      );
      return {
        documentWidth: document.documentElement.scrollWidth,
        viewportWidth: document.documentElement.clientWidth,
        selectionTop: selection?.getBoundingClientRect().top ?? -1,
        selectionBottom: selection?.getBoundingClientRect().bottom ?? -1,
        actionBarTop: actionBar?.getBoundingClientRect().top ?? -1,
      };
    });
    expect(geometry.documentWidth).toBeLessThanOrEqual(
      geometry.viewportWidth + 1,
    );
    expect(geometry.selectionTop).toBeGreaterThanOrEqual(0);
    expect(geometry.selectionBottom).toBeLessThanOrEqual(
      geometry.actionBarTop + 1,
    );
  });

  test("exposes a saved car as a real keyboard action", async ({ page }) => {
    await page.addInitScript(() => {
      window.localStorage.setItem(
        "fr-fair-car-v1",
        JSON.stringify({
          version: 1,
          savedAt: "2026-09-02T12:00:00.000Z",
          expiresAt: "2026-09-20T12:00:00.000Z",
          lotId: "lot-a",
          lotLabel: "Lot A",
          note: "Near the blue flag",
          latitude: 39.4125,
          longitude: -77.3943,
          accuracyMeters: 12,
        }),
      );
    });
    const map = await openFairMap(page);
    const savedCar = map.getByRole("button", {
      name: "Show saved car location, Lot A, note: Near the blue flag",
    });
    await savedCar.focus();
    await savedCar.press("Enter");
    await expect(savedCar).toBeFocused();
    await expect(page.locator("[data-fair-grounds-map]")).toContainText(
      "Saved car in Lot A is centered on the map.",
    );
  });

  test("has no automatic WCAG A or AA violations in loaded and selected states", async ({
    page,
  }) => {
    await openFairMap(page);
    await expectNoAxeViolations(page);

    const gate = page
      .locator("[data-fair-grounds-map]")
      .getByRole("button", { name: /^Gate 1\. Gate\./ });
    await gate.press("Enter");
    await expect(
      page.getByRole("region", { name: "Selected map place: Gate 1" }),
    ).toBeVisible();
    await expectNoAxeViolations(page);
  });
});
