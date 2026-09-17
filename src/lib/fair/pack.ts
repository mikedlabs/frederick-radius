import { z } from "zod";

import { fairManifestSchema } from "@/lib/fair/domain";
import { fairOffersSchema } from "@/lib/fair/offers";
import { fairTransitEvidenceSchema } from "@/lib/fair/arrival";
import { GREAT_FREDERICK_FAIR_2026_SCHEDULE_SOURCE_URL } from "@/lib/fair/schedule";

export const MAX_FAIR_PACK_BYTES = 600 * 1024;
export const GREAT_FREDERICK_FAIR_2026_EXPECTED_DAYS = 9;
export const GREAT_FREDERICK_FAIR_2026_EXPECTED_ROWS = 188;

const FAIR_ID = /^great-frederick-fair-\d{4}$/;
const DAY_ID = /^day-\d{4}-\d{2}-\d{2}$/;
const SCHEDULE_ID =
  /^schedule-\d{4}-\d{2}-\d{2}-[a-z0-9]+(?:-[a-z0-9]+)*$/;
const HASH_REVISION = /^sha256:[0-9a-f]{64}$/;

const localDateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine((value) => {
    const parsed = new Date(`${value}T00:00:00Z`);
    return (
      Number.isFinite(parsed.getTime()) &&
      parsed.toISOString().slice(0, 10) === value
    );
  });

const offsetTimestampSchema = z
  .string()
  .regex(
    /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?(?:Z|[+-]\d{2}:\d{2})$/,
  )
  .refine((value) => Number.isFinite(Date.parse(value)));

const httpsUrlSchema = z
  .string()
  .url()
  .refine((value) => value.startsWith("https://"));

const fairScheduleSourceItemSchema = z
  .object({
    id: z.string().regex(SCHEDULE_ID),
    dayId: z.string().regex(DAY_ID),
    fairDate: localDateSchema,
    sourcePosition: z.number().int().positive(),
    text: z.string().trim().min(2).max(1_000),
    timeLabel: z.string().min(1).max(120).nullable(),
    inheritedTimeLabel: z.string().min(1).max(120).nullable(),
    timeOrigin: z.enum(["explicit", "inherited", "none"]),
    timing: z.enum([
      "exact",
      "range",
      "approximate",
      "open-ended",
      "unspecified",
    ]),
    startsAt: offsetTimestampSchema.nullable(),
    endsAt: offsetTimestampSchema.nullable(),
    sourceUid: z.string().trim().min(1).max(320),
    recurrenceId: offsetTimestampSchema.nullable(),
    sourceModifiedAt: offsetTimestampSchema,
    sourceUrl: z.literal(GREAT_FREDERICK_FAIR_2026_SCHEDULE_SOURCE_URL),
  })
  .strict()
  .superRefine((item, ctx) => {
    const expectedDayId = `day-${item.fairDate}`;
    if (item.dayId !== expectedDayId) {
      ctx.addIssue({
        code: "custom",
        message: "schedule dayId must match fairDate",
        path: ["dayId"],
      });
    }
    if (
      (item.timeOrigin === "explicit") !== (item.timeLabel !== null) ||
      (item.timeOrigin === "inherited") !==
        (item.timeLabel === null && item.inheritedTimeLabel !== null) ||
      (item.timeOrigin === "none") !==
        (item.timeLabel === null && item.inheritedTimeLabel === null)
    ) {
      ctx.addIssue({
        code: "custom",
        message: "time origin does not match source time labels",
        path: ["timeOrigin"],
      });
    }
    if (item.endsAt !== null && item.startsAt === null) {
      ctx.addIssue({
        code: "custom",
        message: "schedule endsAt requires startsAt",
        path: ["endsAt"],
      });
    }
    if (
      item.startsAt !== null &&
      item.endsAt !== null &&
      Date.parse(item.endsAt) <= Date.parse(item.startsAt)
    ) {
      ctx.addIssue({
        code: "custom",
        message: "schedule endsAt must be after startsAt",
        path: ["endsAt"],
      });
    }
  });

