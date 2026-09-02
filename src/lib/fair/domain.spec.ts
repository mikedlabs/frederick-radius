import { describe, expect, it } from "vitest";

import { greatFrederickFair2026 } from "@/data/fair/great-frederick-fair-2026";
import {
  fairManifestSchema,
  parseFairManifest,
  type FairManifest,
} from "@/lib/fair/domain";

function cloneManifest(): FairManifest {
  return structuredClone(greatFrederickFair2026);
}

function allEntities(manifest: FairManifest) {
  return [
    ...manifest.days,
    ...manifest.admissionTiers,
    ...manifest.scheduleItems,
    ...manifest.zones,
    ...manifest.vendors,
    ...manifest.facilities,
    ...manifest.accessFacts,
    ...manifest.lots,
  ];
}

describe("Great Frederick Fair domain", () => {
  it("loads the bounded 2026 manifest with stable day ids", () => {
    expect(parseFairManifest(greatFrederickFair2026)).toEqual(
      greatFrederickFair2026,
    );
    expect(greatFrederickFair2026.id).toBe("great-frederick-fair-2026");
    expect(greatFrederickFair2026.timezone).toBe("America/New_York");
    expect(greatFrederickFair2026.days.map((day) => day.id)).toEqual([
      "day-2026-09-18",
      "day-2026-09-19",
      "day-2026-09-20",
      "day-2026-09-21",
      "day-2026-09-22",
      "day-2026-09-23",
      "day-2026-09-24",
      "day-2026-09-25",
      "day-2026-09-26",
    ]);
    expect(greatFrederickFair2026.scheduleItems).toEqual([]);
    expect(greatFrederickFair2026.zones).toEqual([]);
    expect(greatFrederickFair2026.vendors).toEqual([]);
  });

  it("keeps every seeded fact source-attributed with offset timestamps", () => {
    const provenance = [
      ...greatFrederickFair2026.provenance,
      ...allEntities(greatFrederickFair2026).flatMap(
        (entity) => entity.provenance,
      ),
    ];

    expect(provenance.length).toBeGreaterThan(0);
    for (const source of provenance) {
      expect(source.publisher).toBe("The Great Frederick Fair");
      expect(source.sourceUrl).toMatch(/^https:\/\/thegreatfrederickfair\.com\//);
      expect(source.verifiedAt).toMatch(
        /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?(?:Z|[+-]\d{2}:\d{2})$/,
      );
    }
  });

  it("represents missing accessibility knowledge explicitly", () => {
    const sensorySpace = greatFrederickFair2026.accessFacts.find(
      (fact) => fact.id === "access-sensory-space",
    );
    expect(sensorySpace?.state.status).toBe("unknown");
    if (sensorySpace?.state.status !== "unknown") {
      throw new Error("expected the sensory-space fact to remain unknown");
    }
    expect(sensorySpace.state.reason).toContain("do not identify");
  });

  it("preserves the reviewed accessible arrival and mobility facts", () => {
    const dropOff = greatFrederickFair2026.accessFacts.find(
      (fact) => fact.id === "access-accessible-drop-off",
    );
    const shuttle = greatFrederickFair2026.accessFacts.find(
      (fact) => fact.id === "access-accessible-shuttle",
    );
    const rental = greatFrederickFair2026.accessFacts.find(
      (fact) => fact.id === "access-mobility-rental",
    );

    expect(dropOff?.state).toMatchObject({
      status: "known",
      value: expect.stringContaining("Gate 4A"),
    });
    expect(shuttle?.state).toMatchObject({
      status: "known",
      value: expect.stringContaining("Lot D"),
    });
    expect(rental?.state).toMatchObject({
      status: "known",
      value: expect.stringContaining("manual wheelchairs"),
    });
  });

  it("preserves the reviewed admission and parking amounts", () => {
    const adults = greatFrederickFair2026.admissionTiers.find(
      (tier) => tier.id === "admission-adults-11-plus",
    );
    expect(adults?.prices).toEqual([
      { channel: "online", amountCents: 1_000, currency: "USD" },
      { channel: "gate", amountCents: 1_500, currency: "USD" },
    ]);

    const infield = greatFrederickFair2026.lots.find(
      (lot) => lot.id === "lot-infield",
    );
    expect(infield?.vehicleRate).toEqual({
      status: "known",
      amountCents: 1_500,
      currency: "USD",
    });
    expect(
      greatFrederickFair2026.lots
        .filter((lot) => /^lot-[a-d]$/.test(lot.id))
        .map((lot) => lot.vehicleRate),
    ).toEqual(
      Array.from({ length: 4 }, () => ({
        status: "known",
        amountCents: 1_000,
        currency: "USD",
      })),
    );
  });

  it("rejects unstable and duplicate ids across collections", () => {
    const unstable = cloneManifest();
    unstable.days[0].id = "opening-day";
    expect(fairManifestSchema.safeParse(unstable).success).toBe(false);

    const duplicate = cloneManifest();
    duplicate.facilities[0].id = duplicate.days[0].id;
    const result = fairManifestSchema.safeParse(duplicate);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.some((issue) => issue.message.includes("duplicate"))).toBe(
        true,
      );
    }
  });

  it("rejects missing attribution, insecure sources, and ambiguous timestamps", () => {
    const missing = cloneManifest();
    missing.facilities[0].provenance = [];
    expect(fairManifestSchema.safeParse(missing).success).toBe(false);

    const insecure = cloneManifest();
    insecure.provenance[0].sourceUrl = "http://thegreatfrederickfair.com/";
    expect(fairManifestSchema.safeParse(insecure).success).toBe(false);

    const ambiguous = cloneManifest();
    ambiguous.updatedAt = "2026-09-01T18:40:08";
    expect(fairManifestSchema.safeParse(ambiguous).success).toBe(false);

    const newerThanManifest = cloneManifest();
    newerThanManifest.provenance[0].verifiedAt = "2026-09-02T00:00:00Z";
    expect(fairManifestSchema.safeParse(newerThanManifest).success).toBe(false);
  });

  it("rejects malformed offset timestamps that Date.parse normalizes", () => {
    for (const value of [
      "2026-09-31T18:40:08-04:00",
      "2026-09-01T24:00:00-04:00",
    ]) {
      expect(Number.isNaN(Date.parse(value))).toBe(false);
      const manifest = cloneManifest();
      manifest.updatedAt = value;
      const result = fairManifestSchema.safeParse(manifest);
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(
          result.error.issues.some(
            (issue) =>
              issue.path.join(".") === "updatedAt" &&
              issue.message === "must be a real timestamp",
          ),
        ).toBe(true);
      }
    }
  });

  it("requires a complete chronological Fair-day range", () => {
    const missingDay = cloneManifest();
    missingDay.days.splice(4, 1);
    expect(fairManifestSchema.safeParse(missingDay).success).toBe(false);

    const wrongOrder = cloneManifest();
    [wrongOrder.days[0], wrongOrder.days[1]] = [
      wrongOrder.days[1],
      wrongOrder.days[0],
    ];
    expect(fairManifestSchema.safeParse(wrongOrder).success).toBe(false);
  });

  it("allows gate closing on the immediately following local date only", () => {
    const overnight = cloneManifest();
    const firstDayGateHours = overnight.days[0].gateHours;
    if (firstDayGateHours.status !== "known") {
      throw new Error("expected known gate hours in the test fixture");
    }
    firstDayGateHours.closesAt = "2026-09-19T00:30:00-04:00";
    expect(fairManifestSchema.safeParse(overnight).success).toBe(true);

    const twoDatesLater = cloneManifest();
    const tooLateGateHours = twoDatesLater.days[0].gateHours;
    if (tooLateGateHours.status !== "known") {
      throw new Error("expected known gate hours in the test fixture");
    }
    tooLateGateHours.closesAt = "2026-09-20T00:30:00-04:00";
    expect(fairManifestSchema.safeParse(twoDatesLater).success).toBe(false);
  });

  it("validates schedule items against New York day boundaries and zone ids", () => {
    const valid = cloneManifest();
    valid.zones.push({
      id: "zone-grandstand",
      name: "Grandstand",
      kind: "stage",
      location: {
        status: "known",
        description: "The Grandstand on the fairgrounds.",
        coordinates: {
          status: "unknown",
          reason: "No precise coordinates have been reviewed for this Fair entity.",
        },
      },
      provenance: [valid.provenance[0]],
    });
    valid.scheduleItems.push({
      id: "schedule-opening-example",
      title: "Validated schedule example",
      dayId: "day-2026-09-18",
      timing: {
        kind: "exact",
        startsAt: "2026-09-18T19:00:00-04:00",
        endsAt: "2026-09-18T20:00:00-04:00",
      },
      kind: "other",
      status: "scheduled",
      zoneId: { status: "known", value: "zone-grandstand" },
      provenance: [valid.provenance[0]],
    });
    expect(fairManifestSchema.safeParse(valid).success).toBe(true);

    const wrongLocalDay = structuredClone(valid);
    const wrongTiming = wrongLocalDay.scheduleItems[0].timing;
    if (wrongTiming.kind !== "exact") {
      throw new Error("expected exact timing in the test fixture");
    }
    wrongTiming.startsAt = "2026-09-18T23:30:00-07:00";
    expect(fairManifestSchema.safeParse(wrongLocalDay).success).toBe(false);

    const unknownZone = structuredClone(valid);
    unknownZone.scheduleItems[0].zoneId = {
      status: "known",
      value: "zone-not-reviewed",
    };
    expect(fairManifestSchema.safeParse(unknownZone).success).toBe(false);
  });

  it("requires an exact schedule item to end on its referenced Fair day", () => {
    const manifest = cloneManifest();
    manifest.scheduleItems.push({
      id: "schedule-cross-date-example",
      title: "Cross-date schedule example",
      dayId: "day-2026-09-18",
      timing: {
        kind: "exact",
        startsAt: "2026-09-18T23:30:00-04:00",
        endsAt: "2026-09-19T00:30:00-04:00",
      },
      kind: "other",
      status: "scheduled",
      zoneId: {
        status: "unknown",
        reason: "A stable, sourced Fair zone identifier has not been reviewed yet.",
      },
      provenance: [manifest.provenance[0]],
    });

    const result = fairManifestSchema.safeParse(manifest);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(
        result.error.issues.some(
          (issue) =>
            issue.path.join(".") === "scheduleItems.0.timing.endsAt" &&
            issue.message ===
              "exact schedule item must end on its referenced Fair day",
        ),
      ).toBe(true);
    }
  });

  it("keeps incomplete source times explicit instead of inventing endpoints", () => {
    const manifest = cloneManifest();
    const source = manifest.provenance[0];
    const base = {
      dayId: "day-2026-09-22",
      kind: "other" as const,
      status: "scheduled" as const,
      zoneId: {
        status: "unknown" as const,
        reason: "A stable, sourced Fair zone identifier has not been reviewed yet.",
      },
      provenance: [source],
    };
    manifest.scheduleItems.push(
      {
        ...base,
        id: "schedule-noon-through-close",
        title: "Open-ended schedule item",
        timing: {
          kind: "open-ended",
          startsAt: "2026-09-22T12:00:00-04:00",
          endBoundary: "fair-close",
          sourceLabel: "Noon-Close",
        },
      },
      {
        ...base,
        id: "schedule-approximate-start",
        title: "Approximate schedule item",
        timing: {
          kind: "approximate",
          anchorAt: "2026-09-22T21:30:00-04:00",
          sourceLabel: "Approx. 9:30 p.m.",
        },
      },
      {
        ...base,
        id: "schedule-time-not-published",
        title: "Unknown-time schedule item",
        timing: {
          kind: "unknown",
          reason: "The official source row does not publish a time label.",
        },
      },
    );

    expect(fairManifestSchema.safeParse(manifest).success).toBe(true);
  });
});
