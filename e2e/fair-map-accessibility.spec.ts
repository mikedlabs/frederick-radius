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
      level: 1,
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

  test("connects rideshare search with owned arrival, parking, and transit details", async ({
    page,
  }) => {
    const map = await openFairMap(page);
    const search = page.getByRole("searchbox", {
      name: "Find a place or program event on the Fair grounds map",
    });

    await search.fill("rideshare");
    const gateResult = page
      .locator("#fair-map-search-results")
      .getByRole("button", { name: /Gate 4A/ });
    await expect(gateResult).toBeVisible();
    await gateResult.press("Enter");

    const gateDetails = page.getByRole("region", {
      name: "Selected map place: Gate 4A",
    });
    await expect(gateDetails).toBeVisible();
    await gateDetails.getByRole("button", { name: "More details" }).click();
    await expect(
      gateDetails.getByRole("link", { name: /Get directions/i }),
    ).toBeVisible();
    await expect(
      gateDetails.getByRole("link", { name: /Official details/i }),
    ).toBeVisible();

    await gateDetails
      .getByRole("button", { name: "Close selected map place" })
      .click();
    await page
      .getByRole("button", { name: /Parking \+ transit/ })
      .click();

    await expect(
      map.getByRole("button", {
        name: /^Lot D entrance on Monroe Avenue\. Parking\./,
      }),
    ).toBeVisible();
    await expect(
      map.getByRole("button", {
        name: /^East Patrick Street at Fairground Center\. Transit stop\./,
      }),
    ).toBeVisible();
  });

  test("keeps selected-place details above map controls at 320px", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 320, height: 568 });
    const map = await openFairMap(page);
    await page
      .getByRole("button", { name: /Parking \+ transit/ })
      .click();
    await map
      .getByRole("button", {
        name: /^Lot D entrance on Monroe Avenue\. Parking\./,
      })
      .click();

    const sheet = page.getByRole("region", {
      name: "Selected map place: Lot D entrance on Monroe Avenue",
    });
    const heading = sheet.getByRole("heading", {
      name: "Selected map place: Lot D entrance on Monroe Avenue",
    });
    await expect(sheet).toBeVisible();
    await expect(heading).toBeVisible();
    await expect(heading).toBeFocused();

    const stacking = await page.evaluate(() => {
      const selected = document.querySelector<HTMLElement>(
        "#fair-map-selection-mobile",
      );
      const search = document.querySelector<HTMLElement>(
        "[data-fair-map-search-rail]",
      );
      const filters = document.querySelector<HTMLElement>(
        "[data-fair-map-filter-rail]",
      );
      const title = document.querySelector<HTMLElement>(
        "#fair-map-selection-mobile-heading",
      );
      if (!selected || !search || !filters || !title) return null;
      const selectedBox = selected.getBoundingClientRect();
      const titleBox = title.getBoundingClientRect();
      return {
        selectedZ: Number(window.getComputedStyle(selected).zIndex),
        searchZ: Number(window.getComputedStyle(search).zIndex),
        filtersZ: Number(window.getComputedStyle(filters).zIndex),
        selectedTop: selectedBox.top,
        selectedBottom: selectedBox.bottom,
        titleTop: titleBox.top,
        titleBottom: titleBox.bottom,
        viewportHeight: window.innerHeight,
      };
    });
    expect(stacking).not.toBeNull();
    expect(stacking?.selectedZ).toBeGreaterThan(stacking?.searchZ ?? 0);
    expect(stacking?.selectedZ).toBeGreaterThan(stacking?.filtersZ ?? 0);
    expect(stacking?.selectedTop).toBeGreaterThanOrEqual(0);
    expect(stacking?.titleTop).toBeGreaterThanOrEqual(
      stacking?.selectedTop ?? 0,
    );
    expect(stacking?.titleBottom).toBeLessThanOrEqual(
      Math.min(
        stacking?.selectedBottom ?? Number.POSITIVE_INFINITY,
        stacking?.viewportHeight ?? Number.POSITIVE_INFINITY,
      ),
    );
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
      .filter({ hasText: "Find places by task" });
    await listDisclosure.focus();
    await listDisclosure.press("Enter");
    const places = page.getByRole("list", {
      name: "Mapped places grouped by task",
    });
    await expect(
      places.getByRole("heading", { name: "Arrive and enter" }),
    ).toBeVisible();
    await expect(
      places.getByRole("heading", { name: "Find essentials" }),
    ).toBeVisible();
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

  test("keeps the direct-to-map load visually stable", async ({ page }) => {
    await page.addInitScript(() => {
      const trackedWindow = window as typeof window & {
        __fairLayoutShift: number;
        __fairLayoutShiftEntries: Array<{
          value: number;
          sources: string[];
        }>;
      };
      trackedWindow.__fairLayoutShift = 0;
      trackedWindow.__fairLayoutShiftEntries = [];
      new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) {
          const shift = entry as PerformanceEntry & {
            hadRecentInput?: boolean;
            value?: number;
            sources?: Array<{ node?: Node | null }>;
          };
          if (!shift.hadRecentInput) {
            trackedWindow.__fairLayoutShift += shift.value ?? 0;
            trackedWindow.__fairLayoutShiftEntries.push({
              value: shift.value ?? 0,
              sources: (shift.sources ?? []).map(({ node }) => {
                if (!(node instanceof HTMLElement)) return node?.nodeName ?? "unknown";
                const id = node.id ? `#${node.id}` : "";
                const classes = Array.from(node.classList)
                  .slice(0, 3)
                  .map((name) => `.${name}`)
                  .join("");
                return `${node.tagName.toLowerCase()}${id}${classes}`;
              }),
            });
          }
        }
      }).observe({ type: "layout-shift", buffered: true });
    });

    await openFairMap(page);
    await page.evaluate(() => document.fonts.ready);
    await page.waitForTimeout(500);

    const layoutShift = await page.evaluate(() => {
      const trackedWindow = window as typeof window & {
        __fairLayoutShift: number;
        __fairLayoutShiftEntries: Array<{ value: number; sources: string[] }>;
      };
      return {
        score: trackedWindow.__fairLayoutShift,
        entries: trackedWindow.__fairLayoutShiftEntries,
      };
    });
    expect(
      layoutShift.score,
      JSON.stringify(layoutShift.entries, null, 2),
    ).toBeLessThan(0.1);
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
    const details = sheet.getByRole("button", { name: "More details" });
    await expect(details).toHaveAttribute("aria-expanded", "false");
    await details.click();
    await expect(
      sheet.getByRole("button", { name: "Show less" }),
    ).toHaveAttribute("aria-expanded", "true");
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