const fairScheduleSourceDaySchema = z
  .object({
    id: z.string().regex(DAY_ID),
    date: localDateSchema,
    gateStartsAt: offsetTimestampSchema,
    gateEndsAt: offsetTimestampSchema,
    sourceUid: z.string().trim().min(1).max(320),
    recurrenceId: offsetTimestampSchema.nullable(),
    sourceModifiedAt: offsetTimestampSchema,
    items: z.array(fairScheduleSourceItemSchema).min(1).max(100),
  })
  .strict()
  .superRefine((day, ctx) => {
    if (day.id !== `day-${day.date}`) {
      ctx.addIssue({
        code: "custom",
        message: "schedule day id must match its date",
        path: ["id"],
      });
    }
    if (Date.parse(day.gateEndsAt) <= Date.parse(day.gateStartsAt)) {
      ctx.addIssue({
        code: "custom",
        message: "schedule gate end must follow its start",
        path: ["gateEndsAt"],
      });
    }
    day.items.forEach((item, index) => {
      if (
        item.dayId !== day.id ||
        item.fairDate !== day.date ||
        item.sourcePosition !== index + 1
      ) {
        ctx.addIssue({
          code: "custom",
          message: "nested schedule rows must match their day and source order",
          path: ["items", index],
        });
      }
    });
  });

const fairScheduleStatsSchema = z
  .object({
    calendarEventCount: z.number().int().nonnegative(),
    selectedEventCount: z.number().int().nonnegative(),
    dayCount: z.number().int().positive(),
    itemCount: z.number().int().positive(),
    blankTimeLabelCount: z.number().int().nonnegative(),
    inheritedTimeLabelCount: z.number().int().nonnegative(),
  })
  .strict();

const fairPackScheduleSchema = z
  .object({
    version: z.literal(1),
    startsOn: localDateSchema,
    endsOn: localDateSchema,
    source: z
      .object({
        publisher: z.literal("The Great Frederick Fair"),
        sourceTitle: z.literal("Official Fair schedule"),
        sourceUrl: z.literal(GREAT_FREDERICK_FAIR_2026_SCHEDULE_SOURCE_URL),
        sourceRevision: offsetTimestampSchema,
      })
      .strict(),
    stats: fairScheduleStatsSchema,
    days: z.array(fairScheduleSourceDaySchema).min(1).max(20),
  })
  .strict()
  .superRefine((schedule, ctx) => {
    const items = schedule.days.flatMap((day) => day.items);
    const ids = new Set<string>();
    items.forEach((item, index) => {
      if (ids.has(item.id)) {
        ctx.addIssue({
          code: "custom",
          message: "nested schedule row ids must be unique",
          path: ["days", index],
        });
      }
      ids.add(item.id);
    });

    const expectedStats = {
      dayCount: schedule.days.length,
      itemCount: items.length,
      blankTimeLabelCount: items.filter((item) => item.timeLabel === null).length,
      inheritedTimeLabelCount: items.filter(
        (item) => item.timeOrigin === "inherited",
      ).length,
    };
    (Object.keys(expectedStats) as Array<keyof typeof expectedStats>).forEach(
      (key) => {
        if (schedule.stats[key] !== expectedStats[key]) {
          ctx.addIssue({
            code: "custom",
            message: `${key} does not match the nested schedule`,
            path: ["stats", key],
          });
        }
      },
    );

    const latestModifiedAt = schedule.days
      .flatMap((day) => [
        day.sourceModifiedAt,
        ...day.items.map((item) => item.sourceModifiedAt),
      ])
      .sort()
      .at(-1);
    if (latestModifiedAt !== schedule.source.sourceRevision) {
      ctx.addIssue({
        code: "custom",
        message: "schedule sourceRevision must equal the latest selected source modification",
        path: ["source", "sourceRevision"],
      });
    }
  });

const fairPackProvenanceSchema = z
  .object({
    manifestSourceUrls: z.array(httpsUrlSchema).min(1).max(20),
    offerSourceUrls: z.array(httpsUrlSchema).min(1).max(20),
    scheduleSourceUrl: z.literal(
      GREAT_FREDERICK_FAIR_2026_SCHEDULE_SOURCE_URL,
    ),
    scheduleSourceRevision: offsetTimestampSchema,
    transitSourceUrl: z.union([httpsUrlSchema, z.null()]),
    transitFetchedOn: z.union([localDateSchema, z.null()]),
  })
  .strict();

const fairPackFields = {
  version: z.literal(1),
  fairId: z.string().regex(FAIR_ID),
  contentUpdatedAt: offsetTimestampSchema,
  manifest: fairManifestSchema,
  offers: fairOffersSchema,
  schedule: fairPackScheduleSchema,
  transit: fairTransitEvidenceSchema,
  provenance: fairPackProvenanceSchema,
};

const fairPackBaseSchema = z.object(fairPackFields).strict();
type FairPackBase = z.infer<typeof fairPackBaseSchema>;

function uniqueSorted(values: readonly string[]): string[] {
  return Array.from(new Set(values)).sort();
}

