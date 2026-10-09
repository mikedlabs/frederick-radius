import { expect, test, type Page } from "@playwright/test";

async function settled(page: Page) {
  await expect.poll(() => page.evaluate(() => document.getAnimations().filter((animation) => {
    const timing = animation.effect?.getComputedTiming();
    return animation.playState === "running" && timing && Number.isFinite(timing.iterations) && Number.isFinite(timing.endTime);
  }).length), { timeout: 5000 }).toBe(0);
}

for (const width of [390, 1200]) {
  test(`Events filters own input and preserve time/town at ${width}px`, async ({ page, context, baseURL }, testInfo) => {
    await page.setViewportSize({ width, height: 844 });
    const origin = new URL(baseURL!);
    await context.addCookies([{ name: "fr_onboarded", value: "1", domain: origin.hostname, path: "/" }]);
    await context.route("**/*", (route) => {
      const request = route.request();
      const url = new URL(request.url());
      if (url.origin !== origin.origin || request.resourceType() === "image") return route.abort();
      if (url.pathname === "/api/auth/me") return route.fulfill({ json: { user: null } });
      // This journey uses only the existing anonymous event archive read.
      // No account, external provider, analytics or mutation requests run.
      if (url.pathname.startsWith("/api/") && !(request.method() === "GET" && url.pathname === "/api/events/browse")) return route.abort();
      if (!["GET", "HEAD"].includes(request.method())) return route.abort();
      return route.continue();
    });
    await page.goto("/events?lens=weekend&in=thurmont", { waitUntil: "domcontentloaded" });
    await expect(page.locator("[data-events-interaction-ready]")).toHaveAttribute("data-events-interaction-ready", "true");
    const filters = page.getByRole("button", { name: /^Filters/ });
    const dialog = page.getByRole("dialog", { name: "Event filters" });
    if (width === 390) await page.locator(".eb-display-options > summary").click();
    await filters.click();
    await expect(dialog).toBeVisible();
    await expect(dialog).toHaveAttribute("aria-modal", "true");
    expect(await page.locator(".eb-display-options").evaluate((node) => (node as HTMLDetailsElement).open)).toBe(false);
    await expect(page.locator(".eb-subbar")).toBeHidden();
    expect(await page.locator("header").evaluate((node) => node.hasAttribute("inert"))).toBe(true);
    expect(await page.locator(".eb-head").evaluate((node) => node.hasAttribute("inert"))).toBe(true);
    await settled(page);
    const openingY = await page.evaluate(() => window.scrollY);
    await page.mouse.move(width - 8, 760);
    await page.mouse.wheel(0, 400);
    await expect.poll(() => page.evaluate(() => window.scrollY)).toBe(openingY);
    // Wait through two actual layout samples so delayed wheel delivery cannot
    // make an immediate unchanged sample count as scroll-lock evidence.
    const wheelSamples = await page.evaluate(async () => {
      const first = { y: window.scrollY, at: performance.now() };
      await new Promise<void>((resolve) => {
        const sample = () => {
          if (performance.now() - first.at >= 100) resolve();
          else requestAnimationFrame(sample);
        };
        requestAnimationFrame(sample);
      });
      return [first.y, window.scrollY];
    });
    expect(wheelSamples).toEqual([openingY, openingY]);
    const done = dialog.getByRole("button", { name: "Done", exact: true });
    await done.focus();
    await page.keyboard.press("/");
    await page.evaluate(() => window.dispatchEvent(new CustomEvent("fr:open-search")));
    // Programmatic click deliberately exercises direct opener protection even
    // though the real pointer/keyboard cannot reach an inert header.
    await page.locator('header button[aria-label="Ask or find across Frederick County"]').filter({ visible: true }).evaluate((node) => (node as HTMLButtonElement).click());
    await expect(page.locator("#radius-find-dialog")).toHaveCount(0);
    await expect(page.getByRole("dialog")).toHaveCount(1);
    await expect(done).toBeFocused();
    await dialog.getByRole("tab", { name: "What", exact: true }).click();
    await dialog.getByRole("textbox", { name: "Filter the events shown" }).fill("a very long local music search phrase with additional words");
    await expect.poll(() => page.locator(".eb-dock").evaluate((dock) =>
      [...dock.parentElement!.children].every((node) => node === dock || node.hasAttribute("inert"))
    )).toBe(true);
    await dialog.locator(".eb-pane-scroll").evaluate((node) => { node.scrollTop = node.scrollHeight; });
    await settled(page);
    const doneBox = await done.boundingBox();
    expect(doneBox).not.toBeNull();
    expect(doneBox!.y).toBeGreaterThanOrEqual(0);
    expect(doneBox!.y + doneBox!.height).toBeLessThan(780);
    expect(await done.evaluate((node) => {
      const box = node.getBoundingClientRect();
      return node.contains(document.elementFromPoint(box.x + box.width / 2, box.y + box.height / 2));
    })).toBe(true);
    await page.screenshot({ path: testInfo.outputPath(`events-filter-open-${width}.png`), fullPage: false });
    await done.click();
    await expect(dialog).toBeHidden();
    await expect(filters).toBeFocused();
    await expect(page.locator(".eb-subbar")).toBeVisible();
    expect(await page.locator("header").evaluate((node) => node.hasAttribute("inert"))).toBe(false);
    const time = page.locator("[data-event-filter-time]");
    const town = page.locator("[data-event-filter-scope]");
    await expect(time).toHaveText("This weekend");
    await expect(town).toHaveText("Thurmont");
    for (const label of [time, town]) {
      await expect(label).toBeVisible();
      expect(await label.evaluate((node) => node.scrollWidth <= node.clientWidth + 1)).toBe(true);
    }
    await expect(filters).toHaveAccessibleName(/a very long local music search phrase with additional words/);
    await expect(page).toHaveURL(/in=thurmont/);
    await expect(page).toHaveURL(/lens=weekend/);
    await page.evaluate(() => window.scrollTo({ top: 250, behavior: "instant" }));
    await expect.poll(() => page.evaluate(() => window.scrollY)).toBeGreaterThan(0);
    await settled(page);
    const preflight = { y: await page.evaluate(() => window.scrollY), filterBox: await filters.boundingBox() };
    // Near the page footer the sticky dock reaches its containing boundary.
    // Bring the actual trigger fully into view before measuring modal opening;
    // a locator click would otherwise perform that scrolling itself.
    await filters.scrollIntoViewIfNeeded();
    await expect(filters).toBeInViewport({ ratio: 1 });
    await settled(page);
    const scrolledY = await page.evaluate(() => window.scrollY);
    expect(scrolledY).toBeGreaterThan(0);
    await testInfo.attach("filter-reopen-preflight", { contentType: "application/json", body: JSON.stringify({ width, preflight, visibleTriggerY: scrolledY, visibleTriggerBox: await filters.boundingBox() }) });
    await filters.click();
    await expect(dialog).toBeVisible();
    await settled(page);
    expect(await page.evaluate(() => window.scrollY)).toBe(scrolledY);
    const scrolledDoneBox = await done.boundingBox();
    expect(scrolledDoneBox).not.toBeNull();
    expect(scrolledDoneBox!.y).toBeGreaterThanOrEqual(0);
    expect(scrolledDoneBox!.y + scrolledDoneBox!.height).toBeLessThan(780);
    await done.focus();
    await page.keyboard.press("Escape");
    await expect(dialog).toBeHidden();
    await expect(filters).toBeFocused();
    const find = page.getByRole("button", { name: "Ask or find across Frederick County", exact: true }).filter({ visible: true });
    await find.click();
    await expect(page.getByRole("dialog", { name: "What do you need?", exact: true })).toBeVisible();
    await page.getByRole("button", { name: "Close Find", exact: true }).click();
    await expect(page.locator("#radius-find-dialog")).toHaveCount(0);
    await expect(find).toBeFocused();
    await page.screenshot({ path: testInfo.outputPath(`events-filter-restored-${width}.png`), fullPage: false });
    await testInfo.attach("events-filter-layer", { contentType: "application/json", body: JSON.stringify({ width, openingY, wheelSamples, scrolledY, scrolledDoneBox, settledY: await page.evaluate(() => window.scrollY), time: await time.textContent(), town: await town.textContent(), url: page.url(), nativeDisplayClosed: true, modalExclusive: true, doneBox, evidence: "guarded-local-rendered-controls" }) });
  });
}
