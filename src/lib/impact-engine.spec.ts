import { describe, expect, it } from "vitest";
import {
  buildImpactActionCard,
  impactPrimaryFromEvent,
  type ImpactEngineInput,
  type ImpactEngineResult,
  type ImpactEvidence,
} from "./impact-engine";

const NOW = "2026-07-16T20:00:00.000Z"; // 4:00 PM EDT
const START = "2026-07-16T22:30:00.000Z"; // 6:30 PM EDT
const END = "2026-07-17T00:00:00.000Z";

function evidence(
  sourceLabel: string,
  over: Partial<ImpactEvidence> = {},
): ImpactEvidence {
  return {
    sourceLabel,
    sourceUrl: `https://example.com/${sourceLabel.toLowerCase().replace(/\s+/g, "-")}`,
    observedAt: "2026-07-16T19:55:00.000Z",
    freshUntil: "2026-07-16T20:30:00.000Z",
    confidence: "verified",
    verified: true,
    ...over,
  };
}

function base(over: Partial<ImpactEngineInput> = {}): ImpactEngineInput {
  return {
    now: NOW,
    primary: {
      id: "alive-at-five",
      title: "Alive @ Five",
      startsAt: START,
      endsAt: END,
      status: "scheduled",
      venueName: "Carroll Creek Amphitheater",
      href: "/events/alive-at-five",
      evidence: evidence("Downtown Frederick", {
        confidence: "partner",
        freshUntil: "2026-07-17T01:00:00.000Z",
      }),
    },
    ...over,
  };
}

function ready(result: ImpactEngineResult) {
  expect(result.status).toBe("ready");
  if (result.status !== "ready") throw new Error(`expected ready, got ${result.reason}`);
  return result;
}

