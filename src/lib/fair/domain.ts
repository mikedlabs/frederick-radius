import { z } from "zod";

export const FAIR_TIME_ZONE = "America/New_York" as const;

const ID_PART = "[a-z0-9]+(?:-[a-z0-9]+)*";

function entityIdSchema(prefix: string) {
  return z
    .string()
    .min(3)
    .max(120)
    .regex(new RegExp(`^${prefix}-${ID_PART}$`), {
      message: `must be a stable ${prefix}- prefixed kebab-case id`,
    });
}

const localDateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, { message: "must be YYYY-MM-DD" })
  .refine((value) => {
    const [year, month, day] = value.split("-").map(Number);
    const parsed = new Date(Date.UTC(year, month - 1, day));
    return (
      parsed.getUTCFullYear() === year &&
      parsed.getUTCMonth() === month - 1 &&
      parsed.getUTCDate() === day
    );
  }, "must be a real calendar date");

const offsetTimestampSchema = z
  .string()
  .regex(
    /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?(?:Z|[+-]\d{2}:\d{2})$/,
    { message: "must be an ISO 8601 timestamp with an explicit offset" },
  )
  .refine((value) => !Number.isNaN(Date.parse(value)), {
    message: "must be a real timestamp",
  });

const clockTimeSchema = z
  .string()
  .regex(/^(?:[01]\d|2[0-3]):[0-5]\d$/, { message: "must be HH:mm" });

const httpsUrlSchema = z
  .string()
  .url()
  .refine((value) => value.startsWith("https://"), {
    message: "source URLs must use HTTPS",
  });

export const fairProvenanceSchema = z
  .object({
    publisher: z.string().trim().min(2).max(160),
    sourceTitle: z.string().trim().min(2).max(160),
    sourceUrl: httpsUrlSchema,
    verifiedAt: offsetTimestampSchema,
  })
  .strict();

const provenanceSchema = z.array(fairProvenanceSchema).min(1).max(6);

const unknownStateSchema = z
  .object({
    status: z.literal("unknown"),
    reason: z.string().trim().min(12).max(320),
  })
  .strict();

const referenceStateSchema = z.discriminatedUnion("status", [
  z
    .object({
      status: z.literal("known"),
      value: z.string().regex(new RegExp(`^[a-z]+-${ID_PART}$`)),
    })
    .strict(),
  unknownStateSchema,
]);

const booleanStateSchema = z.discriminatedUnion("status", [
  z.object({ status: z.literal("known"), value: z.boolean() }).strict(),
  unknownStateSchema,
]);

const textStateSchema = z.discriminatedUnion("status", [
  z
    .object({
      status: z.literal("known"),
      value: z.string().trim().min(2).max(500),
    })
    .strict(),
  unknownStateSchema,
]);

const clockTimeStateSchema = z.discriminatedUnion("status", [
  z.object({ status: z.literal("known"), value: clockTimeSchema }).strict(),
  unknownStateSchema,
]);

const stringListStateSchema = z.discriminatedUnion("status", [
  z
    .object({
      status: z.literal("known"),
      value: z.array(z.string().trim().min(1).max(80)).min(1),
    })
    .strict(),
  unknownStateSchema,
]);

const moneyStateSchema = z.discriminatedUnion("status", [
  z
    .object({
      status: z.literal("known"),
      amountCents: z.number().int().nonnegative(),
      currency: z.literal("USD"),
    })
    .strict(),
  unknownStateSchema,
]);

const coordinateStateSchema = z.discriminatedUnion("status", [
  z
    .object({
      status: z.literal("known"),
      latitude: z.number().finite().min(-90).max(90),
      longitude: z.number().finite().min(-180).max(180),
    })
    .strict(),
  unknownStateSchema,
]);

const locationStateSchema = z.discriminatedUnion("status", [
  z
    .object({
      status: z.literal("known"),
      description: z.string().trim().min(2).max(240),
      coordinates: coordinateStateSchema,
    })
    .strict(),
  unknownStateSchema,
]);

const gateHoursSchema = z.discriminatedUnion("status", [
  z
    .object({
      status: z.literal("known"),
      opensAt: offsetTimestampSchema,
      closesAt: offsetTimestampSchema,
    })
    .strict(),
  unknownStateSchema,
]);

