import { describe, expect, it } from "vitest";

import { greatFrederickFair2026Pack } from "@/data/fair/great-frederick-fair-2026-pack";
import type { FairOffer } from "@/lib/fair/offers";
import {
  buildFairPartyOffers,
  recommendFairPartyPlan,
  type FairParty,
  type FairPartyOffer,
} from "@/lib/fair/party-plan";

const INFO_URL = "https://thegreatfrederickfair.com/come-to-the-fair/";
const PURCHASE_URL =
  "https://www.etix.com/ticket/v/11115/the-great-frederick-fair-advanced-gate?partner_id=944";
const REVIEWED_AT = "2026-09-01T12:00:00Z";

function fact(
  kind: FairPartyOffer["kind"],
  price: number,
  overrides: Partial<FairPartyOffer> = {},
): FairPartyOffer {
  return {
    id: `offer-${kind}`,
    label: kind,
    kind,
    unitPriceCents: price,
    validDates: { startsOn: "2026-09-18", endsOn: "2026-09-26" },
    deadline: { status: "unknown" },
    pastKnownDeadline: false,
    officialInfoUrl: INFO_URL,
    officialPurchaseUrl: PURCHASE_URL,
    ...overrides,
  };
}

const catalog: FairPartyOffer[] = [
  fact("adult-online-admission", 1_000),
  fact("child-admission", 0, { officialPurchaseUrl: null }),
  fact("blue-ribbon-bundle", 8_000),
  fact("jack-pass", 3_500),
  fact("carload-special", 6_000, {
    validDates: { startsOn: "2026-09-22", endsOn: "2026-09-22" },
  }),
];

function party(overrides: Partial<FairParty> = {}): FairParty {
  return {
    adults11Plus: 0,
    children10Under: 0,
    adultRiders: 0,
    childRiders: 0,
    ...overrides,
  };
}

function complete(input: FairParty, date = "2026-09-20") {
  const result = recommendFairPartyPlan({
    party: input,
    date,
    asOf: REVIEWED_AT,
    offers: catalog,
  });
  expect(result.status).toBe("complete");
  if (result.status !== "complete") throw new Error("Expected a complete plan.");
  return result;
}