function manifestSourceUrls(manifest: FairPackBase["manifest"]): string[] {
  return uniqueSorted(
    [
      ...manifest.provenance,
      ...manifest.days.flatMap((entity) => entity.provenance),
      ...manifest.admissionTiers.flatMap((entity) => entity.provenance),
      ...manifest.scheduleItems.flatMap((entity) => entity.provenance),
      ...manifest.zones.flatMap((entity) => entity.provenance),
      ...manifest.vendors.flatMap((entity) => entity.provenance),
      ...manifest.facilities.flatMap((entity) => entity.provenance),
      ...manifest.accessFacts.flatMap((entity) => entity.provenance),
      ...manifest.lots.flatMap((entity) => entity.provenance),
    ].map((source) => source.sourceUrl),
  );
}

function addPackIssues(pack: FairPackBase, ctx: z.RefinementCtx): void {
  if (pack.fairId !== pack.manifest.id) {
    ctx.addIssue({
      code: "custom",
      message: "pack fairId must match the manifest",
      path: ["fairId"],
    });
  }
  if (pack.contentUpdatedAt !== pack.manifest.updatedAt) {
    ctx.addIssue({
      code: "custom",
      message: "contentUpdatedAt must match the reviewed manifest update",
      path: ["contentUpdatedAt"],
    });
  }
  if (pack.manifest.scheduleItems.length !== 0) {
    ctx.addIssue({
      code: "custom",
      message: "Fair pack schedule rows must exist only in nested schedule days",
      path: ["manifest", "scheduleItems"],
    });
  }
  if (
    pack.schedule.startsOn !== pack.manifest.startsOn ||
    pack.schedule.endsOn !== pack.manifest.endsOn
  ) {
    ctx.addIssue({
      code: "custom",
      message: "schedule dates must match the manifest",
      path: ["schedule"],
    });
  }

  const manifestDays = pack.manifest.days.map((day) => `${day.id}:${day.date}`);
  const scheduleDays = pack.schedule.days.map((day) => `${day.id}:${day.date}`);
  if (manifestDays.join("|") !== scheduleDays.join("|")) {
    ctx.addIssue({
      code: "custom",
      message: "nested schedule days must match every manifest day in order",
      path: ["schedule", "days"],
    });
  }

  pack.offers.forEach((offer, index) => {
    if (offer.fairId !== pack.fairId) {
      ctx.addIssue({
        code: "custom",
        message: "offer fairId must match the pack",
        path: ["offers", index, "fairId"],
      });
    }
    if (
      offer.validDates.status === "known" &&
      (offer.validDates.startsOn < pack.manifest.startsOn ||
        offer.validDates.endsOn > pack.manifest.endsOn)
    ) {
      ctx.addIssue({
        code: "custom",
        message: "known offer dates must remain inside the Fair",
        path: ["offers", index, "validDates"],
      });
    }
  });

  if (
    pack.transit.fairDateRange.start !== pack.manifest.startsOn ||
    pack.transit.fairDateRange.end !== pack.manifest.endsOn
  ) {
    ctx.addIssue({
      code: "custom",
      message: "transit context must use the manifest Fair dates",
      path: ["transit", "fairDateRange"],
    });
  }

  const manifestUrls = manifestSourceUrls(pack.manifest);
  const offerUrls = uniqueSorted(
    pack.offers.flatMap((offer) =>
      offer.provenance.map((source) => source.sourceUrl),
    ),
  );
  if (
    pack.provenance.manifestSourceUrls.join("|") !== manifestUrls.join("|") ||
    pack.provenance.offerSourceUrls.join("|") !== offerUrls.join("|") ||
    pack.provenance.scheduleSourceUrl !== pack.schedule.source.sourceUrl ||
    pack.provenance.scheduleSourceRevision !==
      pack.schedule.source.sourceRevision ||
    pack.provenance.transitSourceUrl !==
      pack.transit.evidenceState.sourceUrl ||
    pack.provenance.transitFetchedOn !==
      pack.transit.evidenceState.sourceFetchedOn
  ) {
    ctx.addIssue({
      code: "custom",
      message: "pack provenance must exactly describe its component sources",
      path: ["provenance"],
    });
  }

  if (pack.fairId === "great-frederick-fair-2026") {
    if (
      pack.schedule.stats.dayCount !==
        GREAT_FREDERICK_FAIR_2026_EXPECTED_DAYS ||
      pack.schedule.stats.itemCount !==
        GREAT_FREDERICK_FAIR_2026_EXPECTED_ROWS
    ) {
      ctx.addIssue({
        code: "custom",
        message: "the reviewed 2026 Fair release must contain exactly 9 days and 188 rows",
        path: ["schedule", "stats"],
      });
    }
  }
}

