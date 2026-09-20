import { z } from "zod";

import {
  EMPTY_FAIR_PARTY,
  fairPartySchema,
  type FairParty,
} from "@/lib/fair/party-plan";
import type { FairScheduleSourceItem } from "@/lib/fair/schedule";
import type { FairVendor } from "@/lib/fair/domain";

export const FAIR_PLAN_STORAGE_KEY =
  "fr:fair-plan:great-frederick-fair-2026:v1";
export const MAX_FAIR_PLAN_STEPS = 60;
export const MAX_FAIR_PLAN_BYTES = 24 * 1024;

const offsetTimestampSchema = z
  .string()
  .regex(
    /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?(?:Z|[+-]\d{2}:\d{2})$/,
  )
  .refine((value) => Number.isFinite(Date.parse(value)));

const fairIdSchema = z.string().regex(/^great-frederick-fair-\d{4}$/);
const revisionSchema = z.string().regex(/^sha256:[0-9a-f]{64}$/);
const dayIdSchema = z.string().regex(/^day-\d{4}-\d{2}-\d{2}$/);
const scheduleItemIdSchema = z
  .string()
  .regex(/^schedule-\d{4}-\d{2}-\d{2}-[a-z0-9]+(?:-[a-z0-9]+)*$/);
const offerIdSchema = z.string().regex(/^offer-[a-z0-9]+(?:-[a-z0-9]+)*$/);
export const fairPlanReadyKeySchema = z.enum([
  "ticket",
  "travel",
  "arrival",
  "entry",
  "return",
]);

export const fairPlanStepSchema = z
  .object({
    scheduleItemId: scheduleItemIdSchema,
    dayId: dayIdSchema,
    labelSnapshot: z.string().trim().min(2).max(1_000),
    timeLabelSnapshot: z.string().trim().min(1).max(120).nullable(),
    sourceState: z.enum(["current", "changed-or-removed"]),
  })
  .strict();

/** A visit-anytime choice, never a fabricated schedule row or map coordinate. */
export const fairPlanVendorStopSchema = z.object({
  vendorId: z.string().regex(/^vendor-[a-z0-9]+(?:-[a-z0-9]+)*$/).max(120),
  dayId: dayIdSchema,
  labelSnapshot: z.string().trim().min(2).max(160),
  sourceState: z.enum(["current", "changed-or-removed"]),
}).strict();

export const fairPlanSchema = z
  .object({
    version: z.literal(1),
    fairId: fairIdSchema,
    packRevision: revisionSchema,
    selectedDayId: z.union([dayIdSchema, z.null()]),
    arrivalChoice: z.enum([
      "undecided",
      "drive",
      "transit",
      "drop-off",
      "walk",
      "bike",
    ]),
    party: fairPartySchema,
    readyKeys: z.array(fairPlanReadyKeySchema).max(5),
    consideredOfferIds: z.array(offerIdSchema).max(40),
    steps: z.array(fairPlanStepSchema).max(MAX_FAIR_PLAN_STEPS),
    vendorStops: z.array(fairPlanVendorStopSchema).max(MAX_FAIR_PLAN_STEPS).default([]),
    updatedAt: offsetTimestampSchema,
  })
  .strict()
  .superRefine((plan, ctx) => {
    if (plan.steps.length + plan.vendorStops.length > MAX_FAIR_PLAN_STEPS) {
      ctx.addIssue({ code: "custom", message: `A Fair plan may contain at most ${MAX_FAIR_PLAN_STEPS} stops.`, path: ["vendorStops"] });
    }
    const vendorDays = new Set<string>();
    plan.vendorStops.forEach((stop, index) => {
      const key = `${stop.dayId}:${stop.vendorId}`;
      if (vendorDays.has(key)) {
        ctx.addIssue({ code: "custom", message: "a vendor may appear only once per Fair day", path: ["vendorStops", index, "vendorId"] });
      }
      vendorDays.add(key);
    });
    const scheduleIds = new Set<string>();
    plan.steps.forEach((step, index) => {
      if (scheduleIds.has(step.scheduleItemId)) {
        ctx.addIssue({
          code: "custom",
          message: "a schedule item may appear only once in a Fair plan",
          path: ["steps", index, "scheduleItemId"],
        });
      }
      scheduleIds.add(step.scheduleItemId);
    });

    const offerIds = new Set<string>();
    plan.consideredOfferIds.forEach((id, index) => {
      if (offerIds.has(id)) {
        ctx.addIssue({
          code: "custom",
          message: "considered offer ids must be unique",
          path: ["consideredOfferIds", index],
        });
      }
      offerIds.add(id);
    });

    const readyKeys = new Set<string>();
    plan.readyKeys.forEach((key, index) => {
      if (readyKeys.has(key)) {
        ctx.addIssue({
          code: "custom",
          message: "ready keys must be unique",
          path: ["readyKeys", index],
        });
      }
      readyKeys.add(key);
    });
  });

