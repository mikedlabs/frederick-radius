import { expect, test, type Locator } from "@playwright/test";
import { readFileSync } from "node:fs";

const artifact = JSON.parse(readFileSync("src/data/places-official-hours.json", "utf8")) as {
  weekly: { observed_at: string };
  closures: { observed_at: string; url: string; coverage_from: string; coverage_through: string; exceptions: { date: string; closed?: boolean; reason: string }[] };
  expires_at: string;
  places: { slug: string; source_url: string }[];
};
const catalog = JSON.parse(readFileSync("src/data/places-client.json", "utf8")) as { slug: string; name: string }[];
const easternDate = (at: Date) => new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York", year: "numeric", month: "2-digit", day: "2-digit" }).format(at);

/** Inspect the actual painted target after scrolling and its finite entrance motion. */
async function expectReadableInViewport(target: Locator) {
  await expect(target).toBeVisible();
  await expect(target).toBeInViewport({ ratio: 1 });
  await expect.poll(() => target.evaluate((element) => {
    const ancestors: Element[] = [];
    for (let current: Element | null = element; current; current = current.parentElement) ancestors.push(current);
    const readable = ancestors.every((node) => {
      const style = getComputedStyle(node);
      return style.display !== "none" && style.visibility === "visible" && Number(style.opacity) >= .99;
    });
    const animations = [...element.getAnimations({ subtree: true }), ...ancestors.flatMap((node) => node.getAnimations())];
    const settled = animations.every((animation) => animation.effect?.getComputedTiming().iterations === Infinity
      || animation.playState === "finished" || animation.playState === "idle");
    const rect = element.getBoundingClientRect();
    const topmost = document.elementFromPoint(rect.x + rect.width / 2, rect.y + rect.height / 2);
    return { readable, settled, unobscured: Boolean(topmost && element.contains(topmost)) };
  })).toEqual({ readable: true, settled: true, unobscured: true });
}

test.use({ viewport: { width: 390, height: 844 } });
for (const branch of artifact.places) {
  test(`${branch.slug} renders its own official hours evidence honestly`, async ({ page, baseURL }, testInfo) => {
    // These checks inspect local compiled text/controls only. They never call
    // the linked publisher, photo providers, map tiles or analytics writers.
    const origin = new URL(baseURL!).origin;
    await page.route("**/*", async (route) => {
      const request = route.request();
      const url = new URL(request.url());
      if (url.origin !== origin || !["GET", "HEAD"].includes(request.method()) || url.pathname === "/api/place-photo" || url.pathname === "/_next/image") return route.abort();
      return route.continue();
    });
    const response = await page.goto(`/places/${branch.slug}`, { waitUntil: "domcontentloaded" });
    expect(response?.status()).toBe(200);
    await expect(page.locator("main h1")).toHaveText(catalog.find((place) => place.slug === branch.slug)!.name);
    const now = new Date();
    const day = easternDate(now);
    const fresh = now.getTime() <= Date.parse(artifact.expires_at)
      && [artifact.weekly.observed_at, artifact.closures.observed_at].every((stamp) => Date.parse(stamp) <= now.getTime() + 300_000)
      && day >= artifact.closures.coverage_from && day <= artifact.closures.coverage_through;
    const summary = page.locator("main summary").filter({ hasText: "Hours today" });
    if (fresh) {
      await expect(summary).toHaveCount(1);
      await summary.click();
      const disclosure = summary.locator("..");
      const branchSource = disclosure.getByRole("link", { name: "Official branch hours", exact: true });
      const closureSource = disclosure.getByRole("link", { name: "FCPL holiday closures", exact: true });
      await expect(branchSource).toHaveAttribute("href", branch.source_url);
      await expect(closureSource).toHaveAttribute("href", artifact.closures.url);
      await expect(disclosure).toContainText("normal weekly hours");
      await expect(disclosure).toContainText("Frederick County Public Libraries");
      await expect(disclosure).not.toContainText("Hours from Google");
      const exception = artifact.closures.exceptions.find((row) => row.date === day);
      if (exception?.closed) {
        await expect(summary).toContainText("Hours today · Closed");
        await expect(disclosure).toContainText(exception.reason);
      }
      const weeklyRows = disclosure.getByRole("list").getByRole("listitem");
      await expect(weeklyRows).toHaveCount(7);
      await expect(weeklyRows.locator("span:first-child")).toHaveText(["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]);
      await expect(disclosure).toHaveAttribute("open", "");
      // A full-page capture can expose offscreen starting-style frames. Scroll
      // the actual disclosure into view and observe its real painted state.
      // Keep normal motion enabled; no sleep or CSS override hides a defect.
      await disclosure.evaluate((element) => element.scrollIntoView({ block: "center", inline: "nearest", behavior: "instant" }));
      await page.evaluate(() => document.fonts.ready);
      await expectReadableInViewport(summary);
      for (const row of await weeklyRows.all()) {
        await expectReadableInViewport(row);
        await expect(row.locator("span:last-child")).not.toHaveText("");
      }
      await expectReadableInViewport(branchSource);
      await expectReadableInViewport(closureSource);
      await testInfo.attach("official-hours-disclosure", { body: JSON.stringify({
        slug: branch.slug, checkedAt: now.toISOString(), expiresAt: artifact.expires_at,
        text: await disclosure.innerText(), weeklyRows: await weeklyRows.allTextContents(),
        viewport: page.viewportSize(), disclosureBounds: await disclosure.boundingBox(),
        sourceBounds: { branch: await branchSource.boundingBox(), closures: await closureSource.boundingBox() },
        evidence: "Local compiled disclosure after real scroll, readable targets and finite entrance motion settled; external/photo requests blocked.",
      }), contentType: "application/json" });
      await disclosure.screenshot({ path: testInfo.outputPath("official-library-hours-disclosure.png") });
    } else {
      // A later CI run must confirm honest expiry, never assume nine schedules
      // stay fresh forever merely because this pilot once supplied them.
      await expect(summary).toHaveCount(0);
      await expect(page.locator("main")).toContainText("Hours not posted");
      const heading = page.locator("main h1");
      await heading.scrollIntoViewIfNeeded();
      await expectReadableInViewport(heading);
    }
    await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(1);
    await page.screenshot({ path: testInfo.outputPath("official-library-hours-viewport.png") });
  });
}
