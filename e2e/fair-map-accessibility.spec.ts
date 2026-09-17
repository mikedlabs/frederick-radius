import { expect, test, type Locator, type Page } from "@playwright/test";
import { readFileSync } from "node:fs";
import path from "node:path";

import { findErrorBoundaryMarker } from "./error-boundary-markers";

const FAIR_PATH = "/moments/great-frederick-fair-2026#fair-map";
const AXE_PATH = path.join(process.cwd(), "node_modules/axe-core/axe.min.js");
const FAIR_MAP_LENSES = [
  { id: "arrival", count: 16 },
  { id: "program", count: 6 },
  { id: "essentials", count: 24 },
  { id: "animals", count: 16 },
  { id: "buildings", count: 7 },
] as const;

type AxeViolation = {
  id: string;
  impact: string | null;
  help: string;
  nodes: Array<{ target: string[] }>;
};

type GeometryBox = {
  left: number;
  top: number;
  right: number;
  bottom: number;
  width: number;
  height: number;
};

function boxesOverlap(left: GeometryBox, right: GeometryBox): boolean {
  return !(
    left.right <= right.left ||
    right.right <= left.left ||
    left.bottom <= right.top ||
    right.bottom <= left.top
  );
}

async function readMobileMapChrome(page: Page) {
  return page.evaluate(() => {
    const readBox = (selector: string) => {
      const element = document.querySelector<HTMLElement>(selector);
      if (!element) return null;
      const box = element.getBoundingClientRect();
      if (box.width === 0 || box.height === 0) return null;
      return {
        left: box.left,
        top: box.top,
        right: box.right,
        bottom: box.bottom,
        width: box.width,
        height: box.height,
      };
    };

    const attribution = document.querySelector<HTMLElement>(
      ".fair-grounds-map-canvas .maplibregl-ctrl-attrib",
    );
    const attributionToggle = attribution?.querySelector<HTMLElement>(
      ".maplibregl-ctrl-attrib-button",
    );
    const attributionToggleBox = attributionToggle?.getBoundingClientRect();
    const attributionHit = attributionToggleBox
      ? document.elementFromPoint(
          attributionToggleBox.left + attributionToggleBox.width / 2,
          attributionToggleBox.top + attributionToggleBox.height / 2,
        )
      : null;

    return {
      documentWidth: document.documentElement.scrollWidth,
      viewportWidth: document.documentElement.clientWidth,
      viewportHeight: window.innerHeight,
      search: readBox("[data-fair-map-search-rail]"),
      filters: readBox("[data-fair-map-filter-rail]"),
      highTextControls: readBox("[data-fair-map-high-text-controls]"),
      utilities: readBox("[data-fair-map-utility-controls]"),
      zoom: readBox(
        ".fair-grounds-map-canvas .maplibregl-ctrl-top-right .maplibregl-ctrl-group",
      ),
      attribution: readBox(
        ".fair-grounds-map-canvas .maplibregl-ctrl-bottom-right .maplibregl-ctrl-attrib",
      ),
      actionBar: readBox("[data-mobile-action-bar] nav"),
      attributionToggleOwnsHit:
        attribution !== null &&
        attributionHit !== null &&
        attribution.contains(attributionHit),
    };
  });
}

async function readMarkerHitTargets(page: Page) {
  return page.evaluate(() => {
    const markerElements = Array.from(
      document.querySelectorAll<HTMLElement>("[data-fair-map-marker-group]"),
    ).filter((element) => {
      const box = element.getBoundingClientRect();
      return box.width > 0 && box.height > 0;
    });
    const controlSelectors = [
      "[data-fair-map-search-rail]",
      "[data-fair-map-filter-rail]",
      "[data-fair-map-high-text-controls]",
      "[data-fair-map-utility-controls]",
      "[data-fair-aerial-controls]",
      "[data-fair-transit-toggle]",
      ".fair-grounds-map-canvas .maplibregl-ctrl-attrib",
      ".fair-grounds-map-canvas .maplibregl-ctrl-top-right .maplibregl-ctrl-group",
      "[data-mobile-action-bar]",
    ];
    const overlap = (left: DOMRect, right: DOMRect) =>
      Math.min(left.right, right.right) - Math.max(left.left, right.left) > 0.5 &&
      Math.min(left.bottom, right.bottom) - Math.max(left.top, right.top) > 0.5;
    const labelFor = (element: HTMLElement, index: number) =>
      element.getAttribute("aria-label") ?? `marker target ${index + 1}`;
    const controls = controlSelectors.flatMap((selector) =>
      Array.from(document.querySelectorAll<HTMLElement>(selector))
        .filter((element) => {
          const style = window.getComputedStyle(element);
          const box = element.getBoundingClientRect();
          return (
            style.display !== "none" &&
            style.visibility !== "hidden" &&
            box.width > 0 &&
            box.height > 0
          );
        })
        .map((element) => ({
          selector,
          element,
          box: element.getBoundingClientRect(),
        })),
    );

    const markers = markerElements.map((element, index) => {
      const box = element.getBoundingClientRect();
      const centreX = box.left + box.width / 2;
      const centreY = box.top + box.height / 2;
      const cornerInset = Math.min(8, box.width / 4, box.height / 4);
      const edgeInset = Math.min(2, box.width / 8, box.height / 8);
      const samplePoints = [
        [centreX, centreY],
        [centreX, box.top + edgeInset],
        [centreX, box.bottom - edgeInset],
        [box.left + edgeInset, centreY],
        [box.right - edgeInset, centreY],
        [box.left + cornerInset, box.top + cornerInset],
        [box.right - cornerInset, box.top + cornerInset],
        [box.left + cornerInset, box.bottom - cornerInset],
        [box.right - cornerInset, box.bottom - cornerInset],
      ];
      const unownedSamples = samplePoints.flatMap(([x, y]) => {
        const hit = document.elementFromPoint(x, y);
        if (hit && (hit === element || element.contains(hit))) return [];
        const hitElement = hit instanceof HTMLElement ? hit : null;
        return [
          {
            x: Math.round(x),
            y: Math.round(y),
            hit:
              hitElement?.getAttribute("aria-label") ??
              (hitElement?.id || hitElement?.outerHTML.slice(0, 240)) ??
              hitElement?.tagName.toLocaleLowerCase() ??
              null,
          },
        ];
      });
      const overlappingMarkers = markerElements.flatMap((candidate, candidateIndex) => {
        if (candidate === element) return [];
        return overlap(box, candidate.getBoundingClientRect())
          ? [labelFor(candidate, candidateIndex)]
          : [];
      });
      const overlappingControls = Array.from(
        new Set(
          controls
            .filter(({ element: control, box: controlBox }) => {
              if (control.contains(element) || element.contains(control)) return false;
              return overlap(box, controlBox);
            })
            .map(({ selector }) => selector),
        ),
      );
      const issues = [
        ...(box.width < 43.5 || box.height < 43.5
          ? [`target is ${Math.round(box.width)}x${Math.round(box.height)}px`]
          : []),
        ...(box.left < -0.5 ||
        box.top < -0.5 ||
        box.right > window.innerWidth + 0.5 ||
        box.bottom > window.innerHeight + 0.5
          ? ["target is not fully inside the viewport"]
          : []),
        ...overlappingMarkers.map((label) => `overlaps marker: ${label}`),
        ...overlappingControls.map((selector) => `overlaps control: ${selector}`),
        ...(unownedSamples.length > 0
          ? [`${unownedSamples.length} sampled target points are obstructed`]
          : []),
      ];

      return {
        label: labelFor(element, index),
        box: {
          left: box.left,
          top: box.top,
          right: box.right,
          bottom: box.bottom,
          width: box.width,
          height: box.height,
        },
        unownedSamples,
        overlappingMarkers,
        overlappingControls,
        issues,
      };
    });

    return {
      representedPlaces: markerElements.reduce(
        (total, marker) =>
          total + Number(marker.getAttribute("data-fair-map-marker-count") ?? 0),
        0,
      ),
      markers,
      blockedTargets: markers.filter((marker) => marker.issues.length > 0),
    };
  });
}

