import { describe, expect, it } from "vitest";
import { eventPinFromEvent } from "./eventPin";

const NOW = new Date("2026-08-10T19:00:00.000Z");

function event(over: Record<string, unknown> = {}) {
  return {
    slug: "alive-at-five",
    title: "Alive @ Five",
    starts_at: "2026-08-13T21:00:00.000Z",
    ends_at: "2026-08-13T23:00:00.000Z",
    venue_name: "Carroll Creek Amphitheater",
    venue_place_slug: "carroll-creek-outdoor-amphitheater",
    geom: { lng: -77.4105, lat: 39.4143 },
    category: "music",
    source: "dfp",
    source_url: "https://downtownfrederick.org/aliveatfive/",
    confidence: "verified",
    last_verified_at: "2026-08-10T14:05:00-04:00",
    is_verified: false,
    organizer: "Downtown Frederick Partnership",
    ...over,
  } as Parameters<typeof eventPinFromEvent>[0];
}

describe("eventPinFromEvent", () => {
  it("keeps the real publisher evidence in the compact map pin", () => {
    const pin = eventPinFromEvent(event(), NOW);

    expect(pin).toMatchObject({
      source_label: "Downtown Frederick Partnership",
      source_url: "https://downtownfrederick.org/aliveatfive/",
      source_confidence: "verified",
      source_verified: true,
      verified_at: "2026-08-10T18:05:00.000Z",
      verification_expires_at: "2026-08-17T18:05:00.000Z",
    });
    expect(pin).not.toHaveProperty("description");
    expect(pin).not.toHaveProperty("license");
    expect(pin).not.toHaveProperty("source_id");
  });

  it("does not turn an unreviewed or malformed source into verified evidence", () => {
    const pin = eventPinFromEvent(event({
      source: "eventbrite",
      source_url: "javascript:alert(1)",
      confidence: "scraped",
      last_verified_at: "not-a-date",
    }), NOW);

    expect(pin).toMatchObject({
      source_label: "Eventbrite",
      source_confidence: "scraped",
      source_verified: false,
    });
    expect(pin).not.toHaveProperty("source_url");
    expect(pin).not.toHaveProperty("verified_at");
    expect(pin).not.toHaveProperty("verification_expires_at");
  });

  it("does not verify a near-term event after its 24-hour source window", () => {
    const pin = eventPinFromEvent(event({
      starts_at: "2026-08-11T21:00:00.000Z",
      last_verified_at: "2026-08-09T18:00:00.000Z",
    }), NOW);

    expect(pin).toMatchObject({
      source_verified: false,
      verified_at: "2026-08-09T18:00:00.000Z",
      verification_expires_at: "2026-08-10T18:00:00.000Z",
    });
  });

  it("keeps a missing verification date unknown instead of current", () => {
    const pin = eventPinFromEvent(event({ last_verified_at: null }), NOW);

    expect(pin.source_verified).toBe(false);
    expect(pin).not.toHaveProperty("verified_at");
    expect(pin).not.toHaveProperty("verification_expires_at");
  });

  it("rejects a verification timestamp beyond the allowed future skew", () => {
    const pin = eventPinFromEvent(event({
      last_verified_at: "2026-08-10T19:06:00.000Z",
    }), NOW);

    expect(pin.source_verified).toBe(false);
    expect(pin).not.toHaveProperty("verified_at");
    expect(pin).not.toHaveProperty("verification_expires_at");
  });

  it("requires a public source record even when the check is fresh", () => {
    const pin = eventPinFromEvent(event({ source_url: null }), NOW);

    expect(pin.source_verified).toBe(false);
    expect(pin).not.toHaveProperty("source_url");
  });
});
