import { expect, test } from "@playwright/test";

test.use({ serviceWorkers: "block" });

for (const width of [320, 375, 390, 430, 1366]) {
  test(`Today keeps the editorial layout useful at ${width}px`, async ({ page }, testInfo) => {
    test.setTimeout(120_000);
    await page.setViewportSize({ width, height: width === 1366 ? 900 : 844 });
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.addInitScript(() => {
      localStorage.setItem("fr:scope:v1", "county");
      document.cookie = "fr_scope=county; path=/";
    });
    await page.goto("/today", { waitUntil: "domcontentloaded" });
    const area = page.getByRole("combobox", { name: "Choose your area" });
    await expect(area).toBeEnabled();
    // Measure the final masthead facts, not the weather Suspense placeholder.
    const renderedWeather = page.locator("[data-today-weather] [data-weather-state]");
    await expect(renderedWeather).toHaveCount(1);
    await expect(renderedWeather).toHaveAttribute("data-weather-state", /^(available|safety-only|unavailable)$/);
    await expect(renderedWeather).toBeVisible();
    await page.evaluate(() => document.fonts.ready);

    const masthead = page.locator("main .scroll-masthead");
    const find = page.getByRole("link", {
      name: "Find a place, service, event, or answer", exact: true,
    });
    const mastheadBox = (await masthead.boundingBox())!;
    const findBox = (await find.boundingBox())!;
    const weatherBox = (await page.locator("[data-today-weather]").boundingBox())!;
    const doorway = page.locator("[data-today-geographic-doorway]");
    await expect(doorway).toHaveAttribute("data-photo-state", "loaded");
    await expect(doorway).toHaveAttribute("href", "/places/carroll-creek-linear-park-frederick");
    const photoBox = (await doorway.locator("figure").boundingBox())!;
    const doorwayBox = (await doorway.boundingBox())!;
    const captionBox = (await doorway.locator("[data-today-geographic-caption]").boundingBox())!;
    const headingBox = (await masthead.locator("h1").boundingBox())!;
    expect(findBox.y).toBeGreaterThanOrEqual(mastheadBox.y + mastheadBox.height);
    // The arrival action now has a deliberate phone density; neither weather
    // facts nor the photograph are subtracted from an artificial height budget.
    expect(findBox.height).toBeGreaterThanOrEqual(56);
    expect(findBox.height).toBeLessThanOrEqual(56);
    await expect(page.locator('[data-find-density="arrival"]')).toHaveCount(1);
    expect(doorwayBox.y).toBeGreaterThanOrEqual(findBox.y + findBox.height);
    // The real named caption shares the photo's grid area; it must fit inside
    // the image rather than precede it or cover a separate blank rectangle.
    expect(captionBox.x).toBeGreaterThanOrEqual(photoBox.x - 1);
    expect(captionBox.x + captionBox.width).toBeLessThanOrEqual(photoBox.x + photoBox.width + 1);
    expect(captionBox.y).toBeGreaterThanOrEqual(photoBox.y - 1);
    expect(captionBox.y + captionBox.height).toBeLessThanOrEqual(photoBox.y + photoBox.height + 1);
    expect(Math.abs(captionBox.y + captionBox.height - photoBox.y - photoBox.height)).toBeLessThanOrEqual(1);
    expect(photoBox.width).toBeGreaterThan(photoBox.height);
    expect(photoBox.height).toBeGreaterThanOrEqual(160);
    expect(photoBox.height).toBeLessThanOrEqual(190);
    expect(photoBox.width).toBeGreaterThanOrEqual(doorwayBox.width * 0.95);
    expect(photoBox.height).toBeGreaterThan(130);
    await expect(doorway.locator("img")).toHaveAttribute("alt", "Carroll Creek in Frederick.");
    await expect(doorway.getByRole("heading", { name: "Carroll Creek", exact: true })).toBeVisible();
    await expect(doorway).toContainText("Frederick");
    await expect(doorway).toContainText("View place");
    await expect(doorway).not.toContainText(/best|open now|safe now|current conditions|Mike D|June 2023/i);
    await expect(doorway.locator("a, button, input, select")).toHaveCount(0);
    const quickNeeds = page.getByRole("group", { name: "Quick needs", exact: true });
    await expect(quickNeeds).toHaveCount(1);
    await expect(quickNeeds.getByRole("link")).toHaveCount(4);
    const quickNeedsBox = (await quickNeeds.boundingBox())!;
    let primaryNavBox: { x: number; y: number; width: number; height: number } | null = null;
    if (width < 640) {
      const primaryNav = page.locator("[data-bottom-nav-shell]").getByRole("navigation", {
        name: "Primary", exact: true,
      });
      await expect(primaryNav).toBeVisible();
      primaryNavBox = (await primaryNav.boundingBox())!;
      expect(findBox.y).toBeGreaterThanOrEqual(0);
      expect(findBox.y + findBox.height).toBeLessThanOrEqual(primaryNavBox.y);
      if (width === 375) {
        const activeAlert = page.getByRole("region", { name: "Heads up", exact: true });
        const specialDayLead = page.locator('[data-moment-spotlight-day-of="true"]');
        // The existing In The Streets day-of lead is a deliberate exception.
        // It remains above the ordinary briefing instead of being compressed.
        if (await specialDayLead.count() === 0) {
          const visiblePhotoHeight = Math.max(0, Math.min(photoBox.y + photoBox.height, primaryNavBox.y) - Math.max(photoBox.y, 0));
          if (await activeAlert.count() === 0) {
            expect(visiblePhotoHeight, "substantial local photography is visible on ordinary arrival").toBeGreaterThanOrEqual(130);
            // Large, accurate photography is intentional. The quick actions
            // follow it within one viewport of scrolling instead of forcing
            // every element into tiny cards above the fixed navigation.
            expect(quickNeedsBox.y + quickNeedsBox.height).toBeLessThanOrEqual(primaryNavBox.y + 844);
          }
          const scrollForActions = Math.max(0, quickNeedsBox.y + quickNeedsBox.height - primaryNavBox.y + 16);
          expect(scrollForActions).toBeLessThanOrEqual(844);
          await page.mouse.wheel(0, scrollForActions);
          await expect.poll(async () => {
            const actions = (await quickNeeds.boundingBox())!;
            const tabs = (await primaryNav.boundingBox())!;
            return actions.y + actions.height <= tabs.y;
          }).toBe(true);
          const visibleQuickNeeds = (await quickNeeds.boundingBox())!;
          const visibleNav = (await primaryNav.boundingBox())!;
          expect(visibleQuickNeeds.y + visibleQuickNeeds.height, "all four actions clear the fixed tabs after a normal scroll").toBeLessThanOrEqual(visibleNav.y);
          await page.evaluate(() => window.scrollTo(0, 0));
        }
      }
    }
    expect(await masthead.evaluate((element) => ({
      border: getComputedStyle(element).borderTopWidth,
      shadow: getComputedStyle(element).boxShadow,
    }))).toEqual({ border: "0px", shadow: "none" });
    await expect(masthead.locator("img")).toHaveCount(0);
    expect(headingBox.y + headingBox.height).toBeLessThanOrEqual(photoBox.y);

    for (const name of ["Open now", "Public essentials", "Plan a few hours", "Local services"]) {
      const shortcut = page.getByRole("link", { name, exact: true });
      await expect(shortcut, `${name} occurs once across Today`).toHaveCount(1);
      await expect(quickNeeds.getByRole("link", { name, exact: true })).toHaveCount(1);
      const expectedHref = ({
        "Open now": "/open-now",
        "Public essentials": "/amenities",
        "Plan a few hours": "/ask?q=Plan%20the%20next%20two%20hours&in=county",
        "Local services": "/contacts",
      } as Record<string, string>)[name];
      await expect(shortcut).toHaveAttribute("href", expectedHref);
      const box = (await shortcut.boundingBox())!;
      // CSS transforms can report 43.999969px for an exact 44px target.
      // Check the declared minimum and round only subpixel representation.
      expect(await shortcut.evaluate((element) => parseFloat(getComputedStyle(element).minHeight)))
        .toBeGreaterThanOrEqual(44);
      expect(Math.round(box.height * 100) / 100, `${name} has a phone-sized touch target`)
        .toBeGreaterThanOrEqual(44);
      expect(box.width).toBeGreaterThanOrEqual(44);
      expect(box.x).toBeGreaterThanOrEqual(0);
      expect(box.x + box.width).toBeLessThanOrEqual(width + 1);
    }

    expect(weatherBox.y).toBeGreaterThanOrEqual(headingBox.y + headingBox.height);
    // The date may share the title row or wrap below it. Both facts must stay
    // visible inside the masthead without colliding or pushing weather upward.
    const dateline = masthead.locator("[data-today-dateline]");
    await expect(dateline).toBeVisible();
    const datelineBox = (await dateline.boundingBox())!;
    expect(headingBox.x).toBeGreaterThanOrEqual(mastheadBox.x);
    expect(headingBox.x + headingBox.width).toBeLessThanOrEqual(mastheadBox.x + mastheadBox.width + 1);
    expect(datelineBox.x).toBeGreaterThanOrEqual(mastheadBox.x);
    expect(datelineBox.x + datelineBox.width).toBeLessThanOrEqual(mastheadBox.x + mastheadBox.width + 1);
    expect(datelineBox.y + datelineBox.height).toBeLessThanOrEqual(weatherBox.y);
    expect(datelineBox.x >= headingBox.x + headingBox.width - 1 || datelineBox.y >= headingBox.y + headingBox.height - 1).toBe(true);
    expect(weatherBox.y + weatherBox.height).toBeLessThanOrEqual(findBox.y);
    const campaign = page.locator("[data-today-fair-feature]");
    if (await campaign.count()) {
      const campaignBox = (await campaign.boundingBox())!;
      expect(campaignBox.y).toBeGreaterThan(findBox.y + findBox.height);
      expect(campaignBox.height).toBeLessThan(210);
      await expect(campaign).toHaveAttribute("data-fair-feature-tone", "briefing");
    }

    const places = page.locator('[aria-label="Places for your area"]');
    const events = page.getByRole("group", { name: "Follow the day", exact: true });
    const placesBox = (await places.boundingBox())!;
    const eventsBox = (await events.boundingBox())!;
    // None-open is also a real answer; it deliberately has no pick-card marker.
    const decision = places.locator(":scope > section");
    await expect(decision).toHaveCount(1);
    // Runtime place facts can hydrate after the first arrival measurements.
    // Compare adjacent elements in one frame instead of mixing the early
    // quick-needs position with the later expanded decision card.
    await expect.poll(() => places.evaluate((element) => {
      const decision = element.querySelector(":scope > section")?.getBoundingClientRect();
      const quick = element.querySelector('[role="group"][aria-label="Quick needs"]')?.getBoundingClientRect();
      const photo = element.querySelector('[data-today-geographic-doorway]')?.getBoundingClientRect();
      if (!decision || !quick || !photo) return false;
      const rowBottom = innerWidth >= 640 ? Math.max(photo.bottom, decision.bottom) : decision.bottom;
      const gap = quick.y - rowBottom;
      return gap >= 0 && gap <= 17;
    })).toBe(true);
    const currentLayout = await places.evaluate((element) => {
      const read = (selector: string) => {
        const r = element.querySelector(selector)!.getBoundingClientRect();
        return { x: r.x, y: r.y, width: r.width, height: r.height };
      };
      return { decision: read(":scope > section"), quick: read('[role="group"][aria-label="Quick needs"]') };
    });
    const decisionBox = currentLayout.decision;
    const currentQuickNeedsBox = currentLayout.quick;
    expect(weatherBox.y + weatherBox.height).toBeLessThanOrEqual(placesBox.y);
    expect(weatherBox.y + weatherBox.height).toBeLessThanOrEqual(eventsBox.y);
    if (width >= 640) {
      expect(Math.abs(doorwayBox.y - decisionBox.y)).toBeLessThanOrEqual(1);
      expect(decisionBox.x).toBeGreaterThanOrEqual(doorwayBox.x + doorwayBox.width);
      const firstRowBottom = Math.max(doorwayBox.y + doorwayBox.height, decisionBox.y + decisionBox.height);
      expect(currentQuickNeedsBox.y).toBeGreaterThanOrEqual(firstRowBottom);
      expect(currentQuickNeedsBox.y - firstRowBottom).toBeLessThanOrEqual(17);
      expect(currentQuickNeedsBox.width).toBeGreaterThanOrEqual(placesBox.width - 1);
    } else {
      expect(decisionBox.y).toBeGreaterThanOrEqual(doorwayBox.y + doorwayBox.height);
      expect(decisionBox.y - doorwayBox.y - doorwayBox.height).toBeLessThanOrEqual(17);
      expect(currentQuickNeedsBox.y).toBeGreaterThanOrEqual(decisionBox.y + decisionBox.height);
      expect(currentQuickNeedsBox.y - decisionBox.y - decisionBox.height).toBeLessThanOrEqual(17);
      const activeAlert = page.getByRole("region", { name: "Heads up", exact: true });
      const specialDay = page.locator('[data-moment-spotlight-day-of="true"]');
      if (width >= 375 && await activeAlert.count() === 0 && await specialDay.count() === 0) {
        expect(captionBox.y + captionBox.height, "the exact owned place action clears navigation on ordinary arrival").toBeLessThanOrEqual(primaryNavBox!.y);
        expect(decisionBox.y, "the useful place answer begins before navigation on ordinary arrival").toBeLessThan(primaryNavBox!.y);
      }
    }
    expect(eventsBox.y).toBeGreaterThanOrEqual(placesBox.y + placesBox.height);
    await expect.poll(() => page.evaluate(() =>
      document.documentElement.scrollWidth - document.documentElement.clientWidth,
    )).toBeLessThanOrEqual(1);

    await expect.poll(() => doorway.locator("img").evaluate((element) =>
      element instanceof HTMLImageElement && element.complete && element.naturalWidth > 1 && element.naturalHeight > 1,
    )).toBe(true);
    await testInfo.attach("today-arrival-geometry", {
      contentType: "application/json",
      body: JSON.stringify({ width, mastheadBox, weatherBox, findBox, captionBox, photoBox, doorwayBox, quickNeedsBox, decisionBox, primaryNavBox,
        note: "A short daypart and dated county context precede unchanged weather and Find. A compact landscape keeps the exact named owned place visible; the real area answer follows before four shortcuts. Desktop pairs the two separate place actions." }),
    });
    await page.screenshot({ path: testInfo.outputPath(`today-${width}.png`), fullPage: true });
    await page.screenshot({ path: testInfo.outputPath(`today-${width}-viewport.png`), fullPage: false });
    await area.selectOption("town:brunswick");
    await expect(page.getByTestId("today-scope-status")).toContainText(
      "Brunswick place picks · Countywide weather and events",
    );
    await expect(page.getByRole("link", { name: "Plan a few hours", exact: true }))
      .toHaveAttribute("href", /in=brunswick/);
    await expect(page.locator("[data-today-geographic-doorway]")).toHaveCount(0);
    await expect(places.locator(":scope > section")).toHaveCount(1);
    const categoryDisclosure = page.getByRole("button", { name: "Browse all categories", exact: true });
    await expect(categoryDisclosure).toHaveCount(1);
    await expect(categoryDisclosure).toHaveAttribute("aria-expanded", "false");
    await expect(categoryDisclosure).toHaveAttribute("aria-controls", "browse-places-panel");
    await categoryDisclosure.scrollIntoViewIfNeeded();
    await categoryDisclosure.click();
    await expect(categoryDisclosure).toHaveAttribute("aria-expanded", "true");
    const categoryPanel = page.locator("#browse-places-panel");
    await expect(categoryPanel).toBeVisible();
    await expect(categoryPanel).toHaveAttribute("data-state", "open");
    await categoryDisclosure.click();
    await expect(categoryDisclosure).toHaveAttribute("aria-expanded", "false");
    await expect(categoryPanel).toHaveAttribute("data-state", "closed");
    await expect(categoryPanel).toHaveAttribute("aria-hidden", "true");
    await expect(categoryPanel).toHaveAttribute("inert", "");
    await expect(page.getByRole("group", { name: "Quick needs", exact: true })).toHaveCount(1);
  });
}