async function readMarkerSpread(page: Page) {
  return page
    .locator("[data-fair-map-marker-group]")
    .evaluateAll((markers) => {
      const centres = markers.map((marker) => {
        const box = marker.getBoundingClientRect();
        return {
          x: box.left + box.width / 2,
          y: box.top + box.height / 2,
        };
      });
      let widestPair = 0;
      for (let leftIndex = 0; leftIndex < centres.length; leftIndex += 1) {
        for (
          let rightIndex = leftIndex + 1;
          rightIndex < centres.length;
          rightIndex += 1
        ) {
          widestPair = Math.max(
            widestPair,
            Math.hypot(
              centres[leftIndex].x - centres[rightIndex].x,
              centres[leftIndex].y - centres[rightIndex].y,
            ),
          );
        }
      }
      return { count: centres.length, widestPair };
    });
}

async function expectSheetClearOfActionBar(
  page: Page,
  sheet: Locator,
  minimumGap = 7.5,
) {
  await expect(sheet).toBeVisible();
  await expect
    .poll(async () => {
      const [sheetBox, actionBarBox] = await Promise.all([
        sheet.boundingBox(),
        page.locator("[data-mobile-action-bar]").boundingBox(),
      ]);
      if (!sheetBox || !actionBarBox) return Number.NEGATIVE_INFINITY;
      return actionBarBox.y - (sheetBox.y + sheetBox.height);
    })
    .toBeGreaterThanOrEqual(minimumGap);
}

async function expectControlInsideSheet(sheet: Locator, control: Locator) {
  await control.focus();
  await expect(control).toBeFocused();
  const [sheetBox, controlBox] = await Promise.all([
    sheet.boundingBox(),
    control.boundingBox(),
  ]);
  expect(sheetBox).not.toBeNull();
  expect(controlBox).not.toBeNull();
  expect(controlBox!.y).toBeGreaterThanOrEqual(sheetBox!.y - 0.5);
  expect(controlBox!.y + controlBox!.height).toBeLessThanOrEqual(
    sheetBox!.y + sheetBox!.height + 0.5,
  );
}

async function readCondensedSelectHitOwnership(page: Page) {
  return page.evaluate(() => {
    const select = document.querySelector<HTMLSelectElement>(
      "[data-fair-map-high-text-controls] [data-fair-map-filter-select]",
    );
    const frame = select?.parentElement;
    if (!select || !frame) return null;
    const selectBox = select.getBoundingClientRect();
    const frameBox = frame.getBoundingClientRect();
    const x = frameBox.left + frameBox.width / 2;
    const hitAt = (y: number) => {
      const hit = document.elementFromPoint(x, y);
      return hit === select || (hit !== null && select.contains(hit));
    };
    return {
      select: {
        top: selectBox.top,
        bottom: selectBox.bottom,
        height: selectBox.height,
      },
      frame: {
        top: frameBox.top,
        bottom: frameBox.bottom,
        height: frameBox.height,
      },
      ownsTopEdge: hitAt(frameBox.top + 2),
      ownsBottomEdge: hitAt(frameBox.bottom - 2),
    };
  });
}

async function readFocusedMarkerClearance(page: Page, memberId: string) {
  return page.evaluate((requestedMemberId) => {
    const marker = Array.from(
      document.querySelectorAll<HTMLElement>(
        "[data-fair-map-cluster-members]",
      ),
    ).find((candidate) =>
      (candidate.dataset.fairMapClusterMembers?.split(" ") ?? []).includes(
        requestedMemberId,
      ),
    );
    if (!marker) return ["focused marker is missing"];
    const markerBox = marker.getBoundingClientRect();
    const overlaps = (left: DOMRect, right: DOMRect) =>
      Math.min(left.right, right.right) - Math.max(left.left, right.left) > 0.5 &&
      Math.min(left.bottom, right.bottom) - Math.max(left.top, right.top) > 0.5;
    const issues = [];
    if (
      markerBox.left < -0.5 ||
      markerBox.top < -0.5 ||
      markerBox.right > window.innerWidth + 0.5 ||
      markerBox.bottom > window.innerHeight + 0.5
    ) {
      issues.push("focused marker is outside the viewport");
    }
    for (const selector of [
      "[data-fair-map-high-text-controls]",
      "[data-fair-map-search-rail]",
      "[data-fair-map-filter-rail]",
      "[data-fair-map-utility-controls]",
      "[data-fair-map-selection]",
      ".fair-grounds-map-canvas .maplibregl-ctrl-attrib",
      "[data-mobile-action-bar]",
    ]) {
      const control = document.querySelector<HTMLElement>(selector);
      if (!control) continue;
      const style = window.getComputedStyle(control);
      const controlBox = control.getBoundingClientRect();
      if (
        style.display !== "none" &&
        style.visibility !== "hidden" &&
        controlBox.width > 0 &&
        controlBox.height > 0 &&
        overlaps(markerBox, controlBox)
      ) {
        issues.push(`focused marker overlaps ${selector}`);
      }
    }
    const centreHit = document.elementFromPoint(
      markerBox.left + markerBox.width / 2,
      markerBox.top + markerBox.height / 2,
    );
    if (centreHit !== marker && !marker.contains(centreHit)) {
      issues.push("focused marker centre is obstructed");
    }
    return issues;
  }, memberId);
}

