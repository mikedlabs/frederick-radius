import { expect, test } from "@playwright/test";
import { registerWebkitLoopbackDocumentSeam } from "./webkit-loopback-document";

const returnTo = "/search?q=coffee&in=brunswick&kind=place";
const mapUrl = `/map?in=brunswick&returnTo=${encodeURIComponent(returnTo)}`;

/** Real built route and retry UI. Only the first local core response is held;
 * retry reads the actual committed snapshot. WebGL and optional/provider
 * transport are unavailable by design, so this proves recovery and URL
 * continuity, not styled-map rendering or external source availability. */
test.describe("Map core-response deadline", () => {
  test.use({ viewport: { width: 390, height: 844 }, bypassCSP: false, serviceWorkers: "block" });

  test("a stalled place response reaches retry and recovers without losing scope or origin", async ({ page, baseURL }) => {
    if (!baseURL || !["localhost", "127.0.0.1"].includes(new URL(baseURL).hostname)) {
      throw new Error("The core-response fixture requires a loopback application server.");
    }
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.clock.install();
    await page.addInitScript(() => {
      localStorage.setItem("fr_map_location_intro_v1", "dismissed");
      const original = HTMLCanvasElement.prototype.getContext;
      HTMLCanvasElement.prototype.getContext = function (this: HTMLCanvasElement, type: string, ...args: unknown[]) {
        if (/webgl/.test(type)) return null;
        return original.call(this, type as "2d", ...args);
      } as typeof original;
    });

    let coreRequests = 0;
    let releaseHeld!: () => void;
    const held = new Promise<void>((resolve) => { releaseHeld = resolve; });
    await page.route("**/*", async (route) => {
      const request = route.request();
      const url = new URL(request.url());
      if (url.origin !== new URL(baseURL).origin || request.method() !== "GET") {
        return route.abort("blockedbyclient");
      }
      // The loopback-only WebKit document seam remains behind this guard.
      if (request.isNavigationRequest() && request.resourceType() === "document") return route.fallback();
      if (url.pathname === "/api/map/places") {
        coreRequests++;
        if (coreRequests === 1) {
          await held;
          await route.abort("timedout").catch(() => undefined);
          return;
        }
        return route.continue();
      }
      if (url.pathname.startsWith("/api/") || url.pathname === "/_next/image") {
        return route.fulfill({ status: 503, json: { error: "Optional transport unavailable in the local recovery fixture" } });
      }
      return route.continue();
    });

    const assertContext = () => {
      const current = new URL(page.url());
      expect(current.pathname).toBe("/map");
      expect(current.searchParams.get("in")).toBe("brunswick");
      expect(current.searchParams.get("returnTo")).toBe(returnTo);
    };

    try {
      await page.goto(mapUrl, { waitUntil: "domcontentloaded" });
      await expect.poll(() => coreRequests).toBe(1);
      await expect(page.getByText("Loading Frederick County places.", { exact: true })).toBeVisible();
      assertContext();
      await page.clock.fastForward(10_000);
      const failure = page.getByRole("alert").filter({ hasText: "The place layer did not load." });
      await expect(failure).toBeVisible();
      const retry = failure.getByRole("button", { name: "Try again", exact: true });
      await expect(retry).toBeVisible();
      expect((await retry.boundingBox())?.height ?? 0).toBeGreaterThanOrEqual(44);
      expect(coreRequests).toBe(1);
      assertContext();

      const recovered = page.waitForResponse((response) =>
        new URL(response.url()).pathname === "/api/map/places" && response.status() === 200);
      await retry.click();
      const actualPayload = await (await recovered).json() as {
        places?: Array<{ slug: string; name: string; municipality?: string }>;
      };
      expect(actualPayload.places?.length ?? 0).toBeGreaterThan(0);
      await expect(failure).toHaveCount(0);
      await expect(page.locator(".dock-host .map-error-fallback")).toBeVisible();
      const available = page.getByRole("region", { name: "Available results without the map", exact: true });
      await expect(available).toBeVisible();
      const firstResult = available.getByRole("region", { name: "Places", exact: true })
        .getByRole("button").first();
      await expect(firstResult).toBeVisible();
      const slug = await firstResult.getAttribute("data-decision-id");
      const actualPlace = actualPayload.places?.find((place) => place.slug === slug);
      expect(actualPlace, "The visible recovered result belongs to the actual snapshot response").toBeDefined();
      if (!actualPlace) throw new Error("The recovered result was absent from the real snapshot");
      await expect(firstResult).toContainText(actualPlace.name);
      expect(actualPlace.municipality).toBe("brunswick");
      expect(coreRequests).toBe(2);
      assertContext();
    } finally {
      releaseHeld();
    }
  });
});

registerWebkitLoopbackDocumentSeam();
