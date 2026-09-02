import { z } from "zod";

import { fairOfferSchema, type FairOffer } from "@/lib/fair/offers";

export const MAX_FAIR_PARTY_GUESTS = 40;

const localDateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine((value) => {
    const parsed = new Date(`${value}T00:00:00Z`);
    return (
      Number.isFinite(parsed.getTime()) &&
      parsed.toISOString().slice(0, 10) === value
    );
  }, "must be a real YYYY-MM-DD date");

const offsetTimestampSchema = z
  .string()
  .regex(
    /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?(?:Z|[+-]\d{2}:\d{2})$/,
  )
  .refine((value) => Number.isFinite(Date.parse(value)));

const guestCountSchema = z
  .number()
  .int()
  .min(0)
  .max(MAX_FAIR_PARTY_GUESTS);

export const fairPartySchema = z
  .object({
    adults11Plus: guestCountSchema,
    children10Under: guestCountSchema,
    adultRiders: guestCountSchema,
    childRiders: guestCountSchema,
  })
  .strict()
  .superRefine((party, ctx) => {
    if (party.adultRiders > party.adults11Plus) {
      ctx.addIssue({
        code: "custom",
        message: "adult riders cannot exceed adults age 11 and older",
        path: ["adultRiders"],
      });
    }
    if (party.childRiders > party.children10Under) {
      ctx.addIssue({
        code: "custom",
        message: "child riders cannot exceed children age 10 and under",
        path: ["childRiders"],
      });
    }
    if (party.adults11Plus + party.children10Under > MAX_FAIR_PARTY_GUESTS) {
      ctx.addIssue({
        code: "custom",
        message: `a Fair party may contain at most ${MAX_FAIR_PARTY_GUESTS} guests`,
        path: ["adults11Plus"],
      });
    }
  });

export type FairParty = z.infer<typeof fairPartySchema>;

export const EMPTY_FAIR_PARTY: FairParty = {
  adults11Plus: 0,
  children10Under: 0,
  adultRiders: 0,
  childRiders: 0,
};

export type FairPartyOfferKind =
  | "adult-online-admission"
  | "child-admission"
  | "blue-ribbon-bundle"
  | "jack-pass"
  | "carload-special";

export type FairPartyOffer = {
  id: string;
  label: string;
  kind: FairPartyOfferKind;
  unitPriceCents: number;
  validDates: { startsOn: string; endsOn: string };
  deadline: { status: "known"; value: string } | { status: "unknown" };
  pastKnownDeadline: boolean;
  officialInfoUrl: string;
  officialPurchaseUrl: string | null;
};

export type FairPartyPlanLine = {
  offerId: string;
  label: string;
  quantity: number;
  unitPriceCents: number;
  lineSubtotalCents: number;
  officialInfoUrl: string;
  officialPurchaseUrl: string | null;
};

export type FairPartyPlanResult =
  | {
      status: "needs-party";
      message: string;
    }
  | {
      status: "no-complete-option";
      message: string;
    }
  | {
      status: "complete";
      listedSubtotalCents: number;
      admissionGuestsCovered: number;
      rideGuestsCovered: number;
      lines: FairPartyPlanLine[];
      notes: string[];
      conditional: boolean;
    };

type Candidate = Extract<FairPartyPlanResult, { status: "complete" }> & {
  comparisonKey: string;
  extraCoverageUnits: number;
};

const BLUE_RIBBON_ID = "offer-blue-ribbon-bundle";
const JACK_PASS_ID = "offer-jack-pass";
const CARLOAD_ID = "offer-carload-special";
const BLUE_RIBBON_ELIGIBILITY =
  "One online purchase includes 10 Fair admissions.";
const JACK_PASS_ELIGIBILITY =
  "Use the admission and ride wristband together on one Fair day.";
const CARLOAD_ELIGIBILITY =
  "Everyone must be buckled in the vehicle, up to eight people, and the vehicle must park in Lot D.";

