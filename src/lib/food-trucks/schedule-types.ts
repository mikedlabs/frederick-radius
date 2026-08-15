/** Shared, serializable shapes for the food-truck week board. */

export type FoodTruckScheduleVendor = {
  name: string;
  /** Present when the vendor matches Frederick Radius's curated roster. */
  slug?: string;
  /** The vendor link published by the schedule owner. */
  url?: string;
};
export type FoodTruckScheduleStop = {
  id: string;
  /** Stable collector identity. Older stored snapshots may omit this field. */
  sourceId?: string;
  title: string;
  startsAt: string;
  endsAt?: string;
  venueName: string;
  /** Canonical Radius place used to join the stop to venue details. */
  venuePlaceSlug?: string;
  address?: string;
  municipality?: string;
  /** Verified venue coordinates. Never inferred from a calendar placeholder. */
  lat?: number;
  lng?: number;
  vendors: FoodTruckScheduleVendor[];
  sourceName: string;
  sourceUrl: string;
  /** Explains the authority behind the stop without implying live presence. */
  confidence: "vendor" | "venue" | "organizer";
  serviceNote?: string;
};

export type FoodTruckScheduleSourceHealth = {
  id: string;
  label: string;
  ok: boolean;
  /** Stops returned by this source during the latest collection attempt. */
  count: number;
  checkedAt: string;
  /** Latest successful collection, retained across later source failures. */
  lastSuccessAt?: string;
  /** Comparable stops from the preceding snapshot's overlapping window. */
  previousCount?: number;
  /** Last-known-good stops retained after a source failure or suspicious drop. */
  retainedCount?: number;
  /** A valid source unexpectedly removed every still-future prior stop. */
  suspiciousZero?: boolean;
  /** A valid source lost at least 40% of three or more prior future stops. */
  suspiciousDrop?: boolean;
  error?: string;
};

export type FoodTruckScheduleSnapshot = {
  version: 1;
  generatedAt: string;
  windowStart: string;
  windowEnd: string;
  stops: FoodTruckScheduleStop[];
  sources: FoodTruckScheduleSourceHealth[];
};