describe("Fair party plan recommendation", () => {
  it("asks for a party before presenting a total", () => {
    expect(
      recommendFairPartyPlan({
        party: party(),
        date: "2026-09-20",
        asOf: REVIEWED_AT,
        offers: catalog,
      }),
    ).toMatchObject({ status: "needs-party" });
  });

  it("covers non-riders with age-appropriate admission", () => {
    const result = complete(
      party({ adults11Plus: 2, children10Under: 2 }),
    );

    expect(result.listedSubtotalCents).toBe(2_000);
    expect(result.lines).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          offerId: "offer-adult-online-admission",
          quantity: 2,
          lineSubtotalCents: 2_000,
        }),
        expect.objectContaining({
          offerId: "offer-child-admission",
          quantity: 2,
          lineSubtotalCents: 0,
        }),
      ]),
    );
  });

  it("keeps a child-only non-rider party at a zero listed subtotal", () => {
    const result = complete(party({ children10Under: 3 }));

    expect(result.listedSubtotalCents).toBe(0);
    expect(result.lines).toMatchObject([
      { offerId: "offer-child-admission", quantity: 3 },
    ]);
  });

  it("uses Jack Passes only for requested ride-all-day guests", () => {
    const result = complete(
      party({
        adults11Plus: 2,
        children10Under: 2,
        adultRiders: 1,
        childRiders: 1,
      }),
    );

    expect(result.listedSubtotalCents).toBe(8_000);
    expect(result.lines).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ offerId: "offer-jack-pass", quantity: 2 }),
        expect.objectContaining({
          offerId: "offer-adult-online-admission",
          quantity: 1,
        }),
        expect.objectContaining({ offerId: "offer-child-admission", quantity: 1 }),
      ]),
    );
    expect(result.rideGuestsCovered).toBe(2);
  });

  it("uses exact online admissions for an $80 tie and the bundle for nine adults", () => {
    const eight = complete(party({ adults11Plus: 8 }));
    const nine = complete(party({ adults11Plus: 9 }));

    expect(eight.listedSubtotalCents).toBe(8_000);
    expect(eight.lines).toMatchObject([
      { offerId: "offer-adult-online-admission", quantity: 8 },
    ]);
    expect(nine.listedSubtotalCents).toBe(8_000);
    expect(nine.lines).toMatchObject([
      { offerId: "offer-blue-ribbon-bundle", quantity: 1 },
    ]);
  });

  it("combines a bundle and a single admission for eleven adults", () => {
    const result = complete(party({ adults11Plus: 11 }));
    expect(result.listedSubtotalCents).toBe(9_000);
    expect(result.lines).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          offerId: "offer-blue-ribbon-bundle",
          quantity: 1,
        }),
        expect.objectContaining({
          offerId: "offer-adult-online-admission",
          quantity: 1,
        }),
      ]),
    );
  });

  it("prefers exact coverage when eighteen admissions tie two bundles", () => {
    const result = complete(party({ adults11Plus: 18 }));

    expect(result.listedSubtotalCents).toBe(16_000);
    expect(result.lines).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          offerId: "offer-blue-ribbon-bundle",
          quantity: 1,
        }),
        expect.objectContaining({
          offerId: "offer-adult-online-admission",
          quantity: 8,
        }),
      ]),
    );
  });

  it("recognizes a date-limited adult online tier without a price-specific id", () => {
    const early = fact("adult-online-admission", 800, {
      id: "offer-adult-admission-early",
      label: "Early adult admission online",
      validDates: { startsOn: "2026-09-18", endsOn: "2026-09-18" },
      deadline: { status: "known", value: "2026-09-18T17:00:00-04:00" },
    });
    const result = recommendFairPartyPlan({
      party: party({ adults11Plus: 2 }),
      date: "2026-09-18",
      asOf: REVIEWED_AT,
      offers: [...catalog, early],
    });

    expect(result).toMatchObject({
      status: "complete",
      listedSubtotalCents: 1_600,
      lines: [{ offerId: "offer-adult-admission-early", quantity: 2 }],
    });
  });

  it("falls back to the valid regular online tier after an early tier cutoff", () => {
    const expiredEarly = fact("adult-online-admission", 800, {
      id: "offer-adult-admission-early",
      label: "Early adult admission online",
      validDates: { startsOn: "2026-09-18", endsOn: "2026-09-18" },
      deadline: { status: "known", value: "2026-09-18T17:00:00-04:00" },
      pastKnownDeadline: false,
    });
    const result = recommendFairPartyPlan({
      party: party({ adults11Plus: 2 }),
      date: "2026-09-18",
      asOf: "2026-09-18T17:00:00-04:00",
      offers: [...catalog, expiredEarly],
    });

    expect(result).toMatchObject({
      status: "complete",
      listedSubtotalCents: 2_000,
      lines: [{ offerId: "offer-adult-online-admission", quantity: 2 }],
    });
  });

  it("keeps unknown purchase deadlines visible in the winning result", () => {
    const result = complete(party({ adults11Plus: 1 }));

    expect(result.notes.join(" ")).toContain(
      "does not state a purchase deadline",
    );
    expect(result.notes.join(" ")).toContain("Confirm availability");
  });

  it("uses the Tuesday carload only when its full-party condition and date apply", () => {
    const onTuesday = complete(
      party({ adults11Plus: 2, adultRiders: 2 }),
      "2026-09-22",
    );
    const tooMany = complete(
      party({ adults11Plus: 9, adultRiders: 9 }),
      "2026-09-22",
    );

    expect(onTuesday).toMatchObject({
      listedSubtotalCents: 6_000,
      conditional: true,
      lines: [{ offerId: "offer-carload-special", quantity: 1 }],
    });
    expect(onTuesday.notes.join(" ")).toContain("one vehicle");
    expect(onTuesday.notes.join(" ")).toContain("Lot D");
    expect(tooMany.lines).toMatchObject([
      { offerId: "offer-jack-pass", quantity: 9 },
    ]);
  });

  it("does not present admission-only pricing as complete ride coverage", () => {
    const withoutRideOffer = catalog.filter(
      (offer) =>
        offer.kind !== "jack-pass" && offer.kind !== "carload-special",
    );
    const result = recommendFairPartyPlan({
      party: party({ adults11Plus: 1, adultRiders: 1 }),
      date: "2026-09-20",
      asOf: REVIEWED_AT,
      offers: withoutRideOffer,
    });

    expect(result).toMatchObject({ status: "no-complete-option" });
    expect(result.status === "no-complete-option" ? result.message : "").toContain(
      "not treated as ride-all-day coverage",
    );
  });

  it("excludes known passed deadlines and dates outside the modeled range", () => {
    const unavailableJack = catalog.map((offer) =>
      offer.kind === "jack-pass"
        ? { ...offer, pastKnownDeadline: true }
        : offer,
    );
    const passed = recommendFairPartyPlan({
      party: party({ adults11Plus: 1, adultRiders: 1 }),
      date: "2026-09-20",
      asOf: REVIEWED_AT,
      offers: unavailableJack,
    });
    const offDate = recommendFairPartyPlan({
      party: party({ adults11Plus: 1, adultRiders: 1 }),
      date: "2026-09-27",
      asOf: REVIEWED_AT,
      offers: catalog,
    });

    expect(passed.status).toBe("no-complete-option");
    expect(offDate.status).toBe("no-complete-option");
  });

  it("rejects rider counts that exceed their age group", () => {
    expect(() =>
      recommendFairPartyPlan({
        party: party({ adults11Plus: 1, adultRiders: 2 }),
        date: "2026-09-20",
        asOf: REVIEWED_AT,
        offers: catalog,
      }),
    ).toThrow();
  });

  it("requires a current offset timestamp for deadline-sensitive results", () => {
    expect(() =>
      recommendFairPartyPlan({
        party: party({ adults11Plus: 1 }),
        date: "2026-09-20",
        asOf: "not-current",
        offers: catalog,
      }),
    ).toThrow("offset asOf timestamp");
  });
});

