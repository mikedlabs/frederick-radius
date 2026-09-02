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
    expect(source).toContain('{" · hard cap "}{u.dailyCap}/day');
    expect(source).toContain("recovery attempts today");
    expect(source).toContain("recovery attempt is not necessarily");
  });

  it("excludes capped attempts from estimated dollar totals", () => {
    expect(source).toContain(
      'if (upstream.billing !== "unit-estimate") return null;',
    );
    expect(source).toContain(
      "Firecrawl recovery and the guarded Ask model/embedding rows",
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
    expect(source).toContain("u.dailyCap !== undefined &&");
    expect(source).toContain("u.dailyCap > 0 &&");
    expect(source).toContain("todayCalls >= u.dailyCap");
    expect(source).toContain("/ {u.dailyCap.toLocaleString()} cap");
    expect(source).toContain('month.atDailyCap ? "daily cap reached"');
  });

  it("does not style an intentionally disabled zero cap as over limit", () => {
    expect(source).toContain("limit > 0 && used >= limit");
    expect(source).not.toContain(
      'style={{ color: used >= limit ? "var(--app-brand-press)"',
    );
  });

  it("distinguishes active controls, safe-off controls, and broken setup", () => {
    expect(source).toContain(
      'type CostControlState = "active" | "off" | "attention";',
    );
    expect(source).toContain('active: { label: "Active"');
    expect(source).toContain('off: { label: "Off, safe"');
    expect(source).toContain('attention: { label: "Needs attention"');
    expect(source).toContain("const status = CONTROL_STATUS[c.state]");
    expect(source).not.toContain("c.ok ? \"Active\" : \"Missing\"");
  });

  it("reports disabled paid features as safe-off instead of missing", () => {
    expect(source).toContain(
      'state: !mapboxSearchBoxEnabled\n        ? "off"',
    );
    expect(source).toContain(
      'state: !mapboxPermanentGeocodingEnabled\n        ? "off"',
    );
    expect(source).toContain(
      '!askRuntimeRequested || askCallCap === 0\n          ? "off"',
    );
    expect(source).toContain(
      '!searchSemanticRequested || searchSemanticCap === 0\n          ? "off"',
    );
  });

  it("shows the atomic Mapbox session and permanent-geocode budgets", () => {
    expect(source).toContain('mapboxDailyUsageCap("search_box_session")');
    expect(source).toContain('mapboxDailyUsageCap("permanent_geocode")');
    expect(source).toContain('mapboxDailyUsageCap("matrix_element")');
    expect(source).toContain('label: "Atomic Mapbox daily budgets"');
    expect(source).toContain("paid requests fail closed");
    expect(source).toContain("usage_counters_day_upstream_uq");
    expect(source).toContain("usageCounterUniqueIndexReady");
    expect(source).toContain("unique day/upstream index");
    expect(source).toContain('label: "Mapbox Search Box lifecycle"');
    expect(source).toContain("mapboxSearchSessionTableReady");
    expect(source).toContain("to_regclass('public.mapbox_search_sessions')");
    expect(source).toContain("migration 0045");
    expect(source).toContain("retrieve, 180 seconds, or 50 suggestions");
    expect(source).toContain("index_meta.indisvalid");
    expect(source).toContain("index_meta.indisready");
    expect(source).toContain("index_meta.indpred is null");
    expect(source).toContain("index_meta.indnkeyatts = 2");
    expect(source).toContain("pg_catalog.pg_get_indexdef(index_meta.indexrelid, 1, true) = 'day'");
    expect(source).toContain("pg_catalog.pg_get_indexdef(index_meta.indexrelid, 2, true) = 'upstream'");
    expect(source).toContain('label: "Mapbox permanent-geocoding switch"');
    expect(source).toContain('label: "Mapbox Matrix global breaker"');
    expect(source).toContain("mapboxMatrixRuntimeEnabled()");
    expect(source).toContain("zero-element cap deliberately disables every Matrix path");
    expect(source).toContain("Matrix responses are not persisted");
  });

  it("describes the bounded local rate-limit fallback honestly", () => {
    expect(source).toContain("a bounded per-instance fallback");
    expect(source).toContain("cannot coordinate across serverless workers");
    expect(source).toContain("guarded paid paths also keep their atomic daily budgets");
    expect(source).not.toContain("silently passes everything through");
  });

  it("shows least-privilege Google credential posture and safe fallbacks", () => {
    expect(source).toContain('label: "Google Maps policy approval"');
    expect(source).toContain('label: "Google Places runtime"');
    expect(source).toContain('label: "Dedicated Google Routes runtime"');
    expect(source).toContain("googleMapsWrittenApprovalConfirmed()");
    expect(source).toContain("googleMapsPlatformRuntimeEnabled()");
    expect(source).toContain("googleRoutesRuntimeEnabled()");
    expect(source).toContain("GOOGLE_ROUTES_API_KEY");
    expect(source).toContain("There is no Places-key fallback");
    expect(source).toContain("Existing credentials alone cannot activate");
    expect(source).not.toContain("cannot activate photos");
    expect(source).toContain("Current photo delivery is managed separately");
    expect(source).toContain('label: "Google event-geocoding isolation"');
    expect(source).toContain("GOOGLE_GEOCODING_API_KEY");
    expect(source).toContain("official Frederick County address lookup");
  });

  it("shows the public Ask breakers without inventing a flat AI call price", () => {
    expect(source).toContain('key: "ask_model_call"');
    expect(source).toContain('key: "ask_embedding"');
    expect(source).toContain('key: "radius_search_embedding"');
    expect(source).toContain('billing: "guarded-attempt"');
    expect(source).toContain("dailyCap: askAiDailyCallLimit()");
    expect(source).toContain("dailyCap: askAiEmbeddingDailyLimit()");
    expect(source).toContain('label: "Public Ask model budget"');
    expect(source).toContain('label: "Ask runtime embedding budget"');
    expect(source).toContain('label: "Scheduled search-vector budget"');
    expect(source).toContain('label: "Ask output and retry bounds"');
    expect(source).toContain("SDK retries are zero");
    expect(source).toContain("Radius does not borrow another provider");
    expect(source).toContain("guarded Ask model/embedding rows");
    expect(source).toContain("Anthropic direct usage");
    expect(source).not.toContain("Anthropic fallback usage");
  });
});
