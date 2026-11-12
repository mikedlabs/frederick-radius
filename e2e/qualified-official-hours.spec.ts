import { readFileSync } from "node:fs";
import { expect, test, type Locator } from "@playwright/test";
import type { Hours } from "../src/data/places";
import type { MerchantHoursArtifact } from "../src/lib/merchant-hours";
import { formatWindows, getOpenStatus, hoursForDate, isScheduleEvidenceCurrent } from "../src/lib/hours";
import { registerWebkitLoopbackDocumentSeam } from "./webkit-loopback-document";

const artifact = JSON.parse(readFileSync("src/data/places-merchant-hours.json", "utf8")) as MerchantHoursArtifact;
const catalog = JSON.parse(readFileSync("src/data/places-client.json", "utf8")) as { slug: string; name: string }[];
const examples = [
  { width: 320, slug: "national-museum-civil-war-medicine-frederick" },
  { width: 375, slug: "the-tasting-room-frederick" },
  { width: 390, slug: "hootch-and-banter-frederick" },
  { width: 430, slug: "national-museum-civil-war-medicine-frederick" },
] as const;

test.use({ serviceWorkers: "block" });
test.beforeEach(async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.addInitScript(() => {
    localStorage.setItem("fr:appearance:v1", "light");
    localStorage.setItem("fr:scope:v1", "county");
    document.cookie = "fr_scope=county; path=/";
    document.cookie = "fr_onboarded=1; path=/";
  });
});
// This changes only the local HTTP document's upgrade directive in WebKit;
// the helper verifies identical HTML and otherwise identical headers.
registerWebkitLoopbackDocumentSeam();

async function expectTouchTarget(target: Locator) {
  await target.evaluate((element) => element.scrollIntoView({ block: "center", inline: "nearest", behavior: "instant" }));
  await expect(target).toBeVisible();
  await expect.poll(() => target.evaluate((element) => {
    const box = element.getBoundingClientRect();
    const points = [[0, 0], [-21, 0], [21, 0], [0, -21], [0, 21]];
    return {
      adequate: box.width >= 44 && box.height >= 44,
      unobscured: points.every(([dx, dy]) => {
        const hit = document.elementFromPoint(box.x + box.width / 2 + dx, box.y + box.height / 2 + dy);
        return Boolean(hit && element.contains(hit));
      }),
    };
  })).toEqual({ adequate: true, unobscured: true });
}

