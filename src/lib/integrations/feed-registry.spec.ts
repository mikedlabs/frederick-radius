import { afterEach, describe, expect, it } from "vitest";
import {
  darkFeedCount,
  feedStatuses,
} from "@/lib/integrations/feed-registry";

const ORIGINAL = {
  PULSEPOINT_ENABLED: process.env.PULSEPOINT_ENABLED,
  PULSEPOINT_AGENCY_ID: process.env.PULSEPOINT_AGENCY_ID,
  HOOD_CALENDAR_URL: process.env.HOOD_CALENDAR_URL,
  FCPS_FEED_URL: process.env.FCPS_FEED_URL,
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

  it("does not mistake optional Hood and FCPS URL overrides for credentials", () => {
    delete process.env.HOOD_CALENDAR_URL;
    delete process.env.FCPS_FEED_URL;
    const feeds = feedStatuses();

    expect(feeds.keyed.some((feed) => feed.name === "Hood College")).toBe(false);
    expect(feeds.keyed.some((feed) => feed.name === "FCPS")).toBe(false);
    expect(feeds.keyless.some((feed) => feed.name === "Hood College")).toBe(true);
    expect(feeds.keyless.some((feed) => feed.name === "FCPS")).toBe(true);
  });

  it("computes the dark count from every required setting", () => {
    process.env.PULSEPOINT_ENABLED = "1";
    delete process.env.PULSEPOINT_AGENCY_ID;
    const before = darkFeedCount();

    process.env.PULSEPOINT_AGENCY_ID = "test-agency";
    expect(darkFeedCount()).toBe(before - 1);
  });
});