export type FairPlan = z.infer<typeof fairPlanSchema>;
export type FairPlanStep = z.infer<typeof fairPlanStepSchema>;
export type FairPlanVendorStop = z.infer<typeof fairPlanVendorStopSchema>;
export type FairPlanArrivalChoice = FairPlan["arrivalChoice"];
export type FairPlanReadyKey = z.infer<typeof fairPlanReadyKeySchema>;

export type FairPlanStorage = {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
};

type CreateFairPlanInput = {
  fairId: string;
  packRevision: string;
  now: string;
  selectedDayId?: string | null;
};

function parseTimestamp(value: string): string {
  const parsed = offsetTimestampSchema.safeParse(value);
  if (!parsed.success) throw new TypeError("now must be an offset timestamp.");
  return parsed.data;
}

function effectiveTimeLabel(item: FairScheduleSourceItem): string | null {
  return item.timeLabel ?? item.inheritedTimeLabel;
}

function scheduleStep(
  item: FairScheduleSourceItem,
  sourceState: FairPlanStep["sourceState"] = "current",
): FairPlanStep {
  return fairPlanStepSchema.parse({
    scheduleItemId: item.id,
    dayId: item.dayId,
    labelSnapshot: item.text,
    timeLabelSnapshot: effectiveTimeLabel(item),
    sourceState,
  });
}

function withUpdate(
  planCandidate: FairPlan,
  patch: Partial<Omit<FairPlan, "version" | "fairId">>,
  now: string,
): FairPlan {
  const plan = fairPlanSchema.parse(planCandidate);
  return fairPlanSchema.parse({
    ...plan,
    ...patch,
    updatedAt: parseTimestamp(now),
  });
}

export function createFairPlan(input: CreateFairPlanInput): FairPlan {
  return fairPlanSchema.parse({
    version: 1,
    fairId: input.fairId,
    packRevision: input.packRevision,
    selectedDayId: input.selectedDayId ?? null,
    arrivalChoice: "undecided",
    party: EMPTY_FAIR_PARTY,
    readyKeys: [],
    consideredOfferIds: [],
    steps: [],
    updatedAt: parseTimestamp(input.now),
  });
}

export function addFairPlanItem(
  planCandidate: FairPlan,
  item: FairScheduleSourceItem,
  now: string,
): FairPlan {
  const plan = fairPlanSchema.parse(planCandidate);
  if (plan.steps.some((step) => step.scheduleItemId === item.id)) return plan;
  if (plan.steps.length + plan.vendorStops.length >= MAX_FAIR_PLAN_STEPS) {
    throw new RangeError(`A Fair plan may contain at most ${MAX_FAIR_PLAN_STEPS} items.`);
  }
  return withUpdate(plan, { steps: [...plan.steps, scheduleStep(item)] }, now);
}

export function addFairPlanVendor(
  planCandidate: FairPlan,
  vendor: Pick<FairVendor, "id" | "name">,
  dayId: string,
  now: string,
): FairPlan {
  const plan = fairPlanSchema.parse(planCandidate);
  if (plan.vendorStops.some((stop) => stop.vendorId === vendor.id && stop.dayId === dayId)) return plan;
  if (plan.steps.length + plan.vendorStops.length >= MAX_FAIR_PLAN_STEPS) {
    throw new RangeError(`A Fair plan may contain at most ${MAX_FAIR_PLAN_STEPS} stops.`);
  }
  const stop = fairPlanVendorStopSchema.parse({ vendorId: vendor.id, dayId, labelSnapshot: vendor.name, sourceState: "current" });
  return withUpdate(plan, { vendorStops: [...plan.vendorStops, stop] }, now);
}

export function removeFairPlanVendor(planCandidate: FairPlan, vendorId: string, dayId: string, now: string): FairPlan {
  const plan = fairPlanSchema.parse(planCandidate);
  const vendorStops = plan.vendorStops.filter((stop) => stop.vendorId !== vendorId || stop.dayId !== dayId);
  return vendorStops.length === plan.vendorStops.length ? plan : withUpdate(plan, { vendorStops }, now);
}

