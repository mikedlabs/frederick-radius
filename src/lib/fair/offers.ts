import { z } from "zod";

import { fairProvenanceSchema } from "@/lib/fair/domain";

const FAIR_ID = /^great-frederick-fair-\d{4}$/;
const OFFER_ID = /^offer-[a-z0-9]+(?:-[a-z0-9]+)*$/;
const ISO_DAY = /^\d{4}-\d{2}-\d{2}$/;

const localDateSchema = z
  .string()
  .regex(ISO_DAY, { message: "must be YYYY-MM-DD" })
  .refine((value) => {
    const parsed = new Date(`${value}T00:00:00Z`);
    return (
      Number.isFinite(parsed.getTime()) &&
      parsed.toISOString().slice(0, 10) === value
    );
  }, "must be a real calendar date");

const offsetTimestampSchema = z
  .string()
  .regex(
    /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?(?:Z|[+-]\d{2}:\d{2})$/,
    { message: "must include an explicit UTC offset" },
  )
  .refine((value) => Number.isFinite(Date.parse(value)), {
    message: "must be a real timestamp",
  });

const httpsUrlSchema = z
  .string()
  .url()
  .refine((value) => value.startsWith("https://"), {
    message: "official URLs must use HTTPS",
  });

const unknownStateSchema = z
  .object({
    status: z.literal("unknown"),
    reason: z.string().trim().min(12).max(320),
  })
  .strict();

const knownDateRangeSchema = z
  .object({
    status: z.literal("known"),
    startsOn: localDateSchema,
    endsOn: localDateSchema,
  })
  .strict()
  .refine((value) => value.startsOn <= value.endsOn, {
    message: "endsOn must not be before startsOn",
    path: ["endsOn"],
  });

const knownPurchaseUrlSchema = z
  .object({ status: z.literal("known"), value: httpsUrlSchema })
  .strict();

export const fairOfferSchema = z
  .object({
    id: z.string().regex(OFFER_ID),
    fairId: z.string().regex(FAIR_ID),
    kind: z.enum(["admission", "deal", "bundle", "parking"]),
    label: z.string().trim().min(2).max(140),
    audience: z.enum([
      "general",
      "adult-11-plus",
      "child-10-under",
      "youth-18-under",
      "senior-65-plus",
      "military-id",
    ]),
    eligibility: z.string().trim().min(2).max(280),
    channel: z.enum(["online", "gate", "any"]),
    price: z.discriminatedUnion("status", [
      z
        .object({
          status: z.literal("known"),
          amountCents: z.number().int().nonnegative(),
          currency: z.literal("USD"),
        })
        .strict(),
      unknownStateSchema,
    ]),
    validDates: z.discriminatedUnion("status", [
      knownDateRangeSchema,
      unknownStateSchema,
    ]),
    deadline: z.discriminatedUnion("status", [
      z
        .object({
          status: z.literal("known"),
          value: offsetTimestampSchema,
        })
        .strict(),
      unknownStateSchema,
    ]),
    inclusions: z.discriminatedUnion("status", [
      z
        .object({
          status: z.literal("known"),
          value: z.array(z.string().trim().min(2).max(120)).min(1).max(12),
        })
        .strict(),
      unknownStateSchema,
    ]),
    inventory: z
      .object({
        status: z.literal("not-tracked"),
        reason: z.string().trim().min(12).max(320),
      })
      .strict(),
    officialInfoUrl: httpsUrlSchema,
    officialPurchaseUrl: z.discriminatedUnion("status", [
      knownPurchaseUrlSchema,
      unknownStateSchema,
    ]),
    provenance: z.array(fairProvenanceSchema).min(1).max(6),
  })
  .strict();

export const fairOffersSchema = z
  .array(fairOfferSchema)
  .max(100)
  .superRefine((offers, ctx) => {
    const ids = new Set<string>();
    offers.forEach((offer, index) => {
      if (ids.has(offer.id)) {
        ctx.addIssue({
          code: "custom",
          message: "offer ids must be unique",
          path: [index, "id"],
        });
      }
      ids.add(offer.id);
    });
  });

export type FairOffer = z.infer<typeof fairOfferSchema>;
export type FairOfferAudience = FairOffer["audience"];
export type FairOfferChannel = FairOffer["channel"];