describe("buildImpactActionCard planning", () => {
  it("combines weather, travel, parking, and an indoor backup into one concise plan", () => {
    const result = ready(
      buildImpactActionCard(
        base({
          signals: [
            {
              id: "rain-1830",
              kind: "weather",
              condition: "rain",
              probabilityPercent: 80,
              startsAt: "2026-07-16T22:00:00.000Z",
              endsAt: "2026-07-16T23:30:00.000Z",
              evidence: evidence("National Weather Service"),
            },
          ],
          travel: {
            mode: "drive",
            durationMinutes: 28,
            arriveEarlyMinutes: 10,
            evidence: evidence("Google Routes"),
          },
          parking: {
            id: "carroll-creek-deck",
            name: "Carroll Creek Parking Deck",
            status: "available",
            evidence: evidence("Park Frederick"),
          },
          nearbyAlternatives: [
            {
              id: "unknown-hours",
              title: "A closer place with unknown hours",
              indoor: true,
              travelMinutes: 1,
              availability: "unknown",
              evidence: evidence("Places directory"),
            },
            {
              id: "indoor-art",
              title: "Delaplaine Arts Center",
              indoor: true,
              travelMinutes: 4,
              availability: "available",
              href: "/places/delaplaine",
              evidence: evidence("Radius editorial"),
            },
            {
              id: "outdoor-park",
              title: "Baker Park",
              indoor: false,
              travelMinutes: 2,
              availability: "available",
              evidence: evidence("City of Frederick"),
            },
          ],
        }),
      ),
    );

    expect(result.card.whatChanged).toBe("80% chance of rain during Alive @ Five.");
    expect(result.card.whyItMatters).toContain("Also: Driving takes about 28 minutes.");
    expect(result.card.nextAction.label).toBe(
      "Bring rain gear and recheck the event status before leaving. Leave by 5:52 PM.",
    );
    expect(result.card.leaveAt).toBe("2026-07-16T21:52:00.000Z");
    expect(result.card.backup).toEqual({
      kind: "nearby",
      itemId: "indoor-art",
      label: "Indoor backup: Delaplaine Arts Center.",
      href: "/places/delaplaine",
    });
    expect(result.card.facts.map((fact) => fact.kind)).toEqual([
      "weather",
      "travel",
      "parking",
    ]);
    expect(result.card.sources.map((source) => source.label)).toEqual([
      "Downtown Frederick",
      "National Weather Service",
      "Google Routes",
      "Park Frederick",
      "Radius editorial",
    ]);
    expect(result.card.confidence).toBe("medium");
    expect(result.rejections).toContainEqual({
      input: "nearby-alternative",
      id: "unknown-hours",
      reason: "not-actionable",
    });
  });

  it("prioritizes an official severe alert and withholds conflicting travel guidance", () => {
    const result = ready(
      buildImpactActionCard(
        base({
          signals: [
            {
              id: "storm-watch",
              kind: "weather",
              condition: "thunderstorm",
              probabilityPercent: 90,
              startsAt: "2026-07-16T22:00:00.000Z",
              endsAt: "2026-07-17T01:00:00.000Z",
              evidence: evidence("NWS forecast"),
            },
            {
              id: "warning",
              kind: "alert",
              headline: "Severe Thunderstorm Warning",
              severity: "severe",
              startsAt: "2026-07-16T22:00:00.000Z",
              endsAt: "2026-07-16T23:00:00.000Z",
              evidence: evidence("NWS alerts"),
            },
          ],
          travel: {
            mode: "drive",
            durationMinutes: 20,
            evidence: evidence("Routes"),
          },
          parking: {
            id: "deck",
            name: "Carroll Creek Deck",
            status: "available",
            evidence: evidence("Parking feed"),
          },
          nearbyAlternatives: [
            {
              id: "cafe",
              title: "Nearby Cafe",
              indoor: true,
              availability: "available",
              evidence: evidence("Places"),
            },
          ],
        }),
      ),
    );

    expect(result.card.whatChanged).toBe(
      "Severe Thunderstorm Warning overlaps Alive @ Five.",
    );
    expect(result.card.nextAction.label).toBe(
      "Follow the official alert guidance before traveling.",
    );
    expect(result.card.leaveAt).toBeNull();
    expect(result.card.backup).toBeNull();
    expect(result.card.facts.map((fact) => fact.kind)).toEqual(["alert", "weather"]);
    expect(result.card.sources.map((source) => source.label)).not.toContain("Routes");
    expect(result.card.sources.map((source) => source.label)).not.toContain("Parking feed");
  });

  it("uses a verified parking alternative when the planned garage is full", () => {
    const result = ready(
      buildImpactActionCard(
        base({
          parking: {
            id: "carroll",
            name: "Carroll Creek Deck",
            status: "full",
            evidence: evidence("Park Frederick"),
            alternatives: [
              {
                id: "court",
                name: "Court Street Garage",
                status: "unknown",
                walkMinutes: 2,
              },
              {
                id: "church",
                name: "Church Street Garage",
                status: "available",
                walkMinutes: 8,
                href: "/places/church-street-garage",
              },
              {
                id: "stale",
                name: "Stale Garage",
                status: "available",
                walkMinutes: 1,
                evidence: evidence("Old parking snapshot", {
                  freshUntil: "2026-07-16T19:59:00.000Z",
                }),
              },
            ],
          },
        }),
      ),
    );

    expect(result.card.whatChanged).toBe("Carroll Creek Deck is full.");
    expect(result.card.nextAction).toEqual({
      label: "Use Church Street Garage instead.",
      href: "/places/church-street-garage",
    });
    expect(result.card.backup?.label).toBe(
      "Church Street Garage has reported availability.",
    );
    expect(result.rejections).toContainEqual({
      input: "parking",
      id: "stale",
      reason: "stale",
    });
  });

  it("keeps prediction-only parking honest", () => {
    const result = ready(
      buildImpactActionCard(
        base({
          parking: {
            id: "carroll",
            name: "Carroll Creek Deck",
            status: "recommended",
            evidence: evidence("Radius parking model", { confidence: "curated" }),
          },
        }),
      ),
    );

    expect(result.card.whatChanged).toBe(
      "Carroll Creek Deck is the suggested parking option.",
    );
    expect(result.card.whatChanged).not.toMatch(/available|open|spaces/i);
  });

  it("is deterministic for identical inputs", () => {
    const input = base({
      travel: {
        mode: "walk",
        durationMinutes: 15,
        arriveEarlyMinutes: 5,
        evidence: evidence("Routes"),
      },
    });
    expect(buildImpactActionCard(input)).toEqual(buildImpactActionCard(input));
  });
});

