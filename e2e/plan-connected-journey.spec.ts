import { createHash } from "node:crypto";
import { expect, test, type Page } from "@playwright/test";
import CLIENT_HOURS_RAW from "../src/data/places-client-hours.json";
import type { Hours } from "../src/data/places";
import { getOpenStatus, isScheduleEvidenceCurrent } from "../src/lib/hours";
import { encodeSpec } from "../src/lib/plan/plan-token";


// WebKit applies production upgrade-insecure-requests to localhost assets
// despite bypassCSP. This seam applies only to HTTP loopback document GETs;
// the same compiled document and every other response header stay intact.
const localHeaderProof = new WeakMap<Page, {
  changed: Array<{ url: string; before: string; after: string; htmlSha256: string; otherHeadersUnchanged: boolean }>;
  untouched: Record<string, { count: number; exampleUrl: string }>;
}>();
test.beforeEach(async ({ page, browserName, baseURL }) => {
  if (browserName !== "webkit" || !baseURL) return;
  const origin = new URL(baseURL);
  if (origin.protocol !== "http:" || !["localhost", "127.0.0.1"].includes(origin.hostname)) return;
  const proof = { changed: [] as Array<{ url: string; before: string; after: string; htmlSha256: string; otherHeadersUnchanged: boolean }>, untouched: {} as Record<string, { count: number; exampleUrl: string }> };
  localHeaderProof.set(page, proof);
  await page.route("**/*", async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    if (url.origin !== origin.origin || url.protocol !== "http:" || !["localhost", "127.0.0.1"].includes(url.hostname)
      || request.method() !== "GET" || !request.isNavigationRequest() || request.resourceType() !== "document") {
      const reason = url.origin !== origin.origin ? "other-origin" : request.method() !== "GET" ? "non-get" : "non-navigation-document";
      const previous = proof.untouched[reason];
      proof.untouched[reason] = { count: (previous?.count ?? 0) + 1, exampleUrl: previous?.exampleUrl ?? `${url.origin}${url.pathname}` };
      return route.fallback();
    }
    const response = await route.fetch({ maxRedirects: 0 });
    const originalHeaders = response.headers();
    const headers = { ...originalHeaders };
    const before = headers["content-security-policy"];
    if (before) {
      const after = before.split(";").filter((directive) => directive.trim().toLowerCase() !== "upgrade-insecure-requests").join(";");
      headers["content-security-policy"] = after;
      const otherHeaders = Object.fromEntries(Object.entries(headers).filter(([name]) => name !== "content-security-policy"));
      const originalOtherHeaders = Object.fromEntries(Object.entries(originalHeaders).filter(([name]) => name !== "content-security-policy"));
      expect(otherHeaders).toEqual(originalOtherHeaders);
      if (before !== after) proof.changed.push({ url: `${url.origin}${url.pathname}`, before, after, htmlSha256: createHash("sha256").update(await response.body()).digest("hex"), otherHeadersUnchanged: true });
    }
    await route.fulfill({ response, headers });
  });
});
test.afterEach(async ({ page }, info) => {
  const proof = localHeaderProof.get(page);
  if (proof) await info.attach("webkit-http-loopback-document-header-seam", { contentType: "application/json", body: JSON.stringify(proof) });
});

