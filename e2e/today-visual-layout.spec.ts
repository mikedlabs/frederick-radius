import { expect, test, type Locator, type Page, type TestInfo } from "@playwright/test";
import { getOwnedPlacePhoto } from "../src/lib/owned-place-photos";
import {
  dismissReturnBridge,
  emptyReturnBridgeState,
  RETURN_BRIDGE_STORAGE_KEY,
} from "../src/lib/return-bridge";

test.use({ serviceWorkers: "block" });

const geographicSubjects = [
  { slug: "carroll-creek-linear-park-frederick", title: "Carroll Creek", action: "Carroll Creek Linear Park" },
  { slug: "baker-park-frederick", title: "Baker Park", action: "Baker Park" },
  { slug: "visitation-hotel", title: "Visitation Hotel", action: "Visitation Hotel" },
] as const;
const geographicPhotoPaths = new Set(geographicSubjects.map(subject => getOwnedPlacePhoto(subject.slug)!.src));

/** Root-font text resizing is not browser page zoom. These probes must prove
 * actual computed growth of the compact weather before geometry is accepted. */
async function compactWeatherTextMetrics(weather: Locator) {
  return weather.evaluate((region) => {
    const selectors: Record<string, string> = {
      temperature: "[data-weather-temperature]",
      condition: "[data-weather-condition]",
      scope: "[data-weather-scope]",
      cue: "[data-weather-disclosure-cue]",
      source: "[data-weather-source]",
      issuance: "[data-weather-issuance]",
      stats: "[data-weather-stats]",
      warning: "[data-weather-headline]",
      uncertainty: "[data-weather-safety-note]",
      message: "[data-weather-message]",
      forecast: 'a[href="/pulse?open=weather"]',
    };
    return {
      rootPx: parseFloat(getComputedStyle(document.documentElement).fontSize),
      entries: Object.entries(selectors).flatMap(([name, selector]) => {
        const node = region.querySelector(selector);
        return node ? [{ name, px: parseFloat(getComputedStyle(node).fontSize) }] : [];
      }),
    };
  });
}

async function tabToCompactWeather(page: Page, control: Locator) {
  for (let presses = 1; presses <= 40; presses += 1) {
    await page.keyboard.press("Tab");
    if (await control.evaluate((element) => document.activeElement === element)) return presses;
  }
  throw new Error("Compact weather was not reachable within 40 ordinary Tab presses at enlarged text.");
}

async function compactWeatherTargetProbe(control: Locator) {
  return control.evaluate(async (element) => {
    // Observe the browser's native focus scroll across paints; no focus or
    // scrolling command manufactures the target position.
    await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
    const rect = element.getBoundingClientRect();
    const x = rect.x + rect.width / 2, y = rect.y + rect.height / 2;
    const points = [[x,y],[x-21.5,y],[x+21.5,y],[x,y-21.5],[x,y+21.5]];
    const owners = points.map(([px,py]) => document.elementFromPoint(px,py));
    const bounds = (selector: string) => {
      const box = document.querySelector(selector)?.getBoundingClientRect();
      return box ? { top: box.top, bottom: box.bottom, left: box.left, right: box.right } : null;
    };
    return {
      width: rect.width, height: rect.height, left: rect.left, right: rect.right,
      top: rect.top, bottom: rect.bottom, viewport: innerWidth, viewportHeight: innerHeight,
      scrollY, focused: document.activeElement === element,
      header: bounds("header"), navigation: bounds('nav[aria-label="Primary"]'),
      hits: points.map(([px,py], index) => px >= 0 && py >= 0 && px < innerWidth && py < innerHeight
        && (owners[index] === element || (owners[index] !== null && element.contains(owners[index])))),
      hitOwners: owners.map((hit) => hit ? {
        tag: hit.tagName, id: hit.id, primaryNavigation: Boolean(hit.closest('nav[aria-label="Primary"]')),
        header: Boolean(hit.closest("header")),
      } : null),
    };
  });
}

function expectCompactWeatherTarget(probe: Awaited<ReturnType<typeof compactWeatherTargetProbe>>) {
  expect(probe.focused).toBe(true);
  expect(probe.width).toBeGreaterThanOrEqual(44);
  expect(probe.height).toBeGreaterThanOrEqual(44);
  expect(probe.left).toBeGreaterThanOrEqual(0);
  expect(probe.right).toBeLessThanOrEqual(probe.viewport + 1);
  expect(probe.hits).toEqual([true,true,true,true,true]);
}

async function readyCompactWeatherTarget(control: Locator, testInfo: TestInfo, phase: string) {
  let probe: Awaited<ReturnType<typeof compactWeatherTargetProbe>> | null = null;
  const samples: Array<{ elapsedMs: number; probe: Awaited<ReturnType<typeof compactWeatherTargetProbe>> }> = [];
  const started = Date.now();
  let consecutiveReadyPaints = 0;
  try {
    // Keep the normal expectation deadline and every physical hit requirement.
    // Persistent navigation occlusion remains a failure with its receipt.
    await expect.poll(async () => {
      probe = await compactWeatherTargetProbe(control);
      samples.push({ elapsedMs: Date.now() - started, probe });
      const ready = probe.focused && probe.width >= 44 && probe.height >= 44
        && probe.left >= 0 && probe.right <= probe.viewport + 1 && probe.hits.every(Boolean);
      consecutiveReadyPaints = ready ? consecutiveReadyPaints + 1 : 0;
      return consecutiveReadyPaints >= 2;
    }, { message: "Native weather focus must settle with all five physical target samples clear" }).toBe(true);
    expectCompactWeatherTarget(probe!);
    return probe!;
  } finally {
    await testInfo.attach(`compact-weather-target-${phase}`, {
      contentType: "application/json", body: JSON.stringify({ phase, samples,
        consecutiveReadyPaints, nativeInputOnly: true, scriptedFocusOrScroll: false }),
    });
  }
}



