import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = readFileSync("src/app/admin/costs/page.tsx", "utf8");

describe("admin cost visibility", () => {
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

  it("accounts for every guarded Google Places path", () => {
    for (const key of [
      "google_photo",
      "budget_google_place_enrich_basic",
      "budget_google_place_enrich_experience",
      "budget_google_business_status",
      "budget_google_hours_refresh",
    ]) {
      expect(source, key).toContain(`key: "${key}"`);
    }

    expect(source).toContain("freeMonthly: 1_000");
    expect(source).toContain('rateLabel: "$20–$35"');
    expect(source).toContain('rateLabel: "$25–$40"');
    expect(source).toContain("googleHoursRefreshDailyCap()");
    expect(source).toContain("googleRoutesDailyElementCap()");
  });

  it("shows configured cap utilization and a cap-reached state for unit-estimate rows", () => {
    expect(source).toContain("dailyCap: googlePhotoDailyCap()");
    expect(source).toContain("u.dailyCap !== undefined && todayCalls >= u.dailyCap");
    expect(source).toContain("/ {u.dailyCap.toLocaleString()} cap");
    expect(source).toContain('month.atDailyCap ? "daily cap reached"');
  });
});