export const fairPackPayloadSchema = fairPackBaseSchema.superRefine(addPackIssues);

export const fairPackSchema = z
  .object({ ...fairPackFields, revision: z.string().regex(HASH_REVISION) })
  .strict()
  .superRefine(addPackIssues);

export const fairPackPointerSchema = z
  .object({
    version: z.literal(1),
    fairId: z.string().regex(FAIR_ID),
    revision: z.string().regex(HASH_REVISION),
    assetPath: z
      .string()
      .regex(/^\/fair\/2026\/releases\/[0-9a-f]{64}\.json$/),
    byteLength: z.number().int().positive().max(MAX_FAIR_PACK_BYTES),
    contentUpdatedAt: offsetTimestampSchema,
    sourceRevision: offsetTimestampSchema,
    dayCount: z.literal(GREAT_FREDERICK_FAIR_2026_EXPECTED_DAYS),
    itemCount: z.literal(GREAT_FREDERICK_FAIR_2026_EXPECTED_ROWS),
  })
  .strict()
  .superRefine((pointer, ctx) => {
    const hash = pointer.revision.slice("sha256:".length);
    if (pointer.assetPath !== `/fair/2026/releases/${hash}.json`) {
      ctx.addIssue({
        code: "custom",
        message: "assetPath must use the content revision",
        path: ["assetPath"],
      });
    }
  });

export type FairPackPayload = z.infer<typeof fairPackPayloadSchema>;
export type FairPack = z.infer<typeof fairPackSchema>;
export type FairPackPointer = z.infer<typeof fairPackPointerSchema>;

/** Stable JSON for content identity. Object keys sort; source array order stays meaningful. */
export function canonicalFairPackJson(value: unknown): string {
  if (value === null) return "null";
  if (typeof value === "string" || typeof value === "boolean") {
    return JSON.stringify(value);
  }
  if (typeof value === "number") {
    if (!Number.isFinite(value)) throw new TypeError("Fair pack numbers must be finite.");
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map((item) => canonicalFairPackJson(item)).join(",")}]`;
  }
  if (typeof value === "object") {
    const record = value as Record<string, unknown>;
    const entries = Object.keys(record)
      .filter((key) => record[key] !== undefined)
      .sort()
      .map(
        (key) =>
          `${JSON.stringify(key)}:${canonicalFairPackJson(record[key])}`,
      );
    return `{${entries.join(",")}}`;
  }
  throw new TypeError("Fair pack content must be JSON serializable.");
}

async function sha256Hex(text: string): Promise<string> {
  const subtle = globalThis.crypto?.subtle;
  if (!subtle) throw new Error("SHA-256 is unavailable in this runtime.");
  const digest = await subtle.digest("SHA-256", new TextEncoder().encode(text));
  return Array.from(new Uint8Array(digest), (byte) =>
    byte.toString(16).padStart(2, "0"),
  ).join("");
}

export async function computeFairPackRevision(
  payloadCandidate: FairPackPayload,
): Promise<`sha256:${string}`> {
  const payload = fairPackPayloadSchema.parse(payloadCandidate);
  const hash = await sha256Hex(canonicalFairPackJson(payload));
  return `sha256:${hash}`;
}

export async function createFairPack(
  payloadCandidate: FairPackPayload,
): Promise<FairPack> {
  const payload = fairPackPayloadSchema.parse(payloadCandidate);
  const revision = await computeFairPackRevision(payload);
  return fairPackSchema.parse({ ...payload, revision });
}

export function parseFairPack(candidate: unknown): FairPack {
  return fairPackSchema.parse(candidate);
}

export async function verifyFairPackRevision(
  packCandidate: FairPack,
): Promise<boolean> {
  const pack = fairPackSchema.parse(packCandidate);
  const { revision, ...payload } = pack;
  return revision === (await computeFairPackRevision(payload));
}

export async function parseFairPackText(text: string): Promise<FairPack> {
  if (new TextEncoder().encode(text).byteLength > MAX_FAIR_PACK_BYTES) {
    throw new RangeError("Fair pack exceeds its download limit.");
  }
  const pack = parseFairPack(JSON.parse(text));
  if (!(await verifyFairPackRevision(pack))) {
    throw new Error("Fair pack revision does not match its content.");
  }
  return pack;
}

export function parseFairPackPointer(candidate: unknown): FairPackPointer {
  return fairPackPointerSchema.parse(candidate);
}