for (const town of ["brunswick", "thurmont"]) {
  test(`Today keeps the first ${town} paint free of a Frederick photo doorway`, async ({ page }, testInfo) => {
    test.setTimeout(120_000);
    await page.setViewportSize({ width: 375, height: 844 });
    await page.emulateMedia({ reducedMotion: "reduce" });
    const creekRequests: string[] = [];
    page.on("request", (request) => {
      const url = new URL(request.url());
      const source = url.pathname === "/_next/image" ? url.searchParams.get("url") : url.pathname;
      if (source && decodeURIComponent(source).includes("SUMMER CARROL CREEK.jpg")) creekRequests.push(request.url());
    });
    // Freeze the server paint before Next can hydrate useSearchParams. This
    // deliberately inspects the real initial fallback, not a made-up town UI.
    const holdScripts = (route: import("@playwright/test").Route) =>
      route.request().resourceType() === "script" ? route.abort() : route.continue();
    await page.route("**/*", holdScripts);
    await page.goto(`/today?in=${town}`, { waitUntil: "domcontentloaded" });
    const pending = page.locator("[data-today-geographic-pending]");
    await expect(pending).toBeAttached();
    await expect(pending).toHaveAttribute("aria-hidden", "true");
    await expect(pending.locator("a, img, h2, button")).toHaveCount(0);
    await expect(page.locator("[data-today-geographic-doorway]")).toHaveCount(0);
    expect(creekRequests).toEqual([]);
    await page.screenshot({ path: testInfo.outputPath(`today-${town}-initial-viewport.png`), fullPage: false });

    await page.unroute("**/*", holdScripts);
    await page.reload({ waitUntil: "domcontentloaded" });
    const area = page.getByRole("combobox", { name: "Choose your area" });
    await expect(area).toBeEnabled();
    await expect(area).toHaveValue(`town:${town}`);
    await expect(page.locator("[data-today-geographic-pending]")).toHaveCount(0);
    await expect(page.locator("[data-today-geographic-doorway]")).toHaveCount(0);
    await expect(page.getByTestId("today-scope-status")).toContainText(`${town === "brunswick" ? "Brunswick" : "Thurmont"} place picks`);
    await expect(page.locator('[aria-label="Places for your area"] > section')).toHaveCount(1);
    expect(creekRequests).toEqual([]);
    await page.screenshot({ path: testInfo.outputPath(`today-${town}-hydrated-viewport.png`), fullPage: false });
    await testInfo.attach("town-arrival-photo-requests", {
      contentType: "application/json", body: JSON.stringify({ town, creekRequests, serverPaint: "Scripts held; scope-neutral fallback observed." }),
    });
  });
}


