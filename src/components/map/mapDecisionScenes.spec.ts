import { describe, expect, it } from "vitest";
import {
  availabilityFromOpenStatus,
  buildMapDecisionScene,
  buildMapPeekDecisionCue,
  buildMapPeekDecisionSurface,
  geometryIntersectsRouteCorridor,
  mapPeekDecisionTelemetry,
  mapDecisionEvidenceState,
  mapHoursEvidence,
  routeConsequencesForCandidate,
  type MapDecisionCandidate,
  type MapDecisionEvidence,
  type MapDecisionSignal,
} from "./mapDecisionScenes";

const NOW = "2026-08-03T16:00:00.000Z";
const ORIGIN = { lng: -77.4105, lat: 39.4143 };

function evidence(
  id: string,
  over: Partial<MapDecisionEvidence> = {},
): MapDecisionEvidence {
  return {
    id,
    sourceLabel: "Frederick Radius editorial record",
    sourceUrl: `/sources/${id}`,
    confidence: "curated",
    verified: true,
    basis: "static-record",
    ...over,
  };
}

function candidate(
  id: string,
  over: Partial<MapDecisionCandidate> = {},
): MapDecisionCandidate {
  return {
    id,
    kind: "place",
    title: id,
    location: ORIGIN,
    availability: { state: "unknown" },
    evidence: [evidence(`record:${id}`)],
    ...over,
  };
}

describe("map decision evidence", () => {
  it("keeps current, mapped, stale, and invalid source states separate", () => {
    expect(mapDecisionEvidenceState(evidence("static"), NOW)).toBe("current");
    expect(mapDecisionEvidenceState(evidence("osm", {
      confidence: "scraped",
      verified: false,
    }), NOW)).toBe("mapped");
    expect(mapDecisionEvidenceState(evidence("stale", {
      basis: "live-status",
      observedAt: "2026-08-03T14:00:00.000Z",
      freshUntil: "2026-08-03T15:00:00.000Z",
    }), NOW)).toBe("stale");
    expect(mapDecisionEvidenceState(evidence("missing-expiry", {
      basis: "live-status",
      observedAt: "2026-08-03T15:00:00.000Z",
    }), NOW)).toBe("invalid");
  });

  it("uses the explicit seven-day hours policy and does not confirm without a date", () => {
    const hours = mapHoursEvidence("hours:cafe", "2026-08-01T12:00:00.000Z");
    expect(hours?.freshUntil).toBe("2026-08-08T12:00:00.000Z");
    expect(availabilityFromOpenStatus(
      { state: "open", closesAt: "21:00", closingSoon: false },
      hours,
    )).toEqual({ state: "confirmed-open", evidenceId: "hours:cafe", until: "21:00" });
    expect(availabilityFromOpenStatus(
      { state: "open", closesAt: "21:00", closingSoon: false },
      null,
    )).toEqual({ state: "unknown" });
  });
});