function hasKnownInclusions(
  offer: FairOffer,
  required: readonly string[],
): boolean {
  const inclusions = offer.inclusions;
  return inclusions.status === "known"
    ? required.every((value) => inclusions.value.includes(value))
    : false;
}

/**
 * Builds the small client-safe catalog used by the party calculator. An offer
 * enters the catalog only when price, dates, and the required coverage facts
 * are explicit in the reviewed pack. Unknown deadlines stay visible as an
 * honest caveat; known passed deadlines make the offer ineligible later.
 */
export function buildFairPartyOffers(
  candidates: readonly FairOffer[],
  asOf: string,
): FairPartyOffer[] {
  const reviewedAt = offsetTimestampSchema.safeParse(asOf);
  if (!reviewedAt.success) {
    throw new TypeError("Fair party offers require an offset asOf timestamp.");
  }

  const facts: FairPartyOffer[] = [];
  for (const candidate of candidates) {
    const offer = fairOfferSchema.parse(candidate);
    if (
      offer.price.status !== "known" ||
      offer.validDates.status !== "known"
    ) {
      continue;
    }

    let kind: FairPartyOfferKind | null = null;
    if (
      offer.kind === "admission" &&
      offer.audience === "adult-11-plus" &&
      offer.channel === "online" &&
      hasKnownInclusions(offer, ["Fair admission"])
    ) {
      // This intentionally recognizes every source-modeled adult online tier,
      // including date-limited early admission, instead of keying to $10.
      kind = "adult-online-admission";
    } else if (
      offer.kind === "admission" &&
      offer.audience === "child-10-under" &&
      hasKnownInclusions(offer, ["Fair admission"])
    ) {
      kind = "child-admission";
    } else if (
      offer.id === BLUE_RIBBON_ID &&
      offer.kind === "bundle" &&
      offer.audience === "general" &&
      offer.channel === "online" &&
      offer.eligibility === BLUE_RIBBON_ELIGIBILITY &&
      hasKnownInclusions(offer, ["10 Fair admissions"])
    ) {
      kind = "blue-ribbon-bundle";
    } else if (
      offer.id === JACK_PASS_ID &&
      offer.kind === "bundle" &&
      offer.audience === "general" &&
      offer.channel === "online" &&
      offer.eligibility === JACK_PASS_ELIGIBILITY &&
      hasKnownInclusions(offer, [
        "Fair admission",
        "Ride-all-day wristband",
      ])
    ) {
      kind = "jack-pass";
    } else if (
      offer.id === CARLOAD_ID &&
      offer.kind === "bundle" &&
      offer.audience === "general" &&
      offer.channel === "any" &&
      offer.eligibility === CARLOAD_ELIGIBILITY &&
      hasKnownInclusions(offer, [
        "Fair admission",
        "Ride wristbands",
        "Lot D parking",
      ])
    ) {
      kind = "carload-special";
    }

    if (!kind) continue;
    facts.push({
      id: offer.id,
      label: offer.label,
      kind,
      unitPriceCents: offer.price.amountCents,
      validDates: {
        startsOn: offer.validDates.startsOn,
        endsOn: offer.validDates.endsOn,
      },
      deadline:
        offer.deadline.status === "known"
          ? { status: "known", value: offer.deadline.value }
          : { status: "unknown" },
      pastKnownDeadline:
        offer.deadline.status === "known" &&
        Date.parse(reviewedAt.data) >= Date.parse(offer.deadline.value),
      officialInfoUrl: offer.officialInfoUrl,
      officialPurchaseUrl:
        offer.officialPurchaseUrl.status === "known"
          ? offer.officialPurchaseUrl.value
          : null,
    });
  }
  return facts;
}