/** Missing vendors remain visible for review; matching names never replace IDs. */
export function reconcileFairPlanVendors(planCandidate: FairPlan, vendors: readonly Pick<FairVendor, "id" | "name">[], now: string): FairPlan {
  const plan = fairPlanSchema.parse(planCandidate);
  const current = new Map(vendors.map((vendor) => [vendor.id, vendor]));
  const vendorStops = plan.vendorStops.map((stop): FairPlanVendorStop => {
    const vendor = current.get(stop.vendorId);
    return vendor
      ? { ...stop, labelSnapshot: vendor.name, sourceState: "current" }
      : { ...stop, sourceState: "changed-or-removed" };
  });
  return withUpdate(plan, { vendorStops }, now);
}

export function removeFairPlanItem(
  planCandidate: FairPlan,
  scheduleItemId: string,
  now: string,
): FairPlan {
  const plan = fairPlanSchema.parse(planCandidate);
  const steps = plan.steps.filter(
    (step) => step.scheduleItemId !== scheduleItemId,
  );
  return steps.length === plan.steps.length
    ? plan
    : withUpdate(plan, { steps }, now);
}

export function moveFairPlanItem(
  planCandidate: FairPlan,
  scheduleItemId: string,
  direction: -1 | 1,
  now: string,
): FairPlan {
  const plan = fairPlanSchema.parse(planCandidate);
  const index = plan.steps.findIndex(
    (step) => step.scheduleItemId === scheduleItemId,
  );
  const nextIndex = index + direction;
  if (index < 0 || nextIndex < 0 || nextIndex >= plan.steps.length) return plan;
  const steps = [...plan.steps];
  [steps[index], steps[nextIndex]] = [steps[nextIndex], steps[index]];
  return withUpdate(plan, { steps }, now);
}

/** Reorders one day's stops without moving through stops saved for another day. */
export function moveFairPlanItemWithinDay(
  planCandidate: FairPlan,
  scheduleItemId: string,
  direction: -1 | 1,
  now: string,
): FairPlan {
  const plan = fairPlanSchema.parse(planCandidate);
  const index = plan.steps.findIndex(
    (step) => step.scheduleItemId === scheduleItemId,
  );
  if (index < 0) return plan;

  const dayId = plan.steps[index].dayId;
  const sameDayIndices = plan.steps.flatMap((step, stepIndex) =>
    step.dayId === dayId ? [stepIndex] : [],
  );
  const dayPosition = sameDayIndices.indexOf(index);
  const nextDayPosition = dayPosition + direction;
  if (
    dayPosition < 0 ||
    nextDayPosition < 0 ||
    nextDayPosition >= sameDayIndices.length
  ) {
    return plan;
  }

  const nextIndex = sameDayIndices[nextDayPosition];
  const steps = [...plan.steps];
  [steps[index], steps[nextIndex]] = [steps[nextIndex], steps[index]];
  return withUpdate(plan, { steps }, now);
}

export function clearFairPlan(planCandidate: FairPlan, now: string): FairPlan {
  const plan = fairPlanSchema.parse(planCandidate);
  return plan.steps.length === 0 && plan.vendorStops.length === 0
    ? plan
    : withUpdate(plan, { steps: [], vendorStops: [] }, now);
}

export function setFairPlanDay(
  planCandidate: FairPlan,
  selectedDayId: string | null,
  now: string,
): FairPlan {
  return withUpdate(planCandidate, { selectedDayId }, now);
}

export function setFairPlanArrivalChoice(
  planCandidate: FairPlan,
  arrivalChoice: FairPlanArrivalChoice,
  now: string,
): FairPlan {
  return withUpdate(planCandidate, { arrivalChoice }, now);
}

export function setFairPlanParty(
  planCandidate: FairPlan,
  party: FairParty,
  now: string,
): FairPlan {
  return withUpdate(planCandidate, { party: fairPartySchema.parse(party) }, now);
}

export function setFairPlanReady(
  planCandidate: FairPlan,
  key: FairPlanReadyKey,
  ready: boolean,
  now: string,
): FairPlan {
  const plan = fairPlanSchema.parse(planCandidate);
  const parsedKey = fairPlanReadyKeySchema.parse(key);
  const readyKeys = ready
    ? Array.from(new Set([...plan.readyKeys, parsedKey]))
    : plan.readyKeys.filter((candidate) => candidate !== parsedKey);
  return readyKeys.length === plan.readyKeys.length &&
    readyKeys.every((candidate, index) => candidate === plan.readyKeys[index])
    ? plan
    : withUpdate(plan, { readyKeys }, now);
}