export const fairDaySchema = z
  .object({
    id: entityIdSchema("day"),
    date: localDateSchema,
    gateHours: gateHoursSchema,
    provenance: provenanceSchema,
  })
  .strict()
  .superRefine((day, ctx) => {
    if (
      day.gateHours.status === "known" &&
      Date.parse(day.gateHours.closesAt) <= Date.parse(day.gateHours.opensAt)
    ) {
      ctx.addIssue({
        code: "custom",
        message: "closesAt must be after opensAt",
        path: ["gateHours", "closesAt"],
      });
    }
  });

export const fairScheduleItemSchema = z
  .object({
    id: entityIdSchema("schedule"),
    title: z.string().trim().min(2).max(220),
    dayId: entityIdSchema("day"),
    timing: z.discriminatedUnion("kind", [
      z
        .object({
          kind: z.literal("exact"),
          startsAt: offsetTimestampSchema,
          endsAt: offsetTimestampSchema,
        })
        .strict(),
      z
        .object({
          kind: z.literal("start-only"),
          startsAt: offsetTimestampSchema,
          reason: z.string().trim().min(12).max(320),
        })
        .strict(),
      z
        .object({
          kind: z.literal("open-ended"),
          startsAt: offsetTimestampSchema,
          endBoundary: z.literal("fair-close"),
          sourceLabel: z.string().trim().min(2).max(120),
        })
        .strict(),
      z
        .object({
          kind: z.literal("approximate"),
          anchorAt: offsetTimestampSchema,
          sourceLabel: z.string().trim().min(2).max(120),
        })
        .strict(),
      z
        .object({
          kind: z.literal("unknown"),
          reason: z.string().trim().min(12).max(320),
          sourceLabel: z.string().trim().min(1).max(120).optional(),
        })
        .strict(),
    ]),
    kind: z.enum([
      "agriculture",
      "animal",
      "carnival",
      "concert",
      "exhibit",
      "food",
      "motorsport",
      "service",
      "other",
    ]),
    status: z.enum(["scheduled", "cancelled", "postponed"]),
    zoneId: referenceStateSchema,
    provenance: provenanceSchema,
  })
  .strict()
  .refine(
    (item) =>
      item.timing.kind !== "exact" ||
      Date.parse(item.timing.endsAt) > Date.parse(item.timing.startsAt),
    {
      message: "endsAt must be after startsAt",
      path: ["timing", "endsAt"],
    },
  );

export const fairZoneSchema = z
  .object({
    id: entityIdSchema("zone"),
    name: z.string().trim().min(2).max(120),
    kind: z.enum([
      "grounds",
      "stage",
      "ring",
      "building",
      "barn",
      "midway",
      "gate",
      "area",
    ]),
    location: locationStateSchema,
    provenance: provenanceSchema,
  })
  .strict();

export const fairVendorSchema = z
  .object({
    id: entityIdSchema("vendor"),
    name: z.string().trim().min(2).max(160),
    kind: z.enum(["food", "retail", "exhibit", "service", "other"]),
    zoneId: referenceStateSchema,
    booth: textStateSchema,
    operatingHours: textStateSchema,
    provenance: provenanceSchema,
  })
  .strict();

export const fairFacilitySchema = z
  .object({
    id: entityIdSchema("facility"),
    name: z.string().trim().min(2).max(160),
    kind: z.enum([
      "family-care",
      "first-aid",
      "guest-services",
      "restroom",
      "security",
      "water",
      "other",
    ]),
    zoneId: referenceStateSchema,
    location: locationStateSchema,
    services: z.array(z.string().trim().min(2).max(80)).min(1),
    provenance: provenanceSchema,
  })
  .strict();

export const fairAccessFactSchema = z
  .object({
    id: entityIdSchema("access"),
    kind: z.enum([
      "accessible-parking",
      "accessible-shuttle",
      "accessible-drop-off",
      "accessible-seating",
      "mobility-rental",
      "sensory-space",
      "service-animal",
      "other",
    ]),
    state: textStateSchema,
    relatedEntityIds: z.array(z.string().regex(new RegExp(`^[a-z]+-${ID_PART}$`))),
    provenance: provenanceSchema,
  })
  .strict();

