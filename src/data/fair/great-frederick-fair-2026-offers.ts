import { parseFairOffers } from "@/lib/fair/offers";

const VERIFIED_AT = "2026-09-01T20:58:08Z";
const FAIR_ID = "great-frederick-fair-2026";
const FAIR_INFO_URL = "https://thegreatfrederickfair.com/come-to-the-fair/";
const ADVANCE_ADMISSION_URL =
  "https://www.etix.com/ticket/p/61602326/advance-gate-admissionthe-great-frederick-fair-frederick-the-great-frederick-fair-advanced-gate?partner_id=944";
const BLUE_RIBBON_URL =
  "https://www.etix.com/ticket/p/65356930/blue-ribbon-bundle-frederick-the-great-frederick-fair-advanced-gate?partner_id=944";
const ticketLinkSource = (url: string) => ({
  publisher: "Etix",
  sourceTitle: "Official 2026 Fair ticket page",
  sourceUrl: url,
  verifiedAt: "2026-09-09T04:48:00Z",
});
const JACK_PASS_URL =
  "https://www.etix.com/ticket/p/36957156/jack-pass-frederick-the-great-frederick-fair-advanced-gate?partner_id=944";
const CARLOAD_SPECIAL_URL =
  "https://www.etix.com/ticket/p/66497377/carload-special-tuesday-sept22-lot-d-onlythe-great-frederick-fair-frederick-the-great-frederick-fair-advanced-gate?partner_id=944";

const admissionSource = {
  publisher: "The Great Frederick Fair",
  sourceTitle: "Come to the Fair",
  sourceUrl: FAIR_INFO_URL,
  verifiedAt: "2026-09-09T08:16:24Z",
};

const scheduleSource = {
  publisher: "The Great Frederick Fair",
  sourceTitle: "Official Fair schedule",
  sourceUrl: "https://thegreatfrederickfair.com/schedule/",
  verifiedAt: VERIFIED_AT,
};

const carnivalSource = {
  publisher: "The Great Frederick Fair",
  sourceTitle: "The Carnival",
  sourceUrl: "https://thegreatfrederickfair.com/the-carnival/",
  verifiedAt: VERIFIED_AT,
};

const fairDates = {
  status: "known" as const,
  startsOn: "2026-09-18",
  endsOn: "2026-09-26",
};

const deadlineUnknown = {
  status: "unknown" as const,
  reason: "The reviewed official visitor page does not state a purchase deadline.",
};

const purchaseUrlUnknown = {
  status: "unknown" as const,
  reason: "A stable official purchase URL has not been reviewed for this offer.",
};

const inventoryNotTracked = {
  status: "not-tracked" as const,
  reason: "Frederick Radius does not check ticket inventory or purchase status.",
};