test.describe("Today compiled chapter at enlarged phone text", () => {
  test.use({ viewport: { width: 320, height: 568 }, isMobile: true, hasTouch: true, permissions: [] });

  test("Today compiled plain chapter fits at 320px with 200% text", async ({ page, baseURL }, testInfo) => {
    test.setTimeout(60_000);
    const origin = new URL(baseURL ?? "http://localhost:3010").origin;
    const counts = { want: 0, mapCard: 0, pulse: 0 };
    const limits = { want: 16, mapCard: 8, pulse: 8 };
    const exceeded: string[] = [];
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.addInitScript(() => {
      localStorage.setItem("fr:scope:v1", "county");
      localStorage.setItem("fr:appearance:v1", "light");
      document.cookie = "fr_scope=county; path=/";
      document.cookie = "fr_onboarded=1; path=/";
      document.addEventListener("DOMContentLoaded", () => {
        document.documentElement.style.fontSize = "200%";
      }, { once: true });
    });
    // Use the actual page, ranker and source states. No response fixtures or
    // forced place selection: paid images, third parties and writes stay off.
    await page.route("**/*", (route) => {
      const request = route.request();
      const url = new URL(request.url());
      if (url.origin !== origin || !["GET", "HEAD"].includes(request.method())) return route.abort();
      if (url.pathname.startsWith("/api/place-photo")) return route.abort();
      if (url.pathname === "/_next/image") {
        const raw = url.searchParams.get("url");
        const source = raw ? new URL(raw, origin) : null;
        if (!source || source.origin !== origin || source.pathname.startsWith("/api/")) return route.abort();
      }
      if (url.pathname.startsWith("/api/")) {
        let key: keyof typeof counts;
        if (url.pathname === "/api/want" && url.searchParams.get("scope") === "county"
          && !["lat", "lng", "lon", "origin", "latitude", "longitude"].some((name) => url.searchParams.has(name))) {
          key = "want";
        } else if (url.pathname === "/api/pulse/status") {
          key = "pulse";
        } else if (/^\/api\/places\/map-card\/[a-z0-9-]{1,120}$/.test(url.pathname)) {
          key = "mapCard";
        } else return route.abort();
        if (++counts[key] > limits[key]) {
          exceeded.push(key);
          return route.abort();
        }
      }
      return route.continue();
    });

    const response = await page.goto("/today?in=county", { waitUntil: "domcontentloaded" });
    expect(response?.status()).toBe(200);
    const area = page.getByRole("combobox", { name: "Choose your area" });
    await expect(area).toBeEnabled();
    await expect(area).toHaveValue("county");
    const chapter = page.getByRole("group", { name: "Follow the day", exact: true });
    await expect(chapter).toHaveClass(/content-chapter--plain/);
    await expect(chapter.locator(".content-chapter__label")).toHaveText("Follow the day");
    await chapter.scrollIntoViewIfNeeded();
    await page.evaluate(async () => {
      await document.fonts.ready;
      await new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
    });
    // Read the compiled browser CSS and all geometry in one frame. A root
    // overflow clip must not conceal body overflow or a divider outside its
    // register, which happened despite the source and component story passing.
    const geometry = await chapter.evaluate((element) => {
      const register = element.querySelector<HTMLElement>(".content-chapter__register")!;
      const label = register.querySelector<HTMLElement>(".content-chapter__label")!;
      const rule = register.querySelector<HTMLElement>(".content-chapter__rule")!;
      const bounds = (node: Element) => {
        const rect = node.getBoundingClientRect();
        return { left: rect.left, right: rect.right, top: rect.top, bottom: rect.bottom };
      };
      const range = document.createRange();
      range.selectNodeContents(label);
      const labelStyle = getComputedStyle(label);
      // Keep a bounded account of the rest of the real page before any bounds
      // assertion fails. A chapter can fit while a different subtree escapes.
      const diagnosticLimits = { elements: 24, directText: 20, deepestScroll: 16, ancestors: 5, textRects: 6, landmarks: 6, nativeControls: 10 };
      const nodes = [document.body, ...document.body.querySelectorAll("*")];
      const depths = new Map<Element, number>();
      const entries = nodes.map((node) => {
        const depth = (depths.get(node.parentElement!) ?? -1) + 1;
        depths.set(node, depth);
        return { node, depth, rect: node.getBoundingClientRect(), style: getComputedStyle(node) };
      });
      const byNode = new Map(entries.map((entry) => [entry.node, entry]));
      const identify = (node: Element) => `${node.tagName.toLowerCase()}${node.id ? `#${node.id}` : ""}${[...node.classList].slice(0, 3).map((name) => `.${name}`).join("")}`.slice(0, 180);
      const clipped = (style: CSSStyleDeclaration) =>
        ["auto", "scroll", "hidden", "clip"].includes(style.overflowX)
          || style.clipPath !== "none" || (style.clip !== "auto" && style.clip !== "");
      const ancestors = (node: Element) => {
        const result = [];
        for (let parent = node.parentElement; parent; parent = parent.parentElement) {
          const style = byNode.get(parent)?.style ?? getComputedStyle(parent);
          if (!clipped(style)) continue;
          result.push({ element: identify(parent), box: bounds(parent), overflowX: style.overflowX,
            overflowY: style.overflowY, clip: style.clip, clipPath: style.clipPath,
            position: style.position, contain: style.contain });
        }
        return { count: result.length, entries: result.slice(0, diagnosticLimits.ancestors) };
      };
      const pseudoStyles = (node: Element) => ["::before", "::after"].flatMap((pseudo) => {
        const style = getComputedStyle(node, pseudo);
        if (style.content === "none" || style.content === "normal" || style.display === "none") return [];
        // CSS exposes no DOM rectangle for pseudo-elements. Preserve their box
        // styles explicitly rather than presenting these as measured bounds.
        return [{ pseudo, content: style.content.slice(0, 100), display: style.display, position: style.position,
          width: style.width, minWidth: style.minWidth, maxWidth: style.maxWidth, height: style.height,
          left: style.left, right: style.right, top: style.top, bottom: style.bottom,
          margin: style.margin, transform: style.transform, overflowX: style.overflowX }];
      });
      const describe = (entry: typeof entries[number]) => ({
        element: identify(entry.node), depth: entry.depth, box: bounds(entry.node),
        scroll: entry.node.scrollWidth, client: entry.node.clientWidth,
        style: { display: entry.style.display, position: entry.style.position, width: entry.style.width,
          minWidth: entry.style.minWidth, maxWidth: entry.style.maxWidth, flex: entry.style.flex,
          gridTemplateColumns: entry.style.gridTemplateColumns, font: entry.style.fontSize,
          padding: entry.style.padding, margin: entry.style.margin, transform: entry.style.transform,
          overflowX: entry.style.overflowX, contentVisibility: entry.style.contentVisibility },
        pseudoStylesOnly: pseudoStyles(entry.node), clippingAncestors: ancestors(entry.node),
      });
      const hasIntermediateClip = (node: Element) => {
        for (let parent = node.parentElement; parent && parent !== document.body; parent = parent.parentElement) {
          if (clipped(byNode.get(parent)?.style ?? getComputedStyle(parent))) return true;
        }
        return false;
      };
      const outliers = entries.filter(({ rect }) => rect.width > 0 && (rect.left < -1 || rect.right > innerWidth + 1))
        // Root/body clipping must not hide a candidate. Descendants clipped by
        // their own component remain recorded after the likely escaping nodes.
        .sort((a, b) => Number(hasIntermediateClip(a.node)) - Number(hasIntermediateClip(b.node)) || b.depth - a.depth);
      const scrollOffenders = entries.filter(({ node }) => node.clientWidth > 0 && node.scrollWidth > node.clientWidth + 1);
      const scrollAncestors = new Set<Element>();
      for (const { node } of scrollOffenders) {
        for (let parent = node.parentElement; parent; parent = parent.parentElement) scrollAncestors.add(parent);
      }
      const deepestScroll = scrollOffenders.filter(({ node }) => !scrollAncestors.has(node)).sort((a, b) => b.depth - a.depth);
      const directText = [];
      for (const entry of entries) {
        for (const text of entry.node.childNodes) {
          if (text.nodeType !== Node.TEXT_NODE || !text.textContent?.trim()) continue;
          const textRange = document.createRange();
          textRange.selectNodeContents(text);
          const rects = [...textRange.getClientRects()].filter((rect) => rect.width > 0 && (rect.left < -1 || rect.right > innerWidth + 1));
          if (rects.length === 0) continue;
          directText.push({ entry, text: text.textContent.trim().slice(0, 120), rectCount: rects.length,
            rects: rects.slice(0, diagnosticLimits.textRects).map((rect) => ({ left: rect.left, right: rect.right, top: rect.top, bottom: rect.bottom })) });
        }
      }
      directText.sort((a, b) => Number(hasIntermediateClip(a.entry.node)) - Number(hasIntermediateClip(b.entry.node)) || b.entry.depth - a.entry.depth);
      const textMeasure = document.createElement("canvas").getContext("2d");
      const nativeControls = entries.filter(({ node }) => node.matches("select, input, textarea"));
      const controlMetrics = (entry: typeof entries[number]) => {
        const { node, style } = entry;
        const options = node instanceof HTMLSelectElement ? [...node.options].map((option) => option.textContent ?? "") : [];
        const text = node instanceof HTMLSelectElement ? node.selectedOptions[0]?.textContent ?? ""
          : node instanceof HTMLInputElement || node instanceof HTMLTextAreaElement ? node.value : "";
        if (textMeasure) textMeasure.font = `${style.fontStyle} ${style.fontWeight} ${style.fontSize} ${style.fontFamily}`;
        return { ...describe(entry), text: text.slice(0, 120),
          // Font metrics supplement the real control box; they do not claim to
          // measure the browser's native arrow or intrinsic select width.
          glyphWidth: textMeasure?.measureText(text).width ?? null,
          widestOptionGlyphWidth: options.length && textMeasure ? Math.max(...options.map((option) => textMeasure.measureText(option).width)) : null,
          fontFamily: style.fontFamily, boxSizing: style.boxSizing, appearance: style.appearance,
          fieldSizing: style.getPropertyValue("field-sizing"), flexBasis: style.flexBasis,
          whiteSpace: style.whiteSpace, overflowWrap: style.overflowWrap, wordBreak: style.wordBreak,
          borderLeft: style.borderLeftWidth, borderRight: style.borderRightWidth };
      };
      const overflowDiagnostics = {
        state: { viewport: { width: innerWidth, height: innerHeight }, scroll: { x: scrollX, y: scrollY },
          documentWidths: { scroll: document.documentElement.scrollWidth, client: document.documentElement.clientWidth, offset: document.documentElement.offsetWidth },
          bodyWidths: { scroll: document.body.scrollWidth, client: document.body.clientWidth, offset: document.body.offsetWidth },
          scrollbarWidth: innerWidth - document.documentElement.clientWidth,
          deviceScaleFactor: devicePixelRatio, visualViewport: visualViewport ? { width: visualViewport.width, height: visualViewport.height, scale: visualViewport.scale, offsetLeft: visualViewport.offsetLeft } : null,
          activeElement: document.activeElement ? identify(document.activeElement) : null,
          bodyBox: bounds(document.body), documentBox: bounds(document.documentElement),
          fontFamily: getComputedStyle(document.body).fontFamily },
        limits: diagnosticLimits, inspectedElements: entries.length,
        landmarks: entries.filter(({ node }) => node.matches("main, header, nav")).slice(0, diagnosticLimits.landmarks).map(describe),
        nativeControls: { count: nativeControls.length, entries: nativeControls.slice(0, diagnosticLimits.nativeControls).map(controlMetrics) },
        elementOutliers: { count: outliers.length, entries: outliers.slice(0, diagnosticLimits.elements).map(describe) },
        directTextOutliers: { count: directText.length, entries: directText.slice(0, diagnosticLimits.directText).map(({ entry, ...text }) => ({ ...describe(entry), ...text })) },
        scrollOffenders: { count: scrollOffenders.length, deepestCount: deepestScroll.length,
          entries: deepestScroll.slice(0, diagnosticLimits.deepestScroll).map(describe) },
      };
      return {
        viewport: innerWidth,
        rootFontSize: getComputedStyle(document.documentElement).fontSize,
        chapter: bounds(element), register: bounds(register), label: bounds(label), rule: bounds(rule),
        labelLines: [...range.getClientRects()].map((rect) => ({ left: rect.left, right: rect.right, top: rect.top, bottom: rect.bottom })),
        labelStyle: { flexShrink: labelStyle.flexShrink, minWidth: labelStyle.minWidth, overflowWrap: labelStyle.overflowWrap, overflowX: labelStyle.overflowX },
        ruleMinWidth: getComputedStyle(rule).minWidth,
        widths: [element, register, document.body, document.documentElement].map((node) => ({
          element: node.className || node.tagName, scroll: node.scrollWidth, client: node.clientWidth,
        })),
        documentOverflow: document.documentElement.scrollWidth - innerWidth,
        bodyOverflow: document.body.scrollWidth - innerWidth,
        overflowDiagnostics,
      };
    });
    await testInfo.attach("today-compiled-chapter-200pct", {
      contentType: "application/json", body: JSON.stringify({ geometry, counts, limits, exceeded,
        source: "Actual Today and compiled CSS; paid/third-party/write transport blocked; no fixtures or image-availability claim." }, null, 2),
    });
    expect(geometry.viewport).toBe(320);
    expect(geometry.rootFontSize).toBe("32px");
    expect(parseFloat(geometry.labelStyle.flexShrink), "the real plain label can shrink").toBeGreaterThan(0);
    expect(parseFloat(geometry.labelStyle.minWidth)).toBe(0);
    expect(geometry.labelStyle.overflowWrap).toBe("anywhere");
    expect(geometry.labelStyle.overflowX, "readable text must not be hidden to pass bounds").toBe("visible");
    expect(parseFloat(geometry.ruleMinWidth), "the decorative line can collapse before pushing out of the register").toBe(0);
    for (const box of [geometry.chapter, geometry.register, geometry.label, geometry.rule]) {
      expect(box.left).toBeGreaterThanOrEqual(-1);
      expect(box.right).toBeLessThanOrEqual(geometry.viewport + 1);
    }
    expect(geometry.rule.left).toBeGreaterThanOrEqual(geometry.register.left - 1);
    expect(geometry.rule.right).toBeLessThanOrEqual(geometry.register.right + 1);
    expect(geometry.rule.top).toBeGreaterThanOrEqual(geometry.register.top - 1);
    expect(geometry.rule.bottom).toBeLessThanOrEqual(geometry.register.bottom + 1);
    expect(geometry.labelLines.length).toBeGreaterThan(0);
    for (const line of geometry.labelLines) {
      expect(line.left).toBeGreaterThanOrEqual(geometry.register.left - 1);
      expect(line.right).toBeLessThanOrEqual(geometry.register.right + 1);
      expect(line.top).toBeGreaterThanOrEqual(geometry.label.top - 2);
      expect(line.bottom).toBeLessThanOrEqual(geometry.label.bottom + 2);
    }
    for (const width of geometry.widths) {
      expect(width.scroll, `${width.element}: no hidden horizontal overflow`).toBeLessThanOrEqual(width.client + 1);
    }
    expect(geometry.documentOverflow).toBeLessThanOrEqual(1);
    expect(geometry.bodyOverflow).toBeLessThanOrEqual(1);
    expect(exceeded, "the real page stays inside its free read bounds").toEqual([]);
  });
});
