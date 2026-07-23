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
  title: string;
  startsAt: string;
  endsAt?: string;
  venueName: string;
  address?: string;
  municipality?: string;
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
  count: number;
  checkedAt: string;
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