export const greatFrederickFair2026Offers = parseFairOffers([
  {
    id: "offer-adult-admission-online",
    fairId: FAIR_ID,
    kind: "admission",
    label: "Adult admission online",
    audience: "adult-11-plus",
    eligibility: "Guests age 11 and over.",
    channel: "online",
    price: { status: "known", amountCents: 1_000, currency: "USD" },
    validDates: fairDates,
    deadline: deadlineUnknown,
    inclusions: { status: "known", value: ["Fair admission"] },
    inventory: inventoryNotTracked,
    officialInfoUrl: FAIR_INFO_URL,
    officialPurchaseUrl: { status: "known", value: ADVANCE_ADMISSION_URL },
    provenance: [admissionSource, ticketLinkSource(ADVANCE_ADMISSION_URL)],
  },
  {
    id: "offer-blue-ribbon-bundle",
    fairId: FAIR_ID,
    kind: "bundle",
    label: "Blue Ribbon Bundle",
    audience: "general",
    eligibility: "One online purchase includes 10 Fair admissions.",
    channel: "online",
    price: { status: "known", amountCents: 8_000, currency: "USD" },
    validDates: fairDates,
    deadline: deadlineUnknown,
    inclusions: { status: "known", value: ["10 Fair admissions"] },
    inventory: inventoryNotTracked,
    officialInfoUrl: FAIR_INFO_URL,
    officialPurchaseUrl: { status: "known", value: BLUE_RIBBON_URL },
    provenance: [admissionSource, ticketLinkSource(BLUE_RIBBON_URL)],
  },
  {
    id: "offer-jack-pass",
    fairId: FAIR_ID,
    kind: "bundle",
    label: "$35 Jack Pass",
    audience: "general",
    eligibility: "Use the admission and ride wristband together on one Fair day.",
    channel: "online",
    price: { status: "known", amountCents: 3_500, currency: "USD" },
    validDates: fairDates,
    deadline: {
      status: "known",
      value: "2026-09-18T17:00:00-04:00",
    },
    inclusions: {
      status: "known",
      value: ["Fair admission", "Ride-all-day wristband"],
    },
    inventory: inventoryNotTracked,
    officialInfoUrl: FAIR_INFO_URL,
    officialPurchaseUrl: { status: "known", value: JACK_PASS_URL },
    provenance: [admissionSource],
  },
  {
    id: "offer-adult-admission-gate",
    fairId: FAIR_ID,
    kind: "admission",
    label: "Adult admission at the gate",
    audience: "adult-11-plus",
    eligibility: "Guests age 11 and over.",
    channel: "gate",
    price: { status: "known", amountCents: 1_500, currency: "USD" },
    validDates: fairDates,
    deadline: deadlineUnknown,
    inclusions: { status: "known", value: ["Fair admission"] },
    inventory: inventoryNotTracked,
    officialInfoUrl: FAIR_INFO_URL,
    officialPurchaseUrl: purchaseUrlUnknown,
    provenance: [admissionSource],
  },
  {
    id: "offer-child-admission",
    fairId: FAIR_ID,
    kind: "admission",
    label: "Child admission",
    audience: "child-10-under",
    eligibility: "Guests age 10 and under.",
    channel: "any",
    price: { status: "known", amountCents: 0, currency: "USD" },
    validDates: fairDates,
    deadline: deadlineUnknown,
    inclusions: { status: "known", value: ["Fair admission"] },
    inventory: inventoryNotTracked,
    officialInfoUrl: FAIR_INFO_URL,
    officialPurchaseUrl: purchaseUrlUnknown,
    provenance: [admissionSource],
  },
  {
    id: "offer-canned-food-drive-admission",
    fairId: FAIR_ID,
    kind: "deal",
    label: "$5 Canned Food Drive admission",
    audience: "general",
    eligibility:
      "Bring one canned food item for the Frederick Rescue Mission. The offer is limited to one admission per person.",
    channel: "gate",
    price: { status: "known", amountCents: 500, currency: "USD" },
    validDates: {
      status: "known",
      startsOn: "2026-09-21",
      endsOn: "2026-09-21",
    },
    deadline: {
      status: "unknown",
      reason: "The official schedule does not state a cutoff time for this offer.",
    },
    inclusions: { status: "known", value: ["Fair admission"] },
    inventory: inventoryNotTracked,
    officialInfoUrl: scheduleSource.sourceUrl,
    officialPurchaseUrl: purchaseUrlUnknown,
    provenance: [scheduleSource],
  },
  {
    id: "offer-senior-day-admission",
    fairId: FAIR_ID,
    kind: "deal",
    label: "Senior Day admission until 3 p.m.",
    audience: "senior-65-plus",
    eligibility:
      "Guests age 65 and over are admitted free until 3 p.m. on each listed day.",
    channel: "gate",
    price: { status: "known", amountCents: 0, currency: "USD" },
    validDates: {
      status: "known",
      startsOn: "2026-09-21",
      endsOn: "2026-09-23",
    },
    deadline: {
      status: "unknown",
      reason: "This offer repeats daily, so its 3 p.m. cutoff depends on the selected Fair day.",
    },
    inclusions: { status: "known", value: ["Fair admission"] },
    inventory: inventoryNotTracked,
    officialInfoUrl: FAIR_INFO_URL,
    officialPurchaseUrl: purchaseUrlUnknown,
    provenance: [admissionSource],
  },
  {
    id: "offer-lunch-bunch-admission",
    fairId: FAIR_ID,
    kind: "deal",
    label: "Lunch Bunch admission, 11 a.m. to 2 p.m.",
    audience: "general",
    eligibility:
      "Arrive between 11 a.m. and 2 p.m. on each listed day for free Fair admission.",
    channel: "gate",
    price: { status: "known", amountCents: 0, currency: "USD" },
    validDates: {
      status: "known",
      startsOn: "2026-09-21",
      endsOn: "2026-09-24",
    },
    deadline: {
      status: "unknown",
      reason: "This offer repeats daily, so its 2 p.m. cutoff depends on the selected Fair day.",
    },
    inclusions: { status: "known", value: ["Fair admission"] },
    inventory: inventoryNotTracked,
    officialInfoUrl: scheduleSource.sourceUrl,
    officialPurchaseUrl: purchaseUrlUnknown,
    provenance: [scheduleSource],
  },
  {
    id: "offer-carload-special",
    fairId: FAIR_ID,
    kind: "bundle",
    label: "$60 Carload Special",
    audience: "general",
    eligibility:
      "Everyone must be buckled in the vehicle, up to eight people, and the vehicle must park in Lot D.",
    channel: "any",
    price: { status: "known", amountCents: 6_000, currency: "USD" },
    validDates: {
      status: "known",
      startsOn: "2026-09-22",
      endsOn: "2026-09-22",
    },
    deadline: {
      status: "known",
      value: "2026-09-22T19:00:00-04:00",
    },
    inclusions: {
      status: "known",
      value: ["Fair admission", "Ride wristbands", "Lot D parking"],
    },
    inventory: inventoryNotTracked,
    officialInfoUrl: carnivalSource.sourceUrl,
    officialPurchaseUrl: { status: "known", value: CARLOAD_SPECIAL_URL },
    provenance: [admissionSource, carnivalSource],
  },
  {
    id: "offer-military-day-admission",
    fairId: FAIR_ID,
    kind: "deal",
    label: "Military Day admission until 6 p.m.",
    audience: "military-id",
    eligibility: "Guests with military ID are admitted free until 6 p.m.",
    channel: "gate",
    price: { status: "known", amountCents: 0, currency: "USD" },
    validDates: {
      status: "known",
      startsOn: "2026-09-23",
      endsOn: "2026-09-23",
    },
    deadline: {
      status: "known",
      value: "2026-09-23T18:00:00-04:00",
    },
    inclusions: { status: "known", value: ["Fair admission"] },
    inventory: inventoryNotTracked,
    officialInfoUrl: scheduleSource.sourceUrl,
    officialPurchaseUrl: purchaseUrlUnknown,
    provenance: [scheduleSource],
  },
  {
    id: "offer-youth-day-admission",
    fairId: FAIR_ID,
    kind: "deal",
    label: "Youth admission until 5 p.m.",
    audience: "youth-18-under",
    eligibility: "Guests age 18 and under are admitted free until 5 p.m.",
    channel: "gate",
    price: { status: "known", amountCents: 0, currency: "USD" },
    validDates: {
      status: "known",
      startsOn: "2026-09-25",
      endsOn: "2026-09-25",
    },
    deadline: {
      status: "known",
      value: "2026-09-25T17:00:00-04:00",
    },
    inclusions: { status: "known", value: ["Fair admission"] },
    inventory: inventoryNotTracked,
    officialInfoUrl: scheduleSource.sourceUrl,
    officialPurchaseUrl: purchaseUrlUnknown,
    provenance: [scheduleSource],
  },
]);