function availableOn(
  offer: FairPartyOffer,
  date: string,
  asOf: string,
): boolean {
  const pastCurrentKnownDeadline =
    offer.deadline.status === "known" &&
    Date.parse(asOf) >= Date.parse(offer.deadline.value);
  return (
    !offer.pastKnownDeadline &&
    !pastCurrentKnownDeadline &&
    date >= offer.validDates.startsOn &&
    date <= offer.validDates.endsOn
  );
}

function lowestUnitPrice(
  offers: readonly FairPartyOffer[],
  kind: FairPartyOfferKind,
): FairPartyOffer | null {
  return (
    offers
      .filter((offer) => offer.kind === kind)
      .sort(
        (left, right) =>
          left.unitPriceCents - right.unitPriceCents ||
          left.id.localeCompare(right.id),
      )[0] ?? null
  );
}

function line(offer: FairPartyOffer, quantity: number): FairPartyPlanLine {
  return {
    offerId: offer.id,
    label: offer.label,
    quantity,
    unitPriceCents: offer.unitPriceCents,
    lineSubtotalCents: offer.unitPriceCents * quantity,
    officialInfoUrl: offer.officialInfoUrl,
    officialPurchaseUrl: offer.officialPurchaseUrl,
  };
}

function unknownDeadlineNotes(
  lines: readonly FairPartyPlanLine[],
  offers: readonly FairPartyOffer[],
): string[] {
  const unknownLabels = Array.from(
    new Set(
      lines.flatMap((item) => {
        const offer = offers.find((candidate) => candidate.id === item.offerId);
        return offer?.deadline.status === "unknown" &&
          offer.officialPurchaseUrl !== null
          ? [offer.label]
          : [];
      }),
    ),
  );
  if (unknownLabels.length === 0) return [];
  const formattedLabels = new Intl.ListFormat("en-US", {
    style: "long",
    type: "conjunction",
  }).format(unknownLabels);
  return [
    `The reviewed source does not state a purchase deadline for ${formattedLabels}. Confirm availability on the official page.`,
  ];
}

function standardTicketCandidates(
  party: FairParty,
  offers: readonly FairPartyOffer[],
): Candidate[] {
  const jackPass = lowestUnitPrice(offers, "jack-pass");
  const riderCount = party.adultRiders + party.childRiders;
  if (riderCount > 0 && !jackPass) return [];

  const remainingAdults = party.adults11Plus - party.adultRiders;
  const remainingChildren = party.children10Under - party.childRiders;
  const adultAdmission = lowestUnitPrice(offers, "adult-online-admission");
  const childAdmission = lowestUnitPrice(offers, "child-admission");
  const blueRibbon = lowestUnitPrice(offers, "blue-ribbon-bundle");
  const totalRemaining = remainingAdults + remainingChildren;
  const maxBlueBundles = blueRibbon ? Math.ceil(totalRemaining / 10) : 0;
  const candidates: Candidate[] = [];

  for (let blueCount = 0; blueCount <= maxBlueBundles; blueCount += 1) {
    const blueCapacity = blueCount * 10;
    for (
      let adultsCoveredByBlue = 0;
      adultsCoveredByBlue <= Math.min(remainingAdults, blueCapacity);
      adultsCoveredByBlue += 1
    ) {
      const childrenCoveredByBlue = Math.min(
        remainingChildren,
        blueCapacity - adultsCoveredByBlue,
      );
      const adultsNeedingTickets = remainingAdults - adultsCoveredByBlue;
      const childrenNeedingTickets = remainingChildren - childrenCoveredByBlue;
      if (adultsNeedingTickets > 0 && !adultAdmission) continue;
      if (childrenNeedingTickets > 0 && !childAdmission) continue;

      const lines = [
        ...(jackPass && riderCount > 0 ? [line(jackPass, riderCount)] : []),
        ...(blueRibbon && blueCount > 0 ? [line(blueRibbon, blueCount)] : []),
        ...(adultAdmission && adultsNeedingTickets > 0
          ? [line(adultAdmission, adultsNeedingTickets)]
          : []),
        ...(childAdmission && childrenNeedingTickets > 0
          ? [line(childAdmission, childrenNeedingTickets)]
          : []),
      ];
      candidates.push({
        status: "complete",
        listedSubtotalCents: lines.reduce(
          (total, item) => total + item.lineSubtotalCents,
          0,
        ),
        admissionGuestsCovered:
          party.adults11Plus + party.children10Under,
        rideGuestsCovered: riderCount,
        lines,
        notes: unknownDeadlineNotes(lines, offers),
        conditional: false,
        comparisonKey: lines
          .map((item) => `${item.offerId}:${item.quantity}`)
          .join("|"),
        extraCoverageUnits: Math.max(
          0,
          blueCapacity - adultsCoveredByBlue - childrenCoveredByBlue,
        ),
      });
    }
  }
  return candidates;
}

