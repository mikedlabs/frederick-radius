import "server-only";

import { FOOD_TRUCK_BY_SLUG } from "@/data/food-trucks";
import { isInFrederickCountyArea } from "@/lib/geo";
import { resolveFrederickMunicipality } from "@/lib/location";
import { withDeadlineFallback } from "@/lib/promise-deadline";
import { readBeacon, type TruckBeacon } from "./beacon";
import { getStoredFoodTruckSchedule } from "./schedule-loader";
import type {
  FoodTruckScheduleSnapshot,
  FoodTruckScheduleStop,
} from "./schedule-types";
import { getFreshestBeaconByTruck } from "@/lib/loaders/truckBeacons";

const AVAILABILITY_READ_BUDGET_MS = 1_250;

export type FoodTruckAvailabilityKind =
  | "operator-live"
  | "published-stop";

/**
 * One food-truck possibility with the evidence that supports it.
 *
 * `operator-live` is the only state that may claim a truck is physically out.
 * `published-stop` is a current publisher schedule, never proof of arrival.
 */
type FoodTruckAvailabilityBase = {
  id: string;
  truckSlug?: string;
  name: string;
  cuisine: string;
  lat?: number;
  lng?: number;
  spot?: string;
  note?: string;
  venueName?: string;
  municipality?: string;
  startsAt: string;
  endsAt?: string;
  sourceName: string;
  sourceUrl: string;
  href: string;
};

export type FoodTruckAvailability = FoodTruckAvailabilityBase & (
  | {
      kind: "operator-live";
      endsAt: string;
      sourceConfidence: "operator";
    }
  | {
      kind: "published-stop";
      venueName: string;
      sourceConfidence: "vendor" | "venue" | "organizer";
    }
);

export type FoodTruckAvailabilitySnapshot = {
  checkedAt: string;
  /** A missing schedule means the durable snapshot was absent, stale, or did
   * not answer inside the read budget. A snapshot whose publishers all failed
   * is also unavailable; a mix of healthy and failed publishers is partial.
   * None of those states means no stops exist. */
  scheduleState: "current" | "partial" | "unavailable";
  items: FoodTruckAvailability[];
};

function scheduleState(
  snapshot: FoodTruckScheduleSnapshot | null,
): FoodTruckAvailabilitySnapshot["scheduleState"] {
  if (!snapshot || snapshot.sources.length === 0) return "unavailable";
  const healthyCount = snapshot.sources.filter((source) => source.ok).length;
  if (healthyCount === 0) return "unavailable";
  return healthyCount === snapshot.sources.length ? "current" : "partial";
}

function safeHttpUrl(value: string): string | null {
  try {
    const parsed = new URL(value);
    return parsed.protocol === "https:" || parsed.protocol === "http:"
      ? parsed.toString()
      : null;
  } catch {
    return null;
  }
}

function stableNameKey(value: string): string {
  return value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 80);
}

function validWindow(
  startsAt: string,
  endsAt: string | undefined,
  now: Date,
): boolean {
  const start = Date.parse(startsAt);
  if (!Number.isFinite(start)) return false;
  if (!endsAt) return start >= now.getTime();
  const end = Date.parse(endsAt);
  return Number.isFinite(end) && end > start && end > now.getTime();
}

function scheduleItems(
  snapshot: FoodTruckScheduleSnapshot | null,
  now: Date,
): FoodTruckAvailability[] {
  if (!snapshot) return [];

  // A stored board may preserve a prior useful snapshot through an upstream
  // outage. Only stops whose publisher reported healthy in this exact snapshot
  // become availability; an unverified source label stays off public surfaces.
  const healthyPublishers = new Set(
    snapshot.sources
      .filter((source) => source.ok)
      .map((source) => source.label.trim()),
  );

  return snapshot.stops.flatMap((stop: FoodTruckScheduleStop) => {
    const sourceUrl = safeHttpUrl(stop.sourceUrl);
    if (
      !sourceUrl ||
      !healthyPublishers.has(stop.sourceName.trim()) ||
      !validWindow(stop.startsAt, stop.endsAt, now)
    ) {
      return [];
    }

    const coordinate =
      typeof stop.lat === "number" &&
      typeof stop.lng === "number" &&
      isInFrederickCountyArea(stop.lng, stop.lat)
        ? { lat: stop.lat, lng: stop.lng }
        : null;
    const mappedMunicipality = coordinate
      ? resolveFrederickMunicipality(coordinate)?.municipality.name
      : undefined;

    return stop.vendors.flatMap((vendor, vendorIndex) => {
      const vendorName = vendor.name.trim();
      if (!vendorName) return [];
      const rosterTruck = vendor.slug
        ? FOOD_TRUCK_BY_SLUG.get(vendor.slug)
        : undefined;
      const name = rosterTruck?.name ?? vendorName;
      const truckSlug = rosterTruck?.slug;
      return [{
        id: `schedule:${stop.id}:${truckSlug || stableNameKey(name) || String(vendorIndex)}`,
        kind: "published-stop" as const,
        ...(truckSlug ? { truckSlug } : {}),
        name,
        cuisine: rosterTruck?.cuisine ?? "Food truck",
        ...(coordinate ?? {}),
        venueName: stop.venueName,
        municipality: stop.municipality?.trim() || mappedMunicipality,
        startsAt: stop.startsAt,
        ...(stop.endsAt ? { endsAt: stop.endsAt } : {}),
        sourceName: stop.sourceName.trim(),
        sourceUrl,
        sourceConfidence: stop.confidence,
        href: truckSlug
          ? `/food-trucks#truck-${truckSlug}`
          : "/food-trucks#this-week",
      }];
    });
  });
}

