import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = process.cwd();
const read = (p: string) => readFileSync(join(ROOT, p), "utf8");

/**
 * Every route that spends money upstream must bound unattributed callers.
 *
 * `isSameOriginRequest` returns true for a request carrying neither Referer
 * nor Origin, deliberately, so Next's image optimizer and genuine
 * server-to-server renders keep working. That admission is also the cheapest
 * way for anyone on the internet to reach a paid upstream on our bill: strip
 * two headers and the origin guard waves you through. It was confirmed
 * exploitable on /api/place-photo against production, where a cache-busted
 * photo name is a guaranteed paid miss every time.
 *
 * `isOverPaidRequestBudget` is the fix: the normal per-IP budget plus a much
 * tighter one for unattributed traffic. A page in a real browser always sends
 * a Referer for its own subresource requests, so the tight bucket never
 * touches a visitor.
 *
 * This spec exists because the failure is invisible. A route that reaches for
 * plain `isRateLimited` still compiles, still passes every other test, and
 * still serves correctly — it just quietly leaves the tap open again.
 */

// Routes that call a metered third party on a cache miss.
const PAID_ROUTES = [
  "src/app/api/place-photo/route.ts",
  "src/app/api/static-map/route.ts",
  "src/app/api/isochrone/route.ts",
  "src/app/api/walk-time/route.ts",
  "src/app/api/travel-matrix/route.ts",
  "src/app/api/place/[slug]/enrich/route.ts",
];

describe("paid upstream request budgets", () => {
  it.each(PAID_ROUTES)("%s bounds unattributed callers", (route) => {
    expect(read(route)).toContain("isOverPaidRequestBudget");
  });

  it("keeps both buckets inside the shared helper", () => {
    const source = read("src/lib/origin-check.ts");
    // The normal budget must be checked first and must short-circuit, and the
    // tight budget must apply only when the request is unattributed. Losing
    // either half turns the helper back into a plain rate limiter.
    expect(source).toMatch(
      /isOverPaidRequestBudget[\s\S]*?isRateLimited\(req, key, limit, windowSeconds\)[\s\S]*?isUnattributedRequest\(req\)[\s\S]*?`\$\{key\}-unattributed`/,
    );
  });

  it("names a distinct bucket so the two limits cannot share a counter", () => {
    expect(read("src/lib/origin-check.ts")).toContain("`${key}-unattributed`");
  });

  it("flags any new metered route that skipped the helper", () => {
    // A route that meters a paid upstream AND admits header-less requests is
    // exactly the shape this helper exists for. Catching it here is cheaper
    // than discovering it on a bill.
    const apiRoot = join(ROOT, "src/app/api");
    const offenders: string[] = [];

    const walk = (dir: string) => {
      for (const entry of readdirSync(dir, { withFileTypes: true })) {
        const full = join(dir, entry.name);
        if (entry.isDirectory()) {
          walk(full);
          continue;
        }
        if (entry.name !== "route.ts") continue;
        const source = readFileSync(full, "utf8");
        // Metering sometimes happens inside the integration library rather
        // than in the route, so looking only for meterUsage() misses real
        // spenders. /api/place/[slug]/enrich was exactly that: it calls
        // getPlaceDetails() and never names meterUsage itself.
        const meters =
          source.includes("meterUsage(") ||
          source.includes("@/lib/integrations/google-places") ||
          source.includes("@/lib/mapbox-server");
        const admitsBare = source.includes("isSameOriginRequest(");
        const bounded = source.includes("isOverPaidRequestBudget");
        if (meters && admitsBare && !bounded) {
          offenders.push(full.slice(ROOT.length + 1));
        }
      }
    };
    walk(apiRoot);

    expect(
      offenders,
      "these routes meter a paid upstream and admit header-less requests, " +
        "but do not bound them — use isOverPaidRequestBudget",
    ).toEqual([]);
  });
});
