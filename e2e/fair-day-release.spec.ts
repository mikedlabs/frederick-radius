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
      .getByRole("button", { name: /Homegrown Frederick/ })
      .click();
    const selectedPlace = page.getByRole("region", {
      name: "Selected map place: Homegrown Frederick (Building 13)",
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
    await expect(page.locator("[data-fair-program-groups]")).toBeVisible();
    await expect(
      page.locator("[data-fair-program-trail]:visible").first(),
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

  test("keeps concise program cards connected to exact official wording", async ({
    page,
  }) => {
    test.setTimeout(60_000);
    await page.goto(`${FAIR_CANONICAL_PATH}#find`, {
      waitUntil: "domcontentloaded",
    });
    await expect(page.locator("article[data-fair-app]")).toHaveAttribute(
      "data-fair-interaction-ready",
      "true",
      { timeout: 15_000 },
    );

    await page
      .getByRole("combobox", { name: "Fair day to explore" })
      .selectOption("2026-09-18");
    const foodProgram = page.locator(
      '[data-fair-discovery-choice="food-program"]',
    );
    await expect(foodProgram).toBeEnabled();
    await expect(foodProgram).toContainText(
      "Homegrown Wineries, Breweries and Distilleries Showcase",
    );

    await page
      .getByRole("button", { name: "Browse full program", exact: true })
      .click();
    const eveningGroup = page.locator(
      '[data-fair-program-daypart="evening"]',
    );
    await eveningGroup.locator("summary").click();
    const daughtryCard = eveningGroup.locator("li").filter({
      has: page.getByText("Daughtry", { exact: true }),
    });
    await expect(daughtryCard).toBeVisible();
    await daughtryCard
      .getByRole("button", { name: "Open details for Daughtry" })
      .click();

    const details = page.getByRole("dialog", { name: "Daughtry" });
    await expect(details).toContainText("Headliner 8 p.m.");
    await details.getByText("Official program wording", { exact: true }).click();
    await expect(details).toContainText(
      "Daughtry - Presented by Team Reeder of Long & Foster Real Estate, Inc. & Carter Machinery",
    );
    await expect(
      details.getByRole("link", { name: "Official program source" }),
    ).toHaveAttribute("target", "_blank");
    await page.getByRole("button", { name: "Close Daughtry" }).click();
    await expect(
      daughtryCard.getByRole("button", { name: "Open details for Daughtry" }),
    ).toBeFocused();
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

      if (width === 320) {
        const heroLayout = await page.locator("[data-fair-hero]").evaluate(
          (hero) => {
            const credit = hero.querySelector<HTMLElement>(
              "[data-fair-hero-credit]",
            );
            const identity = hero.querySelector<HTMLElement>(
              "[data-fair-hero-identity]",
            );
            const controls = hero.querySelector<HTMLElement>(
              "[data-fair-hero-controls]",
            );
            const content = hero.querySelector<HTMLElement>(
              "[data-fair-hero-content]",
            );
            if (!credit || !identity || !controls || !content) return null;
            const creditBox = credit.getBoundingClientRect();
            const identityBox = identity.getBoundingClientRect();
            return {
              clientHeight: content.clientHeight,
              scrollHeight: content.scrollHeight,
              creditBottom: creditBox.bottom,
              identityTop: identityBox.top,
              controlButtons: Array.from(
                controls.querySelectorAll<HTMLElement>("a, button"),
              ).map((control) => ({
                width: control.getBoundingClientRect().width,
                height: control.getBoundingClientRect().height,
              })),
            };
          },
        );
        expect(heroLayout).not.toBeNull();
        expect(heroLayout?.scrollHeight).toBeLessThanOrEqual(
          (heroLayout?.clientHeight ?? 0) + 1,
        );
        expect(heroLayout?.creditBottom).toBeLessThanOrEqual(
          heroLayout?.identityTop ?? 0,
        );
        for (const control of heroLayout?.controlButtons ?? []) {
          expect(control.height).toBeGreaterThanOrEqual(44);
        }

        const planSummary = page.locator("[data-fair-plan-summary]");
        const planDate = page.locator("[data-fair-plan-date]");
        const planLayout = await planSummary.evaluate((summary) => {
          const style = window.getComputedStyle(summary);
          return {
            clientWidth: summary.clientWidth,
            scrollWidth: summary.scrollWidth,
            textOverflow: style.textOverflow,
            whiteSpace: style.whiteSpace,
          };
        });
        expect(planLayout.scrollWidth).toBeLessThanOrEqual(
          planLayout.clientWidth + 1,
        );
        expect(planLayout.textOverflow).not.toBe("ellipsis");
        expect(planLayout.whiteSpace).not.toBe("nowrap");
        const summaryBox = await planSummary.boundingBox();
        const dateBox = await planDate.boundingBox();
        expect(dateBox?.x ?? 0).toBeGreaterThanOrEqual(
          (summaryBox?.x ?? 0) + (summaryBox?.width ?? 0),
        );

        await page.addStyleTag({
          content: `
            [data-fair-hero-controls] :is(a, button) { font-size: 26px !important; }
            [data-fair-hero-credit] { font-size: 18px !important; }
            [data-fair-hero-identity] > div { font-size: 20px !important; }
            #fair-now-heading { font-size: 68px !important; }
            [data-fair-hero-identity] > p { font-size: 20px !important; }
          `,
        });
        const enlargedHero = await page.locator("[data-fair-hero]").evaluate(
          (hero) => {
            const credit = hero.querySelector<HTMLElement>(
              "[data-fair-hero-credit]",
            );
            const identity = hero.querySelector<HTMLElement>(
              "[data-fair-hero-identity]",
            );
            const content = hero.querySelector<HTMLElement>(
              "[data-fair-hero-content]",
            );
            if (!credit || !identity || !content) return null;
            return {
              clientHeight: content.clientHeight,
              scrollHeight: content.scrollHeight,
              creditBottom: credit.getBoundingClientRect().bottom,
              identityTop: identity.getBoundingClientRect().top,
              documentClientWidth: document.documentElement.clientWidth,
              documentScrollWidth: document.documentElement.scrollWidth,
            };
          },
        );
        expect(enlargedHero).not.toBeNull();
        expect(enlargedHero?.scrollHeight).toBeLessThanOrEqual(
          (enlargedHero?.clientHeight ?? 0) + 1,
        );
        expect(enlargedHero?.creditBottom).toBeLessThanOrEqual(
          enlargedHero?.identityTop ?? 0,
        );
        expect(enlargedHero?.documentScrollWidth).toBeLessThanOrEqual(
          (enlargedHero?.documentClientWidth ?? 0) + 1,
        );
      }

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

  test("keeps all three travel choices on the first phone screen", async ({
    page,
  }) => {
    test.setTimeout(60_000);
    await page.route("**/api/fair/arrival-status?*", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          schemaVersion: 1,
          generatedAt: "2026-09-18T16:00:00.000Z",
          state: "no-current-update",
          coverage: "configured-sources-current",
          headline: "No official arrival update needs your attention right now.",
          summary: "Check again before you leave.",
          signals: [],
          hiddenSignalCount: 0,
          sources: [
            {
              id: "nws",
              label: "National Weather Service",
              url: "https://www.weather.gov/lwx/",
              state: "current",
              checkedAt: "2026-09-18T16:00:00.000Z",
              providerUpdatedAt: "2026-09-18T15:59:00.000Z",
            },
          ],
          transit: null,
          limitsLabel:
            "Official feeds do not measure Fair attendance, parking-space availability, or gate waits.",
        }),
      });
    });

    for (const width of [320, 390, 430]) {
      await page.setViewportSize({ width, height: 568 });
      await page.goto(`${FAIR_CANONICAL_PATH}#travel`, {
        waitUntil: "domcontentloaded",
      });
      await expect(
        page.getByRole("heading", { name: "Get there and back" }),
      ).toBeVisible();
      const status = page.locator('[data-fair-arrival-status="compact"]');
      await expect(status).toBeVisible();
      await expect(status).toContainText("Checked 12:00 PM");
      const statusBox = await status.boundingBox();
      expect(statusBox?.height ?? 0).toBeGreaterThanOrEqual(56);
      expect(statusBox?.height ?? Number.POSITIVE_INFINITY).toBeLessThanOrEqual(
        72,
      );

      const travelModes = page.getByRole("radiogroup", {
        name: "Fair travel mode",
      });
      const choices = travelModes.locator("[data-fair-travel-choice]");
      await expect(choices).toHaveCount(3);
      for (const choice of await choices.all()) {
        await expect(choice).toBeVisible();
        expect((await choice.boundingBox())?.height ?? 0).toBeGreaterThanOrEqual(
          44,
        );
      }
      const finalChoiceBox = await choices.last().boundingBox();
      const actionBarBox = await page
        .locator("[data-mobile-action-bar]")
        .boundingBox();
      expect(
        (finalChoiceBox?.y ?? 0) + (finalChoiceBox?.height ?? 0),
      ).toBeLessThanOrEqual(actionBarBox?.y ?? 568);
      const pageWidth = await page.evaluate(() => ({
        client: document.documentElement.clientWidth,
        scroll: document.documentElement.scrollWidth,
      }));
      expect(pageWidth.scroll).toBeLessThanOrEqual(pageWidth.client + 1);
    }

    await page.setViewportSize({ width: 320, height: 568 });
    await page.reload({
      waitUntil: "domcontentloaded",
    });
    await expect(
      page.locator('[data-fair-arrival-status="compact"]'),
    ).toBeVisible();
    await page
      .getByRole("button", { name: "Show official arrival check details" })
      .click();
    await expect(page.locator("[data-fair-arrival-details]")).toBeVisible();
    await expect
      .poll(async () => {
        const positions = await page.evaluate(() => ({
          modesBottom: document
            .querySelector<HTMLElement>(
              '[role="radiogroup"][aria-label="Fair travel mode"]',
            )
            ?.getBoundingClientRect().bottom,
          actionBarTop: document
            .querySelector<HTMLElement>("[data-mobile-action-bar]")
            ?.getBoundingClientRect().top,
        }));
        if (
          positions.modesBottom === undefined ||
          positions.actionBarTop === undefined
        ) {
          return false;
        }
        return positions.modesBottom <= positions.actionBarTop;
      })
      .toBe(true);
    const expandedLayout = await page.evaluate(() => ({
      documentClientWidth: document.documentElement.clientWidth,
      documentScrollWidth: document.documentElement.scrollWidth,
    }));
    expect(expandedLayout.documentScrollWidth).toBeLessThanOrEqual(
      expandedLayout.documentClientWidth + 1,
    );

    await page.reload({ waitUntil: "domcontentloaded" });
    await expect(
      page.locator('[data-fair-arrival-status="compact"]'),
    ).toBeVisible();
    await page.addStyleTag({
      content: `
        #fair-travel-heading { font-size: 60px !important; }
        #fair-travel-panel > p { font-size: 26px !important; }
        [data-fair-arrival-status] :is(span, h2, p) { font-size: 200% !important; }
        [data-fair-travel-choice] span { font-size: 200% !important; }
      `,
    });
    const enlargedLayout = await page.evaluate(() => ({
      client: document.documentElement.clientWidth,
      scroll: document.documentElement.scrollWidth,
      choices: Array.from(
        document.querySelectorAll<HTMLElement>("[data-fair-travel-choice]"),
      ).map((choice) => ({
        clientHeight: choice.clientHeight,
        scrollHeight: choice.scrollHeight,
      })),
    }));
    expect(enlargedLayout.scroll).toBeLessThanOrEqual(
      enlargedLayout.client + 1,
    );
    for (const choice of enlargedLayout.choices) {
      expect(choice.scrollHeight).toBeLessThanOrEqual(choice.clientHeight + 1);
      expect(choice.clientHeight).toBeGreaterThanOrEqual(44);
    }

    const detailsToggle = page.getByRole("button", {
      name: "Show official arrival check details",
    });
    await detailsToggle.focus();
    await detailsToggle.press("Enter");
    await expect(
      page.getByRole("button", {
        name: "Hide official arrival check details",
      }),
    ).toHaveAttribute("aria-expanded", "true");
    await expect(page.locator("[data-fair-arrival-details]")).toBeVisible();
    await expect(
      page.getByRole("link", { name: /National Weather Service/ }),
    ).toBeVisible();
  });
});