const BEANS_SLUG = "beans-in-the-belfry-brunswick";
const beansEvidence = (CLIENT_HOURS_RAW as Array<{ slug: string; hours: Hours }>).find((row) => row.slug === BEANS_SLUG);
function beansWindowState(at: Date): "open" | "closed" | "unknown" {
  const hours = beansEvidence?.hours as Hours | undefined;
  if (!hours || !isScheduleEvidenceCurrent(hours, new Date())) return "unknown";
  const first = getOpenStatus(hours, { verified: true }, at);
  const last = getOpenStatus(hours, { verified: true }, new Date(at.getTime() + 40 * 60_000 - 1));
  if (first.state === "closed" || last.state === "closed") return "closed";
  if ((first.state === "open" || first.state === "closing-soon") && (last.state === "open" || last.state === "closing-soon") && first.closesAt === last.closesAt) return "open";
  return "unknown";
}
function beansPlannedWindow(state: "open" | "closed" = "open") {
  const now = Date.now();
  const hours = beansEvidence?.hours as Hours | undefined;
  if (hours && isScheduleEvidenceCurrent(hours, new Date(now))) {
    // Choose a real future visit covered by this source, not the wall-clock
    // test execution hour. Never manufacture a newer source observation.
    const end = Math.min(now + 7 * 86_400_000, Date.parse(hours._official!.expires_at) - 40 * 60_000);
    for (let at = Math.ceil((now + 60 * 60_000) / 900_000) * 900_000; at < end; at += 900_000) {
      if (beansWindowState(new Date(at)) === state) return { at: new Date(at).toISOString(), verified: true };
    }
  }
  // Held/expired evidence remains an explicit unconfirmed draft. Its old
  // weekly pattern is not treated as a current opening or closing claim.
  const afterEvidence = hours?._official ? Date.parse(hours._official.expires_at) + 60_000 : 0;
  return { at: new Date(Math.ceil(Math.max(now + 86_400_000, afterEvidence) / 60_000) * 60_000).toISOString(), verified: false };
}
function beansPlanUrl(at = beansPlannedWindow().at, requireVerifiedHours = false, returnTo?: string) {
  const token = encodeSpec({ v: 1, i: { audience: "friends", vibe: "easy", duration_hours: 3, municipality: "brunswick", anchor_slug: BEANS_SLUG, start_at: at, require_verified_hours: requireVerifiedHours }, s: [{ p: BEANS_SLUG }] });
  return `/plan?${new URLSearchParams({ p: token, in: "brunswick", ...(returnTo ? { returnTo } : {}) })}`;
}


test.use({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });

