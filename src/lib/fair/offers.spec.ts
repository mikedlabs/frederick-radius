import { describe, expect, it } from "vitest";

import { greatFrederickFair2026Offers } from "@/data/fair/great-frederick-fair-2026-offers";
import { greatFrederickFair2026 } from "@/data/fair/great-frederick-fair-2026";
import {
  compareFairOfferPrices,
  fairOffersSchema,
  selectFairOffers,
  type FairOffer,
} from "@/lib/fair/offers";

describe("Fair offers", () => {
  it("keeps the reviewed offer prices in parity with the Fair manifest", () => {
    const adultTier = greatFrederickFair2026.admissionTiers.find(
      (tier) => tier.id === "admission-adults-11-plus",
    );
    const childTier = greatFrederickFair2026.admissionTiers.find(
      (tier) => tier.id === "admission-children-10-under",
    );

    expect(
      greatFrederickFair2026Offers
        .filter((offer) =>
          [
            "offer-adult-admission-online",
            "offer-adult-admission-gate",
          ].includes(offer.id),
        )
        .map((offer) => ({
          channel: offer.channel,
          amountCents:
            offer.price.status === "known" ? offer.price.amountCents : null,
          currency:
            offer.price.status === "known" ? offer.price.currency : null,
        })),
    ).toEqual(adultTier?.prices);
    expect(
      greatFrederickFair2026Offers.find(
        (offer) => offer.id === "offer-adult-admission-early",
      ),
    ).toMatchObject({
      audience: "adult-11-plus",
      channel: "online",
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
    });
    expect(
      greatFrederickFair2026Offers.find(
        (offer) => offer.audience === "child-10-under",
      )?.price,
    ).toMatchObject({
      status: "known",
      amountCents: childTier?.prices[0].amountCents,
      currency: "USD",
    });
  });

  it("selects by date, age, and purchase channel without inventing availability", () => {
    const result = selectFairOffers(greatFrederickFair2026Offers, {
      date: "2026-09-20",
      audience: "adult-11-plus",
      channel: "online",
    });

    expect(result.matches.map((match) => match.offer.id)).toEqual(
      expect.arrayContaining([
        "offer-adult-admission-online",
        "offer-blue-ribbon-bundle",
        "offer-jack-pass",
      ]),
    );
    const onlineAdmission = result.matches.find(
      (match) => match.offer.id === "offer-adult-admission-online",
    );
    expect(onlineAdmission?.confidence).toBe("possible");
    expect(onlineAdmission?.caveats.join(" ")).toContain(
      "does not check ticket inventory",
    );
    expect(result.excludedOfferIds).toContain("offer-adult-admission-gate");
  });

  it("excludes a known offer outside its validity dates", () => {
    const result = selectFairOffers(greatFrederickFair2026Offers, {
      date: "2026-09-27",
      audience: "child-10-under",
      channel: "any",
    });

    expect(result.matches).toEqual([]);
    expect(result.excludedOfferIds).toContain("offer-child-admission");
  });

  it("excludes an offer after a known purchase deadline", () => {
    const deadlineOffer = {
      ...greatFrederickFair2026Offers[0],
      deadline: {
        status: "known" as const,
        value: "2026-09-18T17:00:00-04:00",
      },
    };
    const result = selectFairOffers([deadlineOffer], {
      date: "2026-09-18",
      audience: "adult-11-plus",
      channel: "online",
      asOf: "2026-09-18T17:01:00-04:00",
    });

    expect(result.matches).toEqual([]);
    expect(result.excludedOfferIds).toEqual([deadlineOffer.id]);
  });

  it("surfaces reviewed day-specific deals for the matching audience", () => {
    const senior = selectFairOffers(greatFrederickFair2026Offers, {
      date: "2026-09-22",
      audience: "senior-65-plus",
      channel: "gate",
    });
    expect(senior.matches.map((match) => match.offer.id)).toContain(
      "offer-senior-day-admission",
    );
    expect(senior.matches.map((match) => match.offer.id)).toContain(
      "offer-lunch-bunch-admission",
    );

    const thursdaySenior = selectFairOffers(greatFrederickFair2026Offers, {
      date: "2026-09-24",
      audience: "senior-65-plus",
      channel: "gate",
    });
    expect(thursdaySenior.matches.map((match) => match.offer.id)).not.toContain(
      "offer-senior-day-admission",
    );
    expect(thursdaySenior.matches.map((match) => match.offer.id)).toContain(
      "offer-lunch-bunch-admission",
    );

    const carload = greatFrederickFair2026Offers.find(
      (offer) => offer.id === "offer-carload-special",
    );
    expect(carload).toMatchObject({
      price: { status: "known", amountCents: 6_000 },
      inclusions: {
        status: "known",
        value: ["Fair admission", "Ride wristbands", "Lot D parking"],
      },
      officialPurchaseUrl: {
        status: "known",
        value:
          "https://www.etix.com/ticket/p/66497377/carload-special-tuesday-sept22-lot-d-onlythe-great-frederick-fair-frederick-the-great-frederick-fair-advanced-gate?partner_id=944",
      },
    });
  });

  it("preserves the reviewed Blue Ribbon and Jack Pass terms", () => {
    const blueRibbon = greatFrederickFair2026Offers.find(
      (offer) => offer.id === "offer-blue-ribbon-bundle",
    );
    expect(blueRibbon).toMatchObject({
      kind: "bundle",
      channel: "online",
      price: { status: "known", amountCents: 8_000 },
      inclusions: { status: "known", value: ["10 Fair admissions"] },
      officialPurchaseUrl: {
        status: "known",
        value:
          "https://www.etix.com/ticket/p/65356930/blue-ribbon-bundle-frederick-the-great-frederick-fair-advanced-gate?partner_id=944",
      },
    });

    const jackPass = greatFrederickFair2026Offers.find(
      (offer) => offer.id === "offer-jack-pass",
    );
    expect(jackPass).toMatchObject({
      kind: "bundle",
      channel: "online",
      price: { status: "known", amountCents: 3_500 },
      deadline: {
        status: "known",
        value: "2026-09-18T17:00:00-04:00",
      },
      inclusions: {
        status: "known",
        value: ["Fair admission", "Ride-all-day wristband"],
      },
      officialPurchaseUrl: {
        status: "known",
        value:
          "https://www.etix.com/ticket/p/36957156/jack-pass-frederick-the-great-frederick-fair-advanced-gate?partner_id=944",
      },
    });
  });

  it("compares like-for-like admission and refuses unlike bundles", () => {
    const online = greatFrederickFair2026Offers.find(
      (offer) => offer.id === "offer-adult-admission-online",
    );
    const gate = greatFrederickFair2026Offers.find(
      (offer) => offer.id === "offer-adult-admission-gate",
    );
    expect(online).toBeDefined();
    expect(gate).toBeDefined();
    if (!online || !gate) {
      throw new Error("Reviewed adult admission offers are required.");
    }
    expect(compareFairOfferPrices(online, gate)).toEqual({
      comparable: true,
      cheaperOfferId: online.id,
      differenceCents: 500,
      currency: "USD",
    });

    const bundle = {
      ...gate,
      id: "offer-adult-bundle",
      kind: "bundle",
    } as FairOffer;
    expect(compareFairOfferPrices(online, bundle)).toMatchObject({
      comparable: false,
    });
  });

  it("rejects duplicate ids and missing source attribution", () => {
    expect(
      fairOffersSchema.safeParse([
        greatFrederickFair2026Offers[0],
        greatFrederickFair2026Offers[0],
      ]).success,
    ).toBe(false);
    expect(
      fairOffersSchema.safeParse([
        { ...greatFrederickFair2026Offers[0], provenance: [] },
      ]).success,
    ).toBe(false);
  });
});
