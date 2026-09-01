import { parseFairManifest } from "@/lib/fair/domain";

const VERIFIED_AT = "2026-09-01T20:58:08Z";

const fairHomeSource = {
  publisher: "The Great Frederick Fair",
  sourceTitle: "The Great Frederick Fair",
  sourceUrl: "https://thegreatfrederickfair.com/",
  verifiedAt: VERIFIED_AT,
};

const visitorSource = {
  publisher: "The Great Frederick Fair",
  sourceTitle: "Come to the Fair",
  sourceUrl: "https://thegreatfrederickfair.com/come-to-the-fair/",
  verifiedAt: VERIFIED_AT,
};

const parkingSource = {
  publisher: "The Great Frederick Fair",
  sourceTitle: "Plan Your Visit",
  sourceUrl: "https://thegreatfrederickfair.com/plan-your-visit/",
  verifiedAt: VERIFIED_AT,
};

const faqSource = {
  publisher: "The Great Frederick Fair",
  sourceTitle: "FAQ",
  sourceUrl: "https://thegreatfrederickfair.com/faq/",
  verifiedAt: VERIFIED_AT,
};

const guestServicesSource = {
  publisher: "The Great Frederick Fair",
  sourceTitle: "Guest Services",
  sourceUrl: "https://thegreatfrederickfair.com/guest-services/",
  verifiedAt: VERIFIED_AT,
};

const unknownCoordinates = {
  status: "unknown" as const,
  reason: "No precise coordinates have been reviewed for this Fair entity.",
};

const unknownZone = {
  status: "unknown" as const,
  reason: "A stable, sourced Fair zone identifier has not been reviewed yet.",
};

function fairDay(date: string, openingTime: "09:00" | "16:00") {
  return {
    id: `day-${date}`,
    date,
    gateHours: {
      status: "known" as const,
      opensAt: `${date}T${openingTime}:00-04:00`,
      closesAt: `${date}T22:00:00-04:00`,
    },
    provenance: [visitorSource],
  };
}

function satelliteLot(
  code: "A" | "B" | "C" | "D",
  location: string,
) {
  return {
    id: `lot-${code.toLowerCase()}`,
    name: `Lot ${code}`,
    code,
    zoneId: unknownZone,
    location: {
      status: "known" as const,
      description: location,
      coordinates: unknownCoordinates,
    },
    vehicleRate: {
      status: "known" as const,
      amountCents: 1_000,
      currency: "USD" as const,
    },
    paymentMethods: {
      status: "known" as const,
      value: ["cash"],
    },
    dailyOpeningTime: { status: "known" as const, value: "09:00" },
    accessibleParking: { status: "known" as const, value: true },
    shuttle:
      code === "D"
        ? {
            status: "known" as const,
            value: "A free ADA-compliant shuttle runs from Lot D to Gate 4A.",
          }
        : {
            status: "unknown" as const,
            reason: "The reviewed official visitor pages do not list a shuttle for this lot.",
          },
    provenance: [visitorSource, parkingSource, faqSource],
  };
}

/**
 * A deliberately small, source-attributed foundation for the 2026 Fair.
 * Empty schedule, zone, and vendor collections are honest coverage states,
 * not placeholders for information that has not been reviewed yet.
 */
