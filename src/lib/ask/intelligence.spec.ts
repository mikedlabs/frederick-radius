import { describe, expect, it } from "vitest";
import {
  askEventSourceUnavailable,
  askEventTrust,
  parkingStatusForAsk,
  validAskAgentLead,
} from "./intelligence";

const NOW = new Date("2026-08-10T16:00:00.000Z");
const HEALTHY = { degraded: false, unavailable: [] as string[] };

function eventTrustInput(
  overrides: Partial<Parameters<typeof askEventTrust>[0]> = {},
): Parameters<typeof askEventTrust>[0] {
  return {
    source: "dfp",
    source_url: "https://downtownfrederick.org/events/example",
    confidence: "verified",
    last_verified_at: "2026-08-10T15:30:00.000Z",
    starts_at: "2026-08-10T23:00:00.000Z",
    ...overrides,
  };
}

describe("parkingStatusForAsk", () => {
  it("describes an explicitly closed garage as closed", () => {
    expect(parkingStatusForAsk({
      availabilityState: "closed",
    })).toBe("closed");
  });

  it("keeps the remaining live states distinct", () => {
    expect(parkingStatusForAsk({
      availabilityState: "full",
    })).toBe("full");
    expect(parkingStatusForAsk({
      availabilityState: "filling",
    })).toBe("filling");
    expect(parkingStatusForAsk({
      availabilityState: "available",
    })).toBe("available");
  });

  it("does not describe status-only OPEN or incomplete counts as available", () => {
    expect(parkingStatusForAsk({ availabilityState: "open" })).toBe("open");
    expect(parkingStatusForAsk({ availabilityState: "unknown" })).toBe("unknown");
  });
});

describe("askEventTrust", () => {
  it("allows a recently checked event from a trustworthy source to lead", () => {
    expect(askEventTrust(eventTrustInput(), HEALTHY, NOW)).toEqual({
      confidence: "high",
      eligibleAsLead: true,
      reason: "current-source",
    });
  });

  it("keeps stale near-term events browseable but out of the lead", () => {
    expect(askEventTrust(eventTrustInput({
      last_verified_at: "2026-08-08T15:30:00.000Z",
    }), HEALTHY, NOW)).toEqual({
      confidence: "medium",
      eligibleAsLead: false,
      reason: "stale-verification",
    });
  });

  it("does not grant high confidence to a fresh scraped row", () => {
    expect(askEventTrust(eventTrustInput({
      source: "venue-extract",
      confidence: "scraped",
    }), HEALTHY, NOW)).toEqual({
      confidence: "medium",
      eligibleAsLead: false,
      reason: "unreviewed-source",
    });
  });

  it("downgrades a stale-good row when its own source failed", () => {
    const sourceHealth = { degraded: true, unavailable: ["SeatGeek"] };
    expect(askEventTrust(eventTrustInput({
      source: "seatgeek",
      source_url: "https://seatgeek.com/example",
    }), sourceHealth, NOW)).toEqual({
      confidence: "medium",
      eligibleAsLead: false,
      reason: "source-unavailable",
    });
  });

  it("does not punish a healthy event for an unrelated feed failure", () => {
    const sourceHealth = { degraded: true, unavailable: ["SeatGeek"] };
    expect(askEventTrust(eventTrustInput(), sourceHealth, NOW)).toEqual({
      confidence: "high",
      eligibleAsLead: true,
      reason: "current-source",
    });
  });

  it("maps calendar health labels back to their event source", () => {
    expect(askEventSourceUnavailable("city-frederick", {
      degraded: true,
      unavailable: ["City of Frederick"],
    })).toBe(true);
    expect(askEventSourceUnavailable("dfp", {
      degraded: true,
      unavailable: ["municipal calendars"],
    })).toBe(true);
    expect(askEventSourceUnavailable("ticketmaster", {
      degraded: true,
      unavailable: ["municipal calendars"],
    })).toBe(false);
    expect(askEventSourceUnavailable("county", {
      degraded: true,
      unavailable: ["Frederick County Public Libraries"],
    })).toBe(false);
  });
});

describe("validAskAgentLead", () => {
  const evidence = [
    {
      slug: "gravel-and-grind",
      name: "Gravel & Grind",
      kind: "place" as const,
      eligibleAsLead: true,
    },
    {
      slug: "current-event",
      name: "Current Event",
      kind: "event" as const,
      eligibleAsLead: true,
    },
    {
      slug: "stale-event",
      name: "Stale Event",
      kind: "event" as const,
      eligibleAsLead: false,
    },
  ];

  it("accepts a cited place or eligible event declared as the lead", () => {
    expect(validAskAgentLead({
      leadSlug: "gravel-and-grind",
      answer: "Gravel & Grind is the strongest match.",
      selectedPlaceSlugs: ["gravel-and-grind"],
      selectedEventSlugs: [],
      evidence,
    })).toBe(true);
    expect(validAskAgentLead({
      leadSlug: "current-event",
      answer: "Current Event is the best move tonight.",
      selectedPlaceSlugs: [],
      selectedEventSlugs: ["current-event"],
      evidence,
    })).toBe(true);
  });

  it("rejects an event that the trust gate says cannot lead", () => {
    expect(validAskAgentLead({
      leadSlug: "stale-event",
      answer: "Stale Event is the best move tonight.",
      selectedPlaceSlugs: [],
      selectedEventSlugs: ["stale-event"],
      evidence,
    })).toBe(false);
  });

  it("rejects a missing, uncited, or contradictory lead declaration", () => {
    expect(validAskAgentLead({
      leadSlug: "not-returned",
      answer: "Not Returned is the best move tonight.",
      selectedPlaceSlugs: ["not-returned"],
      selectedEventSlugs: [],
      evidence,
    })).toBe(false);
    expect(validAskAgentLead({
      leadSlug: "current-event",
      answer: "Nothing in the current data is a safe recommendation.",
      selectedPlaceSlugs: [],
      selectedEventSlugs: ["current-event"],
      evidence,
    })).toBe(false);
    expect(validAskAgentLead({
      leadSlug: "current-event",
      answer: "Current Event is the best move tonight.",
      selectedPlaceSlugs: ["current-event"],
      selectedEventSlugs: [],
      evidence,
    })).toBe(false);
    expect(validAskAgentLead({
      leadSlug: null,
      answer: "Gravel & Grind is the strongest match.",
      selectedPlaceSlugs: [],
      selectedEventSlugs: [],
      evidence,
    })).toBe(false);
  });

  it("allows null only for an answer with no selected or cited entity", () => {
    expect(validAskAgentLead({
      leadSlug: null,
      answer: "The current data does not support a recommendation.",
      selectedPlaceSlugs: [],
      selectedEventSlugs: [],
      evidence,
    })).toBe(true);
  });
});