export const fairLotSchema = z
  .object({
    id: entityIdSchema("lot"),
    name: z.string().trim().min(2).max(120),
    code: z.string().trim().min(1).max(24),
    zoneId: referenceStateSchema,
    location: locationStateSchema,
    vehicleRate: moneyStateSchema,
    paymentMethods: stringListStateSchema,
    dailyOpeningTime: clockTimeStateSchema,
    accessibleParking: booleanStateSchema,
    shuttle: textStateSchema,
    provenance: provenanceSchema,
  })
  .strict();

export const fairAdmissionTierSchema = z
  .object({
    id: entityIdSchema("admission"),
    label: z.string().trim().min(2).max(120),
    eligibility: z.string().trim().min(2).max(240),
    prices: z
      .array(
        z
          .object({
            channel: z.enum(["online", "gate", "any"]),
            amountCents: z.number().int().nonnegative(),
            currency: z.literal("USD"),
          })
          .strict(),
      )
      .min(1),
    provenance: provenanceSchema,
  })
  .strict();

function enumerateDates(start: string, end: string): string[] {
  const dates: string[] = [];
  const cursor = new Date(`${start}T00:00:00Z`);
  const final = new Date(`${end}T00:00:00Z`);
  while (cursor <= final) {
    dates.push(cursor.toISOString().slice(0, 10));
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return dates;
}

function localDateAt(timestamp: string, timeZone: string): string {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date(timestamp));
  const part = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((item) => item.type === type)?.value ?? "";
  return `${part("year")}-${part("month")}-${part("day")}`;
}