async function expectLensTargetsReachable(
  page: Page,
  lens: (typeof FAIR_MAP_LENSES)[number],
) {
  const mapView = page.getByRole("combobox", { name: "Map view" });
  await mapView.selectOption(lens.id);
  await expect(mapView).toHaveValue(lens.id);
  await expect
    .poll(
      async () => {
        const audit = await readMarkerHitTargets(page);
        return {
          representedPlaces: audit.representedPlaces,
          hasRenderedTarget: audit.markers.length > 0,
          blockedTargets: audit.blockedTargets,
        };
      },
      { timeout: 8_000 },
    )
      .toEqual({
        representedPlaces: lens.count,
        hasRenderedTarget: true,
        blockedTargets: [],
      });
}

async function openFairMap(page: Page) {
  await page.goto(FAIR_PATH, { waitUntil: "domcontentloaded" });
  const map = page.locator("[data-fair-grounds-map]");
  await expect(map).toBeVisible({ timeout: 15_000 });
  await expect(map.locator("canvas")).toBeVisible({ timeout: 15_000 });
  await expect(map.locator("[data-fair-map-canvas-fallback]")).toHaveCount(0);
  await expect(map.locator(".maplibregl-ctrl-attrib")).toBeVisible({
    timeout: 15_000,
  });
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

async function expectCenterHitTarget(target: Locator) {
  const center = await target.evaluate((element) => {
    const rect = element.getBoundingClientRect();
    const x = rect.left + rect.width / 2;
    const y = rect.top + rect.height / 2;
    const hit = document.elementFromPoint(x, y);
    return {
      x,
      y,
      hitTarget: hit === element || (hit !== null && element.contains(hit)),
      insideViewport:
        x >= 0 && x <= window.innerWidth && y >= 0 && y <= window.innerHeight,
    };
  });
  expect(center.insideViewport).toBe(true);
  expect(center.hitTarget).toBe(true);
  return center;
}

test.describe("Fairgrounds map accessibility", () => {
  test.use({
    viewport: { width: 390, height: 844 },
    locale: "en-US",
    timezoneId: "America/New_York",
    serviceWorkers: "block",
  });

  test("keeps the Fair guide usable when WebGL2 is unavailable", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 320, height: 568 });
    await page.addInitScript(() => {
      const originalGetContext = HTMLCanvasElement.prototype.getContext;
      HTMLCanvasElement.prototype.getContext = function getContext(
        this: HTMLCanvasElement,
        contextId: string,
        ...args: unknown[]
      ) {
        if (contextId === "webgl2") return null;
        return Reflect.apply(originalGetContext, this, [contextId, ...args]);
      } as typeof HTMLCanvasElement.prototype.getContext;
    });

    await page.goto(FAIR_PATH, { waitUntil: "domcontentloaded" });
    const map = page.locator("[data-fair-grounds-map]");
    await expect(map).toBeVisible({ timeout: 15_000 });
    const fallback = page.getByRole("region", {
      name: "Use the searchable grounds guide.",
    });
    await expect(fallback).toBeVisible();
    await expect(map.locator("canvas")).toHaveCount(0);
    expect(findErrorBoundaryMarker(await page.textContent("body"))).toBeNull();

    const sourceLink = fallback.getByRole("link", {
      name: "Open the map source",
    });
    await expect(sourceLink).toHaveAttribute(
      "href",
      "https://www.openstreetmap.org/copyright",
    );
    const browseButton = fallback.getByRole("button", {
      name: "Browse all reviewed places",
    });
    const browseCenter = await expectCenterHitTarget(browseButton);
    const sourceCenter = await expectCenterHitTarget(sourceLink);
    const mobileNavTop = await page
      .getByRole("navigation", { name: "Fair Day" })
      .evaluate((element) => element.getBoundingClientRect().top);
    expect(browseCenter.y).toBeLessThan(mobileNavTop);
    expect(sourceCenter.y).toBeLessThan(mobileNavTop);

    // Use a raw pointer coordinate so Playwright cannot auto-scroll an obscured
    // control into view and accidentally hide a fixed-navigation regression.
    await page.mouse.click(browseCenter.x, browseCenter.y);
    expect(await page.evaluate(() => window.location.hash)).toBe("#fair-map");
    await expect(
      page.locator("#fair-map-place-list > summary"),
    ).toBeFocused();
    await expect(
      map.getByRole("button", { name: "Show my location" }),
    ).toHaveCount(0);
    await expect(
      map.getByRole("button", { name: "Whole grounds" }),
    ).toHaveCount(0);
    const places = page.getByRole("list", {
      name: "Mapped places grouped by task",
    });
    await expect(places).toBeVisible();
    await expect(
      places.getByRole("heading", { name: "Arrive and enter" }),
    ).toBeVisible();
    await expect(
      places.getByRole("heading", { name: "Find essentials" }),
    ).toBeVisible();
    await expect(
      places.getByRole("heading", { name: "Explore the grounds" }),
    ).toBeVisible();
    await expect(
      places.getByRole("button", { name: /Restroom/ }).first(),
    ).toBeVisible();
    await expect(
      places.getByRole("button", { name: /Beef Barn/ }).first(),
    ).toBeVisible();

    const search = page.getByRole("searchbox", {
      name: "Find a place or program event on the Fair grounds map",
    });
    await search.fill("Gate 4A");
    await page
      .locator("#fair-map-search-results")
      .getByRole("button", { name: /^Gate 4A Gate$/ })
      .click();
    const selection = page.getByRole("region", {
      name: "Selected map place: Gate 4A",
    });
    await expect(selection).toBeVisible();
    await expect(
      selection.getByRole("link", { name: /Get directions/i }),
    ).toBeVisible();
    await selection.getByRole("button", { name: "More details" }).click();
    const expandedSelection = page.getByRole("dialog", {
      name: "Selected map place: Gate 4A",
    });
    await expect(
      expandedSelection.getByRole("link", { name: /Official details/i }),
    ).toBeVisible();

    await expect(
      page.getByRole("navigation", { name: "Fair Day" }),
    ).toBeVisible();
    await expectNoAxeViolations(page);
    const width = await page.evaluate(() => ({
      client: document.documentElement.clientWidth,
      scroll: document.documentElement.scrollWidth,
    }));
    expect(width.scroll).toBeLessThanOrEqual(width.client + 1);
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
      name: /Homegrown Frederick/,
    });
    await result.focus();
    await result.press("Enter");

    const selectionHeading = page.getByRole("heading", {
      level: 3,
      name: "Selected map place: Homegrown Frederick (Building 13)",
    });
    await expect(selectionHeading).toBeFocused();
    const commercialMarker = map.getByRole("button", {
      name: /^Homegrown Frederick \(Building 13\)\./,
    });
    await expect(commercialMarker).toHaveAttribute("aria-expanded", "true");

    await selectionHeading.press("Escape");
    await expect(
      page.getByRole("region", {
        name: "Selected map place: Homegrown Frederick (Building 13)",
      }),
    ).toHaveCount(0);
    await expect(search).toBeFocused();

    const administrationMarker = map.getByRole("button", {
      name: /^Administration \(Building 3\)\./,
    });
    await expect(administrationMarker).toBeVisible();
    await administrationMarker.focus();
    await administrationMarker.press("Enter");
    const markerHeading = page.getByRole("heading", {
      level: 3,
      name: "Selected map place: Administration (Building 3)",
    });
    await expect(markerHeading).toBeFocused();
    await markerHeading.press("Escape");
    await expect(administrationMarker).toBeFocused();
  });

  test("connects rideshare search with owned arrival, parking, and transit details", async ({
    page,
  }) => {
    await openFairMap(page);
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
    const expandedGateDetails = page.getByRole("dialog", {
      name: "Selected map place: Gate 4A",
    });
    await expect(
      expandedGateDetails.getByRole("link", { name: /Get directions/i }),
    ).toBeVisible();
    await expect(
      expandedGateDetails.getByRole("link", { name: /Official details/i }),
    ).toBeVisible();

    await expandedGateDetails
      .getByRole("button", { name: "Close selected map place" })
      .click();
    await page.getByRole("combobox", { name: "Map view" }).selectOption("arrival");

    await search.fill("Lot D entrance on Monroe Avenue");
    await expect(
      page
        .locator("#fair-map-search-results")
        .getByRole("button", { name: /Lot D entrance on Monroe Avenue/ }),
    ).toBeVisible();
    await search.fill("East Patrick Street at Fairground Center");
    await expect(
      page
        .locator("#fair-map-search-results")
        .getByRole("button", { name: /East Patrick Street at Fairground Center/ }),
    ).toBeVisible();
  });

  test("explains restricted gates and schematic First Aid without false routing", async ({
    page,
  }) => {
    await openFairMap(page);
    const search = page.getByRole("searchbox", {
      name: "Find a place or program event on the Fair grounds map",
    });
    const results = page.locator("#fair-map-search-results");

    await search.fill("Gate 4");
    await results.getByRole("button", { name: /^Gate 4 Gate$/ }).press("Enter");
    const restrictedGate = page.getByRole("region", {
      name: "Selected map place: Gate 4",
    });
    await expect(restrictedGate).toBeVisible();
    await expect(restrictedGate).toContainText("Fair gate");
    await expect(restrictedGate).toContainText("Mapped place");
    await expect(restrictedGate).toContainText("Exit only");
    await restrictedGate.getByRole("button", { name: "More details" }).click();
    const expandedRestrictedGate = page.getByRole("dialog", {
      name: "Selected map place: Gate 4",
    });
    await expect(expandedRestrictedGate).toContainText("Exit only");
    await expect(
      expandedRestrictedGate.getByRole("link", { name: /Get directions/i }),
    ).toHaveCount(0);
    await expect(
      expandedRestrictedGate.getByRole("link", { name: /Official details/i }),
    ).toBeVisible();
    await expandedRestrictedGate
      .getByRole("button", { name: "Close selected map place" })
      .click();

    await search.fill("First Aid");
    await results
      .getByRole("button", { name: /^First Aid near Building 15 Guest service$/ })
      .press("Enter");
    const firstAid = page.getByRole("region", {
      name: "Selected map place: First Aid near Building 15",
    });
    await expect(firstAid).toContainText("Published area; follow signs");
    await firstAid.getByRole("button", { name: "More details" }).click();
    const expandedFirstAid = page.getByRole("dialog", {
      name: "Selected map place: First Aid near Building 15",
    });
    await expect(expandedFirstAid).toContainText(
      "next to Building 15, inside Gate 3",
    );
    await expect(
      expandedFirstAid.getByRole("link", { name: /Get directions/i }),
    ).toHaveCount(0);
  });

  test("starts with a compact essentials view across common narrow phone widths", async ({
    page,
  }) => {
    for (const { width, height } of [
      { width: 320, height: 568 },
      { width: 360, height: 844 },
      { width: 390, height: 844 },
    ]) {
      await page.setViewportSize({ width, height });
      await openFairMap(page);
      const mapView = page.getByRole("combobox", { name: "Map view" });
      await expect(mapView).toHaveValue("essentials");
      await expect(mapView).toHaveCSS("height", "44px");
      await expect(mapView.locator("option:checked")).toHaveText("Essentials · 24");
      await expect(mapView.locator("option")).toHaveCount(5);
      await expect(mapView.locator("option").last()).toHaveText("Buildings · 7");
      await expect(page.locator("#fair-map-filter-status")).toContainText(
        "This map view shows Entry + essentials: 24 places.",
      );
      await expect(
        page.locator(
          '[role="group"][aria-label="Choose what the Fair map shows"]',
        ),
      ).toBeHidden();

      const locate = page.getByRole("button", { name: "Show my location" });
      const wholeGrounds = page.getByRole("button", { name: "Whole grounds" });
      await expect(locate).toHaveCSS("width", "44px");
      await expect(locate).toHaveCSS("height", "44px");
      await expect(wholeGrounds).toHaveCSS("width", "44px");
      await expect(wholeGrounds).toHaveCSS("height", "44px");

      await expect
        .poll(async () => {
          const markers = await readMarkerHitTargets(page);
          return (
            markers.representedPlaces === 24 &&
            markers.markers.length > 0 &&
            markers.blockedTargets.length === 0
          );
        })
        .toBe(true);

      const chrome = await readMobileMapChrome(page);
      expect(chrome.documentWidth).toBeLessThanOrEqual(chrome.viewportWidth + 1);
      expect(chrome.search).not.toBeNull();
      expect(chrome.filters).not.toBeNull();
      expect(chrome.highTextControls).toBeNull();
      expect(chrome.utilities).not.toBeNull();
      expect(chrome.zoom).toBeNull();
      expect(chrome.attribution).not.toBeNull();
      expect(boxesOverlap(chrome.search!, chrome.filters!)).toBe(false);
      expect(boxesOverlap(chrome.filters!, chrome.utilities!)).toBe(false);
      expect(boxesOverlap(chrome.utilities!, chrome.attribution!)).toBe(false);
      await expect(page.getByRole("button", { name: "Aerial background" })).toHaveAttribute("aria-pressed", "true");
      if (width === 390) {
        // A whole-grounds view must actually expose choices, not satisfy
        // hit-target checks with one opaque cluster of every essential.
        await expect.poll(async () => (await readMarkerSpread(page)).widestPair).toBeGreaterThan(160);
        await page.screenshot({ path: "output/playwright/visual-journey/fair-aerial-phone.png" });
      }
      if (width === 320) {
        const search = page.getByRole("searchbox", {
          name: "Find a place or program event on the Fair grounds map",
        });
        await search.focus();
        await page.keyboard.press("Tab");
        await expect(mapView).toBeFocused();
        await expect(mapView).toHaveCSS("outline-style", "solid");
        await expect(mapView).toHaveCSS("outline-width", "2px");

        expect(chrome.actionBar).not.toBeNull();
        expect(boxesOverlap(chrome.attribution!, chrome.actionBar!)).toBe(false);
        expect(chrome.attribution!.bottom).toBeLessThanOrEqual(
          chrome.viewportHeight,
        );
        expect(chrome.attributionToggleOwnsHit).toBe(true);
      }
    }
  });

  test("preserves map-control separation when root text is enlarged", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 320, height: 568 });
    await openFairMap(page);
    await page.addStyleTag({ content: "html { font-size: 200% !important; }" });

    const highTextControls = page.locator(
      "[data-fair-map-high-text-controls]",
    );
    await expect(highTextControls).toBeVisible();
    const searchTrigger = page.getByRole("button", {
      name: "Search the Fair map",
    });
    await expect(searchTrigger).toBeVisible();
    const triggerBox = await searchTrigger.boundingBox();
    expect(triggerBox?.width).toBeGreaterThanOrEqual(44);
    expect(triggerBox?.height).toBeGreaterThanOrEqual(44);
    const mapView = page.getByRole("combobox", { name: "Map view" });
    await expect(mapView).toHaveCSS("height", "44px");
    const selectHitOwnership = await readCondensedSelectHitOwnership(page);
    expect(selectHitOwnership).not.toBeNull();
    expect(selectHitOwnership?.select.top).toBeGreaterThanOrEqual(
      (selectHitOwnership?.frame.top ?? 0) - 0.5,
    );
    expect(selectHitOwnership?.select.bottom).toBeLessThanOrEqual(
      (selectHitOwnership?.frame.bottom ?? 0) + 0.5,
    );
    expect(selectHitOwnership?.select.height).toBeGreaterThanOrEqual(44);
    expect(selectHitOwnership?.ownsTopEdge).toBe(true);
    expect(selectHitOwnership?.ownsBottomEdge).toBe(true);
    for (const name of ["Show my location", "Whole grounds"]) {
      const utility = page.getByRole("button", { name });
      const utilityBox = await utility.boundingBox();
      expect(utilityBox?.width).toBeGreaterThanOrEqual(44);
      expect(utilityBox?.height).toBeGreaterThanOrEqual(44);
    }

    const chrome = await readMobileMapChrome(page);
    expect(chrome.documentWidth).toBeLessThanOrEqual(chrome.viewportWidth + 1);
    expect(chrome.highTextControls).not.toBeNull();
    expect(chrome.zoom).toBeNull();
    expect(chrome.attribution).not.toBeNull();
    expect(chrome.actionBar).not.toBeNull();
    if (chrome.utilities) {
      expect(boxesOverlap(chrome.highTextControls!, chrome.utilities)).toBe(
        false,
      );
      expect(boxesOverlap(chrome.utilities, chrome.attribution!)).toBe(false);
    }
    expect(boxesOverlap(chrome.attribution!, chrome.actionBar!)).toBe(false);
    expect(chrome.attribution!.top).toBeGreaterThanOrEqual(0);
    expect(chrome.attribution!.bottom).toBeLessThanOrEqual(
      chrome.viewportHeight,
    );
    await expect
      .poll(
        async () => (await readMobileMapChrome(page)).attributionToggleOwnsHit,
        { timeout: 8_000 },
      )
      .toBe(true);

    await page.screenshot({ path: "output/playwright/visual-journey/map-large-text.png" });
    for (const lens of FAIR_MAP_LENSES) {
      await expectLensTargetsReachable(page, lens);
    }

    const cluster = page.locator("[data-fair-map-cluster]").first();
    await cluster.click();
    const clusterSheet = page.locator("[data-fair-map-cluster-selection]");
    await expectSheetClearOfActionBar(page, clusterSheet);
    await expectControlInsideSheet(
      clusterSheet,
      clusterSheet
        .getByRole("list", { name: "Nearby map places" })
        .getByRole("button")
        .last(),
    );
    await page.keyboard.press("Escape");
    await expect(cluster).toBeFocused();

    await searchTrigger.click();
    const search = page.getByRole("searchbox", {
      name: "Find a place or program event on the Fair grounds map",
    });
    await expect(search).toBeVisible();
    await expect(search).toBeFocused();
    await search.fill("Gate 1");
    const clearSearch = page.getByRole("button", { name: "Clear search" });
    await expect(clearSearch).toBeVisible();
    await clearSearch.click();
    await expect(search).toHaveValue("");
  });

  test("gives every represented place an unobstructed marker or cluster at 320px", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 320, height: 568 });
    await openFairMap(page);
    for (const lens of FAIR_MAP_LENSES) {
      await expectLensTargetsReachable(page, lens);
    }
  });

  test("does not leave stale lens markers when reduced motion removes camera animation", async ({
    page,
  }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.setViewportSize({ width: 320, height: 568 });
    await openFairMap(page);
    expect(
      await page.evaluate(
        () => window.matchMedia("(prefers-reduced-motion: reduce)").matches,
      ),
    ).toBe(true);

    for (const lens of [
      FAIR_MAP_LENSES[2],
      FAIR_MAP_LENSES[1],
      FAIR_MAP_LENSES[3],
      FAIR_MAP_LENSES[0],
    ]) {
      await expectLensTargetsReachable(page, lens);
      await expect(page.locator("#fair-map-filter-status")).toContainText(
        `${lens.count} places.`,
      );
    }
  });

  test("opens a compact choice sheet for a dense marker cluster", async ({
    page,
  }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.setViewportSize({ width: 320, height: 568 });
    await openFairMap(page);
    await page
      .getByRole("combobox", { name: "Map view" })
      .selectOption("animals");
    await expect
      .poll(async () => (await readMarkerHitTargets(page)).representedPlaces)
      .toBe(16);

    const cluster = page.locator("[data-fair-map-cluster]").first();
    await expect(cluster).toBeVisible();
    await expect(
      cluster.locator("[data-fair-map-cluster-summary]"),
    ).toContainText("animal areas");
    const clusterMemberIds =
      (await cluster.getAttribute("data-fair-map-cluster-members"))?.split(
        " ",
      ) ?? [];
    await cluster.click();
    const choiceSheet = page.locator("[data-fair-map-cluster-selection]");
    await expect(choiceSheet).toHaveAttribute("open", "");
    await expect(choiceSheet).toHaveAttribute("aria-modal", "true");
    await expectSheetClearOfActionBar(page, choiceSheet);
    const choices = choiceSheet
      .getByRole("list", { name: "Nearby map places" })
      .getByRole("button");
    const memberCount = await choices.count();
    expect(memberCount).toBeGreaterThan(1);
    const choiceHeading = choiceSheet.getByRole("heading", {
      name: `Choose from ${memberCount} places`,
    });
    await expect(choiceHeading).toBeFocused();
    await expect(choices).toHaveCount(memberCount);
    await choiceHeading.focus();
    await page.evaluate(() => {
      document.querySelector<HTMLInputElement>("#fair-map-search")?.focus();
    });
    await expect(choiceHeading).toBeFocused();
    await expectControlInsideSheet(choiceSheet, choices.last());

    const closeChoiceSheet = choiceSheet.getByRole("button", {
      name: "Close nearby map places",
    });
    await closeChoiceSheet.focus();
    await closeChoiceSheet.press("Shift+Tab");
    await expect(choices.last()).toBeFocused();
    await choices.last().press("Tab");
    await expect(closeChoiceSheet).toBeFocused();

    await choiceHeading.focus();
    await choiceHeading.press("Escape");
    await expect(choiceSheet).toHaveCount(0);
    await expect(cluster).toBeFocused();

    await cluster.click();
    const firstChoice = page
      .getByRole("list", { name: "Nearby map places" })
      .getByRole("button")
      .first();
    const selectedName = (await firstChoice.innerText()).split("\n")[0];
    await firstChoice.click();
    const selectedHeading = page.getByRole("heading", {
      level: 3,
      name: `Selected map place: ${selectedName}`,
    });
    await expect(selectedHeading).toBeVisible();
    await expect(selectedHeading).toBeFocused();
    await selectedHeading.press("Escape");
    await expect
      .poll(async () =>
        page.evaluate((memberIds) => {
          const active = document.activeElement as HTMLElement | null;
          if (active?.id === "fair-map-search") return true;
          const activeMemberIds =
            active?.dataset.fairMapClusterMembers?.split(" ") ?? [];
          return memberIds.every((id) => activeMemberIds.includes(id));
        }, clusterMemberIds),
      )
      .toBe(true);
  });

  test("keeps pointer actions behind the cluster modal inert", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 320, height: 568 });
    const map = await openFairMap(page);
    await page
      .getByRole("combobox", { name: "Map view" })
      .selectOption("program");
    await expect
      .poll(async () => (await readMarkerHitTargets(page)).representedPlaces)
      .toBe(6);

    const clusters = page.locator("[data-fair-map-cluster]");
    await expect
      .poll(async () => {
        const counts = await clusters.evaluateAll((nodes) =>
          nodes.map((node) =>
            Number(node.getAttribute("data-fair-map-marker-count") ?? 0),
          ),
        );
        return Math.min(...counts.filter((count) => count > 1));
      })
      .toBeLessThanOrEqual(4);
    const clusterCounts = await clusters.evaluateAll((nodes) =>
      nodes.map((node) =>
        Number(node.getAttribute("data-fair-map-marker-count") ?? 0),
      ),
    );
    const smallestClusterIndex = clusterCounts.reduce(
      (smallestIndex, count, index) =>
        count > 1 && count < clusterCounts[smallestIndex]
          ? index
          : smallestIndex,
      0,
    );
    const cluster = clusters.nth(smallestClusterIndex);
    await expect(cluster).toBeVisible();
    const dialog = page.locator("[data-fair-map-cluster-selection]");
    const openCluster = async () => {
      await cluster.click();
      await expect(dialog).toHaveAttribute("open", "");
      await expect(
        dialog.getByRole("heading", { name: /Choose from \d+ places/ }),
      ).toBeFocused();
    };
    const clickBehindDialog = async (target: Locator) => {
      const targetBox = await target.boundingBox();
      expect(targetBox).not.toBeNull();
      await page.mouse.click(
        targetBox!.x + targetBox!.width / 2,
        targetBox!.y + targetBox!.height / 2,
      );
      await expect(dialog).toHaveCount(0);
      await expect(cluster).toBeFocused();
      await expect(target).not.toBeFocused();
    };

    await openCluster();
    await clickBehindDialog(
      page.getByRole("searchbox", {
        name: "Find a place or program event on the Fair grounds map",
      }),
    );

    await openCluster();
    const canvas = map.locator("canvas");
    const canvasBox = await canvas.boundingBox();
    expect(canvasBox).not.toBeNull();
    await page.mouse.click(canvasBox!.x + 5, canvasBox!.y + 8);
    await expect(dialog).toHaveCount(0);
    await expect(cluster).toBeFocused();
    await expect(canvas).not.toBeFocused();

    await openCluster();
    const today = page
      .locator("[data-mobile-action-bar]")
      .getByRole("button", { name: "Home" });
    await clickBehindDialog(today);
    await expect(map).toBeVisible();
    await expect(
      page
        .locator("[data-mobile-action-bar]")
        .getByRole("button", { name: "Map" }),
    ).toHaveAttribute("aria-current", "page");
  });

  test("restores full lens and utility labels from the small breakpoint", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 640, height: 844 });
    await openFairMap(page);

    await expect(page.locator("[data-fair-map-filter-select]")).toBeHidden();

    const arrival = page.getByRole("button", {
      name: "Arrive and enter · 16",
    });
    await expect(
      page
        .getByRole("group", { name: "Choose what the Fair map shows" })
        .getByRole("button"),
    ).toHaveCount(5);
    await expect(arrival).toBeVisible();
    await expect(arrival).toContainText("Arrive and enter · 16");
    await expect(
      page.locator(
        ".fair-grounds-map-canvas .maplibregl-ctrl-top-right .maplibregl-ctrl-group",
      ),
    ).toBeVisible();
    for (const name of ["Show my location", "Whole grounds"]) {
      const utility = page.getByRole("button", { name });
      await expect(utility.locator(".sr-only")).toHaveText(name);
      await expect(utility.locator(".sr-only")).toHaveCSS(
        "position",
        "absolute",
      );
      const visibleLabel = utility.locator('span[aria-hidden="true"]');
      await expect(visibleLabel).toHaveText(name);
      await expect(visibleLabel).toBeVisible();
    }
  });

  test("changes the real map zoom with focused-canvas plus and minus keys", async ({
    page,
  }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    for (const width of [320, 639]) {
      await page.setViewportSize({ width, height: 844 });
      const map = await openFairMap(page);
      await expect
        .poll(async () => (await readMarkerSpread(page)).count)
        .toBeGreaterThan(1);
      await expect(
        page.locator(
          ".fair-grounds-map-canvas .maplibregl-ctrl-top-right .maplibregl-ctrl-group",
        ),
      ).toBeHidden();

      const canvas = map.locator("canvas");
      await canvas.focus();
      await expect(canvas).toBeFocused();
      const before = await readMarkerSpread(page);
      expect(before.widestPair).toBeGreaterThan(0);

      await canvas.press("Shift+Equal");
      await expect
        .poll(async () => (await readMarkerSpread(page)).widestPair)
        .toBeGreaterThan(before.widestPair * 1.25);
      const afterPlus = await readMarkerSpread(page);
      await expect(canvas).toBeFocused();

      await canvas.press("Minus");
      await expect
        .poll(async () => (await readMarkerSpread(page)).widestPair)
        .toBeLessThan(afterPlus.widestPair * 0.8);
      await expect(canvas).toBeFocused();
    }
  });

  test("remembers a chosen map view across Fair mode remounts but not reloads", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 320, height: 568 });
    await openFairMap(page);

    const mapView = page.getByRole("combobox", { name: "Map view" });
    await mapView.selectOption("buildings");
    await expect(mapView).toHaveValue("buildings");
    await expect(page.locator("#fair-map-filter-status")).toContainText(
      "This map view shows Buildings: 7 places.",
    );

    const actionBar = page.locator("[data-mobile-action-bar]");
    await actionBar.getByRole("button", { name: "Home" }).press("Enter");
    await expect(page.locator("[data-fair-grounds-map]")).toHaveCount(0);
    await actionBar.getByRole("button", { name: "Map" }).press("Enter");
    await expect(page.locator("[data-fair-grounds-map] canvas")).toBeVisible();
    await expect(page.getByRole("combobox", { name: "Map view" })).toHaveValue(
      "buildings",
    );
    await expect
      .poll(async () => (await readMarkerHitTargets(page)).representedPlaces)
      .toBe(7);

    await page.reload({ waitUntil: "domcontentloaded" });
    await expect(page.locator("[data-fair-grounds-map] canvas")).toBeVisible();
    await expect(page.getByRole("combobox", { name: "Map view" })).toHaveValue(
      "essentials",
    );
    await expect
      .poll(async () => (await readMarkerHitTargets(page)).representedPlaces)
      .toBe(24);
  });

  test("keeps selected-place details above map controls at 320px", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 320, height: 568 });
    await openFairMap(page);
    const search = page.getByRole("searchbox", {
      name: "Find a place or program event on the Fair grounds map",
    });
    await search.fill("Lot D entrance on Monroe Avenue");
    await page
      .locator("#fair-map-search-results")
      .getByRole("button", { name: /Lot D entrance on Monroe Avenue/ })
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
    await expectSheetClearOfActionBar(page, sheet);
    await expect
      .poll(
        () =>
          readFocusedMarkerClearance(page, "fair-arrival-lot-d-monroe"),
        { timeout: 8_000 },
      )
      .toEqual([]);

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

  test("keeps north and south search focus clear at 200 percent text", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 320, height: 568 });
    await openFairMap(page);
    await page.addStyleTag({ content: "html { font-size: 200% !important; }" });

    for (const target of [
      {
        name: "Middletown Valley Bank Arena",
        memberId: "osm-way-307321847",
      },
      {
        name: "Monocacy Boulevard at Bucheimer Road",
        memberId: "transit-stop-163111",
      },
    ]) {
      const searchTrigger = page.getByRole("button", {
        name: "Search the Fair map",
      });
      await searchTrigger.click();
      const search = page.getByRole("searchbox", {
        name: "Find a place or program event on the Fair grounds map",
      });
      await search.fill(target.name);
      await page
        .locator("#fair-map-search-results")
        .getByRole("button", { name: new RegExp(`^${target.name}`) })
        .click();

      const sheet = page.getByRole("region", {
        name: `Selected map place: ${target.name}`,
      });
      await expectSheetClearOfActionBar(page, sheet);
      const details = sheet.getByRole("button", { name: "More details" });
      await details.click();
      const expandedSheet = page.getByRole("dialog", {
        name: `Selected map place: ${target.name}`,
      });
      await expectControlInsideSheet(
        expandedSheet,
        expandedSheet.getByRole("button", { name: "Report issue" }),
      );
      await page.keyboard.press("Escape");
      await expect(page.locator("#fair-map-selection-mobile")).toHaveCount(0);
      await expect
        .poll(() => readFocusedMarkerClearance(page, target.memberId), {
          timeout: 8_000,
        })
        .toEqual([]);
    }
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
    await expect(page.locator("#fair-map-instructions")).toContainText(
      "pinch or double-tap the map to zoom",
    );
    await expect(page.locator("#fair-map-instructions")).toContainText(
      "use keyboard plus and minus to zoom",
    );
    await expect(page.locator("#fair-map-instructions")).toContainText(
      "complete task-grouped list below",
    );
    await expect(canvas).toHaveAttribute("tabindex", "0");
    await expect(map.locator(".maplibregl-canvas-container")).toHaveClass(
      /maplibregl-cooperative-gestures/,
    );

    await page
      .getByRole("combobox", { name: "Map view" })
      .selectOption("essentials");

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

  test("uses browser Back and Forward for a mobile map-place layer", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await openFairMap(page);
    const search = page.getByRole("searchbox", {
      name: "Find a place or program event on the Fair grounds map",
    });
    await search.fill("Gate 1");
    await page
      .locator("#fair-map-search-results")
      .getByRole("button", { name: /^Gate 1 Gate$/ })
      .click();

    await expect(page).toHaveURL(
      /\/moments\/great-frederick-fair-2026\?meet=osm-node-14099608925#fair-map$/,
    );
    await expect(
      page.getByRole("region", { name: "Selected map place: Gate 1" }),
    ).toBeVisible();

    await page.goBack();
    await expect(page.locator("[data-fair-map-selection]")).toHaveCount(0);
    await expect(page).toHaveURL(
      /\/moments\/great-frederick-fair-2026#fair-map$/,
    );
    await expect(page.getByRole("heading", { name: "Fairgrounds map" })).toBeVisible();

    await page.goForward();
    await expect(page).toHaveURL(
      /\/moments\/great-frederick-fair-2026\?meet=osm-node-14099608925#fair-map$/,
    );
    await expect(
      page.getByRole("region", { name: "Selected map place: Gate 1" }),
    ).toBeVisible();
  });

  test("leaves a map selection behind when switching Fair tools", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await openFairMap(page);
    const search = page.getByRole("searchbox", {
      name: "Find a place or program event on the Fair grounds map",
    });
    await search.fill("Gate 1");
    await page
      .locator("#fair-map-search-results")
      .getByRole("button", { name: /^Gate 1 Gate$/ })
      .click();
    await expect(page.locator("[data-fair-map-selection]:visible")).toBeVisible();

    await page
      .getByRole("navigation", { name: "Fair Day" })
      .getByRole("button", { name: "Program", exact: true })
      .click();

    await expect(page).toHaveURL(
      /\/moments\/great-frederick-fair-2026#program$/,
    );
    expect(new URL(page.url()).searchParams.has("meet")).toBe(false);
    expect(
      await page.evaluate(
        () =>
          (window.history.state as Record<string, unknown> | null)
            ?.__frederickRadiusFairMapSelection,
      ),
    ).not.toBe(true);

    await page.goBack();
    await expect(page).toHaveURL(
      /\/moments\/great-frederick-fair-2026#fair-map$/,
    );
    await expect(page.locator("[data-fair-map-selection]")).toHaveCount(0);
    await expect(
      page.getByRole("heading", { name: "Fairgrounds map" }),
    ).toBeVisible();
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
      .getByRole("button", { name: /Homegrown Frederick/ })
      .press("Enter");

    const sheet = page.getByRole("region", {
      name: "Selected map place: Homegrown Frederick (Building 13)",
    });
    await expect(sheet).toHaveCSS("overflow-y", "auto");
    const details = sheet.getByRole("button", { name: "More details" });
    await expect(details).toHaveAttribute("aria-expanded", "false");
    await details.click();
    const expandedSheet = page.getByRole("dialog", {
      name: "Selected map place: Homegrown Frederick (Building 13)",
    });
    await expect(
      expandedSheet.getByRole("button", { name: "Show less" }),
    ).toHaveAttribute("aria-expanded", "true");
    const source = expandedSheet.getByRole("link", { name: "Mapped source" });
    await source.focus();
    await expect(source).toBeInViewport();
    await expectSheetClearOfActionBar(page, expandedSheet);
    await expectControlInsideSheet(
      expandedSheet,
      expandedSheet.getByRole("button", { name: "Report issue" }),
    );

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
      geometry.actionBarTop - 7.5,
    );
  });

  test("makes expanded place details modal at 320px and restores focus", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 320, height: 480 });
    await openFairMap(page);
    const search = page.getByRole("searchbox", {
      name: "Find a place or program event on the Fair grounds map",
    });
    const selectHomegrown = async () => {
      await search.fill("Homegrown Wineries");
      await page
        .locator("#fair-map-search-results")
        .getByRole("button", { name: /Homegrown Frederick/ })
        .press("Enter");
    };

    await selectHomegrown();
    const compactSheet = page.getByRole("region", {
      name: "Selected map place: Homegrown Frederick (Building 13)",
    });
    await expect(compactSheet).not.toHaveAttribute("aria-modal", "true");
    await expect(
      compactSheet.evaluate(
        (element) =>
          element instanceof HTMLDialogElement &&
          element.open &&
          !element.matches(":modal"),
      ),
    ).resolves.toBe(true);

    await compactSheet.getByRole("button", { name: "More details" }).click();
    let modalSheet = page.getByRole("dialog", {
      name: "Selected map place: Homegrown Frederick (Building 13)",
    });
    await expect(modalSheet).toHaveAttribute("aria-modal", "true");
    const modalContract = await modalSheet.evaluate((element) => {
      const dialog = element as HTMLDialogElement;
      const style = window.getComputedStyle(dialog);
      const backdrop = window.getComputedStyle(dialog, "::backdrop");
      return {
        nativeModal: dialog.matches(":modal"),
        bodyOverflow: document.body.style.overflow,
        overflowY: style.overflowY,
        overscrollY: style.overscrollBehaviorY,
        maxHeight: style.maxHeight,
        clientHeight: dialog.clientHeight,
        scrollHeight: dialog.scrollHeight,
        backdrop: backdrop.backgroundColor,
      };
    });
    expect(modalContract.nativeModal).toBe(true);
    expect(modalContract.bodyOverflow).toBe("hidden");
    expect(modalContract.overflowY).toBe("auto");
    expect(modalContract.overscrollY).toBe("contain");
    expect(modalContract.maxHeight).not.toBe("none");
    expect(modalContract.scrollHeight).toBeGreaterThan(
      modalContract.clientHeight,
    );
    expect(modalContract.backdrop).not.toBe("rgba(0, 0, 0, 0)");
    expect(modalContract.backdrop).not.toBe("transparent");

    const modalHeading = modalSheet.getByRole("heading", {
      name: "Selected map place: Homegrown Frederick (Building 13)",
    });
    await expect(modalHeading).toBeFocused();
    const backgroundStayedInert = await modalSheet.evaluate((dialog) => {
      const outsideControl = document.querySelector<HTMLElement>(
        "[data-mobile-action-bar] button",
      );
      outsideControl?.focus();
      return {
        focusStayedInside: dialog.contains(document.activeElement),
        outsideReceivedFocus: document.activeElement === outsideControl,
      };
    });
    expect(backgroundStayedInert).toEqual({
      focusStayedInside: true,
      outsideReceivedFocus: false,
    });

    const closeButton = modalSheet.getByRole("button", {
      name: "Close selected map place",
    });
    const reportButton = modalSheet.getByRole("button", {
      name: "Report issue",
    });
    await closeButton.focus();
    await page.keyboard.press("Shift+Tab");
    await expect(reportButton).toBeFocused();
    await page.keyboard.press("Tab");
    await expect(closeButton).toBeFocused();

    await modalSheet.getByRole("button", { name: "Show less" }).click();
    const collapsedAgain = page.getByRole("region", {
      name: "Selected map place: Homegrown Frederick (Building 13)",
    });
    const moreDetailsAgain = collapsedAgain.getByRole("button", {
      name: "More details",
    });
    await expect(moreDetailsAgain).toBeFocused();
    await moreDetailsAgain.click();
    modalSheet = page.getByRole("dialog", {
      name: "Selected map place: Homegrown Frederick (Building 13)",
    });
    await expect(modalSheet).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(page.locator("#fair-map-selection-mobile")).toHaveCount(0);
    await expect(search).toBeFocused();
    await expect
      .poll(() => page.evaluate(() => document.body.style.overflow))
      .toBe("");

    await selectHomegrown();
    await page
      .getByRole("region", {
        name: "Selected map place: Homegrown Frederick (Building 13)",
      })
      .getByRole("button", { name: "More details" })
      .click();
    modalSheet = page.getByRole("dialog", {
      name: "Selected map place: Homegrown Frederick (Building 13)",
    });
    await modalSheet
      .getByRole("button", { name: "Close selected map place" })
      .click();
    await expect(page.locator("#fair-map-selection-mobile")).toHaveCount(0);
    await expect(search).toBeFocused();
    await expect
      .poll(() => page.evaluate(() => document.body.style.overflow))
      .toBe("");

    await selectHomegrown();
    await page
      .getByRole("region", {
        name: "Selected map place: Homegrown Frederick (Building 13)",
      })
      .getByRole("button", { name: "More details" })
      .click();
    modalSheet = page.getByRole("dialog", {
      name: "Selected map place: Homegrown Frederick (Building 13)",
    });
    await modalSheet.getByRole("button", { name: "Report issue" }).click();
    await expect(page.locator("#fair-map-selection-mobile")).toHaveCount(0);
    const reportDialog = page.getByRole("dialog", {
      name: "Report a Fair issue",
    });
    await expect(reportDialog).toBeVisible();
    await expect(reportDialog).toContainText(
      "Reporting: Homegrown Frederick (Building 13)",
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

    const search = page.getByRole("searchbox", {
      name: "Find a place or program event on the Fair grounds map",
    });
    await search.fill("Gate 1");
    await page
      .locator("#fair-map-search-results")
      .getByRole("button", { name: /^Gate 1/ })
      .press("Enter");
    await expect(
      page.getByRole("region", { name: "Selected map place: Gate 1" }),
    ).toBeVisible();
    await expectNoAxeViolations(page);
  });
});