describe("buildMapDecisionScene", () => {
  it("puts a confirmed-open nearby place ahead of a closer unknown listing", () => {
    const hours = evidence("hours:open", {
      sourceLabel: "Business hours feed",
      basis: "live-status",
      observedAt: "2026-08-03T15:00:00.000Z",
      freshUntil: "2026-08-04T15:00:00.000Z",
    });
    const scene = buildMapDecisionScene({
      now: NOW,
      intent: "go-now",
      origin: ORIGIN,
      candidates: [
        candidate("closer-unknown", { location: { lng: -77.4104, lat: 39.4143 } }),
        candidate("confirmed-open", {
          location: { lng: -77.414, lat: 39.4143 },
          availability: { state: "confirmed-open", evidenceId: hours.id, until: "21:00" },
          evidence: [evidence("record:open"), hours],
        }),
      ],
    });

    expect(scene.status).toBe("ready");
    if (scene.status !== "ready") return;
    expect(scene.lead.id).toBe("confirmed-open");
    expect(scene.lead.reasons[0].label).toBe("Confirmed open until 9pm");
    expect(scene.alternatives[0]).toMatchObject({
      id: "closer-unknown",
      availability: "unknown",
      confidence: "partial",
    });
    expect(scene.relevantOverlays).toEqual(["places"]);
    expect(scene.expiresAt).toBe("2026-08-04T15:00:00.000Z");
  });

  it("does not turn unknown hours into closed, or all closed candidates into none", () => {
    const hours = evidence("hours:closed", {
      basis: "live-status",
      observedAt: "2026-08-03T15:00:00.000Z",
      freshUntil: "2026-08-04T15:00:00.000Z",
    });
    const unknownScene = buildMapDecisionScene({
      now: NOW,
      intent: "go-now",
      candidates: [candidate("hours-unknown")],
    });
    expect(unknownScene.status).toBe("ready");
    if (unknownScene.status === "ready") {
      expect(unknownScene.lead.availability).toBe("unknown");
      expect(unknownScene.coverage).toBe("partial");
    }

    const closedScene = buildMapDecisionScene({
      now: NOW,
      intent: "go-now",
      candidates: [candidate("closed", {
        availability: { state: "confirmed-closed", evidenceId: hours.id },
        evidence: [evidence("record:closed"), hours],
      })],
    });
    expect(closedScene).toMatchObject({
      status: "insufficient",
      reason: "no-usable-candidates",
      rejections: [{ id: "closed", reason: "confirmed-closed" }],
    });
  });

  it("exposes only the overlays used by the lead decision", () => {
    const scene = buildMapDecisionScene({
      now: NOW,
      intent: "need-essential",
      candidates: [candidate("restroom", {
        kind: "amenity",
        availability: { state: "not-applicable" },
        overlays: ["amenity:restroom"],
        reasons: [{
          id: "mapped-restroom",
          label: "Nearest mapped public restroom",
          weight: 90,
          evidenceIds: ["record:restroom"],
          overlay: "amenity:restroom",
        }],
      })],
    });
    expect(scene.status).toBe("ready");
    if (scene.status === "ready") {
      expect(scene.relevantOverlays).toEqual(["amenity:restroom"]);
      expect(scene.relevantOverlays).not.toContain("parking");
      expect(scene.lead.reasons[0].label).toBe("Nearest mapped public restroom");
    }
  });
});