function beaconItems(
  beacons: ReadonlyMap<string, TruckBeacon>,
  now: Date,
): FoodTruckAvailability[] {
  return [...beacons.values()].flatMap((beacon) => {
    const truck = FOOD_TRUCK_BY_SLUG.get(beacon.truckSlug);
    const live = readBeacon(beacon, now);
    if (
      !truck ||
      !live ||
      !isInFrederickCountyArea(beacon.lng, beacon.lat)
    ) {
      return [];
    }
    return [{
      id: `beacon:${truck.slug}`,
      kind: "operator-live" as const,
      truckSlug: truck.slug,
      name: truck.name,
      cuisine: truck.cuisine,
      lat: beacon.lat,
      lng: beacon.lng,
      municipality: resolveFrederickMunicipality({
        lng: beacon.lng,
        lat: beacon.lat,
      })?.municipality.name,
      spot: live.spot,
      note: live.note,
      startsAt: beacon.startedAt,
      endsAt: beacon.expiresAt,
      sourceName: "Operator live beacon",
      sourceUrl: `/food-trucks#truck-${truck.slug}`,
      sourceConfidence: "operator" as const,
      href: `/food-trucks#truck-${truck.slug}`,
    }];
  });
}

function availabilityOrder(
  item: FoodTruckAvailability,
  nowMs: number,
): [number, number, string] {
  if (item.kind === "operator-live") return [0, 0, item.name];
  const start = Date.parse(item.startsAt);
  const end = item.endsAt ? Date.parse(item.endsAt) : Number.NaN;
  const isScheduledNow = start <= nowMs && Number.isFinite(end) && end > nowMs;
  return [isScheduledNow ? 1 : 2, start, item.name];
}

/** Pure assembly used by focused tests and the bounded public reader. */
export function buildFoodTruckAvailability({
  beacons,
  schedule,
  now,
}: {
  beacons: ReadonlyMap<string, TruckBeacon>;
  schedule: FoodTruckScheduleSnapshot | null;
  now: Date;
}): FoodTruckAvailabilitySnapshot {
  const nowMs = now.getTime();
  const assembled = [
    ...beaconItems(beacons, now),
    ...scheduleItems(schedule, now),
  ];
  const liveTruckSlugs = new Set(
    assembled.flatMap((item) =>
      item.kind === "operator-live" && item.truckSlug ? [item.truckSlug] : [],
    ),
  );
  const items = assembled.filter((item) => {
    if (
      item.kind !== "published-stop" ||
      !item.truckSlug ||
      !liveTruckSlugs.has(item.truckSlug)
    ) {
      return true;
    }
    const start = Date.parse(item.startsAt);
    const end = item.endsAt ? Date.parse(item.endsAt) : Number.NaN;
    // A confirmed location replaces only an overlapping "scheduled now"
    // record. A later stop remains useful and visibly scheduled.
    return !(start <= nowMs && Number.isFinite(end) && end > nowMs);
  }).sort((a, b) => {
    const ao = availabilityOrder(a, nowMs);
    const bo = availabilityOrder(b, nowMs);
    return ao[0] - bo[0] || ao[1] - bo[1] || ao[2].localeCompare(bo[2]);
  });

  return {
    checkedAt: now.toISOString(),
    scheduleState: scheduleState(schedule),
    items,
  };
}

/**
 * Shared, fail-soft food-truck truth for Ask and Map.
 *
 * This deliberately reads only the cron-built schedule. Unlike the dedicated
 * board, a map or Ask request never fans out to five publisher sites.
 */
export async function getFoodTruckAvailability(
  now = new Date(),
): Promise<FoodTruckAvailabilitySnapshot> {
  const [beacons, schedule] = await Promise.all([
    withDeadlineFallback(
      getFreshestBeaconByTruck(),
      AVAILABILITY_READ_BUDGET_MS,
      new Map<string, TruckBeacon>(),
    ),
    withDeadlineFallback(
      getStoredFoodTruckSchedule(now),
      AVAILABILITY_READ_BUDGET_MS,
      null,
    ),
  ]);
  return buildFoodTruckAvailability({ beacons, schedule, now });
}
