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
});
