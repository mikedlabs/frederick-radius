import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = readFileSync("src/app/admin/costs/page.tsx", "utf8");

describe("admin cost visibility", () => {
  it.each([
    ["google_photo", 7, "1_000"],
    ["google_place_details_pro", 17, "5_000"],
    ["google_place_details_enterprise", 20, "1_000"],
    ["google_place_details_enterprise_atmosphere", 25, "1_000"],
    ["google_text_search_pro", 32, "5_000"],
    ["google_text_search_enterprise", 35, "1_000"],
    ["google_text_search_enterprise_atmosphere", 40, "1_000"],
    ["google_routes_matrix_essentials", 5, "10_000"],
    ["google_routes_matrix_pro", 10, "5_000"],
    ["google_geocode", 5, "10_000"],
  ])(
    "reports %s at the current first-volume price and monthly free cap",
    (key, per1000, freeMonthly) => {
      const start = source.indexOf(`key: "${key}"`);
      const end = source.indexOf("\n  {", start);
      const config = source.slice(start, end);

      expect(start).toBeGreaterThan(-1);
      expect(end).toBeGreaterThan(start);
      expect(config).toContain(`per1000: ${per1000}`);
      expect(config).toContain(`freeMonthly: ${freeMonthly}`);
    },
  );

  it("subtracts each SKU's free allowance before estimating cost", () => {
    expect(source).toContain(
      "Math.max(0, calls - (upstream.freeMonthly ?? 0))",
    );
  });

  it("shows whether Routes has an independently restricted deployment key", () => {
    expect(source).toContain('label: "Google Routes key isolation"');
    expect(source).toContain("process.env.GOOGLE_ROUTES_API_KEY");
    expect(source).toContain("Routes still works through the Places-key fallback");
  });

  it("shows the Geocoding split-key state and honest KV fallback", () => {
    expect(source).toContain('label: "Google Geocoding key isolation"');
    expect(source).toContain("process.env.GOOGLE_GEOCODING_API_KEY");
    expect(source).toContain("Geocoding still works through the Places-key fallback");
    expect(source).toContain("A bounded per-instance fallback remains active");
    expect(source).not.toContain("silently passes everything through");
  });

  it("reports the configured atomic Google ceilings and fail-closed state", () => {
    expect(source).toContain('label: "Atomic Google daily ceilings"');
    expect(source).toContain("googlePhotoDailyCap()");
    expect(source).toContain("resolveGoogleGeocodeDailyCap()");
    expect(source).toContain("resolveHoursRefreshRunCap()");
    expect(source).toContain("protected Google paths fail closed");
    expect(source).toContain("business status 40");
  });

  it("does not present best-effort internal telemetry as the provider bill", () => {
    expect(source).toContain("best-effort SKU telemetry from database-connected");
    expect(source).toContain("Maintenance and scheduled CLI runs");
    expect(source).toContain("this view may undercount");
    expect(source).toContain("source of truth");
    expect(source).not.toContain("incremented beside every PAID upstream fetch");
  });

  it("shows Visit Frederick recovery as capped app-side attempts", () => {
    const start = source.indexOf('key: "firecrawl_visit_frederick"');
    const end = source.indexOf("\n  },", start);
    const firecrawlConfig = source.slice(start, end);

    expect(start).toBeGreaterThan(-1);
    expect(end).toBeGreaterThan(start);
    expect(firecrawlConfig).toContain('billing: "plan-credit"');
    expect(firecrawlConfig).toContain("dailyCap: 12");
    expect(firecrawlConfig).not.toContain("per1000");
    expect(source).toContain("hard cap {u.dailyCap}/day");
    expect(source).toContain("recovery attempts today");
    expect(source).toContain("attempt is not the same as a");
  });

  it("excludes capped attempts from estimated dollar totals", () => {
    expect(source).toContain(
      'if (upstream.billing === "plan-credit") return null;',
    );
    expect(source).toContain(
      "Firecrawl recovery is shown as app-side attempts and is",
    );
    expect(source).toContain('href: "https://www.firecrawl.dev/app"');
  });
});