export const fairManifestSchema = z
  .object({
    version: z.literal(1),
    id: z.string().regex(/^great-frederick-fair-\d{4}$/),
    title: z.string().trim().min(2).max(160),
    timezone: z.literal(FAIR_TIME_ZONE),
    startsOn: localDateSchema,
    endsOn: localDateSchema,
    updatedAt: offsetTimestampSchema,
    provenance: provenanceSchema,
    days: z.array(fairDaySchema).min(1),
    admissionTiers: z.array(fairAdmissionTierSchema),
    scheduleItems: z.array(fairScheduleItemSchema),
    zones: z.array(fairZoneSchema),
    vendors: z.array(fairVendorSchema),
    facilities: z.array(fairFacilitySchema),
    accessFacts: z.array(fairAccessFactSchema),
    lots: z.array(fairLotSchema),
  })
  .strict()
  .superRefine((manifest, ctx) => {
    if (manifest.endsOn < manifest.startsOn) {
      ctx.addIssue({
        code: "custom",
        message: "endsOn must not be before startsOn",
        path: ["endsOn"],
      });
      return;
    }

    manifest.provenance.forEach((source, sourceIndex) => {
      if (Date.parse(source.verifiedAt) > Date.parse(manifest.updatedAt)) {
        ctx.addIssue({
          code: "custom",
          message: "source verification cannot be newer than the manifest",
          path: ["provenance", sourceIndex, "verifiedAt"],
        });
      }
    });

    const expectedDates = enumerateDates(manifest.startsOn, manifest.endsOn);
    const actualDates = manifest.days.map((day) => day.date);
    if (actualDates.join(",") !== expectedDates.join(",")) {
      ctx.addIssue({
        code: "custom",
        message: "days must cover every Fair date once, in chronological order",
        path: ["days"],
      });
    }

    manifest.days.forEach((day, index) => {
      if (day.id !== `day-${day.date}`) {
        ctx.addIssue({
          code: "custom",
          message: "day id must be derived from its date",
          path: ["days", index, "id"],
        });
      }
      if (day.gateHours.status === "known") {
        if (localDateAt(day.gateHours.opensAt, manifest.timezone) !== day.date) {
          ctx.addIssue({
            code: "custom",
            message: "opensAt must fall on the Fair day in America/New_York",
            path: ["days", index, "gateHours", "opensAt"],
          });
        }
        if (localDateAt(day.gateHours.closesAt, manifest.timezone) !== day.date) {
          ctx.addIssue({
            code: "custom",
            message: "closesAt must fall on the Fair day in America/New_York",
            path: ["days", index, "gateHours", "closesAt"],
          });
        }
      }
    });

    const collections = [
      ["days", manifest.days],
      ["admissionTiers", manifest.admissionTiers],
      ["scheduleItems", manifest.scheduleItems],
      ["zones", manifest.zones],
      ["vendors", manifest.vendors],
      ["facilities", manifest.facilities],
      ["accessFacts", manifest.accessFacts],
      ["lots", manifest.lots],
    ] as const;
    const ids = new Map<string, string>();
    for (const [collectionName, entities] of collections) {
      entities.forEach((entity, index) => {
        const firstPath = ids.get(entity.id);
        if (firstPath) {
          ctx.addIssue({
            code: "custom",
            message: `duplicate Fair entity id; first used at ${firstPath}`,
            path: [collectionName, index, "id"],
          });
        } else {
          ids.set(entity.id, `${collectionName}.${index}`);
        }
        entity.provenance.forEach((source, sourceIndex) => {
          if (Date.parse(source.verifiedAt) > Date.parse(manifest.updatedAt)) {
            ctx.addIssue({
              code: "custom",
              message: "source verification cannot be newer than the manifest",
              path: [collectionName, index, "provenance", sourceIndex, "verifiedAt"],
            });
          }
        });
      });
    }

    const dayById = new Map(manifest.days.map((day) => [day.id, day]));
    const zoneIds = new Set(manifest.zones.map((zone) => zone.id));
    const checkZoneReference = (
      state: z.infer<typeof referenceStateSchema>,
      path: Array<string | number>,
    ) => {
      if (state.status === "known" && !zoneIds.has(state.value)) {
        ctx.addIssue({
          code: "custom",
          message: "known zone reference does not exist in this manifest",
          path,
        });
      }
    };

    manifest.scheduleItems.forEach((item, index) => {
      const day = dayById.get(item.dayId);
      const startsAt =
        item.timing.kind === "unknown"
          ? null
          : item.timing.kind === "approximate"
            ? item.timing.anchorAt
            : item.timing.startsAt;
      if (!day) {
        ctx.addIssue({
          code: "custom",
          message: "schedule item dayId does not exist in this manifest",
          path: ["scheduleItems", index, "dayId"],
        });
      } else if (
        startsAt &&
        localDateAt(startsAt, manifest.timezone) !== day.date
      ) {
        ctx.addIssue({
          code: "custom",
          message: "schedule item timing must fall on its Fair day",
          path: ["scheduleItems", index, "timing"],
        });
      }
      const endDate =
        item.timing.kind === "exact"
          ? localDateAt(item.timing.endsAt, manifest.timezone)
          : null;
      if (
        endDate &&
        (endDate < manifest.startsOn || endDate > manifest.endsOn)
      ) {
        ctx.addIssue({
          code: "custom",
          message: "schedule item ends outside the Fair date range",
          path: ["scheduleItems", index, "timing", "endsAt"],
        });
      }
      checkZoneReference(item.zoneId, ["scheduleItems", index, "zoneId"]);
    });

    manifest.vendors.forEach((vendor, index) =>
      checkZoneReference(vendor.zoneId, ["vendors", index, "zoneId"]),
    );
    manifest.facilities.forEach((facility, index) =>
      checkZoneReference(facility.zoneId, ["facilities", index, "zoneId"]),
    );
    manifest.lots.forEach((lot, index) =>
      checkZoneReference(lot.zoneId, ["lots", index, "zoneId"]),
    );

    manifest.accessFacts.forEach((fact, factIndex) => {
      fact.relatedEntityIds.forEach((id, relatedIndex) => {
        if (!ids.has(id)) {
          ctx.addIssue({
            code: "custom",
            message: "related Fair entity id does not exist in this manifest",
            path: ["accessFacts", factIndex, "relatedEntityIds", relatedIndex],
          });
        }
      });
    });
  });

export type FairProvenance = z.infer<typeof fairProvenanceSchema>;
export type FairDay = z.infer<typeof fairDaySchema>;
export type FairScheduleItem = z.infer<typeof fairScheduleItemSchema>;
export type FairZone = z.infer<typeof fairZoneSchema>;
export type FairVendor = z.infer<typeof fairVendorSchema>;
export type FairFacility = z.infer<typeof fairFacilitySchema>;
export type FairAccessFact = z.infer<typeof fairAccessFactSchema>;
export type FairLot = z.infer<typeof fairLotSchema>;
export type FairAdmissionTier = z.infer<typeof fairAdmissionTierSchema>;
export type FairManifest = z.infer<typeof fairManifestSchema>;

export function parseFairManifest(candidate: unknown): FairManifest {
  return fairManifestSchema.parse(candidate);
}
