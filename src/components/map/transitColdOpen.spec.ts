import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

function read(path: string): string {
  return readFileSync(resolve(process.cwd(), path), "utf8");
}

/**
 * A remembered Transit layer must not blank the place catalog on cold open.
 *
 * This regression has landed twice. The first time it was diagnosed for the v2
 * storage key and fixed with a one-time reset (see mapLayerPrefs.ts's own
 * header: "a returning user should never inherit an invisible old question").
 * The next deliberate toggle simply re-armed it under v3, and by 2026-08-18 a
 * single Transit tap — ever — turned every later /map arrival into a bus map
 * with all 1,500+ places at opacity 0, which is the map friction the owner
 * reported.
 *
 * The distinction the code must keep: transit ON because the person asked for
 * it right now (deep link, mode default, or an in-session toggle) legitimately
 * owns the map. Transit ON only because storage remembered it draws its layer
 * and nothing more. These assertions pin that split at both ends — the flag's
 * definition and the two consumers that decide what the reader sees.
 */
describe("remembered transit does not claim the map", () => {
  it("marks a stored-only transit preference as remembered", () => {
    const toggles = read("src/components/map/useMapLayerToggles.ts");
    // All four conditions matter: any of a deep link, an explicit URL view, a
    // mode default, or an absent pref means this was NOT merely remembered.
    expect(toggles).toContain("transitFromRememberedPref");
    expect(toggles).toContain('!deepLinkLayers.has("transit")');
    expect(toggles).toContain("!hasExplicitLayerView");
    expect(toggles).toContain("layerPrefs.transit === true");
    expect(toggles).toContain("!transitDefaultOn");
  });

  it("clears the remembered flag on the first deliberate toggle", () => {
    const toggles = read("src/components/map/useMapLayerToggles.ts");
    expect(toggles).toContain("setShowTransitDeliberate");
    expect(toggles).toContain("setTransitFromRememberedPref(false)");
    // The exported setter must be the clearing one, or re-asserting transit
    // in-session would never restore the full single-purpose view.
    expect(toggles).toContain("setShowTransit: touch(setShowTransitDeliberate)");
  });

  it("keeps the catalog visible and the bus feed ambient for a remembered layer", () => {
    const appMap = read("src/components/map/AppMap.tsx");
    expect(appMap).toContain(
      "const transitClaimsMap = visibleTransit && !transitFromRememberedPref;",
    );
    // Catalog suppression reads the gated value, never raw visibleTransit.
    expect(appMap).toMatch(/operationalLayerRequested\s*=\s*\n?\s*transitClaimsMap/);
    // And the vehicle field stays the one-badge preview until it is claimed.
    expect(appMap).toContain("preview={!transitClaimsMap}");
  });
});