describe("buildImpactActionCard trust and relevance gates", () => {
  it("drops stale and unverified signals without letting them shape a trusted travel card", () => {
    const result = ready(
      buildImpactActionCard(
        base({
          signals: [
            {
              id: "stale-rain",
              kind: "weather",
              condition: "rain",
              probabilityPercent: 100,
              startsAt: "2026-07-16T22:00:00.000Z",
              endsAt: "2026-07-16T23:00:00.000Z",
              evidence: evidence("Old forecast", {
                freshUntil: "2026-07-16T19:59:00.000Z",
              }),
            },
            {
              id: "rumored-closure",
              kind: "closure",
              name: "Market Street",
              target: "route",
              status: "closed",
              startsAt: "2026-07-16T21:00:00.000Z",
              endsAt: "2026-07-17T01:00:00.000Z",
              evidence: evidence("Social post", {
                confidence: "unverified",
                verified: false,
              }),
            },
          ],
          travel: {
            mode: "walk",
            durationMinutes: 28,
            arriveEarlyMinutes: 10,
            evidence: evidence("Routes"),
          },
        }),
      ),
    );

    expect(result.card.whatChanged).toBe("Walking takes about 28 minutes.");
    expect(result.card.sources.map((source) => source.label)).toEqual([
      "Downtown Frederick",
      "Routes",
    ]);
    expect(result.rejections).toEqual([
      { input: "signal", id: "stale-rain", reason: "stale" },
      { input: "signal", id: "rumored-closure", reason: "unverified" },
    ]);
  });

  it("suppresses output when every optional fact fails closed", () => {
    const result = buildImpactActionCard(
      base({
        signals: [
          {
            id: "stale-rain",
            kind: "weather",
            condition: "rain",
            probabilityPercent: 80,
            startsAt: "2026-07-16T22:00:00.000Z",
            endsAt: "2026-07-16T23:00:00.000Z",
            evidence: evidence("Old forecast", {
              freshUntil: "2026-07-16T19:59:00.000Z",
            }),
          },
        ],
      }),
    );

    expect(result).toEqual({
      status: "suppressed",
      reason: "no-actionable-facts",
      rejections: [{ input: "signal", id: "stale-rain", reason: "stale" }],
    });
  });

  it("suppresses the whole card for stale or unverified primary facts", () => {
    const stale = buildImpactActionCard(
      base({
        primary: {
          ...base().primary,
          evidence: evidence("Organizer", {
            freshUntil: "2026-07-16T19:59:00.000Z",
          }),
        },
      }),
    );
    expect(stale).toEqual({
      status: "suppressed",
      reason: "primary-stale",
      rejections: [],
    });

    const unverified = buildImpactActionCard(
      base({
        primary: {
          ...base().primary,
          evidence: evidence("Rumor", { verified: false }),
        },
      }),
    );
    expect(unverified).toEqual({
      status: "suppressed",
      reason: "primary-unverified",
      rejections: [],
    });
  });

  it("rejects signals outside the primary window and low-probability weather", () => {
    const result = buildImpactActionCard(
      base({
        signals: [
          {
            id: "early-fog",
            kind: "weather",
            condition: "fog",
            startsAt: "2026-07-16T20:10:00.000Z",
            endsAt: "2026-07-16T21:00:00.000Z",
            evidence: evidence("NWS"),
          },
          {
            id: "small-rain-risk",
            kind: "weather",
            condition: "rain",
            probabilityPercent: 20,
            startsAt: "2026-07-16T22:00:00.000Z",
            endsAt: "2026-07-16T23:00:00.000Z",
            evidence: evidence("NWS"),
          },
        ],
      }),
    );

    expect(result).toEqual({
      status: "suppressed",
      reason: "no-actionable-facts",
      rejections: [
        { input: "signal", id: "early-fog", reason: "irrelevant" },
        { input: "signal", id: "small-rain-risk", reason: "not-actionable" },
      ],
    });
  });

  it("matches route closures against the trusted leave-to-arrival window", () => {
    const result = ready(
      buildImpactActionCard(
        base({
          signals: [
            {
              id: "market-street",
              kind: "closure",
              name: "Market Street",
              target: "route",
              status: "closed",
              startsAt: "2026-07-16T21:45:00.000Z",
              endsAt: "2026-07-16T22:10:00.000Z",
              detour: "Use East Street to reach the garage",
              evidence: evidence("City traffic notice"),
            },
          ],
          travel: {
            mode: "drive",
            durationMinutes: 30,
            evidence: evidence("Routes"),
          },
        }),
      ),
    );

    // The closure ends before the 6:30 event, but overlaps the 6:00 departure.
    expect(result.card.whatChanged).toBe(
      "Market Street is closed during your trip to Alive @ Five.",
    );
    expect(result.card.nextAction.label).toBe(
      "Use the published detour and allow extra time. Leave by 6:00 PM.",
    );
    expect(result.card.backup?.label).toBe("Use East Street to reach the garage.");
  });

  it("does not assume an event with no end time is still active after it starts", () => {
    const result = buildImpactActionCard(
      base({
        now: "2026-07-16T22:31:00.000Z",
        primary: {
          ...base().primary,
          endsAt: null,
          evidence: evidence("Organizer", {
            observedAt: "2026-07-16T22:00:00.000Z",
            freshUntil: "2026-07-16T23:00:00.000Z",
          }),
        },
      }),
    );
    expect(result).toEqual({
      status: "suppressed",
      reason: "primary-ended",
      rejections: [],
    });
  });

  it("lets a cancellation lead and removes all leave-now advice", () => {
    const result = ready(
      buildImpactActionCard(
        base({
          primary: { ...base().primary, status: "cancelled" },
          travel: {
            mode: "drive",
            durationMinutes: 20,
            evidence: evidence("Routes"),
          },
          nearbyAlternatives: [
            {
              id: "museum",
              title: "A local museum",
              indoor: true,
              availability: "available",
              evidence: evidence("Radius editorial"),
            },
          ],
        }),
      ),
    );

    expect(result.card.whatChanged).toBe("Alive @ Five is cancelled.");
    expect(result.card.nextAction.label).toMatch(/^Do not make the trip/);
    expect(result.card.leaveAt).toBeNull();
    expect(result.card.facts.map((fact) => fact.kind)).toEqual(["status"]);
    expect(result.card.sources.map((source) => source.label)).not.toContain("Routes");
    expect(result.card.backup?.label).toBe("Indoor backup: A local museum.");
  });

  it("fails closed when a separate cancellation notice is stale", () => {
    const result = buildImpactActionCard(
      base({
        primary: {
          ...base().primary,
          status: "cancelled",
          statusEvidence: evidence("Owner cancellation notice", {
            freshUntil: "2026-07-16T19:59:00.000Z",
          }),
        },
        travel: {
          mode: "drive",
          durationMinutes: 20,
          evidence: evidence("Routes"),
        },
      }),
    );

    expect(result).toEqual({
      status: "suppressed",
      reason: "status-stale",
      rejections: [],
    });
  });

  it("attributes a fresh owner cancellation to that notice, not the older event row", () => {
    const result = ready(
      buildImpactActionCard(
        base({
          primary: {
            ...base().primary,
            status: "cancelled",
            statusEvidence: evidence("Owner cancellation notice", {
              sourceUrl: "https://organizer.example/cancelled",
            }),
          },
        }),
      ),
    );

    expect(result.card.nextAction.href).toBe("https://organizer.example/cancelled");
    expect(result.card.sources.map((source) => source.label)).toEqual([
      "Downtown Frederick",
      "Owner cancellation notice",
    ]);
  });
});