for (const { width, slug } of examples) {
  test(`qualified official hours preserve conditions and unknown venue opening at ${width}px (${slug})`, async ({ page, baseURL }, testInfo) => {
    const row = artifact.places.find((item) => item.slug === slug);
    expect(row, "This regression requires the actual reviewed qualified source record.").toBeDefined();
    const qualification = row!.qualification;
    expect(qualification?.usage).toBe("display_only");
    const hours: Hours = { ...row!.hours, _official: {
      slug, kind: "merchant", schedule_kind: row!.kind,
      source_name: row!.source_name, source_url: row!.source_url,
      observed_at: row!.observed_at, expires_at: row!.expires_at,
      coverage_from: row!.coverage_from, coverage_through: row!.coverage_through,
      exceptions: row!.exceptions ?? [], qualification,
    } };
    // Freeze Date in this browser only, at the actual source observation.
    // This does not pretend to renew the built server artifact or its expiry.
    const browserAt = new Date(Date.parse(row!.observed_at) + 1_000);
    await page.clock.setFixedTime(browserAt);
    await page.setViewportSize({ width, height: 844 });
    const origin = new URL(baseURL!).origin;
    const blocked = { external: 0, write: 0, api: 0, image: 0 };
    await page.route("**/*", async (route) => {
      const request = route.request(), url = new URL(request.url());
      if (url.origin !== origin) { blocked.external++; return route.abort("blockedbyclient"); }
      if (!["GET", "HEAD"].includes(request.method())) { blocked.write++; return route.abort("blockedbyclient"); }
      if (url.pathname.startsWith("/api/")) { blocked.api++; return route.abort("blockedbyclient"); }
      if (request.resourceType() === "image" || url.pathname === "/_next/image") { blocked.image++; return route.abort("blockedbyclient"); }
      return route.fallback();
    });
    const response = await page.goto(`/places/${slug}`, { waitUntil: "domcontentloaded" });
    expect(response?.status()).toBe(200);
    const heading = page.locator("main h1");
    await expect(heading).toHaveText(catalog.find((place) => place.slug === slug)!.name);
    const hero = heading.locator("..");
    const freshAtServerClock = isScheduleEvidenceCurrent(hours, new Date())
      && !artifact.review.some((item) => item.slug === slug);
    if (!freshAtServerClock) {
      // A later unrelated release must not be forced to assert old hours to
      // pass CI. The always-current synthetic Storybook case covers the UI;
      // this real compiled route must continue to suppress expired evidence.
      await expect(page.getByRole("region", { name: qualification!.label, exact: true })).toHaveCount(0);
      await expect(hero).toContainText("Hours not recently confirmed");
      await expect(hero.getByText(/^(?:Open now|Closed|Closing soon)/)).toHaveCount(0);
      await testInfo.attach("qualified-hours-evidence-boundary", { contentType: "application/json", body: JSON.stringify({
        slug, width, observation: row!.observed_at, expiry: row!.expires_at,
        browserClockOnly: browserAt.toISOString(), mode: "compiled source expired or held; truthful suppression verified",
        blocked, externalOrProviderRequestsForwarded: 0,
      }) });
      return;
    }
    expect(getOpenStatus(hours, { verified: true }, browserAt)).toEqual({ state: "unknown" });
    const region = page.getByRole("region", { name: qualification!.label, exact: true });
    await expect(region).toBeVisible();
    const note = region.getByText(qualification!.note, { exact: true });
    await expect(note).toBeVisible();
    expect(await note.evaluate((element) => element.closest("details") === null)).toBe(true);
    const disclosure = region.locator("details");
    const summary = disclosure.locator("summary");
    await expect(disclosure).not.toHaveAttribute("open");
    await expect(summary).toContainText(`${qualification!.label} today · ${formatWindows(hoursForDate(hours, browserAt)!)}`);
    await expect(summary.getByText("Checked at source", { exact: true })).toBeVisible();
    await expect(summary.getByLabel("Source Checked at source. Official schedule checked. This schedule does not confirm whether the venue is open.", { exact: true })).toHaveCount(1);
    await expect(region.getByText(/not current enough|needs a new source check|Unconfirmed/)).toHaveCount(0);
    await expect(hero.getByText("Venue opening not confirmed", { exact: true })).toBeVisible();
    await expect(hero.getByText(/^(?:Open now|Closed|Closing soon|Hours not recently confirmed)/)).toHaveCount(0);
    await expectTouchTarget(summary);
    await summary.focus();
    await page.keyboard.press("Enter");
    await expect(disclosure).toHaveAttribute("open", "");
    const week = region.getByRole("list", { name: `${qualification!.label} by day`, exact: true });
    await expect(week).toBeVisible();
    await expect(week.getByRole("listitem")).toHaveCount(7);
    await expect(week.getByRole("listitem").locator("span:first-child")).toHaveText(["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]);
    const source = region.getByRole("link", { name: `Official ${qualification!.label.toLowerCase()}`, exact: true });
    await expect(source).toHaveAttribute("href", row!.source_url);
    await expect(source).toHaveAttribute("target", "_blank");
    await expectTouchTarget(source);
    await expect(note).toBeVisible();
    await summary.focus();
    await page.keyboard.press("Space");
    await expect(disclosure).not.toHaveAttribute("open");
    await expect(summary).toBeFocused();
    await expect(note).toBeVisible();
    // Scoped schedules must not leak into general machine-readable opening
    // promises even while the human-readable source schedule remains useful.
    const structuredHours = await page.locator('script[type="application/ld+json"]').evaluateAll((scripts, name) => {
      const entries = scripts.flatMap((script) => {
        const value = JSON.parse(script.textContent ?? "{}");
        return Array.isArray(value) ? value : value["@graph"] ?? [value];
      });
      return entries.filter((entry) => entry.name === name).map((entry) => ({
        hasGeneralHours: "openingHoursSpecification" in entry || "openingHours" in entry,
      }));
    }, await heading.innerText());
    expect(structuredHours.length).toBeGreaterThan(0);
    expect(structuredHours.every((entry) => !entry.hasGeneralHours)).toBe(true);
    // Returning keyboard focus to the summary can align the earlier note
    // beneath the real fixed header. Center the complete collapsed region
    // before capturing it, without hiding or restyling any application chrome.
    await region.evaluate((element) => element.scrollIntoView({ block: "center", inline: "nearest", behavior: "instant" }));
    const readQualificationReadability = () => note.evaluate((element) => {
      const box = element.getBoundingClientRect();
      const ancestors: Element[] = [];
      for (let current: Element | null = element; current; current = current.parentElement) ancestors.push(current);
      const x = box.left + box.width / 2;
      const samples = Object.fromEntries([
        ["top", box.top + Math.min(2, box.height / 2)],
        ["center", box.top + box.height / 2],
        ["bottom", box.bottom - Math.min(2, box.height / 2)],
      ].map(([position, y]) => {
        const hit = document.elementFromPoint(x, Number(y));
        return [position, Boolean(hit && element.contains(hit))];
      }));
      return {
        visible: ancestors.every((node) => {
          const style = getComputedStyle(node);
          return style.display !== "none" && style.visibility === "visible" && Number(style.opacity) >= .99;
        }),
        withinViewport: box.width > 0 && box.height > 0 && box.left >= 0 && box.top >= 0
          && box.right <= innerWidth && box.bottom <= innerHeight,
        samples,
        bounds: { x: box.x, y: box.y, width: box.width, height: box.height },
        viewport: { width: innerWidth, height: innerHeight },
      };
    });
    const readableConditions = { visible: true, withinViewport: true, samples: { top: true, center: true, bottom: true } };
    await expect.poll(readQualificationReadability).toMatchObject(readableConditions);
    expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(1);
    await region.screenshot({ path: testInfo.outputPath(`qualified-hours-${width}.png`) });
    // The screenshot operation must not re-align the note under the header.
    await expect.poll(readQualificationReadability).toMatchObject(readableConditions);
    const qualificationReadability = await readQualificationReadability();
    await testInfo.attach("qualified-hours-mobile-proof", { contentType: "application/json", body: JSON.stringify({
      slug, width, qualification, observation: row!.observed_at, expiry: row!.expires_at,
      browserClockOnly: browserAt.toISOString(), mode: "fresh compiled qualified schedule",
      genericOpenStatus: "unknown", conditionsVisibleWhenCollapsed: true,
      nativeKeyboardDisclosure: true, minimum44PixelUnobscuredTargets: true,
      qualificationReadability, reducedMotion: true, structuredHours, blocked, externalOrProviderRequestsForwarded: 0,
    }) });
  });
}
