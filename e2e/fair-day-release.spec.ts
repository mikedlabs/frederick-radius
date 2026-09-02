import { expect, test } from "@playwright/test";

const FAIR_CANONICAL_PATH = "/moments/great-frederick-fair-2026";
const ETIX_ADMISSION_URL =
  "https://www.etix.com/ticket/v/11115/the-great-frederick-fair-advanced-gate?partner_id=944";
const COUNTY_TRANSIT_URL =
  "https://www.frederickcountymd.gov/105/Transit-Services";
const EVENTHUB_URL =
  "https://mobile.eventhub-floorplan.net/?Show_ID=18209";

test.describe("Fair Day production release journey", () => {
  test.use({
    viewport: { width: 390, height: 844 },
    locale: "en-US",
    timezoneId: "America/New_York",
    serviceWorkers: "block",
  });

  test("keeps tickets, travel, planning, help, and official handoffs ready", async ({
    page,
  }) => {
    test.setTimeout(90_000);

    const redirect = await page.request.get("/fair", { maxRedirects: 0 });
    expect(redirect.status()).toBe(307);
    expect(redirect.headers().location).toBe(FAIR_CANONICAL_PATH);

    const response = await page.goto("/fair", {
      waitUntil: "domcontentloaded",
      timeout: 60_000,
    });
    expect(response?.status()).toBe(200);
    await expect(page).toHaveURL(new RegExp(`${FAIR_CANONICAL_PATH}$`));
    await expect(
      page.getByRole("heading", {
        level: 1,
        name: "The Great Frederick Fair",
      }),
    ).toBeVisible();
    await expect(page.locator("article[data-fair-app]")).toHaveAttribute(
      "data-fair-interaction-ready",
      "true",
      { timeout: 15_000 },
    );
    await expect(
      page.getByRole("navigation", { name: "Primary" }),
    ).toHaveCount(0);
    await expect(page.getByLabel("Send feedback")).toHaveCount(0);
    const mobileActionBar = page.locator("[data-mobile-action-bar]");
    await expect(mobileActionBar).toBeVisible();
    await expect(mobileActionBar).toHaveAttribute(
      "style",
      /--app-bg-elevated-solid/,
    );

    const datePicker = page.getByRole("combobox", {
      name: "Fair day in your plan",
    });
    await datePicker.selectOption("2026-09-20");
    await expect(datePicker).toHaveValue("2026-09-20");
    await expect(
      page.getByRole("heading", { level: 1, name: "The Great Frederick Fair" }),
    ).toBeVisible();
    const accessHighlight = page.locator("[data-fair-access-highlight]");
    await expect(accessHighlight).toContainText(
      "Sensory-friendly carnival · noon–2 p.m.",
    );
    await expect(accessHighlight).toContainText(
      "does not describe this as a whole-ground low-sensory period",
    );

    await page.getByRole("button", { name: "Help & access", exact: true }).click();
    await page.getByRole("button", { name: /^Access guide/ }).click();
    const accessGuide = page.getByRole("dialog", { name: "Fair help" });
    await expect(accessGuide).toContainText(
      "Where can I see the ASL interpreter at Grandstand shows?",
    );
    await expect(accessGuide).toContainText(
      "When is the sensory-friendly carnival period?",
    );
    await expect(accessGuide).toContainText(
      "Is there a permanent quiet or sensory room?",
    );
    await expect(
      accessGuide.getByRole("link", {
        name: "Communication access around Frederick",
      }),
    ).toHaveAttribute("href", "/access");
    await page.getByRole("button", { name: "Close Fair help" }).click();

    await page.getByRole("button", { name: "Help & access", exact: true }).click();
    await page.getByRole("button", { name: /^Easy to miss/ }).click();
    await expect(page.getByRole("dialog", { name: "Fair help" })).toContainText(
      "Parking is separate",
    );
    await expect(page.getByRole("dialog", { name: "Fair help" })).toContainText(
      "Apple Pay is not accepted",
    );
    await page.getByRole("button", { name: "Close Fair help" }).click();

    await page.getByRole("button", { name: "Review tickets" }).click();
    await page.getByRole("button", { name: "Compare tickets" }).click();
    await page.getByRole("spinbutton", { name: "Adults 11+" }).fill("2");

    const ticketCombination = page.getByRole("list", {
      name: "Reviewed party ticket combination",
    });
    await expect(ticketCombination).toContainText(
      "2 × Adult admission online",
    );
    await expect(ticketCombination).toContainText("$20");

    const etixLink = page.getByRole("link", {
      name: "Continue to Etix for Adult admission online",
    });
    await expect(etixLink).toHaveAttribute("href", ETIX_ADMISSION_URL);
    await expect(etixLink).toHaveAttribute("target", "_blank");
    await expect(etixLink).toHaveAttribute("rel", "noopener noreferrer");
    await page.getByRole("button", { name: "I already have tickets" }).click();
    await page.getByRole("button", { name: "Close Tickets" }).click();

    await page.getByRole("button", { name: "Choose travel", exact: true }).click();
    const transitChoice = page.getByRole("radio", { name: /County Transit/ });
    await transitChoice.locator("..").click();
    await expect(transitChoice).toBeChecked();
    await expect(
      page.getByText(/Fair-date service and arrival times are not confirmed/),
    ).toBeVisible();
    await expect(
      page.getByRole("link", { name: "Open Radius Transit" }),
    ).toHaveAttribute("href", "/transit");

    await page.getByText("Sources and limits").click();
    const transitSource = page.getByRole("link", {
      name: "Open the official information",
    });
    await expect(transitSource).toHaveAttribute("href", COUNTY_TRANSIT_URL);
    await expect(transitSource).toHaveAttribute("target", "_blank");
    await expect(transitSource).toHaveAttribute("rel", "noopener noreferrer");

    await page.getByRole("button", { name: "Map", exact: true }).click();
    await expect(page).toHaveURL(/#fair-map$/);
    const eventHubLink = page.getByRole("link", { name: "Official vendor booths" });
    await expect(eventHubLink).toHaveAttribute("href", EVENTHUB_URL);
    await expect(eventHubLink).toHaveAttribute("target", "_blank");
    await expect(eventHubLink).toHaveAttribute("rel", "noopener noreferrer");
    const fairMap = page.locator("#fair-map");
    await expect(fairMap).toBeVisible();
    await expect(
      page.getByRole("searchbox", {
        name: "Find a place or program event on the Fair grounds map",
      }),
    ).toBeVisible();
    await expect(fairMap.locator("canvas")).toBeVisible({ timeout: 15_000 });
    const mapCanvasPosition = await fairMap.locator("canvas").boundingBox();
    expect(mapCanvasPosition?.y ?? Number.POSITIVE_INFINITY).toBeLessThan(520);
    expect(mapCanvasPosition?.height ?? 0).toBeGreaterThanOrEqual(430);
    const attribution = fairMap.locator(".maplibregl-ctrl-attrib");
    const zoomControls = fairMap.locator(".maplibregl-ctrl-group").first();
    await expect(attribution).toBeVisible();
    const attributionPosition = await attribution.boundingBox();
    const zoomPosition = await zoomControls.boundingBox();
    expect(attributionPosition?.y ?? 0).toBeGreaterThanOrEqual(
      (zoomPosition?.y ?? 0) + (zoomPosition?.height ?? 0),
    );

    await page
      .getByRole("searchbox", {
        name: "Find a place or program event on the Fair grounds map",
      })
      .fill("Homegrown Wineries");
    await page
      .locator("#fair-map-search-results")
      .getByRole("button", { name: /Commercial Building/ })
      .click();
    const selectedPlace = page.getByRole("region", {
      name: "Selected map place: Commercial Building",
    });
    await expect(selectedPlace).toBeVisible();
    await expect(selectedPlace).toContainText("On your selected day");
    await expect(
      page.getByRole("button", { name: "Close selected map place" }),
    ).toBeVisible();
    const selectedPosition = await selectedPlace.boundingBox();
    const actionBarPosition = await page
      .locator("[data-mobile-action-bar]")
      .boundingBox();
    expect(
      (selectedPosition?.y ?? 0) + (selectedPosition?.height ?? 0),
    ).toBeLessThanOrEqual(actionBarPosition?.y ?? Number.POSITIVE_INFINITY);
    await page.getByRole("button", { name: "Explore", exact: true }).click();
    await expect(
      page.getByRole("region", { name: "Fair activity paths" }),
    ).toBeVisible();
    await expect(
      page.getByRole("list", { name: "Fair program results" }),
    ).toHaveCount(0);
    await page
      .getByRole("button", { name: "Browse full program", exact: true })
      .click();
    await expect(
      page.getByRole("list", { name: "Fair program results" }),
    ).toBeVisible();

    const addProgramItem = page
      .getByRole("button", { name: /^Add .+ to My Day$/ })
      .first();
    const addLabel = await addProgramItem.getAttribute("aria-label");
    expect(addLabel).toMatch(/^Add .+ to My Day$/);
    const programTitle = addLabel
      ?.replace(/^Add /, "")
      .replace(/ to My Day$/, "");
    expect(programTitle).toBeTruthy();
    await addProgramItem.click();

    await page
      .getByRole("button", { name: "My Day, 1 saved", exact: true })
      .click();
    const timeline = page.getByRole("list", { name: "My Fair Day timeline" });
    await expect(timeline).toContainText(programTitle ?? "");
    await expect(timeline.locator("li")).toHaveCount(3);

    await page.getByRole("button", { name: "Help & access", exact: true }).click();
    await page.getByRole("button", { name: "Send Fair feedback" }).click();
    const fairReport = page.getByRole("dialog", {
      name: "Report a Fair issue",
    });
    await expect(fairReport).toBeVisible();
    await expect(fairReport).toContainText("What should we fix?");
    const accessBarrier = fairReport.getByRole("button", {
      name: "Accessibility barrier",
    });
    await accessBarrier.click();
    await expect(accessBarrier).toHaveAttribute("aria-pressed", "true");
    await expect(
      fairReport.getByRole("textbox", {
        name: "What changed or went wrong?",
      }),
    ).toHaveAttribute(
      "placeholder",
      "Tell us what made the Fair harder to access or use.",
    );
  });

  test("uses location only after a tap and refuses a misleadingly broad fix", async ({
    page,
    context,
    baseURL,
  }) => {
    test.setTimeout(60_000);
    const origin = new URL(baseURL ?? "http://localhost:3010").origin;
    await context.grantPermissions(["geolocation"], { origin });
    await context.setGeolocation({
      latitude: 39.4125,
      longitude: -77.3943,
      accuracy: 250,
    });
    await page.addInitScript(() => {
      const geolocation = navigator.geolocation;
      const original = geolocation.getCurrentPosition.bind(geolocation);
      Object.defineProperty(window, "__radiusGeoRequests", {
        configurable: true,
        value: 0,
        writable: true,
      });
      Object.defineProperty(geolocation, "getCurrentPosition", {
        configurable: true,
        value: (
          success: PositionCallback,
          failure?: PositionErrorCallback | null,
          options?: PositionOptions,
        ) => {
          const trackedWindow = window as typeof window & {
            __radiusGeoRequests: number;
          };
          trackedWindow.__radiusGeoRequests += 1;
          return original(success, failure, options);
        },
      });
    });

    await page.goto(`${FAIR_CANONICAL_PATH}#fair-map`, {
      waitUntil: "domcontentloaded",
    });
    await expect(page.getByRole("button", { name: "Show my location" })).toBeVisible({
      timeout: 15_000,
    });
    expect(
      await page.evaluate(
        () =>
          (window as typeof window & { __radiusGeoRequests: number })
            .__radiusGeoRequests,
      ),
    ).toBe(0);

    await page.getByRole("button", { name: "Show my location" }).click();
    await expect(page.locator("#fair-map")).toContainText(
      "Your location reading is too broad to place safely",
    );
    expect(
      await page.evaluate(
        () =>
          (window as typeof window & { __radiusGeoRequests: number })
            .__radiusGeoRequests,
      ),
    ).toBe(1);

    await context.setGeolocation({
      latitude: 39.4125,
      longitude: -77.3943,
      accuracy: 12,
    });
    await page.getByRole("button", { name: "Show my location" }).click();
    await expect(page.locator("#fair-map")).toContainText(
      "Your position is shown within about 40 feet for this visit only.",
    );
    await expect(page.locator("[data-fair-visitor-location]")).toBeVisible();
  });

  test("keeps every Fair tool inside common phone widths", async ({ page }) => {
    test.setTimeout(60_000);

    for (const width of [320, 390, 430]) {
      await page.setViewportSize({ width, height: 844 });
      await page.goto(`${FAIR_CANONICAL_PATH}#now`, {
        waitUntil: "domcontentloaded",
      });
      await expect(page.locator("article[data-fair-app]")).toHaveAttribute(
        "data-fair-interaction-ready",
        "true",
      );

      for (const label of ["Today", "Explore", "Map", "My Day"] as const) {
        const destination = page
          .getByRole("navigation", { name: "Fair Day" })
          .getByRole("button", { name: label, exact: true });
        await destination.focus();
        await destination.press("Enter");
        if (label === "Map") {
          await expect(page.locator("[data-fair-grounds-map] canvas")).toBeVisible({
            timeout: 15_000,
          });
        }
        const geometry = await page.evaluate(() => ({
          clientWidth: document.documentElement.clientWidth,
          scrollWidth: document.documentElement.scrollWidth,
          scrollX: window.scrollX,
        }));
        expect(geometry.scrollWidth).toBeLessThanOrEqual(
          geometry.clientWidth + 1,
        );
        expect(geometry.scrollX).toBe(0);
      }
    }
  });
});