export const greatFrederickFair2026 = parseFairManifest({
  version: 1,
  id: "great-frederick-fair-2026",
  title: "The Great Frederick Fair",
  timezone: "America/New_York",
  startsOn: "2026-09-18",
  endsOn: "2026-09-26",
  updatedAt: VERIFIED_AT,
  provenance: [fairHomeSource, visitorSource],
  days: [
    fairDay("2026-09-18", "16:00"),
    fairDay("2026-09-19", "09:00"),
    fairDay("2026-09-20", "09:00"),
    fairDay("2026-09-21", "09:00"),
    fairDay("2026-09-22", "09:00"),
    fairDay("2026-09-23", "09:00"),
    fairDay("2026-09-24", "09:00"),
    fairDay("2026-09-25", "09:00"),
    fairDay("2026-09-26", "09:00"),
  ],
  admissionTiers: [
    {
      id: "admission-adults-11-plus",
      label: "Adults 11 and over",
      eligibility: "Guests age 11 and over.",
      prices: [
        { channel: "online", amountCents: 1_000, currency: "USD" },
        { channel: "gate", amountCents: 1_500, currency: "USD" },
      ],
      provenance: [visitorSource],
    },
    {
      id: "admission-children-10-under",
      label: "Children 10 and under",
      eligibility: "Guests age 10 and under.",
      prices: [{ channel: "any", amountCents: 0, currency: "USD" }],
      provenance: [visitorSource],
    },
  ],
  scheduleItems: [],
  zones: [],
  vendors: [],
  facilities: [
    {
      id: "facility-family-care-station",
      name: "Family Care Station",
      kind: "family-care",
      zoneId: unknownZone,
      location: {
        status: "known",
        description:
          "The Family Care Station is near the Security office, across from the Building 3 Administration office.",
        coordinates: unknownCoordinates,
      },
      services: ["nursing", "diaper changing"],
      provenance: [faqSource],
    },
  ],
  accessFacts: [
    {
      id: "access-accessible-parking",
      kind: "accessible-parking",
      state: {
        status: "known",
        value:
          "Designated accessible parking is available in Lots A, B, C, and D and on the fairgrounds. Regular parking fees apply.",
      },
      relatedEntityIds: ["lot-infield", "lot-a", "lot-b", "lot-c", "lot-d"],
      provenance: [faqSource],
    },
    {
      id: "access-accessible-shuttle",
      kind: "accessible-shuttle",
      state: {
        status: "known",
        value: "A free ADA-compliant shuttle runs from Lot D to Gate 4A.",
      },
      relatedEntityIds: ["lot-d"],
      provenance: [faqSource],
    },
    {
      id: "access-accessible-drop-off",
      kind: "accessible-drop-off",
      state: {
        status: "known",
        value:
          "Visitors with special needs may be unloaded at Gate 1, Gate 4A, or Building 15. The Gate 4A pull-off is also the general rideshare and drop-off point.",
      },
      relatedEntityIds: [],
      provenance: [faqSource],
    },
    {
      id: "access-mobility-rental",
      kind: "mobility-rental",
      state: {
        status: "known",
        value:
          "First-come mobility scooters cost $10 an hour and manual wheelchairs cost $25 a day between Buildings 12 and 13. A driver's license is required.",
      },
      relatedEntityIds: [],
      provenance: [guestServicesSource],
    },
    {
      id: "access-sensory-space",
      kind: "sensory-space",
      state: {
        status: "unknown",
        reason:
          "The reviewed official visitor pages do not identify a permanent sensory or quiet space.",
      },
      relatedEntityIds: [],
      provenance: [faqSource],
    },
  ],
  lots: [
    {
      id: "lot-infield",
      name: "Gate 3/Infield parking",
      code: "Gate 3/Infield",
      zoneId: unknownZone,
      location: {
        status: "known",
        description: "Infield parking is inside the fairgrounds through Gate 3.",
        coordinates: unknownCoordinates,
      },
      vehicleRate: {
        status: "known",
        amountCents: 1_500,
        currency: "USD",
      },
      paymentMethods: {
        status: "known",
        value: ["cash", "credit card"],
      },
      dailyOpeningTime: { status: "known", value: "09:00" },
      accessibleParking: { status: "known", value: true },
      shuttle: {
        status: "unknown",
        reason: "The reviewed official visitor pages do not list a shuttle for infield parking.",
      },
      provenance: [visitorSource, parkingSource, faqSource],
    },
    satelliteLot("A", "Franklin Street."),
    satelliteLot("B", "Highland Street."),
    satelliteLot("C", "Highland Street."),
    satelliteLot("D", "Monroe Avenue or the Monocacy Boulevard entrance."),
  ],
});
