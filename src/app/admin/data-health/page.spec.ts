import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = readFileSync("src/app/admin/data-health/page.tsx", "utf8");

describe("admin data-health Google policy visibility", () => {
  it("distinguishes the runtime hold from the historical-content migration", () => {
    expect(source).toContain('"Known historical Google content (lower bound)"');
    expect(source).toContain("historicalGoogleContentRows");
    expect(source).toContain("does not yet inventory every derived artifact");
    expect(source).toContain("maintenance policy hold is active");
    expect(source).toContain("Existing attributed photo");
    expect(source).not.toContain("actions.push({\n      label: `At least ${historicalGoogleContentRows");
  });

  it("never tells an operator to restart a Google vetting pull while policy holds it off", () => {
    expect(source).toContain("googleMapsPlatformRuntimeEnabled()");
    expect(source).toContain("googlePlaceMaintenanceReady");
    expect(source).toContain("GOOGLE_PLACES_API_KEY");
    expect(source).toContain("Google runtime is on policy hold");
    expect(source).toContain("Do not re-pull it from this alert");
    expect(source).not.toContain(
      'fix: "Run npm run vet to re-pull Google and refresh the drift diff."',
    );
  });

  it("counts only identity-matched historical hours bindings", () => {
    expect(source).toContain("hoursRefreshForAcceptedIdentity(");
    expect(source).toContain("historicalHoursRows[place.slug]");
    expect(source).toContain("place.google_place_id");
    expect(source).not.toContain(
      "Object.keys(HOURS_REFRESH_RAW as Record<string, unknown>)",
    );
  });
});