/** Mobile WebKit exposes no mouse wheel. After aligning the new utility
 * section heading, exercise bounded native scrolling to its four actions. */
async function scrollQuickNeedsWithNativeKeys(
  page: Page, quickNeeds: Locator, primaryNav: Locator,
  testInfo: import("@playwright/test").TestInfo,
) {
  const startY = await page.evaluate(() => window.scrollY);
  const receipt = { mechanism: "native ArrowDown", budget: 844, maxKeyPresses: 32,
    startY, keyPresses: 0, samples: [] as Array<{ scrollY: number; distance: number; actionsBottom: number; navTop: number }>,
    precondition: "More ways to explore heading aligned to the viewport before measuring this section",
    targetFocusOrScriptedScrollUsedWithinSection: false };
  const read = async () => {
    const [actions, nav, scrollY] = await Promise.all([
      quickNeeds.boundingBox(), primaryNav.boundingBox(), page.evaluate(() => window.scrollY),
    ]);
    expect(actions).not.toBeNull(); expect(nav).not.toBeNull();
    const sample = { scrollY, distance: scrollY - startY,
      actionsBottom: actions!.y + actions!.height, navTop: nav!.y };
    receipt.samples.push(sample);
    expect(sample.distance, "ordinary native scrolling stays forward").toBeGreaterThanOrEqual(0);
    expect(sample.distance, "all four actions remain within one viewport of their utility heading").toBeLessThanOrEqual(receipt.budget);
    return sample;
  };
  try {
    let current = await read();
    if (current.actionsBottom <= current.navTop) return;
    const ordinaryDocumentFocus = await page.evaluate(() =>
      document.activeElement === document.body || document.activeElement === document.documentElement);
    expect(ordinaryDocumentFocus, "ArrowDown must begin at document focus, without focus repair").toBe(true);
    while (current.actionsBottom > current.navTop && receipt.keyPresses < receipt.maxKeyPresses) {
      await page.keyboard.press("ArrowDown", { delay: 30 });
      receipt.keyPresses += 1;
      // Native scrolling may settle across later paints, and one key need not
      // move the document. The unchanged end geometry and total distance decide
      // success; no target focus or scripted scrolling can manufacture it.
      await page.evaluate(() => new Promise<void>((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
      current = await read();
    }
    expect(current.actionsBottom, "all four actions clear the fixed tabs after bounded native scrolling").toBeLessThanOrEqual(current.navTop);
  } finally {
    await testInfo.attach("today-quick-needs-native-scroll", {
      contentType: "application/json", body: JSON.stringify(receipt),
    });
  }
}

/** Reach the first event's useful text through ordinary document scrolling.
 * The owned place photograph leads on arrival; it cannot cost more than the
 * existing one-viewport budget to read the first event title and timing. */
async function scrollFirstEventFactsWithNativeInput(
  page: Page, title: Locator, timing: Locator, primaryNav: Locator,
  nativeKeys: boolean, testInfo: TestInfo,
) {
  const startY = await page.evaluate(() => window.scrollY);
  const receipt = { mechanism: nativeKeys ? "native ArrowDown" : "native mouse wheel", budget: 844,
    maxKeyPresses: 32, startY, keyPresses: 0,
    samples: [] as Array<{ scrollY: number; distance: number; titleTop: number; titleBottom: number; timeTop: number; timeBottom: number; navTop: number; headerBottom: number }>,
    targetFocusOrScriptedScrollUsed: false };
  const read = async () => {
    const [titleBox, timeBox, navBox, documentState] = await Promise.all([
      title.boundingBox(), timing.boundingBox(), primaryNav.boundingBox(),
      page.evaluate(() => ({ scrollY: window.scrollY, headerBottom: document.querySelector("header")?.getBoundingClientRect().bottom ?? 0 })),
    ]);
    expect(titleBox).not.toBeNull(); expect(timeBox).not.toBeNull(); expect(navBox).not.toBeNull();
    const sample = { scrollY: documentState.scrollY, distance: documentState.scrollY - startY,
      titleTop: titleBox!.y, titleBottom: titleBox!.y + titleBox!.height,
      timeTop: timeBox!.y, timeBottom: timeBox!.y + timeBox!.height,
      navTop: navBox!.y, headerBottom: documentState.headerBottom };
    receipt.samples.push(sample);
    expect(sample.distance).toBeGreaterThanOrEqual(0);
    expect(sample.distance, "the first useful event facts stay within the existing 844px native-scroll budget").toBeLessThanOrEqual(receipt.budget);
    return sample;
  };
  const clearsTabs = (sample: Awaited<ReturnType<typeof read>>) => Math.max(sample.titleBottom, sample.timeBottom) <= sample.navTop;
  try {
    let current = await read();
    if (!clearsTabs(current)) {
      if (nativeKeys) {
        expect(await page.evaluate(() => document.activeElement === document.body || document.activeElement === document.documentElement),
          "native document scrolling begins without target focus repair").toBe(true);
        while (!clearsTabs(current) && receipt.keyPresses < receipt.maxKeyPresses) {
          await page.keyboard.press("ArrowDown", { delay: 30 });
          receipt.keyPresses += 1;
          await page.evaluate(() => new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
          current = await read();
        }
      } else {
        const distance = Math.max(current.titleBottom, current.timeBottom) - current.navTop + 16;
        expect(distance).toBeLessThanOrEqual(receipt.budget);
        await page.mouse.wheel(0, distance);
        await expect.poll(async () => { current = await read(); return clearsTabs(current); }).toBe(true);
      }
    }
    expect(clearsTabs(current), "the first event title and published timing clear the fixed tabs after ordinary scrolling").toBe(true);
    expect(current.titleTop).toBeGreaterThanOrEqual(current.headerBottom);
    expect(current.timeTop).toBeGreaterThanOrEqual(current.headerBottom);
  } finally {
    await testInfo.attach("today-first-event-native-scroll", { contentType: "application/json", body: JSON.stringify(receipt) });
  }
}

for (const width of [320, 375, 390, 430, 1366]) {
  test(`Today keeps the editorial layout useful at ${width}px`, async ({ page, browserName, isMobile }, testInfo) => {
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
    await expect(masthead).toHaveCount(1);
    await expect(find).toHaveCount(1);
    const doorway = page.locator("[data-today-geographic-doorway]");
    await expect(doorway).toHaveAttribute("data-photo-state", "loaded");
    const mosaic = page.locator("[data-today-geographic-mosaic]");
    await expect(mosaic.getByRole("link")).toHaveCount(3);
    await expect(mosaic.getByRole("img")).toHaveCount(3);
    for (const subject of geographicSubjects) {
      const link = mosaic.getByRole("link", { name: `View ${subject.action} in Frederick`, exact: true });
      const photo = getOwnedPlacePhoto(subject.slug)!;
      await expect(link).toHaveAttribute("href", `/places/${subject.slug}`);
      await expect(link).toHaveAttribute("data-photo-state", "loaded");
      await expect(link.locator("img")).toHaveAttribute("alt", photo.alt);
      await expect.poll(() => link.locator("img").evaluate(async (image: HTMLImageElement, src) => {
        try { await image.decode(); } catch { return false; }
        return image.complete && image.naturalWidth > 1 && image.naturalHeight > 1
          && decodeURIComponent(image.currentSrc || image.src).includes(src);
      }, photo.src)).toBe(true);
      await expect(link.getByRole("heading", { name: subject.title, exact: true })).toBeVisible();
      await expect(link.locator("a, button, input, select")).toHaveCount(0);
    }
    // Header hydration and a decoded photo can move the document between
    // separate protocol calls. Compare all actual layout boxes in one paint.
    const geometry = await page.evaluate(() => {
      const bounds = (selector: string) => {
        const rect = document.querySelector(selector)!.getBoundingClientRect();
        return { x: rect.x, y: rect.y, width: rect.width, height: rect.height };
      };
      return {
        mastheadBox: bounds("main .scroll-masthead"),
        findBox: bounds('[data-find-density="arrival"] a[aria-label="Find a place, service, event, or answer"]'),
        entryControlsBox: bounds("[data-today-entry-controls]"),
        weatherBox: bounds("[data-today-weather]"),
        photoBox: bounds("[data-today-geographic-doorway] figure"),
        doorwayBox: bounds("[data-today-geographic-doorway]"),
        mosaicBox: bounds("[data-today-geographic-mosaic]"),
        captionBox: bounds("[data-today-geographic-caption]"),
        subjects: Array.from(document.querySelectorAll("[data-today-geographic-place]")).map(link => {
          const box = link.getBoundingClientRect(), caption = link.querySelector("[data-today-geographic-caption]")!.getBoundingClientRect();
          const range = document.createRange(); range.selectNodeContents(link.querySelector("h2, h3")!);
          return { slug: link.getAttribute("data-today-geographic-place"),
            box: { x: box.x, y: box.y, width: box.width, height: box.height },
            caption: { x: caption.x, y: caption.y, width: caption.width, height: caption.height },
            lines: Array.from(range.getClientRects()).map(line => ({ x: line.x, y: line.y, width: line.width, height: line.height })) };
        }),
        headingBox: bounds("main .scroll-masthead h1"),
      };
    });
    await testInfo.attach("today-first-screen-geometry", {
      contentType: "application/json", body: JSON.stringify(geometry),
    });
    const { mastheadBox, findBox, entryControlsBox, weatherBox, photoBox, doorwayBox, mosaicBox, captionBox, headingBox } = geometry;
    expect(findBox.y).toBeGreaterThanOrEqual(mastheadBox.y + mastheadBox.height);
    // The arrival action now has a deliberate phone density; neither weather
    // facts nor the photograph are subtracted from an artificial height budget.
    expect(findBox.height).toBeGreaterThanOrEqual(56);
    expect(findBox.height).toBeLessThanOrEqual(56);
    await expect(page.locator('[data-find-density="arrival"]')).toHaveCount(1);
    expect(doorwayBox.y).toBeGreaterThanOrEqual(findBox.y + findBox.height);
    expect(doorwayBox.y).toBeGreaterThanOrEqual(entryControlsBox.y + entryControlsBox.height);
    // The real named caption shares the photo's grid area; it must fit inside
    // the image rather than precede it or cover a separate blank rectangle.
    expect(captionBox.x).toBeGreaterThanOrEqual(photoBox.x - 1);
    expect(captionBox.x + captionBox.width).toBeLessThanOrEqual(photoBox.x + photoBox.width + 1);
    expect(captionBox.y).toBeGreaterThanOrEqual(photoBox.y - 1);
    expect(captionBox.y + captionBox.height).toBeLessThanOrEqual(photoBox.y + photoBox.height + 1);
    expect(Math.abs(captionBox.y + captionBox.height - photoBox.y - photoBox.height)).toBeLessThanOrEqual(1);
    // The whole mosaic stays landscape; its main image deliberately uses a
    // taller crop beside two separately actionable supporting photographs.
    expect(mosaicBox.width).toBeGreaterThan(mosaicBox.height);
    expect(mosaicBox.height).toBeGreaterThanOrEqual(208);
    expect(mosaicBox.height).toBeLessThanOrEqual(260);
    expect(photoBox.height).toBeGreaterThanOrEqual(208);
    expect(photoBox.height).toBeLessThanOrEqual(260);
    expect(geometry.subjects).toHaveLength(3);
    for (const subject of geometry.subjects) {
      expect(subject.box.width).toBeGreaterThanOrEqual(44);
      expect(subject.box.height).toBeGreaterThanOrEqual(44);
      expect(subject.caption.x).toBeGreaterThanOrEqual(subject.box.x);
      expect(subject.caption.y).toBeGreaterThanOrEqual(subject.box.y);
      expect(subject.caption.x + subject.caption.width).toBeLessThanOrEqual(subject.box.x + subject.box.width + 1);
      expect(subject.caption.y + subject.caption.height).toBeLessThanOrEqual(subject.box.y + subject.box.height + 1);
      for (const line of subject.lines) {
        expect(line.x).toBeGreaterThanOrEqual(subject.caption.x);
        expect(line.y).toBeGreaterThanOrEqual(subject.caption.y);
        expect(line.x + line.width).toBeLessThanOrEqual(subject.caption.x + subject.caption.width + 1);
        expect(line.y + line.height).toBeLessThanOrEqual(subject.caption.y + subject.caption.height + 1);
      }
    }
    expect(geometry.subjects[1].box.x).toBeGreaterThan(geometry.subjects[0].box.x + geometry.subjects[0].box.width);
    expect(geometry.subjects[2].box.y).toBeGreaterThan(geometry.subjects[1].box.y + geometry.subjects[1].box.height);
    expect(photoBox.width).toBeGreaterThanOrEqual(doorwayBox.width * 0.95);
    expect(photoBox.height).toBeGreaterThan(130);
    await expect(doorway.locator("img")).toHaveAttribute("alt", getOwnedPlacePhoto(geographicSubjects[0].slug)!.alt);
    await expect(doorway.getByRole("heading", { name: "Carroll Creek", exact: true })).toBeVisible();
    await expect(doorway).toContainText("Frederick");
    await expect(mosaic).toHaveText("Carroll CreekFrederickBaker ParkVisitation Hotel");
    await expect(doorway).not.toContainText(/best|open now|safe now|current conditions|Mike D|June 2023/i);
    await expect(doorway.locator("a, button, input, select")).toHaveCount(0);
    const quickNeeds = page.getByRole("group", { name: "Quick needs", exact: true });
    const explore = page.getByRole("region", { name: "More ways to explore", exact: true });
    await expect(explore).toHaveCount(1);
    await expect(quickNeeds).toHaveCount(1);
    await expect(explore.getByRole("group", { name: "Quick needs", exact: true })).toHaveCount(1);
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
        const specialDayLead = page.locator('[data-moment-spotlight-day-of="true"]');
        // The existing In The Streets day-of lead is a deliberate exception.
        // It remains above the ordinary briefing instead of being compressed.
        if (await specialDayLead.count() === 0) {
          // Utilities follow the first answers. Their own section is the
          // explicit start for this reachability proof; the first event keeps
          // the separate one-viewport native budget from arrival below.
          await explore.getByRole("heading", { name: "More ways to explore", exact: true })
            .evaluate((node) => node.scrollIntoView({ block: "start", behavior: "instant" }));
          const sectionActions = (await quickNeeds.boundingBox())!;
          const scrollForActions = Math.max(0, sectionActions.y + sectionActions.height - primaryNavBox.y + 16);
          expect(scrollForActions).toBeLessThanOrEqual(844);
          if (browserName === "webkit" && isMobile) {
            await scrollQuickNeedsWithNativeKeys(page, quickNeeds, primaryNav, testInfo);
          } else {
            await page.mouse.wheel(0, scrollForActions);
          }
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
    // None-open is also a real answer; it deliberately has no pick-card marker.
    const decision = places.locator(":scope > section");
    await expect(decision).toHaveCount(1);
    // Read the live hierarchy in one frame. Runtime choices may hydrate after
    // arrival, but the owned visual, events, area answer and later utilities
    // retain the same vertical and document order at every viewport width.
    await expect.poll(() => page.evaluate(() => {
      const entry = document.querySelector("[data-today-entry-controls]")?.getBoundingClientRect();
      const photo = document.querySelector("[data-today-geographic-mosaic]")?.getBoundingClientRect();
      const quick = document.querySelector('[role="group"][aria-label="Quick needs"]')?.getBoundingClientRect();
      const events = document.querySelector('[role="group"][aria-label="Follow the day"]')?.getBoundingClientRect();
      const places = document.querySelector('[aria-label="Places for your area"]')?.getBoundingClientRect();
      const news = document.querySelector('section[aria-label="Local news"]')?.getBoundingClientRect();
      const explore = document.querySelector('section[aria-labelledby="today-explore-heading"]')?.getBoundingClientRect();
      return Boolean(entry && photo && quick && events && places && news && explore && photo.y >= entry.bottom
        && events.y >= photo.bottom && places.y >= events.bottom && news.y >= places.bottom
        && explore.y >= news.bottom && quick.y >= explore.y);
    })).toBe(true);
    const currentLayout = await page.evaluate(() => {
      const read = (element: Element) => {
        const r = element.getBoundingClientRect();
        return { x: r.x, y: r.y, width: r.width, height: r.height };
      };
      const places = document.querySelector('[aria-label="Places for your area"]')!;
      const events = document.querySelector('[role="group"][aria-label="Follow the day"]')!;
      const quick = document.querySelector('[role="group"][aria-label="Quick needs"]')!;
      const decision = places.querySelector(":scope > section")!;
      const photo = document.querySelector("[data-today-geographic-mosaic]")!;
      const entry = document.querySelector("[data-today-entry-controls]")!;
      const news = document.querySelector('section[aria-label="Local news"]')!;
      const explore = document.querySelector('section[aria-labelledby="today-explore-heading"]')!;
      const precedes = (a: Element, b: Element) => Boolean(a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING);
      return { places: read(places), events: read(events), decision: read(decision), photo: read(photo), quick: read(quick), news: read(news), explore: read(explore),
        entryBeforePhoto: precedes(entry, photo), photoBeforeQuick: precedes(photo, quick),
        photoOutsidePlaces: !places.contains(photo), photoBeforeEvents: precedes(photo, events),
        eventsBeforePlaces: precedes(events, places), placesBeforeNews: precedes(places, news),
        newsBeforeExplore: precedes(news, explore), exploreOwnsQuick: explore.contains(quick) };
    });
    const placesBox = currentLayout.places;
    const eventsBox = currentLayout.events;
    const decisionBox = currentLayout.decision;
    const currentDoorwayBox = currentLayout.photo;
    const currentQuickNeedsBox = currentLayout.quick;
    expect(currentLayout.entryBeforePhoto).toBe(true);
    expect(currentLayout.photoBeforeQuick).toBe(true);
    expect(currentLayout.photoOutsidePlaces).toBe(true);
    expect(currentLayout.photoBeforeEvents).toBe(true);
    expect(currentLayout.eventsBeforePlaces).toBe(true);
    expect(currentLayout.placesBeforeNews).toBe(true);
    expect(currentLayout.newsBeforeExplore).toBe(true);
    expect(currentLayout.exploreOwnsQuick).toBe(true);
    expect(currentDoorwayBox.y + currentDoorwayBox.height).toBeLessThanOrEqual(eventsBox.y);
    expect(weatherBox.y + weatherBox.height).toBeLessThanOrEqual(currentQuickNeedsBox.y);
    expect(findBox.y + findBox.height).toBeLessThanOrEqual(currentQuickNeedsBox.y);
    expect(eventsBox.y + eventsBox.height).toBeLessThanOrEqual(placesBox.y);
    expect(placesBox.y + placesBox.height).toBeLessThanOrEqual(currentLayout.news.y);
    expect(currentLayout.news.y + currentLayout.news.height).toBeLessThanOrEqual(currentLayout.explore.y);
    expect(currentQuickNeedsBox.y).toBeGreaterThanOrEqual(currentLayout.explore.y);
    expect(decisionBox.y).toBeGreaterThanOrEqual(eventsBox.y + eventsBox.height);
    if (width < 640) {
      const activeAlert = page.getByRole("region", { name: "Heads up", exact: true });
      const specialDay = page.locator('[data-moment-spotlight-day-of="true"]');
      if (await activeAlert.count() === 0 && await specialDay.count() === 0) {
        expect(photoBox.y, "the first owned place photograph begins in the ordinary arrival viewport").toBeGreaterThanOrEqual(0);
        expect(photoBox.y + photoBox.height, "the decoded owned place photograph is above the fixed tabs on ordinary arrival").toBeLessThanOrEqual(primaryNavBox!.y);
      }
      if (width >= 375 && await activeAlert.count() === 0 && await specialDay.count() === 0) {
        const firstChoice = events.locator('[data-today-event-shortlist] article[data-decision-entity="event"]').first();
        if (await firstChoice.count()) {
          const firstAction = firstChoice.locator('a[href^="/events/"]').first();
          const firstTitle = firstChoice.locator("h3");
          const firstTime = firstChoice.locator("p").first();
          await expect(firstAction).toBeVisible();
          await expect(firstTitle).toBeVisible();
          await expect(firstTime).toBeVisible();
          const [actionBox, titleBox, timeBox] = await Promise.all([firstAction.boundingBox(), firstTitle.boundingBox(), firstTime.boundingBox()]);
          expect(actionBox!.height).toBeGreaterThanOrEqual(44);
          expect(actionBox!.width).toBeGreaterThanOrEqual(44);
          expect(titleBox!.height).toBeGreaterThan(0); expect(timeBox!.height).toBeGreaterThan(0);
          const primaryNav = page.locator("[data-bottom-nav-shell]").getByRole("navigation", { name: "Primary", exact: true });
          await scrollFirstEventFactsWithNativeInput(page, firstTitle, firstTime, primaryNav, browserName === "webkit" && isMobile, testInfo);
          // Restore arrival for its screenshot only after the native-input
          // receipt has proved the text reachable without target focus repair.
          await page.evaluate(() => window.scrollTo(0, 0));
        }
      }
    }
    await expect.poll(() => page.evaluate(() =>
      document.documentElement.scrollWidth - document.documentElement.clientWidth,
    )).toBeLessThanOrEqual(1);

    await expect.poll(() => doorway.locator("img").evaluate((element) =>
      element instanceof HTMLImageElement && element.complete && element.naturalWidth > 1 && element.naturalHeight > 1,
    )).toBe(true);
    await testInfo.attach("today-arrival-geometry", {
      contentType: "application/json",
      body: JSON.stringify({ width, mastheadBox, weatherBox, findBox, entryControlsBox, captionBox, photoBox, doorwayBox, mosaicBox, subjects: geometry.subjects, quickNeedsBox, decisionBox, primaryNavBox, currentLayout,
        note: "Weather and Find with scope lead the exact decoded owned place scene, Follow the day, one scoped area answer and news. More ways to explore owns the single four-shortcut deck afterward. DOM and vertical visual order match at phone and desktop widths. Event facts retain the existing bounded native-scroll requirement; utility reachability is measured from its own heading." }),
    });
    await page.screenshot({ path: testInfo.outputPath(`today-${width}.png`), fullPage: true });
    await page.screenshot({ path: testInfo.outputPath(`today-${width}-viewport.png`), fullPage: false });
    await area.selectOption("town:brunswick");
    await expect(page.getByTestId("today-scope-status")).toContainText(
      "Brunswick picks · Countywide weather",
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
    const geographicPhotoRequests: string[] = [];
    const heldBootstrapRequests: string[] = [];
    const scriptFailures: Array<{ path: string; error: string | null }> = [];
    const pageErrors: string[] = [];
    page.on("pageerror", (error) => pageErrors.push(error.message));
    page.on("requestfailed", (request) => {
      if (request.resourceType() === "script") scriptFailures.push({
        path: new URL(request.url()).pathname, error: request.failure()?.errorText ?? null,
      });
    });
    page.on("request", (request) => {
      const url = new URL(request.url());
      const source = url.pathname === "/_next/image" ? url.searchParams.get("url") : url.pathname;
      if (source && geographicPhotoPaths.has(decodeURIComponent(source))) geographicPhotoRequests.push(request.url());
    });
    // Hold real external bootstrap requests, then hydrate this same document.
    // Inline streaming scripts remain real; this is not JavaScript disabled.
    let releaseBootstrap!: () => void;
    const bootstrapGate = new Promise<void>((resolve) => { releaseBootstrap = resolve; });
    let holdBootstrap = true;
    await page.route("**/*", async (route) => {
      if (holdBootstrap && route.request().resourceType() === "script") {
        heldBootstrapRequests.push(new URL(route.request().url()).pathname);
        await bootstrapGate;
      }
      await route.continue();
    });
    let initialTimeOrigin: number | null = null;
    try {
      const response = await page.goto(`/today?in=${town}`, { waitUntil: "commit" });
      expect(response?.status()).toBe(200);
      try {
        const pending = page.locator("[data-today-geographic-pending]");
        await expect(pending).toBeAttached();
        await expect(pending).toHaveAttribute("aria-hidden", "true");
        await expect(pending.locator("a, img, h2, h3, button")).toHaveCount(0);
        await expect(page.locator("[data-today-geographic-doorway]")).toHaveCount(0);
        await expect.poll(() => heldBootstrapRequests.length).toBeGreaterThan(0);
        expect(geographicPhotoRequests).toEqual([]);
        initialTimeOrigin = await page.evaluate(() => performance.timeOrigin);
        // WebKit screenshot capture waits for font readiness, which cannot
        // settle while bootstrap is deliberately held. Preserve the actual
        // pre-bootstrap DOM/layout here, then photograph the hydrated page.
        await testInfo.attach("town-before-bootstrap", {
          contentType: "application/json",
          body: JSON.stringify(await pending.evaluate((element) => {
            const rect = element.getBoundingClientRect();
            return { markup: element.outerHTML, x: rect.x, y: rect.y,
              width: rect.width, height: rect.height, timeOrigin: performance.timeOrigin };
          })),
        });
      } finally {
        holdBootstrap = false;
        releaseBootstrap();
      }
      await page.waitForLoadState("domcontentloaded");
      const area = page.getByRole("combobox", { name: "Choose your area" });
      await expect(area).toBeEnabled();
      await expect(area).toHaveValue(`town:${town}`);
      await expect(page.locator("[data-today-geographic-pending]")).toHaveCount(0);
      await expect(page.locator("[data-today-geographic-doorway]")).toHaveCount(0);
      await expect(page.locator("[data-today-geographic-mosaic], [data-today-geographic-place]")).toHaveCount(0);
      await expect(page.getByTestId("today-scope-status")).toContainText(`${town === "brunswick" ? "Brunswick" : "Thurmont"} picks · Countywide weather`);
      await expect(page.locator('[aria-label="Places for your area"] > section')).toHaveCount(1);
      expect(geographicPhotoRequests).toEqual([]);
      expect(await page.evaluate(() => performance.timeOrigin)).toBe(initialTimeOrigin);
      await page.screenshot({ path: testInfo.outputPath(`today-${town}-hydrated-viewport.png`), fullPage: false });
    } finally {
      holdBootstrap = false;
      releaseBootstrap();
      await testInfo.attach("town-arrival-photo-requests", {
        contentType: "application/json", body: JSON.stringify({ town, geographicPhotoRequests, guardedPhotoPaths: [...geographicPhotoPaths], heldBootstrapRequests,
          scriptFailures, pageErrors, initialTimeOrigin,
          finalTimeOrigin: await page.evaluate(() => performance.timeOrigin).catch(() => null),
          serverPaint: "Bootstrap scripts gated; actual scope-neutral paint and same-document hydration checked." }),
      });
    }
  });
}

test.describe("Today compiled chapter and compact weather at enlarged root text", () => {
  test.use({ viewport: { width: 320, height: 568 }, isMobile: true, hasTouch: true, permissions: [] });

  test("Today chapter reflows and compact weather text doubles at 320px with 200% root text", async ({ page, baseURL }, testInfo) => {
    test.setTimeout(60_000);
    const origin = new URL(baseURL ?? "http://localhost:3010").origin;
    const counts = { want: 0, mapCard: 0, pulse: 0 };
    const limits = { want: 16, mapCard: 8, pulse: 8 };
    const exceeded: string[] = [];
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.addInitScript(({ returnBridgeKey, returnBridgeState }) => {
      localStorage.setItem("fr:scope:v1", "county");
      localStorage.setItem("fr:appearance:v1", "light");
      // Keep the weather-only keyboard acceptance free of an unrelated install
      // invitation, using the same documented fixture as weather-priority.
      localStorage.setItem(returnBridgeKey, JSON.stringify(returnBridgeState));
      document.cookie = "fr_scope=county; path=/";
      document.cookie = "fr_onboarded=1; path=/";
      document.addEventListener("DOMContentLoaded", () => {
        document.documentElement.style.fontSize = "100%";
      }, { once: true });
    }, {
      returnBridgeKey: RETURN_BRIDGE_STORAGE_KEY,
      returnBridgeState: dismissReturnBridge(emptyReturnBridgeState()),
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
    const enlargedWeather = page.locator("[data-today-weather] [data-weather-state]");
    await expect(enlargedWeather).toHaveAttribute("data-weather-state", /^(available|safety-only|unavailable)$/);
    const enlargedState = await enlargedWeather.getAttribute("data-weather-state");
    const enlargedSummary = enlargedWeather.locator("summary[data-today-weather-summary]");
    const enlargedForecast = enlargedWeather.locator('a[href="/pulse?open=weather"]');
    const enlargedControl = enlargedState === "available" ? enlargedSummary : enlargedForecast;
    await expect(enlargedForecast).toHaveCount(1);
    const originalIssueTime = await enlargedWeather.locator("time").count()
      ? await enlargedWeather.locator("time").getAttribute("datetime") : null;
    await page.evaluate(async () => {
      await document.fonts.ready;
      await new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
    });
    const baselineWeatherText = await compactWeatherTextMetrics(enlargedWeather);
    expect(baselineWeatherText.rootPx).toBe(16);
    const requiredText = enlargedState === "available"
      ? ["scope", "cue", "source", "issuance", "forecast"] : ["message", "forecast"];
    for (const name of requiredText) {
      expect(baselineWeatherText.entries.some((entry) => entry.name === name), `real ${name} probe exists`).toBe(true);
    }
    await page.evaluate(async () => {
      document.documentElement.style.fontSize = "200%";
      await document.fonts.ready;
      await new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
    });
    let doubledWeatherText = await compactWeatherTextMetrics(enlargedWeather);
    const growthSamples: Array<{ elapsedMs: number; metrics: typeof doubledWeatherText }> = [];
    const resizeStarted = Date.now();
    try {
      // WebKit may apply rem-dependent descendant styles after the root style
      // changes. Wait for the measured text itself, not just two root paints.
      await expect.poll(async () => {
        doubledWeatherText = await compactWeatherTextMetrics(enlargedWeather);
        growthSamples.push({ elapsedMs: Date.now() - resizeStarted, metrics: doubledWeatherText });
        return doubledWeatherText.rootPx === baselineWeatherText.rootPx * 2
          && baselineWeatherText.entries.every((before) => {
            const after = doubledWeatherText.entries.find((entry) => entry.name === before.name);
            return after !== undefined && Math.abs(after.px / before.px - 2) < 0.005;
          });
      }, { message: "Every compact weather text probe must actually double" }).toBe(true);
    } finally {
      await testInfo.attach("compact-weather-computed-font-growth", {
        contentType: "application/json",
        body: JSON.stringify({ state: enlargedState, baseline: baselineWeatherText,
          doubled: doubledWeatherText, growthSamples }),
      });
    }
    expect(doubledWeatherText.rootPx).toBe(baselineWeatherText.rootPx * 2);
    expect(doubledWeatherText.entries.map((entry) => entry.name)).toEqual(baselineWeatherText.entries.map((entry) => entry.name));
    for (const before of baselineWeatherText.entries) {
      const after = doubledWeatherText.entries.find((entry) => entry.name === before.name)!;
      expect(before.px, `${before.name} has a measurable normal text size`).toBeGreaterThan(0);
      expect(after.px / before.px, `${before.name} computed font actually doubles`).toBeCloseTo(2, 2);
    }
    // No locator.focus(), click or script focus reset establishes this journey.
    // Native Tab traversal must find the control from the document's own order
    // and scroll it into view, with the same physical44px hit oracle afterwards.
    const entryTabPresses = await tabToCompactWeather(page, enlargedControl);
    await expect(enlargedControl).toBeFocused();
    const enlargedProbe = await readyCompactWeatherTarget(enlargedControl, testInfo, "entry");
    let forecastProbe: Awaited<ReturnType<typeof compactWeatherTargetProbe>> | null = null;
    let expandedWeatherText: Awaited<ReturnType<typeof compactWeatherTextMetrics>> | null = null;
    if (enlargedState === "available") {
      await expect(enlargedWeather.locator("details")).not.toHaveAttribute("open");
      await expect(enlargedSummary).toHaveAccessibleName(/Forecast details for Frederick/);
      await expect(enlargedSummary.locator("a, button, input, select, textarea, div")).toHaveCount(0);
      await expect(enlargedForecast).not.toBeVisible();
      await page.keyboard.press("Enter");
      await expect(enlargedWeather.locator("details")).toHaveAttribute("open", "");
      await expect(enlargedForecast).toBeVisible();
      await expect(enlargedWeather.getByText("NWS forecast · Frederick", { exact: true })).toBeVisible();
      expandedWeatherText = await compactWeatherTextMetrics(enlargedWeather);
      expect(expandedWeatherText).toEqual(doubledWeatherText);
      const evidence = enlargedWeather.locator("time");
      if (originalIssueTime !== null) {
        await expect(evidence).toBeVisible();
        await expect(evidence).toHaveAttribute("datetime", originalIssueTime);
        expect(Number.isFinite(Date.parse(originalIssueTime))).toBe(true);
        expect(await evidence.innerText()).toMatch(/\b20\d{2}\b/);
      } else {
        await expect(enlargedWeather.getByText("Issue time unavailable", { exact: true })).toBeVisible();
      }
      await page.keyboard.press("Tab");
      await expect(enlargedForecast).toBeFocused();
      await expect(enlargedForecast).toHaveAttribute("href", "/pulse?open=weather");
      forecastProbe = await readyCompactWeatherTarget(enlargedForecast, testInfo, "forecast");
      await page.keyboard.press("Shift+Tab");
      await expect(enlargedSummary).toBeFocused();
      await page.keyboard.press("Enter");
      await expect(enlargedWeather.locator("details")).not.toHaveAttribute("open");
      await expect(enlargedForecast).not.toBeVisible();
      await expect(enlargedSummary).toBeFocused();
      await readyCompactWeatherTarget(enlargedSummary, testInfo, "closed-summary");
    } else {
      await expect(enlargedSummary).toHaveCount(0);
      await expect(enlargedForecast).toHaveAttribute("href", "/pulse?open=weather");
      await expect(enlargedWeather.getByText("The NWS forecast is briefly unavailable.", { exact: true })).toBeVisible();
      testInfo.annotations.push({ type: "coverage", description: "Real forecast unavailable: enlarged direct-route coverage only. Available-summary acceptance is still required in a separate actual-source run." });
    }
    const safetyFacts = enlargedWeather.locator("[data-weather-headline], [data-weather-safety-note]");
    for (const note of await safetyFacts.all()) {
      await expect(note).toBeVisible();
      expect(await note.evaluate((element) => element.closest("details") === null)).toBe(true);
      const bounds = await note.boundingBox();
      expect(bounds).not.toBeNull();
      expect(bounds!.x).toBeGreaterThanOrEqual(-1);
      expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(321);
    }
    await testInfo.attach("today-weather-root-text-200pct", { contentType: "application/json",
      body: JSON.stringify({ method: "Root font 100% to 200%; computed compact-weather font growth asserted. This is not browser page zoom.",
        enlargedState, baselineWeatherText, doubledWeatherText, expandedWeatherText, entryTabPresses, enlargedProbe, forecastProbe,
        nativeSummaryExercised: enlargedState === "available", renderedSafetyFacts: await safetyFacts.count(),
        sourceIssuancePreserved: originalIssueTime, actualSources: true, fixtures: 0 }) });
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