describe("impactPrimaryFromEvent", () => {
  it("maps the existing Event fields without inventing verification or freshness", () => {
    const primary = impactPrimaryFromEvent(
      {
        slug: "event-1",
        title: "Community Concert",
        starts_at: START,
        ends_at: END,
        status: undefined,
        venue_name: "Baker Park",
        source_url: "https://organizer.example/event",
        is_verified: false,
        last_verified_at: undefined,
      },
      {
        sourceLabel: "Organizer",
        confidence: "partner",
        freshUntil: "2026-07-17T00:00:00.000Z",
        href: "/events/event-1",
      },
    );

    expect(primary).toMatchObject({
      id: "event-1",
      startsAt: START,
      endsAt: END,
      status: "scheduled",
      href: "/events/event-1",
      evidence: {
        verified: false,
        observedAt: "",
        sourceUrl: "https://organizer.example/event",
      },
    });
    expect(buildImpactActionCard({ now: NOW, primary })).toEqual({
      status: "suppressed",
      reason: "primary-unverified",
      rejections: [],
    });
  });

  it("accepts an explicit provenance-backed verification for legacy live rows", () => {
    const primary = impactPrimaryFromEvent(
      {
        slug: "partner-event",
        title: "Partner Event",
        starts_at: START,
        ends_at: END,
        status: undefined,
        venue_name: "Downtown",
        source_url: "https://partner.example/event",
        is_verified: false,
        last_verified_at: "2026-07-16T19:55:00.000Z",
      },
      {
        sourceLabel: "Official partner feed",
        confidence: "partner",
        verified: true,
        freshUntil: "2026-07-16T21:00:00.000Z",
      },
    );

    expect(primary.evidence.verified).toBe(true);
    const result = ready(
      buildImpactActionCard({
        now: NOW,
        primary,
        travel: {
          mode: "walk",
          durationMinutes: 10,
          evidence: evidence("Routes"),
        },
      }),
    );
    expect(result.card.sources[0].label).toBe("Official partner feed");
  });
});