describe("route corridor consequences", () => {
  const route = [
    { lng: -77.4200, lat: 39.4143 },
    { lng: -77.4000, lat: 39.4143 },
  ];

  it("matches points and crossing paths without treating nearby county noise as relevant", () => {
    expect(geometryIntersectsRouteCorridor(route, {
      type: "point",
      point: { lng: -77.4100, lat: 39.4145 },
    }, 50)).toBe(true);
    expect(geometryIntersectsRouteCorridor(route, {
      type: "point",
      point: { lng: -77.4100, lat: 39.4200 },
    }, 50)).toBe(false);
    expect(geometryIntersectsRouteCorridor(route, {
      type: "path",
      path: [
        { lng: -77.4100, lat: 39.4100 },
        { lng: -77.4100, lat: 39.4200 },
      ],
    }, 0)).toBe(true);
    expect(geometryIntersectsRouteCorridor(route, {
      type: "path",
      path: [
        { lng: -77.3900, lat: 39.4143 },
        { lng: -77.3800, lat: 39.4143 },
      ],
    }, 0)).toBe(false);
  });

  it("uses a fresh route impact, rejects stale and off-route signals, and carries attribution", () => {
    const current = evidence("work-zone", {
      sourceLabel: "Maryland WZDx",
      sourceUrl: "https://example.test/work-zone",
      basis: "live-status",
      observedAt: "2026-08-03T15:45:00.000Z",
      freshUntil: "2026-08-03T17:00:00.000Z",
    });
    const stale = evidence("old-crash", {
      sourceLabel: "MDOT CHART",
      basis: "live-status",
      observedAt: "2026-08-03T12:00:00.000Z",
      freshUntil: "2026-08-03T13:00:00.000Z",
    });
    const signals: MapDecisionSignal[] = [
      {
        id: "work-zone",
        kind: "traffic",
        title: "East Patrick Street lane closure",
        severity: "caution",
        evidence: current,
        overlay: "traffic",
        geometry: { type: "point", point: { lng: -77.4100, lat: 39.4145 } },
        effect: "delay",
        delayMinutes: 8,
        actionLabel: "Use the signed detour",
      },
      {
        id: "old-crash",
        kind: "traffic",
        title: "Old report",
        severity: "severe",
        evidence: stale,
        overlay: "traffic",
        affectsCandidateIds: ["event"],
        effect: "avoid",
      },
      {
        id: "far-away",
        kind: "traffic",
        title: "Elsewhere in the county",
        severity: "caution",
        evidence: { ...current, id: "far-away" },
        overlay: "traffic",
        geometry: { type: "point", point: { lng: -77.60, lat: 39.60 } },
        effect: "note",
      },
    ];
    const result = routeConsequencesForCandidate({
      candidateId: "event",
      route: { candidateId: "event", mode: "drive", path: route, corridorMeters: 70 },
      signals,
      now: NOW,
    });

    expect(result.consequences).toEqual([
      expect.objectContaining({
        signalId: "work-zone",
        delayMinutes: 8,
        sourceLabel: "Maryland WZDx",
        sourceUrl: "https://example.test/work-zone",
      }),
    ]);
    expect(result.rejections).toEqual(expect.arrayContaining([
      { kind: "signal", id: "old-crash", reason: "stale" },
      { kind: "signal", id: "far-away", reason: "outside-route" },
    ]));
  });

  it("can move an affected choice below a credible unaffected alternative", () => {
    const signalEvidence = evidence("closure", {
      sourceLabel: "Maryland WZDx",
      basis: "live-status",
      observedAt: "2026-08-03T15:45:00.000Z",
      freshUntil: "2026-08-03T17:00:00.000Z",
    });
    const scene = buildMapDecisionScene({
      now: NOW,
      intent: "trip",
      candidates: [
        candidate("blocked", { kind: "parking", availability: { state: "not-applicable" }, priority: 10 }),
        candidate("clear", { kind: "parking", availability: { state: "not-applicable" } }),
      ],
      routes: [
        { candidateId: "blocked", mode: "drive", path: route },
        { candidateId: "clear", mode: "drive", path: [
          { lng: -77.50, lat: 39.50 },
          { lng: -77.49, lat: 39.50 },
        ] },
      ],
      signals: [{
        id: "closure",
        kind: "traffic",
        title: "Road closed",
        severity: "severe",
        evidence: signalEvidence,
        overlay: "traffic",
        geometry: { type: "point", point: { lng: -77.4100, lat: 39.4143 } },
        effect: "avoid",
      }],
    });

    expect(scene.status).toBe("ready");
    if (scene.status === "ready") {
      expect(scene.lead.id).toBe("clear");
      expect(scene.alternatives[0].id).toBe("blocked");
    }
  });
});