export function toggleFairPlanOffer(
  planCandidate: FairPlan,
  offerId: string,
  now: string,
): FairPlan {
  const plan = fairPlanSchema.parse(planCandidate);
  const parsedOfferId = offerIdSchema.parse(offerId);
  const consideredOfferIds = plan.consideredOfferIds.includes(parsedOfferId)
    ? plan.consideredOfferIds.filter((id) => id !== parsedOfferId)
    : [...plan.consideredOfferIds, parsedOfferId];
  return withUpdate(plan, { consideredOfferIds }, now);
}

export function numberedFairPlanSteps(
  planCandidate: FairPlan,
): Array<FairPlanStep & { number: number }> {
  const plan = fairPlanSchema.parse(planCandidate);
  return plan.steps.map((step, index) => ({ ...step, number: index + 1 }));
}

export type FairPlanReconciliation = {
  plan: FairPlan;
  changedOrRemovedIds: string[];
  appliedAliases: Array<{ from: string; to: string }>;
};

/**
 * Reconciles only exact ids or a caller-supplied, human-reviewed alias. Similar
 * text and times are deliberately ignored so a changed source row is never
 * substituted behind the user's back.
 */
export function reconcileFairPlan(
  planCandidate: FairPlan,
  currentItems: readonly FairScheduleSourceItem[],
  nextPackRevision: string,
  now: string,
  reviewedAliases: Readonly<Record<string, string>> = {},
): FairPlanReconciliation {
  const plan = fairPlanSchema.parse(planCandidate);
  const revision = revisionSchema.parse(nextPackRevision);
  const itemById = new Map(currentItems.map((item) => [item.id, item] as const));
  const usedIds = new Set<string>();
  const changedOrRemovedIds: string[] = [];
  const appliedAliases: Array<{ from: string; to: string }> = [];

  const steps = plan.steps.map((step) => {
    const direct = itemById.get(step.scheduleItemId);
    const aliasId = reviewedAliases[step.scheduleItemId];
    const aliased = aliasId ? itemById.get(aliasId) : undefined;
    const item = direct ?? aliased;
    if (!item || usedIds.has(item.id)) {
      changedOrRemovedIds.push(step.scheduleItemId);
      usedIds.add(step.scheduleItemId);
      return { ...step, sourceState: "changed-or-removed" as const };
    }
    usedIds.add(item.id);
    if (!direct) {
      appliedAliases.push({ from: step.scheduleItemId, to: item.id });
    }
    return scheduleStep(item);
  });

  return {
    plan: withUpdate(plan, { packRevision: revision, steps }, now),
    changedOrRemovedIds,
    appliedAliases,
  };
}

export function serializeFairPlan(planCandidate: FairPlan): string {
  const serialized = JSON.stringify(fairPlanSchema.parse(planCandidate));
  if (new TextEncoder().encode(serialized).byteLength > MAX_FAIR_PLAN_BYTES) {
    throw new RangeError("The Fair plan exceeds its on-device storage limit.");
  }
  return serialized;
}

export function parseFairPlanText(text: string): FairPlan | null {
  if (new TextEncoder().encode(text).byteLength > MAX_FAIR_PLAN_BYTES) return null;
  try {
    const candidate: unknown = JSON.parse(text);
    const record =
      candidate !== null &&
      typeof candidate === "object" &&
      !Array.isArray(candidate)
        ? candidate
        : null;
    const migrated = record
      ? {
          ...record,
          ...(!("party" in record) ? { party: EMPTY_FAIR_PARTY } : {}),
          ...(!("readyKeys" in record) ? { readyKeys: [] } : {}),
        }
      : candidate;
    return fairPlanSchema.parse(migrated);
  } catch {
    return null;
  }
}

export function readFairPlan(storage: FairPlanStorage): FairPlan | null {
  try {
    const text = storage.getItem(FAIR_PLAN_STORAGE_KEY);
    return text ? parseFairPlanText(text) : null;
  } catch {
    return null;
  }
}

export function writeFairPlan(
  storage: FairPlanStorage,
  planCandidate: FairPlan,
): boolean {
  try {
    storage.setItem(FAIR_PLAN_STORAGE_KEY, serializeFairPlan(planCandidate));
    return true;
  } catch {
    return false;
  }
}

export function removeStoredFairPlan(storage: FairPlanStorage): boolean {
  try {
    storage.removeItem(FAIR_PLAN_STORAGE_KEY);
    return true;
  } catch {
    return false;
  }
}
