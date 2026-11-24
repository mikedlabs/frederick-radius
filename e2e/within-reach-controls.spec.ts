import { expect, test } from "@playwright/test";
import { registerWebkitLoopbackDocumentSeam } from "./webkit-loopback-document";

test.describe("travel reach on a touch screen", () => {
  test.use({
    hasTouch: true,
    viewport: { width: 390, height: 844 },
    permissions: ["geolocation"],
    geolocation: { latitude: 39.4143, longitude: -77.4108 },
  });

  registerWebkitLoopbackDocumentSeam();

  test("changing a town and walking budget preserves focus through rotation and labels straight-line results", async ({ page, baseURL }, info) => {
    test.setTimeout(120_000);
    const appOrigin = new URL(baseURL!).origin;
    const requests: URLSearchParams[] = [];
    await page.route("**/*", async (route) => {
      const url = new URL(route.request().url());
      if (url.origin !== appOrigin) return route.abort();
      if (url.pathname === "/api/isochrone") {
        requests.push(url.searchParams);
        return route.fulfill({ status: 503, json: { ok: false } });
      }
      if (url.pathname.startsWith("/api/")) return route.fulfill({ status: 503, json: {} });
      return route.fallback();
    });
    await page.goto("/map?mode=radius&in=thurmont&minutes=2", { waitUntil: "domcontentloaded" });
    const adjust = page.getByRole("button", { name: "Adjust the radius" });
    await adjust.click();
    const startingPoint = page.getByRole("combobox", { name: "Starting point" });
    await expect(startingPoint.locator("option:checked")).toHaveText("Thurmont");
    const time = page.getByRole("slider", { name: "Travel time" });
    await expect(time).toHaveAttribute("aria-valuetext", "2 minutes");
    await startingPoint.selectOption({ label: "Brunswick" });
    await time.focus();
    await time.press("ArrowRight");
    await expect(time).toHaveValue("3");
    await info.attach("within-reach-phone", { body: await page.screenshot(), contentType: "image/png" });
    await expect(page.getByRole("button", { name: "Walk", exact: true })).toHaveAttribute("aria-pressed", "true");
    await page.setViewportSize({ width: 820, height: 1180 });
    await page.setViewportSize({ width: 1180, height: 820 });
    await expect(time).toBeFocused();
    await expect(page.getByText("This area uses straight-line distance. Actual trips can take longer.")).toBeVisible();
    await expect(startingPoint.locator("option:checked")).toHaveText("Brunswick");
    await expect(page.getByRole("link", { name: "Back to county map" })).toHaveAttribute("href", "/map?mode=browse&in=brunswick");
    expect(requests.at(-1)?.get("minutes")).toBe("3");
    expect(requests.at(-1)?.get("mode")).toBe("walk");
    for (const control of [time, startingPoint]) expect((await control.boundingBox())!.height).toBeGreaterThanOrEqual(44);
    const track = (await time.boundingBox())!;
    await time.tap({ position: { x: Math.floor(track.width * 0.7), y: Math.floor(track.height / 2) } });
    expect(Number(await time.inputValue())).toBeGreaterThan(10);
    await info.attach("within-reach-tablet-landscape", { body: await page.screenshot(), contentType: "image/png" });
    await expect(page.getByRole("button", { name: "Done adjusting" })).toHaveAttribute("aria-expanded", "true");
  });
});
