import { expect, test } from "@playwright/test";

const FAIR_CANONICAL_PATH = "/moments/great-frederick-fair-2026";
const ETIX_ADMISSION_URL =
  "https://www.etix.com/ticket/p/61602326/advance-gate-admissionthe-great-frederick-fair-frederick-the-great-frederick-fair-advanced-gate?partner_id=944";
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

  test("keeps the unrelated Today route out of the Fair cold load", async ({
    page,
  }) => {
    const todayRequests: string[] = [];
    page.on("request", (request) => {
      const url = new URL(request.url());
      if (url.pathname === "/today") todayRequests.push(url.toString());
    });

    const response = await page.goto(FAIR_CANONICAL_PATH, {
      waitUntil: "networkidle",
      timeout: 60_000,
    });
    expect(response?.status()).toBe(200);
    await expect(page.getByRole("link", { name: "Back to Frederick Radius" }))
      .toHaveAttribute("href", "/today");
    await page.waitForTimeout(1_000);

    expect(todayRequests).toEqual([]);
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
    const fairShare = page.getByRole("button", {
      name: "Share the Fair guide",
    });
    await expect(fairShare).toBeVisible();
    const fairShareBox = await fairShare.boundingBox();
    expect(fairShareBox?.height ?? 0).toBeGreaterThanOrEqual(44);
    expect(fairShareBox?.width ?? 0).toBeGreaterThanOrEqual(44);
    await expect(page.locator("article[data-fair-app]")).toHaveAttribute(
      "data-fair-interaction-ready",
      "true",
      { timeout: 15_000 },
    );
    const essentials = page.locator("[data-fair-at-a-glance]");
    await expect(essentials).toBeVisible();
    const essentialTiles = essentials.locator("[data-fair-glance-tile]");
    await expect(essentialTiles).toHaveCount(3);
    await expect(essentials).not.toContainText("0 of 3 ready");
    await expect(essentials).toContainText("Children 10 & under free");
    await expect(essentials).toContainText("$10 cash lots");
    for (const tile of await essentialTiles.all()) {
      const box = await tile.boundingBox();
      expect(box?.height ?? 0).toBeGreaterThanOrEqual(44);
      expect(box?.width ?? 0).toBeGreaterThanOrEqual(44);
    }
    await expect(
      page.getByRole("navigation", { name: "Primary" }),
    ).toHaveCount(0);
    await expect(page.getByLabel("Send feedback")).toHaveCount(0);
    const mobileActionBar = page.locator("[data-mobile-action-bar]");
    await expect(mobileActionBar).toBeVisible();
    await expect(
      mobileActionBar.getByRole("navigation", { name: "Fair Day" }),
    ).toHaveAttribute(
      "style",
      /--app-bg-elevated-solid/,
    );

    const datePicker = page.getByRole("combobox", {
      name: "Fair day in your plan",
    });
    await datePicker.selectOption("2026-09-20");
    await expect(datePicker).toHaveValue("2026-09-20");
    await expect(essentials).toContainText("Sunday at a glance");
    await expect(essentials).toContainText("$10 online · $15 gate");
    await expect(essentials).not.toContainText("$8 first Friday");
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
    const directAdmission = page.getByRole("link", { name: "Buy admission on Etix" });
    await expect(directAdmission).toBeVisible();
    await expect(directAdmission).toHaveAttribute("href", ETIX_ADMISSION_URL);
    await expect(page.locator("[data-fair-direct-admission]")).toContainText("$10");
    await expect(page.locator("[data-fair-direct-admission]")).not.toContainText("$8");
    await expect(page.locator("[data-fair-admission-alternatives]")).toContainText("Blue Ribbon Bundle: $80");
    await expect(page.locator("[data-fair-admission-alternatives]")).toContainText("10 Fair admissions");
    await expect(page.getByRole("link", { name: "Buy the 10-ticket bundle on Etix" })).toHaveAttribute(
      "href", /etix\.com\/ticket\/p\/65356930\//,
    );
    await expect(page.getByRole("dialog", { name: "Tickets" })).toContainText("Single admission at the gate is $15.");
    await expect(page.getByRole("spinbutton", { name: "Adults 11+" })).not.toBeVisible();
    await page.getByText("Estimate for my group", { exact: true }).click();
    await page.getByRole("spinbutton", { name: "Adults 11+" }).fill("2");

    const ticketCombination = page.getByRole("list", {
      name: "Reviewed party ticket combination",
    });
    await expect(ticketCombination).toContainText(
      "2 × Adult admission online",
    );
    await expect(ticketCombination).toContainText("$20");

    const etixLink = page.getByRole("link", {
      name: "Open Etix for Adult admission online",
    });
    await expect(etixLink).toHaveAttribute("href", ETIX_ADMISSION_URL);
    await expect(etixLink).toHaveAttribute("target", "_blank");
    await expect(etixLink).toHaveAttribute("rel", "noopener noreferrer");
    await expect(page.getByText("Your selections do not transfer.", { exact: false })).toBeVisible();
    await expect(page.getByRole("button", { name: "Copy ticket checklist" })).toBeVisible();
    await page.getByRole("button", { name: "Close Tickets" }).click();
    await page.reload();
    await page.getByRole("button", { name: "Review tickets" }).click();
    await page.getByText("Estimate for my group", { exact: true }).click();
    await expect(page.getByRole("spinbutton", { name: "Adults 11+" })).toHaveValue("2");
    await page.getByRole("button", { name: "I already have tickets" }).click();
    await page.getByRole("button", { name: "Close Tickets" }).click();

    await page.getByRole("button", { name: "Choose travel", exact: true }).click();
    const transitChoice = page.getByRole("radio", { name: /County Transit/ });
    await transitChoice.locator("..").click();
    await expect(transitChoice).toBeChecked();
    await expect(
      page.getByText(/does not publish East Frederick Shuttle or Route 15 service/),
    ).toBeVisible();
    const officialTransit = page.getByRole("link", {
      name: "Check official County Transit",
    });
    await expect(officialTransit).toHaveAttribute("href", COUNTY_TRANSIT_URL);
    await expect(officialTransit).toHaveAttribute("target", "_blank");
    await expect(officialTransit).toHaveAttribute("rel", "noopener noreferrer");

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
        name: "Find a place, event, or vendor on the Fair grounds map",
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
        name: "Find a place, event, or vendor on the Fair grounds map",
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
    await page.getByRole("button", { name: "Program", exact: true }).click();
    await expect(
      page.getByRole("group", { name: "Filter the Fair program" }),
    ).toBeVisible();
    const programVendorSearch = page.getByRole("link", {
      name: "Search official vendor booths",
    });
    await expect(programVendorSearch).toHaveAttribute("href", EVENTHUB_URL);
    await expect(programVendorSearch).toHaveAttribute("target", "_blank");
    await expect(programVendorSearch).toHaveAttribute(
      "rel",
      "noopener noreferrer",
    );
    const grandstandSpotlight = page.locator(
      "[data-fair-grandstand-spotlight]",
    );
    await expect(grandstandSpotlight).toBeVisible();
    const grandstandSpotlightBox = await grandstandSpotlight.boundingBox();
    // Browser transforms can report 147.999984px for the 148px minimum.
    expect(Math.round(grandstandSpotlightBox?.height ?? 0)).toBeGreaterThanOrEqual(148);
    expect(grandstandSpotlightBox?.height ?? Number.POSITIVE_INFINITY).toBeLessThanOrEqual(240);
    expect(
      (grandstandSpotlightBox?.x ?? Number.POSITIVE_INFINITY) +
        (grandstandSpotlightBox?.width ?? Number.POSITIVE_INFINITY),
    ).toBeLessThanOrEqual(390);
    await expect(page.locator("[data-fair-program-trail]").first()).toBeVisible();
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
    await page.goto(`${FAIR_CANONICAL_PATH}#program`, {
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
    const foodProgram = page.locator('[data-fair-program-filter="food"]');
    await expect(foodProgram).toBeEnabled();
    await expect(foodProgram).toContainText("Food & drink");

    const eveningGroup = page.locator(
      '[data-fair-program-daypart="evening"]',
    );
    await expect(eveningGroup).toHaveAttribute("open", "");
    const daughtryCard = eveningGroup.locator("li").filter({
      has: page.getByText("Daughtry", { exact: true }),
    });
    await expect(daughtryCard).toBeVisible();
    await daughtryCard
      .getByRole("button", { name: "Open details for Daughtry" })
      .click();

    const details = page.getByRole("dialog", { name: "Daughtry" });
    await expect(details).toContainText("Headliner 8 p.m.");
    await details.getByText("Imported official wording", { exact: true }).click();
    await expect(details).toContainText(
      "Daughtry - Presented by Team Reeder of Long & Foster Real Estate, Inc. & Carter Machinery",
    );
    await expect(
      details.getByRole("link", { name: "Official Grandstand source" }),
    ).toHaveAttribute("target", "_blank");
    await expect(
      details.getByRole("link", { name: "Official Grandstand source" }),
    ).toHaveAttribute(
      "href",
      "https://thegreatfrederickfair.com/schedule/",
    );
    await page.getByRole("button", { name: "Close Daughtry" }).click();
    await expect(
      daughtryCard.getByRole("button", { name: "Open details for Daughtry" }),
    ).toBeFocused();
  });

  test("hands an exact program place to the map once and returns cleanly", async ({
    page,
  }) => {
    test.setTimeout(60_000);
    await page.goto(`${FAIR_CANONICAL_PATH}#program`, {
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
    const eveningGroup = page.locator(
      '[data-fair-program-daypart="evening"]',
    );
    await expect(eveningGroup).toHaveAttribute("open", "");
    await eveningGroup
      .getByRole("button", { name: "Open details for Daughtry" })
      .click();
    const details = page.getByRole("dialog", { name: "Daughtry" });
    await details.getByRole("button", { name: "Show on map" }).click();

    await expect(page).toHaveURL(/#fair-map$/);
    const selectedGrandstand = page.getByRole("region", {
      name: "Selected map place: Grandstand",
    });
    await expect(selectedGrandstand).toBeVisible({ timeout: 15_000 });
    await expect
      .poll(
        () => page.evaluate(() => document.activeElement?.id ?? ""),
        { timeout: 3_000 },
      )
      .toBe("fair-map-selection-mobile-heading");

    await selectedGrandstand.getByRole("button", { name: "More details" }).click();
    const mapDetails = page.getByRole("dialog", { name: "Selected map place: Grandstand" });
    await mapDetails.getByRole("button", { name: "Add Daughtry to My Day" }).click();
    await expect(mapDetails.getByRole("button", { name: "Remove Daughtry from My Day" })).toHaveAttribute("aria-pressed", "true");
    await mapDetails.getByRole("button", { name: "Remove Daughtry from My Day" }).click();
    await expect(mapDetails.getByRole("button", { name: "Add Daughtry to My Day" })).toHaveAttribute("aria-pressed", "false");
    await mapDetails.getByRole("button", { name: "Show less" }).click();

    await page.getByRole("button", { name: "Program", exact: true }).click();
    await expect(page).toHaveURL(/#program$/);
    // Returning to Program must preserve the event context rather than
    // reopening a category gateway or silently resetting discovery.
    await expect(page.locator("[data-fair-program-trail]").first()).toBeVisible();
    await page.getByRole("button", { name: "Map", exact: true }).click();
    await expect(page).toHaveURL(/#fair-map$/);
    await expect(page.locator("[data-fair-grounds-map] canvas")).toBeVisible({
      timeout: 15_000,
    });
    await expect(
      page.getByRole("region", { name: "Selected map place: Grandstand" }),
    ).toHaveCount(0);
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

    for (const width of [320, 375, 390, 430]) {
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
            const identity = hero.querySelector<HTMLElement>(
              "[data-fair-hero-identity]",
            );
            const controls = hero.querySelector<HTMLElement>(
              "[data-fair-hero-controls]",
            );
            const content = hero.querySelector<HTMLElement>(
              "[data-fair-hero-content]",
            );
            if (!identity || !controls || !content) return null;
            const controlsBox = controls.getBoundingClientRect();
            const identityBox = identity.getBoundingClientRect();
            return {
              clientHeight: content.clientHeight,
              scrollHeight: content.scrollHeight,
              controlsBottom: controlsBox.bottom,
              identityTop: identityBox.top,
              controlButtons: Array.from(
                hero.querySelectorAll<HTMLElement>(
                  "[data-fair-hero-controls] a, [data-fair-hero-controls] button, [data-fair-photo-explore-trigger]",
                ),
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
        expect(heroLayout?.controlsBottom).toBeLessThanOrEqual(
          heroLayout?.identityTop ?? 0,
        );
        for (const control of heroLayout?.controlButtons ?? []) {
          expect(control.width).toBeGreaterThanOrEqual(44);
          expect(control.height).toBeGreaterThanOrEqual(44);
        }

        const walletCards = page.locator("[data-fair-wallet-card]");
        await expect(walletCards).toHaveCount(3);
        const walletLayout = await walletCards.evaluateAll((cards) =>
          cards.map((card) => {
            const box = card.getBoundingClientRect();
            const copy = card.querySelector<HTMLElement>(
              "[data-fair-wallet-copy]",
            );
            return {
              top: box.top,
              bottom: box.bottom,
              left: box.left,
              right: box.right,
              clientHeight: card.clientHeight,
              scrollHeight: card.scrollHeight,
              copyBottom: copy?.getBoundingClientRect().bottom,
              zIndex: window.getComputedStyle(card).zIndex,
            };
          }),
        );
        for (let index = 1; index < walletLayout.length; index += 1) {
          const previous = walletLayout[index - 1];
          const current = walletLayout[index];
          const overlap = previous.bottom - current.top;
          expect(overlap).toBeGreaterThanOrEqual(7);
          expect(overlap).toBeLessThanOrEqual(9);
          expect(current.left).toBeGreaterThan(previous.left);
          expect(previous.copyBottom ?? Number.POSITIVE_INFINITY).toBeLessThan(
            current.top,
          );
        }
        for (const card of walletLayout) {
          expect(card.right).toBeLessThanOrEqual(width);
          expect(card.scrollHeight).toBeLessThanOrEqual(card.clientHeight + 1);
        }
        await walletCards.first().focus();
        expect(
          Number(
            await walletCards
              .first()
              .evaluate((card) => window.getComputedStyle(card).zIndex),
          ),
        ).toBeGreaterThan(Number(walletLayout[2].zIndex));

        await expect(page.locator("[data-fair-plan-summary]")).toHaveCount(0);
        const glanceHeading = page.locator("#fair-at-a-glance-heading");
        const planDate = page.locator("[data-fair-plan-date]");
        const planLayout = await glanceHeading.evaluate((heading) => {
          const style = window.getComputedStyle(heading);
          return {
            clientWidth: heading.clientWidth,
            scrollWidth: heading.scrollWidth,
            textOverflow: style.textOverflow,
            whiteSpace: style.whiteSpace,
          };
        });
        expect(planLayout.scrollWidth).toBeLessThanOrEqual(
          planLayout.clientWidth + 1,
        );
        expect(planLayout.textOverflow).not.toBe("ellipsis");
        expect(planLayout.whiteSpace).not.toBe("nowrap");
        const headingBox = await glanceHeading.boundingBox();
        const dateBox = await planDate.boundingBox();
        expect(dateBox?.x ?? 0).toBeGreaterThanOrEqual(
          (headingBox?.x ?? 0) + (headingBox?.width ?? 0),
        );

        await page.addStyleTag({
          content: `
            [data-fair-hero-controls] :is(a, button) { font-size: 26px !important; }
            [data-fair-hero-identity] > div { font-size: 20px !important; }
            #fair-now-heading { font-size: 68px !important; }
            [data-fair-hero-identity] > p { font-size: 20px !important; }
            [data-fair-photo-explore-trigger] { font-size: 24px !important; }
          `,
        });
        const enlargedHero = await page.locator("[data-fair-hero]").evaluate(
          (hero) => {
            const identity = hero.querySelector<HTMLElement>(
              "[data-fair-hero-identity]",
            );
            const content = hero.querySelector<HTMLElement>(
              "[data-fair-hero-content]",
            );
            const controls = hero.querySelector<HTMLElement>(
              "[data-fair-hero-controls]",
            );
            const heading = hero.querySelector<HTMLElement>("#fair-now-heading");
            const date = hero.querySelector<HTMLElement>(
              "[data-fair-hero-identity] > p",
            );
            const photoTrigger = hero.querySelector<HTMLElement>(
              "[data-fair-photo-explore-trigger]",
            );
            if (!identity || !content || !controls || !heading || !date || !photoTrigger) {
              return null;
            }
            return {
              clientHeight: content.clientHeight,
              scrollHeight: content.scrollHeight,
              controlsBottom: controls.getBoundingClientRect().bottom,
              identityTop: identity.getBoundingClientRect().top,
              headingBottom: heading.getBoundingClientRect().bottom,
              dateTop: date.getBoundingClientRect().top,
              dateBottom: date.getBoundingClientRect().bottom,
              photoTriggerTop: photoTrigger.getBoundingClientRect().top,
              photoTriggerRight: photoTrigger.getBoundingClientRect().right,
              documentClientWidth: document.documentElement.clientWidth,
              documentScrollWidth: document.documentElement.scrollWidth,
            };
          },
        );
        expect(enlargedHero).not.toBeNull();
        expect(enlargedHero?.scrollHeight).toBeLessThanOrEqual(
          (enlargedHero?.clientHeight ?? 0) + 1,
        );
        expect(enlargedHero?.controlsBottom).toBeLessThanOrEqual(
          enlargedHero?.identityTop ?? 0,
        );
        expect(enlargedHero?.headingBottom).toBeLessThanOrEqual(
          enlargedHero?.dateTop ?? 0,
        );
        expect(enlargedHero?.dateBottom).toBeLessThanOrEqual(
          enlargedHero?.photoTriggerTop ?? 0,
        );
        expect(enlargedHero?.photoTriggerRight).toBeLessThanOrEqual(width);
        expect(enlargedHero?.documentScrollWidth).toBeLessThanOrEqual(
          (enlargedHero?.documentClientWidth ?? 0) + 1,
        );
      }

      for (const label of ["Home", "Program", "Map", "My Day"] as const) {
        const destination = page
          .getByRole("navigation", { name: "Fair Day" })
          .getByRole("button", { name: label, exact: true });
        await destination.focus();
        await destination.press("Enter");
        const headerControls = page.locator(
          "header .fair-hero-control:visible",
        );
        await expect(headerControls).toHaveCount(label === "Home" ? 3 : 2);
        for (const control of await headerControls.all()) {
          const controlBox = await control.boundingBox();
          const glyphBox = await control.locator("svg").boundingBox();
          expect(controlBox?.width ?? 0).toBeGreaterThanOrEqual(44);
          expect(controlBox?.height ?? 0).toBeGreaterThanOrEqual(44);
          expect(glyphBox?.width ?? Number.POSITIVE_INFINITY).toBeLessThanOrEqual(
            20,
          );
          expect(glyphBox?.height ?? Number.POSITIVE_INFINITY).toBeLessThanOrEqual(
            20,
          );
        }
        if (width === 320 && label === "Program") {
          const categories = page.locator("[data-fair-program-filter]");
          await expect(categories).toHaveCount(8);
          for (const category of await categories.all()) {
            const box = await category.boundingBox();
            expect(box?.width).toBeGreaterThanOrEqual(44);
            expect(box?.height).toBeGreaterThanOrEqual(44);
          }
        }
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

    await page.setViewportSize({ width: 768, height: 844 });
    await page.goto(`${FAIR_CANONICAL_PATH}#program`, {
      waitUntil: "domcontentloaded",
    });
    const tabletProgramCards = page.locator("[data-fair-program-filter]");
    await expect(tabletProgramCards).toHaveCount(8);
    const tabletProgramLayout = await tabletProgramCards.evaluateAll((cards) =>
      cards.map((card) => {
        const box = card.getBoundingClientRect();
        return { top: box.top, bottom: box.bottom };
      }),
    );
    expect(tabletProgramLayout[4].top - tabletProgramLayout[0].bottom).toBeGreaterThanOrEqual(
      5,
    );
  });

  test("keeps the desktop Map date clear of the Fair navigation", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto(`${FAIR_CANONICAL_PATH}#fair-map`, {
      waitUntil: "domcontentloaded",
    });
    await expect(page.locator("article[data-fair-app]")).toHaveAttribute(
      "data-fair-interaction-ready",
      "true",
    );

    const date = page.locator("[data-fair-compact-header-date]");
    const navigation = page.locator("[data-fair-primary-nav-shell]");
    await expect(date).toBeVisible();
    await expect(navigation).toBeVisible();
    const dateBox = await date.boundingBox();
    const navigationBox = await navigation.boundingBox();
    expect(dateBox).not.toBeNull();
    expect(navigationBox).not.toBeNull();
    expect(dateBox!.y + dateBox!.height).toBeLessThanOrEqual(navigationBox!.y);
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