function carloadCandidate(
  party: FairParty,
  offers: readonly FairPartyOffer[],
): Candidate | null {
  const totalGuests = party.adults11Plus + party.children10Under;
  if (totalGuests < 1 || totalGuests > 8) return null;
  const carload = lowestUnitPrice(offers, "carload-special");
  if (!carload) return null;
  const lines = [line(carload, 1)];
  return {
    status: "complete",
    listedSubtotalCents: carload.unitPriceCents,
    admissionGuestsCovered: totalGuests,
    rideGuestsCovered: totalGuests,
    lines,
    notes: [
      "This result applies only if everyone is buckled into one vehicle and the vehicle parks in Lot D.",
      "The Carload Special includes ride wristbands for everyone in the vehicle and Lot D parking.",
      ...unknownDeadlineNotes(lines, offers),
    ],
    conditional: true,
    comparisonKey: carload.id,
    extraCoverageUnits:
      totalGuests - party.adultRiders - party.childRiders + 1,
  };
}

export function recommendFairPartyPlan(input: {
  party: FairParty;
  date: string;
  asOf: string;
  offers: readonly FairPartyOffer[];
}): FairPartyPlanResult {
  const party = fairPartySchema.parse(input.party);
  const date = localDateSchema.safeParse(input.date);
  if (!date.success) {
    throw new TypeError("Fair party planning requires a real YYYY-MM-DD date.");
  }
  const asOf = offsetTimestampSchema.safeParse(input.asOf);
  if (!asOf.success) {
    throw new TypeError("Fair party planning requires an offset asOf timestamp.");
  }
  const totalGuests = party.adults11Plus + party.children10Under;
  if (totalGuests === 0) {
    return {
      status: "needs-party",
      message:
        "Add your party to compare reviewed admission and ride-all-day coverage.",
    };
  }

  const availableOffers = input.offers.filter((offer) =>
    availableOn(offer, date.data, asOf.data),
  );
  const candidates = standardTicketCandidates(party, availableOffers);
  const carload = carloadCandidate(party, availableOffers);
  if (carload) candidates.push(carload);
  if (candidates.length === 0) {
    return {
      status: "no-complete-option",
      message:
        "No reviewed option fully covers this party for the selected date. Admission-only prices are not treated as ride-all-day coverage.",
    };
  }

  candidates.sort(
    (left, right) =>
      left.listedSubtotalCents - right.listedSubtotalCents ||
      Number(left.conditional) - Number(right.conditional) ||
      left.extraCoverageUnits - right.extraCoverageUnits ||
      left.lines.length - right.lines.length ||
      left.comparisonKey.localeCompare(right.comparisonKey),
  );
  const winner = candidates[0];
  return {
    status: "complete",
    listedSubtotalCents: winner.listedSubtotalCents,
    admissionGuestsCovered: winner.admissionGuestsCovered,
    rideGuestsCovered: winner.rideGuestsCovered,
    lines: winner.lines,
    notes: winner.notes,
    conditional: winner.conditional,
  };
}
