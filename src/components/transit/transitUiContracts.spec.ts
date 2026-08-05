import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("transit UI interaction contracts", () => {
  it("keeps an unavailable stop feed distinct from a healthy empty arrival list", () => {
    const source = readFileSync(
      "src/components/transit/StopArrivalsPopup.tsx",
      "utf8",
    );

    const unavailableBranch = source.indexOf("feedAvailable === false");
    const arrivalsBranch = source.indexOf("arrivals.length > 0");
    const healthyEmptyCopy = source.indexOf(
      "No live arrival is reporting for this stop right now.",
    );

    expect(unavailableBranch).toBeGreaterThan(-1);
    expect(arrivalsBranch).toBeGreaterThan(unavailableBranch);
    expect(healthyEmptyCopy).toBeGreaterThan(arrivalsBranch);
    expect(source).toContain("Live arrivals are unavailable.");
    expect(source).toContain("Check the official schedule");
    expect(source).toContain('d.available !== false && d.status !== "unavailable"');
    expect(source).not.toContain("routesForStop");
    expect(source).not.toContain('from "./routeGeometry"');
    expect(source).toContain("new Set(");
    expect(source).toContain("(preds ?? [])");
    expect(source).toContain(
      "feedAvailable === true && feedFresh === true",
    );
    expect(source).toContain(
      'prediction.scheduleRelationship === "NO_DATA"',
    );
    expect(source).toContain(
      'prediction.tripScheduleRelationship === "CANCELED"',
    );
  });

  it("gives the dedicated transit map tappable stop hit targets and an accessible route picker", () => {
    const source = readFileSync(
      "src/components/transit/TransitMap.tsx",
      "utf8",
    );

    expect(source).toContain(
      'interactiveLayerIds={interactiveStops ? ["transit-stops-hit"] : undefined}',
    );
    expect(source).toContain('id="transit-stops-hit"');
    expect(source).toContain("<select");
    expect(source).toContain("Bus route");
    expect(source).toContain("All routes");
    expect(source).toContain("fitBounds(");
  });

  it("makes stops on the main map tappable and opens the shared arrival detail", () => {
    const source = readFileSync("src/components/map/AppMap.tsx", "utf8");
    // The arrivals drawer itself moved to the selection-surfaces child (#77);
    // the tappable hit layer and its selection state stay in AppMap.
    const surfaces = readFileSync(
      "src/components/map/AppMapSelectionSurfaces.tsx",
      "utf8",
    );

    expect(source).toContain('"transit-stop-hit"');
    expect(source).toContain('id="transit-stop-hit"');
    expect(source).toContain("setSelectedTransitStop");
    expect(surfaces).toContain("<StopArrivalsPopup");
    expect(surfaces).toContain("Live Frederick County TransIT arrivals");
  });

  it("offers a non-canvas stop lookup with location ranking and the same arrival detail", () => {
    const source = readFileSync(
      "src/components/transit/TransitStopFinder.tsx",
      "utf8",
    );
    const page = readFileSync("src/app/(app)/transit/page.tsx", "utf8");

    expect(page).toContain("<TransitStopFinder");
    expect(source).toContain("Search bus stops by name");
    expect(source).toContain("Show the nearest bus stops");
    expect(source).toContain("haversineMeters");
    expect(source).toContain("<StopArrivalsPopup");
    expect(source).toContain("Walking directions to this stop");
    expect(source).toContain("prediction.headsign");
    expect(source).toContain("Wheelchair boarding is listed for this stop.");
    expect(source).toContain(
      'prediction.scheduleRelationship !== "NO_DATA"',
    );
    expect(page).toContain("TRANSIT_NETWORK");
    expect(page).toContain("shapeVariants");
    expect(page).toContain("<TransitServiceAlerts");
  });

  it("lets visible transit-tile copy provide the accessible name", () => {
    const page = readFileSync("src/app/(app)/transit/page.tsx", "utf8");

    expect(page).not.toContain(
      'aria-label={`${intent.label}: ${intent.hint}`}',
    );
  });
});