test("a found place becomes a scoped outing and returns to the same search after editing", async ({ page }) => {
  test.setTimeout(90_000);
  await page.addInitScript(() => {
    localStorage.setItem("fr:saved:v1", JSON.stringify([
      { type: "place", id: "brunswick-heritage-museum", saved_at: "2026-09-20T12:00:00Z" },
      { type: "place", id: "cafe-nola", saved_at: "2026-09-20T12:00:00Z" },
    ]));
    localStorage.setItem("fr_map_location_intro_v1", "dismissed");
    Object.defineProperty(navigator, "share", { configurable: true, value: async (data: ShareData) => {
      sessionStorage.setItem("test:shared-plan", JSON.stringify(data));
    } });
  });
  const origin = "/search?q=coffee&in=brunswick&kind=place";
  await page.goto(origin, { waitUntil: "domcontentloaded" });
  const result = page.locator('a[href^="/places/beans-in-the-belfry-brunswick"]').first();
  await expect(result).toBeVisible({ timeout: 30_000 });
  await result.click();
  const planLink = page.getByRole("link", { name: "Plan an outing from Beans in the Belfry" });
  await expect(planLink).toBeVisible({ timeout: 20_000 });
  const href = new URL((await planLink.getAttribute("href"))!, "https://example.test");
  const returnTo = href.searchParams.get("returnTo");
  expect(returnTo).toContain("in=brunswick");
  expect(href.searchParams.get("in")).toBe("brunswick");
  const currentHours = beansWindowState(new Date());
  await planLink.click();
  if (currentHours === "closed") {
    const review = page.getByRole("region", { name: "Choices to review", exact: true });
    await expect(review.getByRole("link", { name: "Beans in the Belfry", exact: true })).toBeVisible();
    await expect(review.getByText("The recorded hours do not cover this visit. Its choice is saved.", { exact: true })).toBeVisible();
    await expect(page.getByRole("link", { name: "Open full route", exact: true })).toHaveCount(0);
  } else {
    const currentStop = page.getByRole("list", { name: "Plan stops, in order" });
    await expect(currentStop.getByRole("heading", { name: "Beans in the Belfry", exact: true })).toBeVisible({ timeout: 20_000 });
    if (currentHours === "unknown") await expect(currentStop.getByText("Hours unconfirmed", { exact: true })).toBeVisible();
  }
  await expect(page.getByRole("link", { name: "Back to search results" })).toHaveAttribute("href", returnTo!);
  const planned = beansPlannedWindow();
  // A real dated share is a user input, not a fabricated opening or clock.
  // Keep only the named stop so the subsequent saved-place edit is exercised.
  await page.goto(beansPlanUrl(planned.at, false, returnTo!), { waitUntil: "domcontentloaded" });
  const plannedStop = page.getByRole("list", { name: "Plan stops, in order" });
  await expect(plannedStop.getByRole("heading", { name: "Beans in the Belfry", exact: true })).toBeVisible({ timeout: 20_000 });
  if (!planned.verified) await expect(plannedStop.getByText("Hours unconfirmed", { exact: true })).toBeVisible();
  await expect(page.getByRole("link", { name: "Back to search results" })).toHaveAttribute("href", returnTo!);
  await page.getByRole("button", { name: "Adjust", exact: true }).click();
  await page.getByRole("combobox", { name: "Planning area", exact: true }).selectOption("frederick");
  await page.getByRole("button", { name: "Close Adjust the plan", exact: true }).click();
  // A dismissed draft must not offer places that the current plan will reject.
  await page.getByRole("button", { name: "Add a saved place", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Add a saved place" });
  await expect(dialog.getByRole("button", { name: /Brunswick Heritage Museum/ })).toBeVisible();
  await expect(dialog.getByRole("button", { name: /Caf[eé] Nola/i })).toHaveCount(0);
  await dialog.getByRole("button", { name: /Brunswick Heritage Museum/ }).click();
  await expect(page.getByRole("list", { name: "Plan stops, in order" }).getByRole("heading", { name: "Brunswick Heritage Museum", exact: true })).toBeVisible();
  await expect.poll(() => new URL(page.url()).searchParams.get("p")).toBeTruthy();
  expect(new URL(page.url()).searchParams.get("returnTo")).toBe(returnTo);
  await page.getByRole("button", { name: "Share this plan" }).click();
  const shared = await page.evaluate(() => JSON.parse(sessionStorage.getItem("test:shared-plan")!));
  const sharedUrl = new URL(shared.url);
  expect([...sharedUrl.searchParams.keys()]).toEqual(["p"]);
  expect(shared.url).not.toContain("returnTo");
  const editedPlan = `${new URL(page.url()).pathname}${new URL(page.url()).search}`;
  await page.getByRole("list", { name: "Plan stops, in order" }).getByRole("link", { name: "Details", exact: true }).first().click();
  await expect(page.getByRole("link", { name: "Back to your plan", exact: true })).toHaveAttribute("href", editedPlan);
  await page.getByRole("link", { name: "Back to your plan", exact: true }).click();
  await expect(page.getByRole("list", { name: "Plan stops, in order" }).getByRole("heading", { name: "Brunswick Heritage Museum", exact: true })).toBeVisible({ timeout: 20_000 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.screenshot({ path: "output/playwright/connected-outing-mobile.png", fullPage: true });
  await page.setViewportSize({ width: 320, height: 700 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  const routeTarget = await page.getByRole("link", { name: "Open full route" }).boundingBox();
  expect(routeTarget?.height).toBeGreaterThanOrEqual(44);
  await page.screenshot({ path: "output/playwright/connected-outing-320.png", fullPage: true });
  await page.getByRole("link", { name: "Back to search results" }).click();
  await expect.poll(() => new URL(page.url()).searchParams.get("q")).toBe("coffee");
  expect(new URL(page.url()).searchParams.get("in")).toBe("brunswick");
});