export type FairOfferCriteria = {
  date: string;
  audience: FairOfferAudience;
  channel: FairOfferChannel;
  /** Current instant for deadline checks. Omit when the caller cannot prove it. */
  asOf?: string;
};

export type FairOfferSelection = {
  matches: Array<{
    offer: FairOffer;
    confidence: "match" | "possible";
    caveats: string[];
  }>;
  excludedOfferIds: string[];
};

export type FairOfferPriceComparison =
  | {
      comparable: true;
      cheaperOfferId: string | null;
      differenceCents: number;
      currency: "USD";
    }
  | { comparable: false; reason: string };

export function parseFairOffers(candidate: unknown): FairOffer[] {
  return fairOffersSchema.parse(candidate);
}

/**
 * Selects only by explicitly modeled facts. Unknown validity is kept as a
 * possible match with a caveat instead of being silently promoted or removed.
 */
export function selectFairOffers(
  offers: readonly FairOffer[],
  criteria: FairOfferCriteria,
): FairOfferSelection {
  const parsedDate = localDateSchema.safeParse(criteria.date);
  if (!parsedDate.success) {
    throw new TypeError("Fair offer selection requires a valid YYYY-MM-DD date.");
  }
  const asOf = criteria.asOf
    ? offsetTimestampSchema.safeParse(criteria.asOf)
    : null;
  if (asOf && !asOf.success) {
    throw new TypeError("Fair offer selection asOf must be an offset timestamp.");
  }

  const matches: FairOfferSelection["matches"] = [];
  const excludedOfferIds: string[] = [];

  for (const candidate of offers) {
    const offer = fairOfferSchema.parse(candidate);
    const audienceMatches =
      offer.audience === "general" || offer.audience === criteria.audience;
    const channelMatches =
      offer.channel === "any" ||
      criteria.channel === "any" ||
      offer.channel === criteria.channel;
    const outsideKnownDates =
      offer.validDates.status === "known" &&
      (criteria.date < offer.validDates.startsOn ||
        criteria.date > offer.validDates.endsOn);
    const pastKnownDeadline =
      offer.deadline.status === "known" &&
      asOf?.success === true &&
      Date.parse(criteria.asOf ?? "") > Date.parse(offer.deadline.value);

    if (
      !audienceMatches ||
      !channelMatches ||
      outsideKnownDates ||
      pastKnownDeadline
    ) {
      excludedOfferIds.push(offer.id);
      continue;
    }

    const caveats: string[] = [];
    if (offer.validDates.status === "unknown") {
      caveats.push(offer.validDates.reason);
    }
    if (offer.deadline.status === "unknown") {
      caveats.push(offer.deadline.reason);
    }
    if (offer.inventory.status === "not-tracked") {
      caveats.push(offer.inventory.reason);
    }
    matches.push({
      offer,
      confidence: caveats.length === 0 ? "match" : "possible",
      caveats,
    });
  }

  return { matches, excludedOfferIds };
}

/**
 * Prices are compared only when the user would receive the same modeled thing.
 * A cheap bundle must never be labeled the better deal beside admission alone.
 */
export function compareFairOfferPrices(
  leftCandidate: FairOffer,
  rightCandidate: FairOffer,
): FairOfferPriceComparison {
  const left = fairOfferSchema.parse(leftCandidate);
  const right = fairOfferSchema.parse(rightCandidate);

  if (
    left.kind !== right.kind ||
    left.audience !== right.audience ||
    JSON.stringify(left.validDates) !== JSON.stringify(right.validDates) ||
    JSON.stringify(left.inclusions) !== JSON.stringify(right.inclusions)
  ) {
    return {
      comparable: false,
      reason: "The offers do not have the same modeled eligibility, validity, and inclusions.",
    };
  }
  if (left.price.status !== "known" || right.price.status !== "known") {
    return {
      comparable: false,
      reason: "Both prices must be known before they can be compared.",
    };
  }

  const differenceCents = Math.abs(
    left.price.amountCents - right.price.amountCents,
  );
  return {
    comparable: true,
    cheaperOfferId:
      left.price.amountCents === right.price.amountCents
        ? null
        : left.price.amountCents < right.price.amountCents
          ? left.id
          : right.id,
    differenceCents,
    currency: "USD",
  };
}