function modeledOffer(overrides: Partial<FairOffer>): FairOffer {
  return {
    id: "offer-adult-admission-online",
    fairId: "great-frederick-fair-2026",
    kind: "admission",
    label: "Adult admission online",
    audience: "adult-11-plus",
    eligibility: "Guests age 11 and over.",
    channel: "online",
    price: { status: "known", amountCents: 1_000, currency: "USD" },
    validDates: {
      status: "known",
      startsOn: "2026-09-18",
      endsOn: "2026-09-26",
    },
    deadline: {
      status: "unknown",
      reason: "The reviewed source does not state a deadline.",
    },
    inclusions: { status: "known", value: ["Fair admission"] },
    inventory: {
      status: "not-tracked",
      reason: "Radius does not track official ticket inventory.",
    },
    officialInfoUrl: INFO_URL,
    officialPurchaseUrl: { status: "known", value: PURCHASE_URL },
    provenance: [
      {
        publisher: "The Great Frederick Fair",
        sourceUrl: INFO_URL,
        sourceTitle: "Come to the Fair",
        verifiedAt: "2026-09-01T12:00:00Z",
      },
    ],
    ...overrides,
  };
}

describe("Fair party offer facts", () => {
  it("fails closed when the reviewed Carload conditions drift", () => {
    const carload = greatFrederickFair2026Pack.offers.find(
      (offer) => offer.id === "offer-carload-special",
    );
    if (!carload) throw new Error("Expected the reviewed Carload offer.");

    expect(
      buildFairPartyOffers([carload], REVIEWED_AT),
    ).toMatchObject([{ kind: "carload-special" }]);
    const changedEligibility: FairOffer = {
      ...carload,
      eligibility:
        "The vehicle conditions changed and require a new reviewed calculator rule.",
    };
    expect(buildFairPartyOffers([changedEligibility], REVIEWED_AT)).toEqual([]);
  });

  it("accepts generic modeled adult online tiers and applies known deadlines", () => {
    const offers = buildFairPartyOffers(
      [
        modeledOffer({
          id: "offer-adult-admission-early",
          label: "Early adult admission online",
          price: { status: "known", amountCents: 800, currency: "USD" },
          validDates: {
            status: "known",
            startsOn: "2026-09-18",
            endsOn: "2026-09-18",
          },
          deadline: {
            status: "known",
            value: "2026-09-18T17:00:00-04:00",
          },
        }),
      ],
      "2026-09-18T17:01:00-04:00",
    );

    expect(offers).toMatchObject([
      {
        id: "offer-adult-admission-early",
        kind: "adult-online-admission",
        unitPriceCents: 800,
        pastKnownDeadline: true,
      },
    ]);
  });

  it("does not infer calculator coverage from unknown price, dates, or inclusions", () => {
    const candidates = [
      modeledOffer({
        id: "offer-unknown-price",
        price: {
          status: "unknown",
          reason: "The reviewed source does not publish this price.",
        },
      }),
      modeledOffer({
        id: "offer-unknown-dates",
        validDates: {
          status: "unknown",
          reason: "The reviewed source does not publish valid dates.",
        },
      }),
      modeledOffer({
        id: "offer-unknown-inclusions",
        inclusions: {
          status: "unknown",
          reason: "The reviewed source does not publish exact inclusions.",
        },
      }),
    ];

    expect(
      buildFairPartyOffers(candidates, "2026-09-01T12:00:00Z"),
    ).toEqual([]);
  });
});
