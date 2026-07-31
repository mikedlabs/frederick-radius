import { afterEach, describe, expect, it } from "vitest";
import {
  darkFeedCount,
  feedStatuses,
} from "@/lib/integrations/feed-registry";

const ORIGINAL = {
  PULSEPOINT_ENABLED: process.env.PULSEPOINT_ENABLED,
  PULSEPOINT_AGENCY_ID: process.env.PULSEPOINT_AGENCY_ID,
  FREDERICK_COUNTY_GIS_REUSE_APPROVED:
    process.env.FREDERICK_COUNTY_GIS_REUSE_APPROVED,
  FREDERICK_COUNTY_GIS_APPROVED_SOURCES:
    process.env.FREDERICK_COUNTY_GIS_APPROVED_SOURCES,
  HOOD_CALENDAR_URL: process.env.HOOD_CALENDAR_URL,
  FCPS_FEED_URL: process.env.FCPS_FEED_URL,
  PARKING_OCCUPANCY_ENABLED: process.env.PARKING_OCCUPANCY_ENABLED,
  PARKING_OCCUPANCY_URL: process.env.PARKING_OCCUPANCY_URL,
};

function restore(name: keyof typeof ORIGINAL) {
  const value = ORIGINAL[name];
  if (value === undefined) delete process.env[name];
  else process.env[name] = value;
}

afterEach(() => {
  for (const name of Object.keys(ORIGINAL) as Array<keyof typeof ORIGINAL>) {
    restore(name);
  }
});

describe("feed configuration registry", () => {
  it("requires both policy approval and an agency id for PulsePoint", () => {
    process.env.PULSEPOINT_AGENCY_ID = "test-agency";
    delete process.env.PULSEPOINT_ENABLED;

    let pulse = feedStatuses().keyed.find((feed) => feed.name === "PulsePoint");
    expect(pulse).toMatchObject({
      configured: false,
      missingEnvs: ["PULSEPOINT_ENABLED"],
    });

    process.env.PULSEPOINT_ENABLED = "1";
    pulse = feedStatuses().keyed.find((feed) => feed.name === "PulsePoint");
    expect(pulse).toMatchObject({ configured: true, missingEnvs: [] });
  });

  it("requires explicit approval as well as a licensed parking endpoint", () => {
    process.env.PARKING_OCCUPANCY_URL =
      "https://parking.example.test/occupancy";
    delete process.env.PARKING_OCCUPANCY_ENABLED;

    let parking = feedStatuses().keyed.find(
      (feed) => feed.name === "Parking occupancy",
    );
    expect(parking).toMatchObject({
      configured: false,
      missingEnvs: ["PARKING_OCCUPANCY_ENABLED"],
    });

    process.env.PARKING_OCCUPANCY_ENABLED = "1";
    parking = feedStatuses().keyed.find(
      (feed) => feed.name === "Parking occupancy",
    );
    expect(parking).toMatchObject({ configured: true, missingEnvs: [] });
  });

  it("does not mistake optional Hood and FCPS URL overrides for credentials", () => {
    delete process.env.HOOD_CALENDAR_URL;
    delete process.env.FCPS_FEED_URL;
    const feeds = feedStatuses();

    expect(feeds.keyed.some((feed) => feed.name === "Hood College")).toBe(false);
    expect(feeds.keyed.some((feed) => feed.name === "FCPS")).toBe(false);
    expect(feeds.keyless.some((feed) => feed.name === "Hood College")).toBe(true);
    expect(feeds.keyless.some((feed) => feed.name === "FCPS")).toBe(true);
  });

  it("lists public County GIS as keyless and keeps gated documents dark", () => {
    const publicGis = feedStatuses().keyless.find(
      (feed) => feed.name === "Frederick County public GIS",
    );
    expect(publicGis).toMatchObject({
      configured: true,
      sourceIds: [
        "fc_planning_projects",
        "fc_snow_command",
        "fc_parks_assets",
        "fc_high_water",
        "fc_municipal_boundaries",
        "fc_county_parks",
        "fc_park_trails",
        "fc_historic_cemeteries",
      ],
    });

    process.env.FREDERICK_COUNTY_GIS_REUSE_APPROVED = "yes";
    delete process.env.FREDERICK_COUNTY_GIS_APPROVED_SOURCES;
    let county = feedStatuses().keyed.find(
      (feed) => feed.name === "Frederick County food-truck roster",
    );
    expect(county).toMatchObject({
      configured: false,
      missingEnvs: [
        "FREDERICK_COUNTY_GIS_REUSE_APPROVED",
        "FREDERICK_COUNTY_GIS_APPROVED_SOURCES",
      ],
    });

    process.env.FREDERICK_COUNTY_GIS_REUSE_APPROVED = "1";
    process.env.FREDERICK_COUNTY_GIS_APPROVED_SOURCES =
      "fc_food_truck_roster";
    county = feedStatuses().keyed.find(
      (feed) => feed.name === "Frederick County food-truck roster",
    );
    expect(county).toMatchObject({ configured: true, missingEnvs: [] });
    expect(
      feedStatuses().keyed.find(
        (feed) => feed.name === "Frederick County recreation locations",
      ),
    ).toMatchObject({
      configured: false,
      missingEnvs: ["FREDERICK_COUNTY_GIS_APPROVED_SOURCES"],
    });
  });

  it("computes the dark count from every required setting", () => {
    process.env.PULSEPOINT_ENABLED = "1";
    delete process.env.PULSEPOINT_AGENCY_ID;
    const before = darkFeedCount();

    process.env.PULSEPOINT_AGENCY_ID = "test-agency";
    expect(darkFeedCount()).toBe(before - 1);
  });

  it("tracks every new official live feed without a deployment secret", () => {
    const sourceIds = feedStatuses().keyless.flatMap(
      (feed) => feed.sourceIds ?? [],
    );

    expect(sourceIds).toEqual(
      expect.arrayContaining([
        "md_wzdx",
        "mdot_chart_tss",
        "city_emergency_rss",
        "county_health_alerts",
        "nws_lsr",
        "nowcoast_lightning",
        "fc_planning_projects",
        "fc_snow_command",
        "fc_parks_assets",
        "fc_high_water",
        "fc_municipal_boundaries",
        "fc_county_parks",
        "fc_park_trails",
        "fc_historic_cemeteries",
      ]),
    );
  });
});
