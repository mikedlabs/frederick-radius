import { expect, test } from "@playwright/test";

test.describe("Pulse public road incidents", () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test("shows fused evidence without exposing a precise CHART location", async ({
    page,
  }) => {
    const updatedAt = "2026-07-27T22:40:00.000Z";
    await page.route("**/api/pulse/incidents", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          chartAvailable: true,
          totalCount: 1,
          corroboratedCount: 1,
          updatedAt,
          items: [
            {
              id: "scanner-demo",
              kind: "Crash",
              status: "corroborated",
              roadImpact: true,
              scannerClockTime: "6:35 pm",
              firstReportedAt: "2026-07-27T22:35:00.000Z",
              lastReportedAt: "2026-07-27T22:40:00.000Z",
              updates: 2,
              location: "100 block N Market St",
              coordinate: {
                lat: 39.41635,
                lng: -77.41065,
                precision: "block",
                source: "frederick-scanner",
              },
              sources: [
                {
                  source: "frederick-scanner",
                  label: "Frederick Scanner",
                  recordId: "scanner-demo",
                  firstReportedAt: "2026-07-27T22:35:00.000Z",
                  lastReportedAt: "2026-07-27T22:40:00.000Z",
                  freshness: {
                    state: "fresh",
                    ageMs: 0,
                    freshForMs: 3_600_000,
                  },
                  confidence: "preliminary",
                },
                {
                  source: "mdot-chart",
                  label: "MDOT CHART",
                  recordId: "chart-demo",
                  firstReportedAt: "2026-07-27T22:37:00.000Z",
                  lastReportedAt: "2026-07-27T22:37:00.000Z",
                  freshness: {
                    state: "fresh",
                    ageMs: 180_000,
                    freshForMs: 7_200_000,
                  },
                  confidence: "official",
                },
              ],
              reasons: [
                {
                  code: "initial-report",
                  label: "Initial report",
                  value: "Frederick Scanner",
                },
                {
                  code: "mdot-road-report",
                  label: "MDOT road report",
                  value: "MDOT CHART",
                },
              ],
              officialRoadImpact: {
                chartId: "chart-demo",
                type: "Incident",
                road: "US 15",
                direction: "NB",
                severity: "High",
                lanesAffected: "Right lane closed",
              },
            },
          ],
        }),
      });
    });

    const response = await page.goto("/pulse?open=scanner", {
      waitUntil: "domcontentloaded",
    });
    expect(response?.status()).toBe(200);

    await expect(
      page.getByRole("heading", { name: "Road incidents" }),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Close Road incidents" }),
    ).toBeVisible();
    const incidentRow = page
      .getByRole("listitem")
      .filter({ hasText: "100 block N Market St" });
    await expect(incidentRow).toBeVisible();
    await expect(
      incidentRow.getByRole("heading", { name: "Crash" }),
    ).toBeVisible();
    await expect(incidentRow.getByText("MDOT nearby")).toBeVisible();
    await expect(
      incidentRow.getByText(
        "MDOT also reports an impact on US 15 northbound: Right lane closed.",
      ),
    ).toBeVisible();

    const mapLink = incidentRow.getByRole("link", {
      name: "View on the map",
    });
    await expect(mapLink).toHaveAttribute(
      "href",
      "/map?at=39.416350,-77.410650&show=incidents,cameras",
    );
    await expect(page.locator('a[href*="x.com"]')).toHaveCount(0);
    await expect(page.getByText("127 N Market St")).toHaveCount(0);

    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - window.innerWidth,
    );
    expect(overflow).toBeLessThanOrEqual(1);

    await page.keyboard.press("Escape");
    await expect(
      page.getByRole("heading", { name: "Road incidents" }),
    ).toBeHidden();
  });

  // Oct 2026 review (local/pulse-m.png, prod/pulse-full.png): the masthead
  // said "no major disruptions" under a header that counted an alert, nothing
  // showed where anything was, and the weather sat below MARC. Live feeds
  // decide which state this run sees, so each branch is checked when present.
  test("names the problem, maps it under the card, and keeps weather above transit", async ({
    page,
  }) => {
    const response = await page.goto("/pulse", { waitUntil: "domcontentloaded" });
    expect(response?.status()).toBe(200);

    const briefing = page.locator("[data-pulse-briefing]");
    const statusMap = page.locator("[data-pulse-status-map]");
    await expect(statusMap).toBeVisible();
    await expect(statusMap.getByRole("heading", { name: "On the map" })).toBeVisible();
    await expect(
      statusMap.getByRole("img", { name: /^Map of Frederick County with / }),
    ).toBeVisible();
    expect(
      await briefing.evaluate((element) =>
        element.nextElementSibling?.hasAttribute("data-pulse-status-map"),
      ),
    ).toBe(true);
    const strip = await statusMap.locator('[data-overview-aspect="wide"]').boundingBox();
    expect(Math.round(strip?.height ?? 0)).toBe(220);

    const word = await statusMap.getAttribute("data-pulse-status-map");
    const headline = (await page.locator("main h1").innerText()).trim();
    // The header chip reads /api/pulse/status, which grades the same list,
    // so it never prints Quiet over a masthead that names an item.
    const chip = page.locator("[data-pulse-indicator]").first();
    await expect(chip).not.toHaveAttribute("data-pulse-state", "checking", { timeout: 20_000 });
    if (word === "Urgent" || word === "Advisory") {
      expect(headline.startsWith(`${word}: `)).toBe(true);
      await expect(chip).not.toHaveAttribute("aria-label", /^County status: Quiet/);
    } else {
      await expect(statusMap).toContainText(
        /No incidents are mapped in the county right now\.|Radius could not reach the road feeds, so nothing is mapped\.|No incidents are mapped right now, but some county feeds did not answer\./,
      );
    }

    const points = statusMap.locator("button[data-overview-point]");
    if ((await points.count()) > 0) {
      await expect(briefing).toHaveAttribute("data-pulse-interaction-ready", "true");
      const id = await points.first().getAttribute("data-overview-point");
      await points.first().locator("[data-overview-tone]").click();
      await expect(page.locator(":focus")).toHaveAttribute("data-pulse-status-row", id ?? "");
    }

    const readings = page.locator("#pulse-readings-heading");
    const transit = page.locator("#pulse-live-board-heading");
    if ((await readings.count()) > 0 && (await transit.count()) > 0) {
      const order = await readings.evaluate(
        (element, other) => element.compareDocumentPosition(other as Node),
        await transit.elementHandle(),
      );
      expect(order & 4).toBe(4);
    }

    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - window.innerWidth,
    );
    expect(overflow).toBeLessThanOrEqual(1);
  });
});
