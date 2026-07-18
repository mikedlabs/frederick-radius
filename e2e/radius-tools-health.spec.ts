import { expect, test } from "@playwright/test";
import { RADIUS_TOOLS } from "../src/data/radius-tools";
import { findErrorBoundaryMarker } from "./error-boundary-markers";

const destinations = new Map<string, string[]>();
for (const tool of RADIUS_TOOLS) {
  const url = new URL(tool.href, "https://frederickradius.app");
  const requestTarget = `${url.pathname}${url.search}`;
  const current = destinations.get(url.pathname) ?? [];
  if (!current.includes(requestTarget)) current.push(requestTarget);
  destinations.set(url.pathname, current);
}

test.describe("Radius tool runtime health", () => {
  for (const [pathname, targets] of destinations) {
    test(pathname, async ({ request }) => {
      test.setTimeout(180_000);
      for (const target of targets) {
        const response = await request.get(target, { timeout: 120_000 });
        expect(response.status(), `${target} should render`).toBeLessThan(400);
        const body = await response.text();
        const errorMarker = findErrorBoundaryMarker(body);
        expect(
          errorMarker,
          `${target} should not render an error boundary${errorMarker ? ` (matched: ${errorMarker})` : ""}`,
        ).toBeNull();
      }
    });
  }
});

test("tool hash targets exist after hydration", async ({ page }) => {
  for (const tool of RADIUS_TOOLS.filter((candidate) => candidate.href.includes("#"))) {
    const url = new URL(tool.href, "https://frederickradius.app");
    await page.goto(tool.href, { waitUntil: "domcontentloaded" });
    await expect(page.locator(url.hash), `${tool.href} should resolve its anchor`).toBeAttached();
  }
});