describe("selected-place decision cue", () => {
  it("keeps one lead and exposes no more than two ranked alternatives", () => {
    const surface = buildMapPeekDecisionSurface({
      place: { slug: "creek", deal_hook: "Half-price fries" },
      hostedEvent: {
        slug: "alive-at-five",
        title: "Alive @ Five",
        starts_at: "2026-08-03T21:00:00.000Z",
        venue_name: "Carroll Creek Amphitheater",
        lng: ORIGIN.lng,
        lat: ORIGIN.lat,
        category: "music",
        source_label: "Downtown Frederick Partnership",
        source_url: "https://downtownfrederick.org/aliveatfive/",
        source_confidence: "verified",
        source_verified: true,
        verified_at: "2026-08-03T15:45:00.000Z",
        verification_expires_at: "2026-08-04T15:45:00.000Z",
      },
      nearestGarage: { name: "Carroll Creek Garage", distM: 180 },
      nearbyUtilities: [{ label: "Restroom", distM: 90 }],
      now: NOW,
    });

    expect(surface).toMatchObject({
      lead: {
        candidateId: "peek:event:alive-at-five",
        kind: "event",
        detail: "Alive @ Five is listed here at 5:00 PM.",
        sourceLabel: "Downtown Frederick Partnership",
        sourceUrl: "https://downtownfrederick.org/aliveatfive/",
        sourceConfidence: "verified",
        sourceVerified: true,
        observedAt: "2026-08-03T15:45:00.000Z",
        reasonIds: [
          "event-here:alive-at-five",
          "timing:peek:event:alive-at-five",
        ],
      },
      alternatives: [
        {
          candidateId: "peek:utility:restroom",
          kind: "utility",
          detail: "The nearest mapped restroom is 295 ft away.",
        },
        {
          candidateId: "peek:parking:carroll creek garage",
          kind: "parking",
        },
      ],
      coverage: "confirmed",
      expiresAt: "2026-08-03T21:00:00.000Z",
    });
    expect(surface?.alternatives).toHaveLength(2);
  });

  it("puts a time-sensitive hosted event ahead of static nearby facts", () => {
    const cue = buildMapPeekDecisionCue({
      place: { slug: "creek", deal_hook: "Half-price fries" },
      hostedEvent: {
        slug: "alive-at-five",
        title: "Alive @ Five",
        starts_at: "2026-08-03T21:00:00.000Z",
        venue_name: "Carroll Creek Amphitheater",
        lng: ORIGIN.lng,
        lat: ORIGIN.lat,
        category: "music",
        source_label: "Downtown Frederick Partnership",
        source_url: "https://downtownfrederick.org/aliveatfive/",
        source_confidence: "verified",
        source_verified: true,
        verified_at: "2026-08-03T15:45:00.000Z",
        verification_expires_at: "2026-08-04T15:45:00.000Z",
      },
      nearestGarage: { name: "Carroll Creek Garage", distM: 180 },
      nearbyUtilities: [{ label: "Restroom", distM: 90 }],
      now: NOW,
    });
    expect(cue).toMatchObject({
      kind: "event",
      headline: "Alive @ Five · 5:00 PM",
      href: "/events/alive-at-five",
    });
    expect(cue).toMatchObject({
      sourceLabel: "Downtown Frederick Partnership",
      sourceUrl: "https://downtownfrederick.org/aliveatfive/",
      sourceConfidence: "verified",
      sourceVerified: true,
      observedAt: "2026-08-03T15:45:00.000Z",
    });
  });

  it("reduces outcome telemetry to stable candidate and reason ids", () => {
    const surface = buildMapPeekDecisionSurface({
      place: { slug: "creek", deal_hook: undefined },
      hostedEvent: {
        slug: "alive-at-five",
        title: "Alive @ Five",
        starts_at: "2026-08-03T21:00:00.000Z",
        venue_name: "Carroll Creek Amphitheater",
        lng: ORIGIN.lng,
        lat: ORIGIN.lat,
        category: "music",
        source_label: "Downtown Frederick Partnership",
        source_url: "https://downtownfrederick.org/aliveatfive/",
        source_confidence: "verified",
        source_verified: true,
        verified_at: "2026-08-03T15:45:00.000Z",
        verification_expires_at: "2026-08-04T15:45:00.000Z",
      },
      now: NOW,
    });

    expect(surface).not.toBeNull();
    expect(mapPeekDecisionTelemetry(surface!.lead)).toEqual({
      candidate_id: "peek:event:alive-at-five",
      candidate_kind: "event",
      reason_ids: "event-here:alive-at-five,timing:peek:event:alive-at-five",
    });
    expect(Object.keys(mapPeekDecisionTelemetry(surface!.lead))).toEqual([
      "candidate_id",
      "candidate_kind",
      "reason_ids",
    ]);
  });

  it("never promotes stale hosted-event evidence into the map decision", () => {
    const surface = buildMapPeekDecisionSurface({
      place: { slug: "creek", deal_hook: undefined },
      hostedEvent: {
        slug: "old-listing",
        title: "Old listing",
        starts_at: "2026-08-03T21:00:00.000Z",
        venue_name: "Carroll Creek Amphitheater",
        lng: ORIGIN.lng,
        lat: ORIGIN.lat,
        category: "music",
        source_label: "Example publisher",
        source_url: "https://example.test/event",
        source_confidence: "verified",
        source_verified: false,
        verified_at: "2026-08-02T15:00:00.000Z",
        verification_expires_at: "2026-08-03T15:00:00.000Z",
      },
      now: NOW,
    });

    expect(surface).toBeNull();
  });

  it("rejects expired schedule evidence even when a caller marks it verified", () => {
    const surface = buildMapPeekDecisionSurface({
      place: { slug: "creek", deal_hook: undefined },
      hostedEvent: {
        slug: "expired-listing",
        title: "Expired listing",
        starts_at: "2026-08-03T21:00:00.000Z",
        venue_name: "Carroll Creek Amphitheater",
        lng: ORIGIN.lng,
        lat: ORIGIN.lat,
        category: "music",
        source_label: "Example publisher",
        source_url: "https://example.test/event",
        source_confidence: "verified",
        source_verified: true,
        verified_at: "2026-08-02T15:00:00.000Z",
        verification_expires_at: "2026-08-03T15:00:00.000Z",
      },
      now: NOW,
    });

    expect(surface).toBeNull();
  });

  it("never promotes an unverified event with no check time", () => {
    const surface = buildMapPeekDecisionSurface({
      place: { slug: "creek", deal_hook: undefined },
      hostedEvent: {
        slug: "undated-source",
        title: "Undated source",
        starts_at: "2026-08-03T21:00:00.000Z",
        venue_name: "Carroll Creek Amphitheater",
        lng: ORIGIN.lng,
        lat: ORIGIN.lat,
        category: "music",
        source_label: "Example publisher",
        source_url: "https://example.test/event",
        source_confidence: "verified",
        source_verified: false,
      },
      now: NOW,
    });

    expect(surface).toBeNull();
  });

  it("promotes a hosted event only while its verified schedule evidence is current", () => {
    const surface = buildMapPeekDecisionSurface({
      place: { slug: "creek", deal_hook: undefined },
      hostedEvent: {
        slug: "current-listing",
        title: "Current listing",
        starts_at: "2026-08-03T21:00:00.000Z",
        venue_name: "Carroll Creek Amphitheater",
        lng: ORIGIN.lng,
        lat: ORIGIN.lat,
        category: "music",
        source_label: "Example publisher",
        source_url: "https://example.test/event",
        source_confidence: "verified",
        source_verified: true,
        verified_at: "2026-08-03T15:00:00.000Z",
        verification_expires_at: "2026-08-04T15:00:00.000Z",
      },
      now: NOW,
    });

    expect(surface).toMatchObject({
      lead: {
        candidateId: "peek:event:current-listing",
        kind: "event",
        sourceVerified: true,
      },
      coverage: "confirmed",
    });
  });

  it("keeps a verified event underway and labels it as happening now", () => {
    const surface = buildMapPeekDecisionSurface({
      place: { slug: "creek", deal_hook: undefined },
      hostedEvent: {
        slug: "current-session",
        title: "Current session",
        starts_at: "2026-08-03T15:30:00.000Z",
        ends_at: "2026-08-03T17:00:00.000Z",
        venue_name: "Carroll Creek Amphitheater",
        lng: ORIGIN.lng,
        lat: ORIGIN.lat,
        category: "music",
        source_label: "Example publisher",
        source_url: "https://example.test/event",
        source_confidence: "verified",
        source_verified: true,
        verified_at: "2026-08-03T15:00:00.000Z",
        verification_expires_at: "2026-08-04T15:00:00.000Z",
      },
      now: NOW,
    });

    expect(surface).toMatchObject({
      lead: {
        candidateId: "peek:event:current-session",
        eventState: "happening-now",
        headline: "Current session · Happening now",
        detail: "Current session is currently listed here.",
        reasonIds: ["event-here:current-session"],
      },
      coverage: "confirmed",
      expiresAt: "2026-08-03T17:00:00.000Z",
    });
  });

  it.each([
    { label: "missing", ends_at: undefined },
    { label: "equal-to-start", ends_at: "2026-08-03T13:15:00.000Z" },
    { label: "end-of-day sentinel", ends_at: "2026-08-04T03:59:00.000Z" },
  ])("does not turn a started event with a $label end into a happening-now cue", ({ ends_at }) => {
    const surface = buildMapPeekDecisionSurface({
      place: { slug: "creek", deal_hook: undefined },
      hostedEvent: {
        slug: "uncertain-session",
        title: "Uncertain session",
        starts_at: "2026-08-03T13:15:00.000Z",
        ends_at,
        venue_name: "Carroll Creek Amphitheater",
        lng: ORIGIN.lng,
        lat: ORIGIN.lat,
        category: "music",
        source_label: "Example publisher",
        source_url: "https://example.test/event",
        source_confidence: "verified",
        source_verified: true,
        verified_at: "2026-08-03T15:00:00.000Z",
        verification_expires_at: "2026-08-04T15:00:00.000Z",
      },
      nearestGarage: { name: "Carroll Creek Garage", distM: 180 },
      now: NOW,
    });

    expect(surface?.lead.kind).toBe("parking");
    expect(
      [surface?.lead, ...(surface?.alternatives ?? [])].some(
        (item) => item?.eventState === "happening-now",
      ),
    ).toBe(false);
  });

  it("uses nearest mapped wording and never claims an unmapped utility does not exist", () => {
    const cue = buildMapPeekDecisionCue({
      place: { slug: "park", deal_hook: undefined },
      nearbyUtilities: [{ label: "Water", distM: 122 }],
      nearestGarage: { name: "Court Street Garage", distM: 400 },
      now: NOW,
    });
    expect(cue).toMatchObject({
      kind: "utility",
      detail: expect.stringContaining("nearest mapped water"),
    });
    expect(cue?.detail).not.toContain("only");
  });

  it("does not surface an event whose listed start has passed", () => {
    const surface = buildMapPeekDecisionSurface({
      place: { slug: "creek", deal_hook: "Half-price fries" },
      hostedEvent: {
        slug: "finished-set",
        title: "Finished set",
        starts_at: "2026-08-03T15:30:00.000Z",
        venue_name: "Carroll Creek Amphitheater",
        lng: ORIGIN.lng,
        lat: ORIGIN.lat,
        category: "music",
      },
      nearestGarage: { name: "Carroll Creek Garage", distM: 180 },
      now: NOW,
    });

    expect(surface?.lead).toMatchObject({
      candidateId: "peek:parking:carroll creek garage",
      kind: "parking",
      detail: expect.stringContaining("is mapped"),
      sourceLabel: "City of Frederick parking map",
    });
    expect(surface?.alternatives).toEqual([]);
    expect(surface?.alternatives.some((item) => item.kind === "event")).toBe(false);
    expect([
      surface?.lead.candidateId,
      ...(surface?.alternatives.map((item) => item.candidateId) ?? []),
    ].some((id) => id?.startsWith("peek:special:"))).toBe(false);
  });

  it("never turns a static deal hook into a map decision without schedule evidence", () => {
    const surface = buildMapPeekDecisionSurface({
      place: { slug: "brewers-alley", deal_hook: "Half-price fries" },
      nearestGarage: { name: "Church Street Garage", distM: 72 },
      nearbyUtilities: [{ label: "Transit stop", distM: 98 }],
      now: NOW,
    });

    expect(surface?.lead.kind).toBe("utility");
    expect(surface?.alternatives).toEqual([
      expect.objectContaining({ kind: "parking" }),
    ]);
    expect([
      surface?.lead.candidateId,
      ...(surface?.alternatives.map((item) => item.candidateId) ?? []),
    ].some((id) => id?.startsWith("peek:special:"))).toBe(false);
  });

  it("returns no decision when a static deal hook is the only available fact", () => {
    expect(buildMapPeekDecisionSurface({
      place: { slug: "creek", deal_hook: "Half-price fries" },
      now: NOW,
    })).toBeNull();
  });
});
